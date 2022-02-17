"use strict";

import * as ChildProcess from 'child_process';

function sleep(callback){
	let cmd = 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0';

	ChildProcess.exec(cmd, (err, stderr, stdout) => {
		callback(err, stderr, stdout);
	});
}

export { sleep }