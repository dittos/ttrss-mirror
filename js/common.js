'use strict';

/* global dijit, __, App, Ajax */

/* error reporting shim */
// TODO: deprecated; remove
/* function exception_error(e, e_compat, filename, lineno, colno) {
	if (typeof e == "string")
		e = e_compat;

	App.Error.report(e, {filename: filename, lineno: lineno, colno: colno});
} */

/* xhr shorthand helpers */

/* exported xhrPost */
function xhrPost(url, params, complete) {
	console.log("xhrPost:", params);

	return new Promise((resolve, reject) => {
		new Ajax.Request(url, {
			parameters: params,
			onComplete: function(reply) {
				if (complete != undefined) complete(reply);

				resolve(reply);
			}
		});
	});
}

/* exported xhrJson */
function xhrJson(url, params, complete) {
	return new Promise((resolve, reject) => {
		return xhrPost(url, params).then((reply) => {
			let obj = null;

			try {
				obj = JSON.parse(reply.responseText);
			} catch (e) {
				console.error("xhrJson", e, reply);
			}

			if (complete != undefined) complete(obj);

			resolve(obj);
		});
	});
}

/* add method to remove element from array */
Array.prototype.remove = function(s) {
	for (let i=0; i < this.length; i++) {
		if (s == this[i]) this.splice(i, 1);
	}
};

/* common helpers not worthy of separate Dojo modules */

/* exported Lists */
const Lists = {
	onRowChecked: function(elem) {
		const checked = elem.domNode ? elem.attr("checked") : elem.checked;
		// account for dojo checkboxes
		elem = elem.domNode || elem;

		const row = elem.up("li");

		if (row)
			checked ? row.addClassName("Selected") : row.removeClassName("Selected");
	},
	select: function(elemId, selected) {
		$(elemId).select("li").each((row) => {
			const checkNode = row.select(".dijitCheckBox,input[type=checkbox]")[0];
			if (checkNode) {
				const widget = dijit.getEnclosingWidget(checkNode);

				if (widget) {
					widget.attr("checked", selected);
				} else {
					checkNode.checked = selected;
				}

				this.onRowChecked(widget);
			}
		});
	},
};

/* exported Tables */
const Tables = {
	onRowChecked: function(elem) {
		// account for dojo checkboxes
		const checked = elem.domNode ? elem.attr("checked") : elem.checked;
		elem = elem.domNode || elem;

		const row = elem.up("tr");

		if (row)
			checked ? row.addClassName("Selected") : row.removeClassName("Selected");

	},
	select: function(elemId, selected) {
		$(elemId).select("tr").each((row) => {
			const checkNode = row.select(".dijitCheckBox,input[type=checkbox]")[0];
			if (checkNode) {
				const widget = dijit.getEnclosingWidget(checkNode);

				if (widget) {
					widget.attr("checked", selected);
				} else {
					checkNode.checked = selected;
				}

				this.onRowChecked(widget);
			}
		});
	},
	getSelected: function(elemId) {
		const rv = [];

		$(elemId).select("tr").each((row) => {
			if (row.hasClassName("Selected")) {
				// either older prefix-XXX notation or separate attribute
				const rowId = row.getAttribute("data-row-id") || row.id.replace(/^[A-Z]*?-/, "");

				if (!isNaN(rowId))
					rv.push(parseInt(rowId));
			}
		});

		return rv;
	}
};

/* exported Cookie */
const Cookie = {
	set: function (name, value, lifetime) {
		const d = new Date();
		d.setTime(d.getTime() + lifetime * 1000);
		const expires = "expires=" + d.toUTCString();
		document.cookie = name + "=" + encodeURIComponent(value) + "; " + expires;
	},
	get: function (name) {
		name = name + "=";
		const ca = document.cookie.split(';');
		for (let i=0; i < ca.length; i++) {
			let c = ca[i];
			while (c.charAt(0) == ' ') c = c.substring(1);
			if (c.indexOf(name) == 0) return decodeURIComponent(c.substring(name.length, c.length));
		}
		return "";
	},
	delete: function(name) {
		const expires = "expires=Thu, 01-Jan-1970 00:00:01 GMT";
		document.cookie = name + "=; " + expires;
	}
};

/* runtime notifications */
/* exported Notify */
const Notify = {
	KIND_GENERIC: 0,
	KIND_INFO: 1,
	KIND_ERROR: 2,
	KIND_PROGRESS: 3,
	timeout: 0,
	default_timeout: 5 * 1000,
	close: function() {
		this.msg("");
	},
	msg: function(msg, keep, kind) {
		kind = kind || this.KIND_GENERIC;
		keep = keep || false;

		const notify = $("notify");

		window.clearTimeout(this.timeout);

		if (!msg) {
			notify.removeClassName("visible");
			return;
		}

		let msgfmt = "<span class=\"msg\">%s</span>".replace("%s", __(msg));
		let icon = "";

		notify.className = "notify";

		console.warn('notify', msg, kind);

		switch (kind) {
			case this.KIND_INFO:
				notify.addClassName("notify_info")
				icon = "notifications";
				break;
			case this.KIND_ERROR:
				notify.addClassName("notify_error");
				icon = "error";
				break;
			case this.KIND_PROGRESS:
				notify.addClassName("notify_progress");
				icon = App.getInitParam("icon_indicator_white")
				break;
			default:
				icon = "notifications";
		}

		if (icon)
			if (icon.indexOf("data:image") != -1)
				msgfmt = "<img src=\"%s\">".replace("%s", icon) + msgfmt;
			else
				msgfmt = "<i class='material-icons icon-notify'>%s</i>".replace("%s", icon) + msgfmt;

		msgfmt += "<i class='material-icons icon-close' title=\"" +
			__("Click to close") + "\" onclick=\"Notify.close()\">close</i>";

		notify.innerHTML = msgfmt;
		notify.addClassName("visible");

		if (!keep)
			this.timeout = window.setTimeout(() => {
				notify.removeClassName("visible");
			}, this.default_timeout);

	},
	info: function(msg, keep) {
		keep = keep || false;
		this.msg(msg, keep, this.KIND_INFO);
	},
	progress: function(msg, keep) {
		keep = keep || true;
		this.msg(msg, keep, this.KIND_PROGRESS);
	},
	error: function(msg, keep) {
		keep = keep || true;
		this.msg(msg, keep, this.KIND_ERROR);
	}
};

// http://stackoverflow.com/questions/6251937/how-to-get-selecteduser-highlighted-text-in-contenteditable-element-and-replac
/* exported getSelectionText */
function getSelectionText() {
	let text = "";

	if (typeof window.getSelection != "undefined") {
		const sel = window.getSelection();
		if (sel.rangeCount) {
			const container = document.createElement("div");
			for (let i = 0, len = sel.rangeCount; i < len; ++i) {
				container.appendChild(sel.getRangeAt(i).cloneContents());
			}
			text = container.innerHTML;
		}
	} else if (typeof document.selection != "undefined") {
		if (document.selection.type == "Text") {
			text = document.selection.createRange().textText;
		}
	}

	return text.stripTags();
}
