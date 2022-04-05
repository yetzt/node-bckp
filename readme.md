# bckp

a backup tool

## install

`npm i -g bckp`

## usaage

`bckp config.js`

## command line options

### Global options

* `-h --help` Show this help message
* `-v --verbose` Show debug information
* `-f --force` Create backup regardless of changes
* `-p --concurrency <num>` Maximum number of parallel streams (Default: Number of CPU cores - 1)

### Use config file

* `-c --config <config.js>` Use config file (Direct options are ignored)

### Direct call options

* `-n --name name` Name of the destination file (name.`<date>`.tar\[.gz|.br|.xz]\[.aes])
* `-s --dir /dir` Create a backup of this directory
* `-s --dir /dir/*` Create a backup of all directories in this directory
* `-d --dest /dir` Save the backup in this location
* `-z --compress [gz|br|xz]` Compress the archive with gzip, brotli or lzma (default: gzip)
* `-e --encrypt [<password>]` Encrypt the archive compatible to aescrypt with this password (otherwise env.AESCRYPT_PASSWORD or prompt on tty is used)
* `-x --exclude <pattern>` Exlude files matching pattern from backup (repeatable for multiple patterns)
* `-t --date <format>` Specify date format (Default: YYYYMMDD)
* `-l --symlinks` Resolve Symlinks (Default: No)

## config file

``` javascript
module.exports = {
	datefmt: "YYYYMMDD", // date format
	concurrency: 8, // concurrent backups
	exclude: [ // global exclude list
		"**/.git",
		"**/node_modules",
		"**/*.tmp",
		"**/*~",
		"**/.DS_Store",
	],
	jobs: [{
		id: "etc", // identifier → $id.$date.tar[.$compress][.aes]
		dir: "/etc", // one archive
		dest: "/opt/backup", // local backup destination
		compress: "xz", // compression: gz|xz|br
		encrypt: "replace-this-with-a-password"
	},{
		id: "www",
		dir: "/var/www/*", // separate archives per subfolder
		compress: "gz",
		exclude: [ // per-source exclude list
			"**/*_OLD",
			"**/.htpasswd"
			"**/logs"
		]
	}],
};
```

example: [config.dist.js](./config.dist.js)

## todo

* ~symmetric encryption~
* ~better parallelisation~
* ~ensure .tmp files are removed~
* restore
* public key encryption
* transfer to remote storage
* make cronable
* minimum age of latest backup
* delete after retention
