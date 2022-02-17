var contextMenuW = null;
var contextMenu_watch = null;
var contextMenu_edit = null;
var contextMenu_download = null;

function main(){
	if(!IE5_OR_NEWER) return;
	var el = document.getElementById("viewstyle-" + getCookie("viewStyle"));
	if(el) el.checked = true;	

	polyfill_util();

	var buttons = document.getElementsByTagName("button");
	for(var i = 0; i < buttons.length; i++){
		var btn = buttons[i];
		if(btn.parentNode.className == 'menu-wrapper'){
			(function(btn){
				btn.onclick = function(){
					openContextMenu(btn);
				}
			})(btn);
		}
		btn.innerHTML = " &gt; ";
	}

	contextMenu = document.getElementById("context-menu");
	contextMenu_watch = document.getElementById("cm-watch");
	contextMenu_edit = document.getElementById("cm-edit");
	contextMenu_download = document.getElementById("cm-download");

	addListener(document, 'click', function(t, event, target){
		if(contextMenuW){
			if(!dom_contains(contextMenuW, target)){
				cm_close();
			}
		}
	});
}

function changeView(style){
	setCookie('viewStyle', style, 365);
	location.reload();
}

function toggleThumbnails(toggled){
	setCookie('viewStyle_thumbs', toggled, 365);
	location.reload();
}

function openContextMenu(ctx){
	if(!IE5_OR_NEWER) return;

	contextMenuW = ctx.parentElement;
	contextMenuW.appendChild(contextMenu);
	contextMenuPath = contextMenuW.parentElement.getAttribute("data-path");

	if(isVideo(contextMenuPath)){
		addClass(contextMenu, "watchable");
		contextMenu_watch.setAttribute("href", "javascript:watch();");
	} else {
		removeClass(contextMenu, "watchable");
		contextMenu_watch.removeAttribute("href");
	}
	if(isFolder(contextMenuPath)){
		removeClass(contextMenu, "editable");
		contextMenu_edit.removeAttribute("href");

		removeClass(contextMenu, "downloadable");
		contextMenu_download.removeAttribute("href");
	} else {
		addClass(contextMenu, "editable");
		contextMenu_edit.setAttribute("href", "javascript:edit();");

		addClass(contextMenu, "downloadable");
		contextMenu_download.setAttribute("href", "javascript:download();");
	}
}

function isFolder(file){
	return endsWith(file, '/');
}

function isVideo(file){
	return endsWith(file, ".mp4") || endsWith(file, ".webm") || endsWith(file, ".mkv") || endsWith(file, ".3gp");
}

function cm_close(){
	document.body.appendChild(contextMenu);
	contextMenuW = null;
}

function watch(){
	window.location.href = contextMenuPath + "?v=watch";
}

function edit(){
	window.location.href = contextMenuPath + "?v=edit";
}

function download(){
	window.location.href = contextMenuPath + "?v=download";
}

function delete_(){
	window.location.href = contextMenuPath + "?v=delete";
}