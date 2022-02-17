import * as FS from 'fs';
import * as Path from 'path';

/**
 * Returns a list of files present inside the folder path given.
 * Folders in the list have a trailing / on the end to indicate such.
 * The path must be a system path. 
 * 
 * @param folder Path to folder */
function getFileList(folder){
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

export { getFileList }