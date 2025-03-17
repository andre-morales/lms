// -- Self

//const Main = await import('./core.js');
//Main.init();

// -- External
import * as CProcess from 'child_process';

var args = ["bin\\core.js", "--stub-run"];
var opt = {
	detached: true,
	stdio: 'ignore'
}
let pr = CProcess.spawn("node.exe", args, opt);
pr.unref();