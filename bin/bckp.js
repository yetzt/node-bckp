#!/usr/bin/env node

const path = require("path");
const unq = require("unq");
const quu = require("quu");

// parse args
const argv = require("yargs-parser")(process.argv.slice(2), { 
	alias: { 
		verbose: ["v"],
		help: ["h","?"],
		config: ["c"], 
		concurrency: ["p"],
		source: ["s","dir"],
		dest: ["d"],
		encrypt: ["e"],
		compress: ["z"],
		exclude: ["x"],
		date: ["t"],
		name: ["n","id"],
		symlinks: ["l"],
		force: ["f"],
//		remote: ["r"],
//		key: ["k"],
	}, 
	string: ["config","source","dest"], 
	number: ["concurrency"], 
	array: [{ key: "exclude", string: true }], 
	boolean: ["verbose", "help", "force"],
	normalize: true,
});

const usage = function usage(code){
	console.error("Usage: %s [options] [config]", path.basename(process.argv[1]));
	console.error("");
	console.error("Global options:");
	console.error("      -h --help                   Show this help message");
	console.error("      -v --verbose                Show debug information");
	console.error("      -f --force                  Create backup regardless of changes");
	console.error("      -p --concurrency <num>      Maximum number of parallel streams (Default: Number of CPU cores - 1)");
	console.error("");
	console.error("Use Config:");
	console.error("   [ -c --config ] config.js         Use config file (Direct options are ignored)");
	console.error("                                     Example: %s", path.resolve(__dirname,"../congig.dist.js"));
	console.error("Direct options:");
	console.error("   -n --name name                 Name of the destination file (name.<date>.tar[.gz|.br|.xz][.aes])");
	console.error("   -s --dir /dir                  Create a backup of this directory");
	console.error("   -s --dir /dir/*                Create a backup of all directories in this directory");
	console.error("   -d --dest /dir                 Save the backup in this location");
	console.error("   [ -z --compress [gz|br|xz] ]   Compress the archive with gzip, brotli or lzma (default: gzip)");
	console.error("   [ -e --encrypt [password] ]    Encrypt the archive compatible to aescrypt with this password");
	console.error("                                     (otherwise env.AESCRYPT_PASSWORD or prompt on tty is used)");
	console.error("   [ -x --exclude pattern ]       Exlude files matching pattern from backup (repeatable for multiple patterns)");
	console.error("   [ -t --date format ]           Specify date format (Default: YYYYMMDD)");
	console.error("   [ -l --symlinks ]              Follow Symlinks (Default: No)");
//	console.error("   [ -r --remote <remote> ]       Copy to remote host using scp");
//	console.error("                                     remote: user@host:port/path");
//	console.error("   [ -k --key <keyfile> ]               Use SSH private key in this file (Default: Default SSH key)");
	console.error("");
	process.exit(code||0);
}

if (argv.help) usage();
if (argv.verbose) process.env.DEBUG = process.env.DEBUG || "bckp";

let config;
if ((argv.config && (typeof argv.config) === "string") || (argv._.length > 0) && ((typeof argv._[0]) == "string")) {
	try {
		config = require(path.resolve(process.cwd(), argv.config || argv._[0]));
	} catch (err) {
		console.error("Unable to load config file %s", (argv.config || argv._[0]));
		usage(1);
	}
	
	// fix global opts
	if (!config.exclude || !(config.exclude instanceof Array)) config.exclude = [];
	if (!config.datefmt || typeof config.datefmt !== "string") config.datefmt = "YYYYMMDD";
	config.symlinks = !!config.symlinks;
	
	if (!config.hasOwnProperty("jobs") || !(config.jobs instanceof Array)) return console.error("No Jobs specified"), usage(1);
	
	config.force = config.force || argv.force;
	
	// merge global options into src options
	config.jobs = config.jobs.map(function(src){
		
		if (!src.dest) src.dest = config.dest;

		if (!src.datefmt) src.datefmt = config.datefmt;

		if (!src.hasOwnProperty("symlinks")) src.symlinks = config.symlinks;
		src.symlinks = !!src.symlinks;

		if (!src.exclude || !(src.exclude instanceof Array)) src.exclude = [];
		src.exclude = unq([ ...config.exclude, ...src.exclude ]);

		if (!src.hasOwnProperty("encrypt")) src.encrypt = config.encrypt;
		if (!!src.encrypt) {
			if (typeof src.encrypt === "string") {
				src.password = src.encrypt;
			} else if (config.hasOwnProperty("password") && !!config.password && typeof config.password === "string") {
				src.password = config.password;
			} else if (!!process.env.AESCRYPT_PASSWORD && typeof process.env.AESCRYPT_PASSWORD === "string") {
				src.password = process.env.AESCRYPT_PASSWORD;
			} else if (process.stdout.isTTY) {
				let password = require("readline-sync").question("Encryption password: ", { hideEchoBack: true });
				if (!password) {
					console.error("No encyryption password specified");
					usage(1);
				};
				argv.encrypt = password;
			} else {
				console.error("No encyryption password specified");
				usage(1);
			}
		}
		
		return src;
	}).filter(function(src,i){ // checks
		if (!src.id) return console.error("No `id` for source #%d",i), usage(1);
		if (!src.dest) return console.error("No `dest` for ", src.id), usage(1);
		if (!src.dir) return console.error("No `dir` for ", src.id), usage(1);
		return !src.disabled;
	});
	
} else {
	// check required options
	if (!argv.name) return console.error("Error: Missing `-n` or `--name` option"), usage(1);
	if (!argv.source) return console.error("Error: Missing `-s` or `--source` option"), usage(1);
	if (!argv.dest) return console.error("Error: Missing `-d` or `--dest` option"), usage(1);
	
	// check encrypt / password
	if (argv.encrypt === true) {
		if (!!process.env.AESCRYPT_PASSWORD) {
			arg.encrypt = process.env.AESCRYPT_PASSWORD;
		} else if (process.stdout.isTTY) {
			let password = require("readline-sync").question("Encryption password: ", { hideEchoBack: true });
			if (!password) {
				console.error("No encyryption password specified");
				usage(1);
			};
			argv.encrypt = password;
		} else {
			console.error("No encyryption password specified");
			usage(1);
		}
	}

	config = {
		concurrency: argv.concurrency || Math.max(1, require("os").cpus().length-1),
		force: !!argv.force,
		jobs: [{
			id: argv.id,
			dir: argv.dir,
			dest: argv.dest,
			compress: argv.compress || false,
			encrypt: !!argv.encrypt,
			password: argv.encrypt || undefined,
			symlinks: argv.symlinks || false,
			datefmt: argv.date || "YYYYMMDD",
			exclude: (!!argv.exclude) ? unq(argv.exclude.filter(function(v){ return !!v })) : [],
		}],
	}

}

require("../lib/bckp")({
	concurrency: config.concurrency,
	force: config.force,
}).run(config.jobs,function(err){
	if (err) return console.error(err), process.exit(1);
	process.exit(0);
});
