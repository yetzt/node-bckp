#!/usr/bin/env node

const argv = require("yargs-parser")(process.argv.slice(2), { alias: { quiet: ["q"], config: ["c"], concurrency: ["p"] }, number: ["concurrency"], boolean: ["quiet"] });
require("colrz");

if (!argv.quiet) process.env.DEBUG = process.env.DEBUG || "bckp";

const fs = require("fs");
const path = require("path");
const debug = require("debug")("bckp");
const tar = require("tar");
const minimatch = require("minimatch");
const unq = require("unq");
const quu = require("quu");
const walker = require("walker");
const moment = require("moment");
const lzma = require("lzma-native");
const zlib = require("zlib");
const filesize = require("filesize");

// load config
if ((!argv.config || (typeof argv.config) !== "string") && argv._.length === 0) console.error("Missing config:\n\tbackup [backup|restore] [-c] config.js".red), process.exit(1);

let config;
try {
	config = require(path.resolve(process.cwd(), argv.config || argv._[0]));
} catch (err) {
	console.error("Unable to load config:\n\tbackup [backup|restore] [-c] config.js".red), process.exit(1);
}

const concurrency = Number.isInteger(argv.concurrency) ? argv.concurrency: (config.concurrency || Math.max(1, require("os").cpus().length-1));

const q = quu(concurrency, true);

const bckp = function(src, fn){
	if (!src.id) return fn(new Error("No id"));

	const exclude = [ ...(config.exclude||[]), ...(src.exclude||[]) ];
	
	if (src.dir.substr(-2) === path.sep+"*") {
		const dir = src.dir.substr(0,src.dir.length-2);
		return subdirs(dir, exclude, function(err, dirs){
			if (err) return fn(err);
			
			dirs.forEach(function(dir){
				q.push(function(next){
					bckp({
						...src,
						dir: dir,
						id: [src.id, path.basename(dir)].join(path.sep),
					}, next);
					
				});
				
			});
			
		});
	}

	const compress = (((src.hasOwnProperty("compress")) ? src.compress : config.compress) || false);

	const destdir = ((src.hasOwnProperty("dest")) ? src.dest : config.dest);
	
	if (!destdir) return debug("%s — No destination directory".red, src.id), fn(new Error("No destination directory"));

	const extension = (!!compress) ? "tar."+compress : "tar";

	const dest = path.resolve(destdir, [ src.id, "latest", extension ].join("."));

	fs.mkdir(destdir, { recursive: true, mode: 0o700 }, function(err){
		if (err) return debug("%s".red, err), fn(err);
		
		// check if latest already exists
		fs.stat(dest, function(err, stat){
			if (err && err.code !== "ENOENT") return debug("%s".red, err), fn(err);
		
			// shortcut: initial backup without checking
			if (err && err.code === "ENOENT") {

				// create initial backup
				debug("[%s] initial backup".magenta, src.id);

				const time_start = Date.now();
				return backup(src.dir, dest, exclude, compress, false, function(err, stat){
					if (err) return debug("[%s] %s".red, src.id, err), fn(err);
					debug("[%s] %s | %ss".green, src.id, filesize(stat.size), ((Date.now()-time_start)/1000).toFixed(2));
					return fn(null);
				});
			
			}
		
			modified(src.dir, exclude, function(err, mtime){

				if (err) return debug("[%s] %s".red, src.id, err), fn(err);
				if (mtime <= stat.mtimeMs) return debug("[%s] no change".grey, src.id), fn(null);

				// rotate 
				const rotatedate = moment(stat.mtime).format(config.datefmt||"YYYYMMDD");
				const rotatedest = path.resolve(destdir, [ src.id, rotatedate, extension ].join("."));
				
				fs.rename(dest, rotatedest, function(err){
					if (err) return debug("%s".red, err), fn(err);
					debug("[%s] rotate latest → %s".cyan, src.id, rotatedate);
					debug("[%s] fresh backup".magenta, src.id);

					// create fresh backup
					const time_start = Date.now();
					return backup(src.dir, dest, exclude, compress, false, function(err, stat){
						if (err) return debug("[%s] %s".red, src.id, err), fn(err);
						debug("[%s] %s | %ss".green, src.id, filesize(stat.size), ((Date.now()-time_start)/1000).toFixed(2));
						return fn(null);
					});

				});
				
			});
		
		});
		
	});
	
};

const backup = function(srcdir, dest, exclude, compress, encrypt, fn){
		
	let stream = tar.create({
		filter: function(filepath, stat){
			return !exclude.find(function(pattern){
				return minimatch(filepath, pattern);
			});
		},
	}, [ srcdir ]);
	
	if (compress) {
		switch (compress) {
//			case "xz":
//				stream = stream.pipe(lzma.createCompressor({ threads: concurrency }));
//			break;
			case "gz":
				stream = stream.pipe(zlib.createGzip());
			break;
			case "br":
				stream = stream.pipe(zlib.createBrotliCompress());
			break;
		}
	}

	// FIXME encrypt
	
	// create random tmp name
	const tmpdest = dest+"."+(Math.round(Math.random()*60466176).toString(36))+".tmp";
	
	stream.pipe(fs.createWriteStream(tmpdest)).on("close", function(){
		fs.rename(tmpdest, dest, function(err){
			if (err) return fn(err);
			fs.stat(dest, fn);
		});
	});
	
	// FIXME handle error
	
};

const subdirs = function(dir, exclude, fn){
	fs.readdir(dir, function(err, files){
		if (err) return fn(err);
		const sq = quu(10,true);
		const result = [];
		files.map(function(file){
			sq.push(function(next){
				const p = path.resolve(dir, file);
				// test exclusions
				if (exclude.length && exclude.find(function(pattern){
					return minimatch(p, pattern);
				})) return next();
				fs.stat(p, function(err,stats){
					if (!err && stats.isDirectory()) result.push(p);
					return next();
				});
			});
		});
		sq.run(function(){
			return fn(null, result);
		});
	});
};

// find the greatest mtime within a direcotry
const modified = function(dir, exclude, fn) {
	let mtime = 0;
	walker(dir).filterDir(function(subdir, stat) {
		return !(exclude.length && exclude.find(function(pattern){
			return minimatch(subdir, pattern);
		}));
	}).on('file', function(file, stat){
		if (exclude.length && exclude.find(function(pattern){
			return minimatch(file, pattern);
		})) return;
		if (stat.mtimeMs > mtime) mtime = stat.mtimeMs;
	}).on('end', function(){
		return fn(null, mtime);
	});
}

config.src.forEach(function(src){
	q.push(function(next){
		bckp(src, next);
	});
});

q.run(function(errs){
	if (errs.length > 0) process.exit(1);
});
