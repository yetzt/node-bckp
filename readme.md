# bckp

a backup tool

## install

`npm i -g bckp`

## usaage

`bckp config.js`

## config file

``` javascript
module.exports = {
	dest: "/var/backup", // local backup destination
	datefmt: "YYYYMMDD", // date format
	concurrency: 8, // concurrent backups
	exclude: [ // global exclude list
		"**/.git",
		"**/node_modules",
		"**/*.tmp",
		"**/*~",
		"**/.DS_Store",
	],
	src: [{
		id: "etc", // identifier → $id.$date.tar.$compress
		dir: "/etc", // one archive
		compress: "xz", // compression: gz|xz|br
		exclude: [ // per-source exclude list
			"**/*-"
		]
	},{
		id: "www",
		dir: "/var/www/*", // separate archives per subfolder
		compress: "gz",
		exclude: [
			"**/*_OLD",
			"**/.htpasswd"
			"**/logs"
		]
	}],
};
```

example: [config.dist.js](./config.dist.js)

## todo

* restore
* symmetric encryption
* public key encryption
* transfert to remote storage
* better parallelisation
* make cronable
* minimum age of latest backup
* delete after retention
