const fs = require("fs");
const tar = require("tar");
const path = require("path");
const zlib = require("zlib");
const lzma = require("node-liblzma");
const debug = require("debug")("bckp");
const moment = require("moment");
const aescrypt = require("node-aescrypt");
const filesize = require("filesize");
const minimatch = require("minimatch");

const backup = module.exports = function backup(job, fn){
	
	// check encryption password
	if (!!job.encrypt && (!job.password || typeof job.password !== "string")) return fn(new Error("Invalid password for AES encryption"));

	// keep start time
	let start = Date.now();

	// construct dest filename
	let dest = job.id+"."+moment().format(job.datefmt)+".tar";
	
	// create tar
	let stream = tar.create({
		filter: function(filepath, stat){
			filepath = path.relative(job.dir, filepath); // use relative paths
			return (!job.exclude.find(function(pattern){
				return minimatch(filepath, pattern);
			}));
		},
		follow: job.symlinks,
	}, [ job.dir ]);
	
	// compress when wanted
	if (job.compress) {
		switch (job.compress) {
			case "xz":
				stream = stream.pipe(lzma.createXz());
				dest = dest+".xz";
			break;
			case "br":
				stream = stream.pipe(zlib.createBrotliCompress());
				dest = dest+".br";
			break;
			default:
				stream = stream.pipe(zlib.createGzip());
				dest = dest+".gz";
			break;
		}
	}

	// encrypt when wanted (aescrypt compatible)
	if (!!job.encrypt) {
		stream = stream.pipe(new aescrypt.Encrypt(job.password));
		dest = dest+".aes";
	}
	
	// resolve dest, create temporary file name
	const dfile = path.resolve(job.dest, dest);
	const dtmp = dfile+"."+(Math.round(Math.random()*60466176).toString(36))+".tmp";
	
	// ensure dest dir
	fs.mkdir(path.dirname(dtmp), { recursive: true }, function(err){
		if (err) return fn(err);

		// write
		let streamerr = null;
		stream.pipe(fs.createWriteStream(dtmp)).on("error", function(err){
			streamerr = err;
		}).on("close", function(){
			if (streamerr) return fs.unlink(dtmp, function(){ 
				fn(streamerr); 
			});
			fs.rename(dtmp, dfile, function(err){
				if (err) return  fs.unlink(dtmp, function(){ 
					fn(err); 
				});
				fs.stat(dfile, function(err, stat){
					const time = (Date.now()-start);
					debug("[backup] complete '%s' | %s | %ds", job.id, filesize(stat.size), (time/1000).toFixed(1));

					// FIXME remote HERE

					fn(err, dfile, stat, time);
				});
			});
		});
		
	});
	
};