

/** Parses the given URL with an encoded query string and 
  * returns a key-value map for every entry on the query string. 
  * 
  * @param string url-encoded string to be parsed */
export function parseGETMapFromURL(string){
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

/** Parses all the cookies in a request and returns
  * a map with the pairs.
  * 
  * @param req Express request object. */
export function parseCookieMapFromRequest(req){
	const str = req.get('Cookie');
	const cookies = {};
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