// Internal Imports
import * as Recycle from './ext/recycle.js';
import * as SleepMode from './ext/sleepmode.js';
import * as Pathex from './ext/pathex.js';
import * as FileSystem from './ext/filesystem.js';
import * as ExpressUtils from './ext/express_util.js';

// Imports
import * as Path from 'path';
import * as ChildProcess from 'child_process';

// Requires
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Util = require('util');
const FS = require('fs');
const HTTP = require('http');
const HTTPS = require('https');
const Express = require('express');
const FileUpload = require('express-fileupload');
const EJS = require('ejs');

const VERSION_STR = "Alpha 1.5.1";

const ImageSize = {
	sizeOf: Util.promisify(require('image-size'))
};

var app = null;
var httpServer;
var httpLegacyServer;
var httpsServer;
var config;

function init(){
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
	setupMountPointRoutes();
	startServers();
	
	console.log("Initialization done.");
}

function startServers(){
	if(config.http.port > 0){
		httpServer = HTTP.createServer(app);
		httpServer.listen(config.http.port, () => {
			console.log('HTTP Ok.');
		});
	}
	if(config.http_legacy.port > 0){
		httpLegacyServer = HTTP.createServer(app);
		httpLegacyServer.listen(config.http_legacy.port, () => {
			console.log('HTTP Legacy Ok.');
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
}

function shutdown(){
	if(httpServer) httpServer.close();
	if(httpsServer) httpsServer.close();
}

function loadConfigs(){
	console.log("-- Config --");
	config = { 'GLOBAL': {}};
	loadConfigFile('conf/config.cnf');
	loadConfigFile('conf/config.private.cnf');
	console.log(config);

	Recycle.setRecyclePath(config.recycle_bin.recycle);
}

function loadConfigFile(path){
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

function setupMountPointRoutes(){
	for(const [mountPoint, mountLocation] of Object.entries(config.folders)){
		app.use(mountPoint, async (req, res, next) => {
			var virtualURL = Pathex.join(mountPoint, req.url); // Virtual full URL with mount point and request string.
			var webPath = decomposeURL(virtualURL).path;       // Virtual path with mount point.
			var systemPath = path_resolveVirtual(webPath);     // Absolute system path.
			var _GET = ExpressUtils.parseGETMapFromURL(req.url);
			var viewVars = getStandardViewVars();

			viewVars.std = {
				'getRequestMap': _GET,  // GET
				'getBodyMap': req.body, // POST
				'getCookieMap': () => ExpressUtils.parseCookieMapFromRequest(req),
				'getFilesIn': FileSystem.getFileList,

				'webPath': webPath,
				'systemPath': systemPath
			};

			var op = _GET['v'];
			if(op){
				switch(op){
					case 'thumb':
						await handleThumbRequest(systemPath, res);
						break;
					case 'control':
						if(req.body['Sleep']){
							SleepMode.sleep((err, stderr, stdout) => {
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
						res.render(op, viewVars);
						break;
					case 'download':
						res.download(Pathex.toFullSystemPath(systemPath));
						break;
					case 'delete':
						console.log("recy", webPath);
						Recycle.recycle(systemPath);
						/*var fn = systemPath.substring(systemPath.lastIndexOf("/") + 1);
						FS.renameSync(systemPath, config.GLOBAL.recycle_folder + "/" + fn)

						var folderURL = virtualURL.substring(0, virtualURL.lastIndexOf("/") + 1);*/
									console.log("WB: ", webPath);
						res.redirect(Pathex.parent(webPath));
						break;
					default:
						res.render(op, viewVars);
				}
			} else {
				if(req.method === 'POST'){
					if(req.body.fileSubmitForm){
						if(req.files && req.files.uploaded_files){
							var files = [];
							if(Array.isArray(req.files.uploaded_files)){
								files = req.files.uploaded_files;
							} else {
								files = [req.files.uploaded_files];
							}
							for(var i = 0; i < files.length; i++){
								var file = files[i];
								file.mv(Path.join(systemPath, file.name));
							}				
						} else {
							console.log("Request files = null. " + req.files);
						}
					} else {
						console.log("Unknown form submit. " + req.files);
					}
				}

				if (FS.existsSync(systemPath)) {
					var type = FS.lstatSync(systemPath);
					if(type.isDirectory()){
						//if(!req.originalUrl.endsWith('/')){
						//	res.redirect(req.originalUrl + "/");
						//	return;
						//}

						if(req.socket.localPort === 1150){
							var result = await EJS.renderFile('views/legacy/folder.ejs', viewVars, {async: true});
							res.send(result);
						} else {
							res.render('folder', viewVars);
						}
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
		res.render('404.ejs', vars);
	});
}

/* -- Thumbnail handling -- */
async function handleThumbRequest(_abs, res){
	let absFilePath = Pathex.toFullSystemPath(_abs);

	var i = absFilePath.lastIndexOf('/');
	var parentFolder = absFilePath.substring(0, i);

	var fileName = absFilePath.substring(i + 1);

	var thumbfolder;
	var thumbpath;

	switch(config.thumbs.c_mode){
	case 'local':
		thumbfolder = Pathex.toFullSystemPath(`./thumbnails/`);
		thumbpath = `${thumbfolder}/${btoa(_abs)}.jpg`;
		break;

	case 'inplace':
		thumbfolder = parentFolder + '/.thumbs';
		thumbpath = thumbfolder + '/' + fileName + '.jpg';
		break;
	}

	if(FS.existsSync(thumbpath)){
		res.sendFile(thumbpath);
		return;
	}

	if(config.thumbs.ffmpeg){
		if(!FS.existsSync(thumbfolder)) FS.mkdirSync(thumbfolder);

		if(!FS.existsSync(thumbpath)){
			let result = await createThumb(absFilePath, thumbpath);

			if(!result){
				res.status(404).end();
				return;
			}	
		} 

		res.sendFile(thumbpath);
	} else {
		res.status(404).end();
	}
}


async function createThumb(video, dest){
	// Run ffprobe on video to get video length.
	let videolength = 0;
	{
		let args = ['-i', `${video}`, '-show_entries', 'format=duration', '-v', 'quiet', '-of', 'csv'];
		let ffprobe = await execute(config.thumbs.ffprobe, args);
		videolength = ffprobe.stdout.split("format,")[1] * 1.0;
	}

	let args = ['-ss', videolength / 2, '-i', video, '-q:v', '2', '-vf', "scale='iw*256/max(iw,ih):-1'", '-vframes', 1, dest];
	await execute(config.thumbs.ffmpeg, args);
	return true;
}

function execute(file, args, options){
	return new Promise((resolve, reject) => {
		let process;
		let callback = (err, sout, serr) => {
			if(err){
				reject(err);
			} else {
				resolve({'app': app, 'stdout': sout, 'stderr': serr});
			}
		};
		
		process = ChildProcess.execFile(file, args, options, callback);
		
	});
}

function p_spawn(path, args, options){
	
	
	ChildProcess.execFile(path, args, options);
	
	let app = ChildProcess.spawn(path, args, options);
	let close_p = new Promise((resolve, reject) => {
		app.on('close', (code) => {
			resolve(code);
		});
	});
	let exit_p = new Promise((resolve, reject) => {
		app.on('exit', (code) => {
			resolve(code);
		});
	});
	return {
		'app': app,
		'pid': app.pid,
		'close_p': close_p,
		'exit_p': exit_p
	};
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

function getStandardViewVars(){
	return {
		'FS': FS,
		'Path': Path,
		'ImageSize': ImageSize,
		'Pathex': Pathex,
		'Sys': {
			path_resolveVirtual: path_resolveVirtual,
			path_normalize: Pathex.normalize,
			decomposeURL: decomposeURL,
		},
		'VERSION': VERSION_STR,
	};

}

function path_resolveVirtual(path){
	path = path.replace(/\\/g, '/');
	for(const [mountPoint, mountLocation] of Object.entries(config.folders)){
		if(path.startsWith(mountPoint)){
			var relativePath = Pathex.normalize(Path.join(mountLocation, path.substring(mountPoint.length)));
			return relativePath;
		}
	}
	console.log("Couldn't resolve virtual path: " + path);
	return null;
}

init();