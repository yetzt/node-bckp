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