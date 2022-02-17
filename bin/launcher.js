import * as CProcess from 'child_process';

var args = ["bin\\core.js"];
var opt = {
	detached: true,
	stdio: 'ignore'
}
let pr = CProcess.spawn("node.exe", args, opt);
pr.unref();
