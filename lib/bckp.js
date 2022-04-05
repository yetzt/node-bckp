
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const tar = require("tar");
const quu = require("quu");
const unq = require("unq");
const glob = require("glob");
const lzma = require("node-liblzma");
const debug = require("debug")("bckp");
const walker = require("walker");
const moment = require("moment");
const aescrypt = require("node-aescrypt");
const filesize = require("filesize");
const minimatch = require("minimatch");
const farm = require("worker-farm");

const bckp = module.exports = function bckp(opt, fn){
	if (!(this instanceof bckp)) return new bckp(opt);

	this.opt = { 
		concurrency: (opt.concurrency || Math.max(1, os.cpus().length-1)),
		force: !!opt.force,
	};
		
	return this;
};

// run jobs
bckp.prototype.run = function run(jobs, fn){
	const self = this;
		
	const j = [];
	const subq = quu(10, true);
	
	// expand subdirs
	jobs.forEach(function(job){
		if (job.dir.substr(-2) !== path.sep+"*") return j.push(job);

		debug("[run] get subdirs for '%s'", job.id);

		// create jobs from sources
		subq.push(function(next){
			self.subdirs(path.dirname(job.dir), job.exclude, function(err, subdirs){
				if (err) return next(err);
				debug("[run] %d subdirs for '%s'", subdirs.length, job.id);
				subdirs.forEach(function(subdir){
					j.push({
						...job,
						dir: subdir,
						id: [job.id, path.basename(subdir)].join(path.sep),
					});
				});
				next();
			});
		});
	});

	// in case subq is empty FIXME fix quu
	subq.push(function(next){ next(); });

	subq.run(function(errs){
		if (errs.length) return fn(errs[0]);
		if (j.length === 0) return fn(null);
		debug("[run] %d jobs", j.length);
		
		const runq = quu(self.opt.concurrency, true);
		
		const worker = farm({
			maxConcurrentWorkers: self.opt.concurrency,
			maxConcurrentCallsPerWorker: 1,
			maxConcurrentCalls: self.opt.concurrency,
		}, require.resolve('../bin/bckp-worker.js'));
		
		j.forEach(function(job){
			runq.push(function(next){
				
				// do things
				(function(proceed){
					if (self.opt.force) return proceed(); // don't check when --force
					self.latest(job, function(err, latestfile, mtime){
						if (err) return debug("[run] failed '%s': %s", job.id, err), next(err);
						if (!latestfile) return proceed(); // if no backup was found a backup is needed
						// scan dir for modified
						self.modified(job, function(err, newest){
							if (err) return debug("[run] failed '%s': %s", job.id, err), next(err);
							if (newest <= mtime) return debug("[run] no change '%s'", job.id), next(); // check if new backup is needed
							proceed();
						});
					});
				})(function(){ // procees
					// do actiual backup with all bells and whistles
					debug("[run] start '%s'", job.id);
					worker(job, function(err, file, stat, time){
						if (err) debug("[run] failed '%s': %s", job.id, err);
						return next(err);
					});
				});
			});
		});

		let compl = 0;
		let progress = (!!process.env.DEBUG) ? setInterval(function(){
			if (runq.completed === compl) return;
			debug("[run] %d/%d completed", runq.completed, runq.running+runq.completed);
			compl = runq.completed;
		},1000) : null;
		
		
		runq.run(function(errs){
			farm.end(worker);
			if (progress) clearInterval(progress);
			debug("[run] all jobs completed, %d errors", (errs||[]).length);
			if (errs && errs.length > 0) return fn(errs[0]);
			return fn(null);
		});
		
	});
	
	return this;
};

// find subdirectories
bckp.prototype.subdirs = function subdirs(dir, exclude, fn){
	const self = this;
	
	debug("[subdirs] %s", dir);
	
	fs.readdir(dir, function(err, files){
		if (err) return fn(err);
		const q = quu(self.opt.concurrency, true);
		const result = [];
		files.forEach(function(file){
			q.push(function(next){

				// test exlusions
				if (exclude.length && exclude.find(function(pattern){
					return minimatch(file, pattern);
				})) return next();

				// resolve file path
				file = path.resolve(dir, file)

				// filter directories
				fs.stat(file, function(err, stat){
					if (!err && stat.isDirectory()) result.push(file);
					return next();
				});
				
			});
		});
		q.run(function(){
			return fn(null, result);
		});
	});
	return this;
};

// find greatest mtime in a directory
bckp.prototype.modified = function modified(job, fn){ // local exclude
	const self = this;
	let mtime = 0;
	let symlinks = [];
	fs.access(job.dir, fs.constants.R_OK | fs.constants.X_OK, function(err){
		if (err) return fn(err, mtime);
		walker(job.dir).filterDir(function(subdir, stat) {
			subdir = path.relative(job.dir, subdir);
			return !(job.exclude.length && job.exclude.find(function(pattern){
				return minimatch(subdir, pattern);
			}));
		}).on('symlink', function(symlink, stat) {
			if (!job.symlinks || symlinks.includes(symlink)) return; // prevent circles
			symlinks.push(symlink);
			const w = this;
			fs.realpath(symlink, function(err, resolved){
				if (!err) w.go(resolved);
			});
		}).on('file', function(file, stat){
			file = path.relative(job.dir, file);
			if (job.exclude.length && job.exclude.find(function(pattern){
				return minimatch(file, pattern);
			})) return;
			if (stat.mtimeMs > mtime) mtime = stat.mtimeMs;
		}).on("error", function(){}).on('end', function(){
			return fn(null, mtime);
		});
	});
	return this;
}

// find the latest file for a job
bckp.prototype.latest = function latest(job, fn){
	const self = this;
	
	glob(path.resolve(job.dest, job.id)+"?(.*).tar?(.gz|.br|.xz)?(.aes)", function(err, files){
		if (files.length === 0) return fn(null, null, 0);
		
		const statq = quu(10, 1);
		let latest = [null, 0];
		
		files.forEach(function(file){
			statq.push(function(next){
				fs.stat(file, function(err, stat){
					if (!err && stat.mtimeMs > latest[1]) latest = [file, stat.mtimeMs];
					next();
				});
			});
		});
		
		statq.run(function(){
			return fn(null, latest[0], latest[1]);
		});
		
	});
	
	return this;
};
