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