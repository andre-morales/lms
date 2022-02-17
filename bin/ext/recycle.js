import * as ChildProcess from 'child_process';

var recyclePath = null;

/** Sets up the path to recycle.exe to use with the recycle function.
 * @param path The Path to the recycle executable file. */
function setRecyclePath(path){
	recyclePath = path;
}

function recycle(path){
	ChildProcess.execFile(recyclePath, [path]);
}

export {recycle, setRecyclePath }