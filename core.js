"use strict";

const VERSION_STR = "Alpha 1.4.1";

// Imports
const Path = require('path');
const FS = require('fs');
const HTTP = require('http');
const HTTPS = require('https');
const Express = require('express');
const FileUpload = require('express-fileupload');
const SleepMode = require('sleep-mode');

var main;
var app = null;
var httpServer;
var httpsServer;
var config;

function init(main_){
	main = main_;
	console.log("--+-- LMS v" + VERSION_STR + " --+--");
	app = Express();
	app.set('view engine', 'ejs');
	app.set('views', './views');
	app.disable('x-powered-by');

	app.use(FileUpload({
		createParentPath: true
	}));
	app.use(Express.json());
	app.use(Express.urlencoded({extended: true})); // Handles POST body translation.
	
	loadConfigs();
	setupHandlers();

	if(config.http.port > 0){
		httpServer = HTTP.createServer(app);
		httpServer.listen(config.http.port, () => {
			console.log('HTTP Ok.');
		});
	}
	if(config.https.port > 0){
		var pKey  = FS.readFileSync(config.https.pkey, 'utf8');
		var certif = FS.readFileSync(config.https.cert, 'utf8');
		httpsServer = HTTPS.createServer({key:pKey, cert:certif}, app);
		httpsServer.listen(config.https.port, () => {
			console.log('HTTPS Ok.');
		});
	}

	console.log("Initialization done.");
}

function loadConfigs(){
	console.log("-- Config --");
	config = { 'GLOBAL': {}};
	parseConfigFile('config.cnf');
	parseConfigFile('config.private.cnf');
	console.log(config);
}

function shutdown(){
	if(httpServer) httpServer.close();
	if(httpsServer) httpsServer.close();
}

function parseConfigFile(path){
	if(!FS.existsSync(path)) return;
	
	var contents = FS.readFileSync(path, 'utf8');
	var lines = contents.split("\n");
	var group = "GLOBAL";

	for(var i = 0; i < lines.length; i++){
		var line = lines[i];
		if(line.trim()){
			if(line.startsWith("[")){
				group = line.substring(1, line.length - 1);
				if(!config[group]){
					config[group] = {};
				}
			} else {
				var line_ = line.split(" = ");
				var key = line_[0];
				if(config[group][key]){
					delete config[group][key];
				}
				config[group][key] = line_[1];
			}
		}
	}
}

function setupHandlers(){
	for(const [mountPoint, mountLocation] of Object.entries(config.folders)){
		app.use(mountPoint, (req, res, next) => {
			var virtualURL = path_join(mountPoint, req.url);
			var URL = decomposeURL(virtualURL);
			var virtualFile = URL.path;
			var absoluteFile = path_resolveVirtual(virtualFile);

			var _GET = parseGETMap(req.url);
			var _vars = {
				'_GET': _GET,
				'_FILE': virtualFile,
			};
			if(req.method == 'POST'){
				_vars._POST = req.body;
			}

			exportStandardViewVars(_vars);
			var op = _GET['v'];
			if(op){
				switch(op){
					case 'thumb':
						handleThumbRequest(absoluteFile, res);
						break;
					case 'control':
						if(req.body['Sleep']){
							SleepMode((err, stderr, stdout) => {
								if (!err && !stderr) {
									console.log(stdout);
								}
							});
						} else if(req.body['Reload']){
							setImmediate(() => {
								shutdown();

								setImmediate(main.loadCore);
							});
						}
						res.render(op, _vars);
						break;
					case 'delete':
						var fn = absoluteFile.substring(absoluteFile.lastIndexOf("/") + 1);
						FS.renameSync(absoluteFile, "trash/" + fn)

						var folderURL = virtualURL.substring(0, virtualURL.lastIndexOf("/") + 1);
						res.redirect(folderURL);
						break;
					default:
						res.render(op, _vars);
				}
			} else {
				if(req.method == 'POST'){
					if(req.body.fileSubmitForm){
						if(req.files){
							var file = req.files.file;
							file.mv(Path.join(absoluteFile, file.name));
						} else {
							console.log("Request files = null. " + req.files);
						}
					} else {
						console.log("Unknown form submit. " + req.files);
					}
				}

				if (FS.existsSync(absoluteFile)) {
					var type = FS.lstatSync(absoluteFile);
					if(type.isDirectory()){
						_vars.folder = virtualFile;
						_vars.files = getFileMap(absoluteFile);
						_vars._COOKIES = parseCookies(req);
						res.render('folder', _vars);
						return;
					}
				}
				next();
			}
		});
	}

	// Static resource handler
	for(var i in config.folders){
		var mountLocation = config.folders[i];
		console.log("[" + i + "] = " + mountLocation);
		app.use(i, Express.static(mountLocation));
	}
	app.use(Express.static('http'));

	// 404 handler.
	app.use((req, res) => {
		var reqFile = decodeURI(req.url);
		res.status(404);
		var vars = {
			'requestedPage': reqFile
		};
		exportStandardViewVars(vars);
		res.render('404.ejs', vars);
	});
}

function handleThumbRequest(_abs, res){
	var absoluteFile = path_normalize(Path.resolve(_abs));
	var i = absoluteFile.lastIndexOf('/');
	var parent = absoluteFile.substring(0, i);
	var file = absoluteFile.substring(i + 1);
	var thumbfolder = parent + '/.thumbs';
	var thumbpath = thumbfolder + '/' + file + '.jpg';
	

	if(config.plugins.ffmpeg){
		if(!FS.existsSync(thumbfolder)) FS.mkdirSync(thumbfolder);
		if(!FS.existsSync(thumbpath)) createThumb(absoluteFile, thumbpath);
		res.sendFile(thumbpath);
	} else {
		if(FS.existsSync(thumbpath)){
			res.sendFile(thumbpath);
		} else {
			res.end("Error.");
		}
	}
}

function createThumb(video, dest){
	const { spawnSync } = require('child_process');
	var args = ['-ss', '00:00:09', '-i', video, '-q:v', '2', '-vf', "scale='iw*256/max(iw,ih):-1'", '-vframes', 1, dest];
	const ffmpeg = spawnSync(config.plugins.ffmpeg, args);
	console.log("TH: " + ffmpeg.stderr);
}

function decomposeURL(url){
	var result = {};
	var i = url.indexOf('?');
	if(i > 0){
		result.path = decodeURI(url.substring(0, i));
		result.query = url.substring(i + 1);
	} else {
		result.path = decodeURI(url);
		result.query = null;
	}
	return result;
}	

function exportStandardViewVars(v){
	v.FS = FS;
	v.Path = Path;
	v.VERSION = VERSION_STR;
	v.S = {
		path_resolveVirtual: path_resolveVirtual,
		path_normalize: path_normalize,
	};
	if(!v._GET) v._GET = null;
	if(!v._POST) v._POST = null;
}

function path_resolveVirtual(path){
	path = path.replace(/\\/g, '/');
	for(const [mountPoint, mountLocation] of Object.entries(config.folders)){
		if(path.startsWith(mountPoint)){
			var relativePath = path_normalize(Path.join(mountLocation, path.substring(mountPoint.length)));
			return relativePath;
		}
	}
	console.log("Couldn't resolve virtual path: " + path);
	return null;
}

function path_join(a, b){
	var as = a.endsWith("/");
	var bs = b.startsWith('/'); 
	if(as && bs){
		return a + b.substring(1);
	} else if(as || bs){
		return a + b;
	} else {
		return a + '/' + b;
	}
}

function path_normalize(path){
	return Path.normalize(path).replace(/\\/g, '/');
}

function parseGETMap(string){
	var GETValueMap = [];
	var i = string.lastIndexOf('?');
	var qm;
	if(i == -1){
		qm = string;
	} else {
		qm = string.substring(i + 1);
	}
	
	var km = qm.split('&');
	for(var i = 0; i < km.length; i++){
		var kmv = km[i];
		var ioe = kmv.indexOf('=');
		var key = kmv.substring(0, ioe);
		var val = kmv.substring(ioe + 1);
		GETValueMap[key] = decodeURIComponent(val);
	}
	return GETValueMap;
}

function parseCookies(req){
	const str = req.get('Cookie');
	const cookies = {
	};
	if(str){
		const decodedCookieStr = decodeURIComponent(str);
		const pairs = decodedCookieStr.split(';');
		for(let i = 0; i < pairs.length; i++) {
			const pair = pairs[i];
			const ps = pair.split('=', 2);
			cookies[ps[0].trim()] = ps[1];
		}
	}
	return cookies;
}

function getFileMap(folder){
	var files = FS.readdirSync(folder);
	var fileMap = [];
	for(var i = 0; i < files.length; i++){
		var file = files[i];
		var filePath = Path.join(folder, file);
		try{
			var type = FS.lstatSync(filePath);
			if(type.isDirectory()){
				fileMap.push(file + "/");
			} else {
				fileMap.push(file);
			}
		} catch (ev){
			fileMap.push(file);
		}
	}
	return fileMap;
}

module.exports = {
	'init': init
};
