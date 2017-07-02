var loading_progress = 0;
var sanity_check_done = false;
var init_params = {};
var _label_base_index = -1024;
var notify_hide_timerid = false;

Ajax.Base.prototype.initialize = Ajax.Base.prototype.initialize.wrap(
	function (callOriginal, options) {

		if (getInitParam("csrf_token") != undefined) {
			Object.extend(options, options || { });

			if (Object.isString(options.parameters))
				options.parameters = options.parameters.toQueryParams();
			else if (Object.isHash(options.parameters))
				options.parameters = options.parameters.toObject();

			options.parameters["csrf_token"] = getInitParam("csrf_token");
		}

		return callOriginal(options);
	}
);

/* add method to remove element from array */

Array.prototype.remove = function(s) {
	for (var i=0; i < this.length; i++) {
		if (s == this[i]) this.splice(i, 1);
	}
};


function report_error(message, filename, lineno, colno, error) {
	exception_error(error, null, filename, lineno);
}

function exception_error(e, e_compat, filename, lineno, colno) {
	if (typeof e == "string") e = e_compat;

	if (!e) return; // no exception object, nothing to report.

	try {
		console.error(e);
		var msg = e.toString();

		try {
			new Ajax.Request("backend.php", {
				parameters: {op: "rpc", method: "log",
					file: e.fileName ? e.fileName : filename,
					line: e.lineNumber ? e.lineNumber : lineno,
					msg: msg, context: e.stack},
				onComplete: function (transport) {
					console.warn(transport.responseText);
				} });

		} catch (e) {
			console.error("Exception while trying to log the error.", e);
		}

		var content = "<div class='fatalError'><p>" + msg + "</p>";

		if (e.stack) {
			content += "<div><b>Stack trace:</b></div>" +
				"<textarea name=\"stack\" readonly=\"1\">" + e.stack + "</textarea>";
		}

		content += "</div>";

		content += "<div class='dlgButtons'>";

		content += "<button dojoType=\"dijit.form.Button\" "+
				"onclick=\"dijit.byId('exceptionDlg').hide()\">" +
				__('Close') + "</button>";
		content += "</div>";

		if (dijit.byId("exceptionDlg"))
			dijit.byId("exceptionDlg").destroyRecursive();

		var dialog = new dijit.Dialog({
			id: "exceptionDlg",
			title: "Unhandled exception",
			style: "width: 600px",
			content: content});

		dialog.show();

	} catch (ei) {
		console.error("Exception while trying to report an exception:", ei);
		console.error("Original exception:", e);

		alert("Exception occured while trying to report an exception.\n" +
			ei.stack + "\n\nOriginal exception:\n" + e.stack);
	}

}

function param_escape(arg) {
	if (typeof encodeURIComponent != 'undefined')
		return encodeURIComponent(arg);
	else
		return escape(arg);
}

function param_unescape(arg) {
	if (typeof decodeURIComponent != 'undefined')
		return decodeURIComponent(arg);
	else
		return unescape(arg);
}

function notify_real(msg, no_hide, n_type) {

	var n = $("notify");

	if (!n) return;

	if (notify_hide_timerid) {
		window.clearTimeout(notify_hide_timerid);
	}

	if (msg == "") {
		if (n.hasClassName("visible")) {
			notify_hide_timerid = window.setTimeout(function() {
				n.removeClassName("visible") }, 0);
		}
		return;
	}

	/* types:

		1 - generic
		2 - progress
		3 - error
		4 - info

	*/

	msg = "<span class=\"msg\"> " + __(msg) + "</span>";

	if (n_type == 2) {
		msg = "<span><img src=\""+getInitParam("icon_indicator_white")+"\"></span>" + msg;
		no_hide = true;
	} else if (n_type == 3) {
		msg = "<span><img src=\""+getInitParam("icon_alert")+"\"></span>" + msg;
	} else if (n_type == 4) {
		msg = "<span><img src=\""+getInitParam("icon_information")+"\"></span>" + msg;
	}

	msg += " <span><img src=\""+getInitParam("icon_cross")+"\" class=\"close\" title=\"" +
		__("Click to close") + "\" onclick=\"notify('')\"></span>";

	n.innerHTML = msg;

	window.setTimeout(function() {
		// goddamnit firefox
		if (n_type == 2) {
		n.className = "notify notify_progress visible";
			} else if (n_type == 3) {
			n.className = "notify notify_error visible";
			msg = "<span><img src='images/alert.png'></span>" + msg;
		} else if (n_type == 4) {
			n.className = "notify notify_info visible";
		} else {
			n.className = "notify visible";
		}

		if (!no_hide) {
			notify_hide_timerid = window.setTimeout(function() {
				n.removeClassName("visible") }, 5*1000);
		}

	}, 10);

}

function notify(msg, no_hide) {
	notify_real(msg, no_hide, 1);
}

function notify_progress(msg, no_hide) {
	notify_real(msg, no_hide, 2);
}

function notify_error(msg, no_hide) {
	notify_real(msg, no_hide, 3);

}

function notify_info(msg, no_hide) {
	notify_real(msg, no_hide, 4);
}

function setCookie(name, value, lifetime, path, domain, secure) {

	var d = false;

	if (lifetime) {
		d = new Date();
		d.setTime(d.getTime() + (lifetime * 1000));
	}

	console.log("setCookie: " + name + " => " + value + ": " + d);

	int_setCookie(name, value, d, path, domain, secure);

}

function int_setCookie(name, value, expires, path, domain, secure) {
	document.cookie= name + "=" + escape(value) +
		((expires) ? "; expires=" + expires.toGMTString() : "") +
		((path) ? "; path=" + path : "") +
		((domain) ? "; domain=" + domain : "") +
		((secure) ? "; secure" : "");
}

function delCookie(name, path, domain) {
	if (getCookie(name)) {
		document.cookie = name + "=" +
		((path) ? ";path=" + path : "") +
		((domain) ? ";domain=" + domain : "" ) +
		";expires=Thu, 01-Jan-1970 00:00:01 GMT";
	}
}


function getCookie(name) {

	var dc = document.cookie;
	var prefix = name + "=";
	var begin = dc.indexOf("; " + prefix);
	if (begin == -1) {
		begin = dc.indexOf(prefix);
		if (begin != 0) return null;
	}
	else {
		begin += 2;
	}
	var end = document.cookie.indexOf(";", begin);
	if (end == -1) {
		end = dc.length;
	}
	return unescape(dc.substring(begin + prefix.length, end));
}

function gotoPreferences() {
	document.location.href = "prefs.php";
}

function gotoLogout() {
	document.location.href = "backend.php?op=logout";
}

function gotoMain() {
	document.location.href = "index.php";
}

/** * @(#)isNumeric.js * * Copyright (c) 2000 by Sundar Dorai-Raj
  * * @author Sundar Dorai-Raj
  * * Email: sdoraira@vt.edu
  * * This program is free software; you can redistribute it and/or
  * * modify it under the terms of the GNU General Public License
  * * as published by the Free Software Foundation; either version 2
  * * of the License, or (at your option) any later version,
  * * provided that any use properly credits the author.
  * * This program is distributed in the hope that it will be useful,
  * * but WITHOUT ANY WARRANTY; without even the implied warranty of
  * * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
  * * GNU General Public License for more details at http://www.gnu.org * * */

var numbers=".0123456789";
function isNumeric(x) {
	// is x a String or a character?
	if(x.length>1) {
		// remove negative sign
		x=Math.abs(x)+"";
		for(var j=0;j<x.length;j++) {
			// call isNumeric recursively for each character
			number=isNumeric(x.substring(j,j+1));
			if(!number) return number;
		}
		return number;
	}
	else {
		// if x is number return true
		if(numbers.indexOf(x)>=0) return true;
		return false;
	}
}


function toggleSelectRowById(sender, id) {
	var row = $(id);
	return toggleSelectRow(sender, row);
}

function toggleSelectListRow(sender) {
	var row = sender.parentNode;
	return toggleSelectRow(sender, row);
}

/* this is for dijit Checkbox */
function toggleSelectListRow2(sender) {
	var row = sender.domNode.parentNode;
	return toggleSelectRow(sender, row);
}

/* this is for dijit Checkbox */
function toggleSelectRow2(sender, row, is_cdm) {

	if (!row)
		if (!is_cdm)
			row = sender.domNode.parentNode.parentNode;
		else
			row = sender.domNode.parentNode.parentNode.parentNode; // oh ffs

	if (sender.checked && !row.hasClassName('Selected'))
		row.addClassName('Selected');
	else
		row.removeClassName('Selected');

	if (typeof updateSelectedPrompt != undefined)
		updateSelectedPrompt();
}


function toggleSelectRow(sender, row) {

	if (!row) row = sender.parentNode.parentNode;

	if (sender.checked && !row.hasClassName('Selected'))
		row.addClassName('Selected');
	else
		row.removeClassName('Selected');

	if (typeof updateSelectedPrompt != undefined)
		updateSelectedPrompt();
}

function checkboxToggleElement(elem, id) {
	if (elem.checked) {
		Effect.Appear(id, {duration : 0.5});
	} else {
		Effect.Fade(id, {duration : 0.5});
	}
}

function dropboxSelect(e, v) {
	for (var i = 0; i < e.length; i++) {
		if (e[i].value == v) {
			e.selectedIndex = i;
			break;
		}
	}
}

function getURLParam(param){
	return String(window.location.href).parseQuery()[param];
}

function closeInfoBox(cleanup) {
	dialog = dijit.byId("infoBox");

	if (dialog)	dialog.hide();

	return false;
}


function displayDlg(title, id, param, callback) {

	notify_progress("Loading, please wait...", true);

	var query = "?op=dlg&method=" +
		param_escape(id) + "&param=" + param_escape(param);

	new Ajax.Request("backend.php", {
		parameters: query,
		onComplete: function (transport) {
			infobox_callback2(transport, title);
			if (callback) callback(transport);
		} });

	return false;
}

function infobox_callback2(transport, title) {
	var dialog = false;

	if (dijit.byId("infoBox")) {
		dialog = dijit.byId("infoBox");
	}

	//console.log("infobox_callback2");
	notify('');

	var content = transport.responseText;

	if (!dialog) {
		dialog = new dijit.Dialog({
			title: title,
			id: 'infoBox',
			style: "width: 600px",
			onCancel: function() {
				return true;
			},
			onExecute: function() {
				return true;
			},
			onClose: function() {
				return true;
				},
			content: content});
	} else {
		dialog.attr('title', title);
		dialog.attr('content', content);
	}

	dialog.show();

	notify("");
}

function getInitParam(key) {
	return init_params[key];
}

function setInitParam(key, value) {
	init_params[key] = value;
}

function fatalError(code, msg, ext_info) {
	if (code == 6) {
		window.location.href = "index.php";
	} else if (code == 5) {
		window.location.href = "public.php?op=dbupdate";
	} else {

		if (msg == "") msg = "Unknown error";

		if (ext_info) {
			if (ext_info.responseText) {
				ext_info = ext_info.responseText;
			}
		}

		if (ERRORS && ERRORS[code] && !msg) {
			msg = ERRORS[code];
		}

		var content = "<div><b>Error code:</b> " + code + "</div>" +
			"<p>" + msg + "</p>";

		if (ext_info) {
			content = content + "<div><b>Additional information:</b></div>" +
				"<textarea style='width: 100%' readonly=\"1\">" +
				ext_info + "</textarea>";
		}

		var dialog = new dijit.Dialog({
			title: "Fatal error",
			style: "width: 600px",
			content: content});

		dialog.show();

	}

	return false;

}

function filterDlgCheckAction(sender) {
	var action = sender.value;

	var action_param = $("filterDlg_paramBox");

	if (!action_param) {
		console.log("filterDlgCheckAction: can't find action param box!");
		return;
	}

	// if selected action supports parameters, enable params field
	if (action == 4 || action == 6 || action == 7 || action == 9) {
		new Effect.Appear(action_param, {duration : 0.5});

		Element.hide(dijit.byId("filterDlg_actionParam").domNode);
		Element.hide(dijit.byId("filterDlg_actionParamLabel").domNode);
		Element.hide(dijit.byId("filterDlg_actionParamPlugin").domNode);

		if (action == 7) {
			Element.show(dijit.byId("filterDlg_actionParamLabel").domNode);
		} else if (action == 9) {
			Element.show(dijit.byId("filterDlg_actionParamPlugin").domNode);
		} else {
			Element.show(dijit.byId("filterDlg_actionParam").domNode);
		}

	} else {
		Element.hide(action_param);
	}
}


function explainError(code) {
	return displayDlg(__("Error explained"), "explainError", code);
}

function loading_set_progress(p) {
	loading_progress += p;

	if (dijit.byId("loading_bar"))
		dijit.byId("loading_bar").update({progress: loading_progress});

	if (loading_progress >= 90)
		remove_splash();

}

function remove_splash() {

	if (Element.visible("overlay")) {
		console.log("about to remove splash, OMG!");
		Element.hide("overlay");
		console.log("removed splash!");
	}
}

function strip_tags(s) {
	return s.replace(/<\/?[^>]+(>|$)/g, "");
}

function truncate_string(s, length) {
	if (!length) length = 30;
	var tmp = s.substring(0, length);
	if (s.length > length) tmp += "&hellip;";
	return tmp;
}

function hotkey_prefix_timeout() {

	var date = new Date();
	var ts = Math.round(date.getTime() / 1000);

	if (hotkey_prefix_pressed && ts - hotkey_prefix_pressed >= 5) {
		console.log("hotkey_prefix seems to be stuck, aborting");
		hotkey_prefix_pressed = false;
		hotkey_prefix = false;
		Element.hide('cmdline');
	}

	setTimeout(hotkey_prefix_timeout, 1000);

}

function uploadIconHandler(rc) {
	switch (rc) {
		case 0:
			notify_info("Upload complete.");
			if (inPreferences()) {
				updateFeedList();
			} else {
				setTimeout('updateFeedList(false, false)', 50);
			}
			break;
		case 1:
			notify_error("Upload failed: icon is too big.");
			break;
		case 2:
			notify_error("Upload failed.");
			break;
	}
}

function removeFeedIcon(id) {
	if (confirm(__("Remove stored feed icon?"))) {
		var query = "backend.php?op=pref-feeds&method=removeicon&feed_id=" + param_escape(id);

		console.log(query);

		notify_progress("Removing feed icon...", true);

		new Ajax.Request("backend.php", {
			parameters: query,
			onComplete: function(transport) {
				notify_info("Feed icon removed.");
				if (inPreferences()) {
					updateFeedList();
				} else {
					setTimeout('updateFeedList(false, false)', 50);
				}
			} });
	}

	return false;
}

function uploadFeedIcon() {
	var file = $("icon_file");

	if (file.value.length == 0) {
		alert(__("Please select an image file to upload."));
	} else {
		if (confirm(__("Upload new icon for this feed?"))) {
			notify_progress("Uploading, please wait...", true);
			return true;
		}
	}

	return false;
}

function addLabel(select, callback) {

	var caption = prompt(__("Please enter label caption:"), "");

	if (caption != undefined) {

		if (caption == "") {
			alert(__("Can't create label: missing caption."));
			return false;
		}

		var query = "?op=pref-labels&method=add&caption=" +
			param_escape(caption);

		if (select)
			query += "&output=select";

		notify_progress("Loading, please wait...", true);

		if (inPreferences() && !select) active_tab = "labelConfig";

		new Ajax.Request("backend.php", {
			parameters: query,
			onComplete: function(transport) {
				if (callback) {
					callback(transport);
				} else if (inPreferences()) {
					updateLabelList();
				} else {
					updateFeedList();
				}
		} });

	}

}

function quickAddFeed() {
	var query = "backend.php?op=feeds&method=quickAddFeed";

	// overlapping widgets
	if (dijit.byId("batchSubDlg")) dijit.byId("batchSubDlg").destroyRecursive();
	if (dijit.byId("feedAddDlg"))	dijit.byId("feedAddDlg").destroyRecursive();

	var dialog = new dijit.Dialog({
		id: "feedAddDlg",
		title: __("Subscribe to Feed"),
		style: "width: 600px",
		show_error: function(msg) {
			var elem = $("fadd_error_message");

			elem.innerHTML = msg;

			if (!Element.visible(elem))
				new Effect.Appear(elem);

		},
		execute: function() {
			if (this.validate()) {
				console.log(dojo.objectToQuery(this.attr('value')));

				var feed_url = this.attr('value').feed;

				Element.show("feed_add_spinner");
				Element.hide("fadd_error_message");

				new Ajax.Request("backend.php", {
					parameters: dojo.objectToQuery(this.attr('value')),
					onComplete: function(transport) {
						try {

							try {
								var reply = JSON.parse(transport.responseText);
							} catch (e) {
								Element.hide("feed_add_spinner");
								alert(__("Failed to parse output. This can indicate server timeout and/or network issues. Backend output was logged to browser console."));
								console.log('quickAddFeed, backend returned:' + transport.responseText);
								return;
							}

							var rc = reply['result'];

							notify('');
							Element.hide("feed_add_spinner");

							console.log(rc);

							switch (parseInt(rc['code'])) {
							case 1:
								dialog.hide();
								notify_info(__("Subscribed to %s").replace("%s", feed_url));

								updateFeedList();
								break;
							case 2:
								dialog.show_error(__("Specified URL seems to be invalid."));
								break;
							case 3:
								dialog.show_error(__("Specified URL doesn't seem to contain any feeds."));
								break;
							case 4:
								feeds = rc['feeds'];

								Element.show("fadd_multiple_notify");

								var select = dijit.byId("feedDlg_feedContainerSelect");

								while (select.getOptions().length > 0)
									select.removeOption(0);

								select.addOption({value: '', label: __("Expand to select feed")});

								var count = 0;
								for (var feedUrl in feeds) {
									select.addOption({value: feedUrl, label: feeds[feedUrl]});
									count++;
								}

								Effect.Appear('feedDlg_feedsContainer', {duration : 0.5});

								break;
							case 5:
								dialog.show_error(__("Couldn't download the specified URL: %s").
										replace("%s", rc['message']));
								break;
							case 6:
								dialog.show_error(__("XML validation failed: %s").
										replace("%s", rc['message']));
								break;
								break;
							case 0:
								dialog.show_error(__("You are already subscribed to this feed."));
								break;
							}

						} catch (e) {
							console.error(transport.responseText);
							exception_error(e);
						}

					} });

				}
		},
		href: query});

	dialog.show();
}

function createNewRuleElement(parentNode, replaceNode) {
	var form = document.forms["filter_new_rule_form"];

	//form.reg_exp.value = form.reg_exp.value.replace(/(<([^>]+)>)/ig,"");

	var query = "backend.php?op=pref-filters&method=printrulename&rule="+
		param_escape(dojo.formToJson(form));

	console.log(query);

	new Ajax.Request("backend.php", {
		parameters: query,
		onComplete: function (transport) {
			try {
				var li = dojo.create("li");

				var cb = dojo.create("input", { type: "checkbox" }, li);

				new dijit.form.CheckBox({
					onChange: function() {
						toggleSelectListRow2(this) },
				}, cb);

				dojo.create("input", { type: "hidden",
					name: "rule[]",
					value: dojo.formToJson(form) }, li);

				dojo.create("span", {
					onclick: function() {
						dijit.byId('filterEditDlg').editRule(this);
					},
					innerHTML: transport.responseText }, li);

				if (replaceNode) {
					parentNode.replaceChild(li, replaceNode);
				} else {
					parentNode.appendChild(li);
				}
			} catch (e) {
				exception_error(e);
			}
	} });
}

function createNewActionElement(parentNode, replaceNode) {
	var form = document.forms["filter_new_action_form"];

	if (form.action_id.value == 7) {
		form.action_param.value = form.action_param_label.value;
	} else if (form.action_id.value == 9) {
		form.action_param.value = form.action_param_plugin.value;
	}

	var query = "backend.php?op=pref-filters&method=printactionname&action="+
		param_escape(dojo.formToJson(form));

	console.log(query);

	new Ajax.Request("backend.php", {
		parameters: query,
		onComplete: function (transport) {
			try {
				var li = dojo.create("li");

				var cb = dojo.create("input", { type: "checkbox" }, li);

				new dijit.form.CheckBox({
					onChange: function() {
						toggleSelectListRow2(this) },
				}, cb);

				dojo.create("input", { type: "hidden",
					name: "action[]",
					value: dojo.formToJson(form) }, li);

				dojo.create("span", {
					onclick: function() {
						dijit.byId('filterEditDlg').editAction(this);
					},
					innerHTML: transport.responseText }, li);

				if (replaceNode) {
					parentNode.replaceChild(li, replaceNode);
				} else {
					parentNode.appendChild(li);
				}

			} catch (e) {
				exception_error(e);
			}
		} });
}


function addFilterRule(replaceNode, ruleStr) {
	if (dijit.byId("filterNewRuleDlg"))
		dijit.byId("filterNewRuleDlg").destroyRecursive();

	var query = "backend.php?op=pref-filters&method=newrule&rule=" +
		param_escape(ruleStr);

	var rule_dlg = new dijit.Dialog({
		id: "filterNewRuleDlg",
		title: ruleStr ? __("Edit rule") : __("Add rule"),
		style: "width: 600px",
		execute: function() {
			if (this.validate()) {
				createNewRuleElement($("filterDlg_Matches"), replaceNode);
				this.hide();
			}
		},
		href: query});

	rule_dlg.show();
}

function addFilterAction(replaceNode, actionStr) {
	if (dijit.byId("filterNewActionDlg"))
		dijit.byId("filterNewActionDlg").destroyRecursive();

	var query = "backend.php?op=pref-filters&method=newaction&action=" +
		param_escape(actionStr);

	var rule_dlg = new dijit.Dialog({
		id: "filterNewActionDlg",
		title: actionStr ? __("Edit action") : __("Add action"),
		style: "width: 600px",
		execute: function() {
			if (this.validate()) {
				createNewActionElement($("filterDlg_Actions"), replaceNode);
				this.hide();
			}
		},
		href: query});

	rule_dlg.show();
}

function editFilterTest(query) {

	if (dijit.byId("filterTestDlg"))
		dijit.byId("filterTestDlg").destroyRecursive();

	var test_dlg = new dijit.Dialog({
		id: "filterTestDlg",
		title: "Test Filter",
		style: "width: 600px",
		results: 0,
		limit: 100,
		max_offset: 10000,
		getTestResults: function(query, offset) {
			var updquery = query + "&offset=" + offset + "&limit=" + test_dlg.limit;

			console.log("getTestResults:" + offset);

			new Ajax.Request("backend.php", {
				parameters: updquery,
				onComplete: function (transport) {
					try {
						var result = JSON.parse(transport.responseText);

						if (result && dijit.byId("filterTestDlg") && dijit.byId("filterTestDlg").open) {
							test_dlg.results += result.size();

							console.log("got results:" + result.size());

							$("prefFilterProgressMsg").innerHTML = __("Looking for articles (%d processed, %f found)...")
								.replace("%f", test_dlg.results)
								.replace("%d", offset);

							console.log(offset + " " + test_dlg.max_offset);

							for (var i = 0; i < result.size(); i++) {
								var tmp = new Element("table");
								tmp.innerHTML = result[i];
								dojo.parser.parse(tmp);

								$("prefFilterTestResultList").innerHTML += tmp.innerHTML;
							}

							if (test_dlg.results < 30 && offset < test_dlg.max_offset) {

								// get the next batch
								window.setTimeout(function () {
									test_dlg.getTestResults(query, offset + test_dlg.limit);
								}, 0);

							} else {
								// all done

								Element.hide("prefFilterLoadingIndicator");

								if (test_dlg.results == 0) {
									$("prefFilterTestResultList").innerHTML = "<tr><td align='center'>No recent articles matching this filter have been found.</td></tr>";
									$("prefFilterProgressMsg").innerHTML = "Articles matching this filter:";
								} else {
									$("prefFilterProgressMsg").innerHTML = __("Found %d articles matching this filter:")
										.replace("%d", test_dlg.results);
								}

							}

						} else if (!result) {
							console.log("getTestResults: can't parse results object");

							Element.hide("prefFilterLoadingIndicator");

							notify_error("Error while trying to get filter test results.");

						} else {
							console.log("getTestResults: dialog closed, bailing out.");
						}
					} catch (e) {
						exception_error(e);
					}

				} });
		},
		href: query});

	dojo.connect(test_dlg, "onLoad", null, function(e) {
		test_dlg.getTestResults(query, 0);
	});

	test_dlg.show();

}

function quickAddFilter() {
	var query = "";
	if (!inPreferences()) {
		query = "backend.php?op=pref-filters&method=newfilter&feed=" +
			param_escape(getActiveFeedId()) + "&is_cat=" +
			param_escape(activeFeedIsCat());
	} else {
		query = "backend.php?op=pref-filters&method=newfilter";
	}

	console.log(query);

	if (dijit.byId("feedEditDlg"))
		dijit.byId("feedEditDlg").destroyRecursive();

	if (dijit.byId("filterEditDlg"))
		dijit.byId("filterEditDlg").destroyRecursive();

	dialog = new dijit.Dialog({
		id: "filterEditDlg",
		title: __("Create Filter"),
		style: "width: 600px",
		test: function() {
			var query = "backend.php?" + dojo.formToQuery("filter_new_form") + "&savemode=test";

			editFilterTest(query);
		},
		selectRules: function(select) {
			$$("#filterDlg_Matches input[type=checkbox]").each(function(e) {
				e.checked = select;
				if (select)
					e.parentNode.addClassName("Selected");
				else
					e.parentNode.removeClassName("Selected");
			});
		},
		selectActions: function(select) {
			$$("#filterDlg_Actions input[type=checkbox]").each(function(e) {
				e.checked = select;

				if (select)
					e.parentNode.addClassName("Selected");
				else
					e.parentNode.removeClassName("Selected");

			});
		},
		editRule: function(e) {
			var li = e.parentNode;
			var rule = li.getElementsByTagName("INPUT")[1].value;
			addFilterRule(li, rule);
		},
		editAction: function(e) {
			var li = e.parentNode;
			var action = li.getElementsByTagName("INPUT")[1].value;
			addFilterAction(li, action);
		},
		addAction: function() { addFilterAction(); },
		addRule: function() { addFilterRule(); },
		deleteAction: function() {
			$$("#filterDlg_Actions li.[class*=Selected]").each(function(e) { e.parentNode.removeChild(e) });
		},
		deleteRule: function() {
			$$("#filterDlg_Matches li.[class*=Selected]").each(function(e) { e.parentNode.removeChild(e) });
		},
		execute: function() {
			if (this.validate()) {

				var query = dojo.formToQuery("filter_new_form");

				console.log(query);

				new Ajax.Request("backend.php", {
					parameters: query,
					onComplete: function (transport) {
						if (inPreferences()) {
							updateFilterList();
						}

						dialog.hide();
				} });
			}
		},
		href: query});

	if (!inPreferences()) {
		var selectedText = getSelectionText();

		var lh = dojo.connect(dialog, "onLoad", function(){
			dojo.disconnect(lh);

			if (selectedText != "") {

				var feed_id = activeFeedIsCat() ? 'CAT:' + parseInt(getActiveFeedId()) :
					getActiveFeedId();

				var rule = { reg_exp: selectedText, feed_id: [feed_id], filter_type: 1 };

				addFilterRule(null, dojo.toJson(rule));

			} else {

				var query = "op=rpc&method=getlinktitlebyid&id=" + getActiveArticleId();

				new Ajax.Request("backend.php", {
				parameters: query,
				onComplete: function(transport) {
					var reply = JSON.parse(transport.responseText);

					var title = false;

					if (reply && reply) title = reply.title;

					if (title || getActiveFeedId() || activeFeedIsCat()) {

						console.log(title + " " + getActiveFeedId());

						var feed_id = activeFeedIsCat() ? 'CAT:' + parseInt(getActiveFeedId()) :
							getActiveFeedId();

						var rule = { reg_exp: title, feed_id: [feed_id], filter_type: 1 };

						addFilterRule(null, dojo.toJson(rule));
					}

				} });

			}

		});
	}

	dialog.show();

}

function unsubscribeFeed(feed_id, title) {

	var msg = __("Unsubscribe from %s?").replace("%s", title);

	if (title == undefined || confirm(msg)) {
		notify_progress("Removing feed...");

		var query = "?op=pref-feeds&quiet=1&method=remove&ids=" + feed_id;

		new Ajax.Request("backend.php", {
			parameters: query,
			onComplete: function(transport) {

					if (dijit.byId("feedEditDlg")) dijit.byId("feedEditDlg").hide();

					if (inPreferences()) {
						updateFeedList();
					} else {
						if (feed_id == getActiveFeedId())
							setTimeout(function() { viewfeed({feed:-5}) }, 100);

						if (feed_id < 0) updateFeedList();
					}

				} });
	}

	return false;
}


function backend_sanity_check_callback(transport) {

	if (sanity_check_done) {
		fatalError(11, "Sanity check request received twice. This can indicate "+
		  "presence of Firebug or some other disrupting extension. "+
			"Please disable it and try again.");
		return;
	}

	var reply = JSON.parse(transport.responseText);

	if (!reply) {
		fatalError(3, "Sanity check: invalid RPC reply", transport.responseText);
		return;
	}

	var error_code = reply['error']['code'];

	if (error_code && error_code != 0) {
		return fatalError(error_code, reply['error']['message']);
	}

	console.log("sanity check ok");

	var params = reply['init-params'];

	if (params) {
		console.log('reading init-params...');

		for (k in params) {
			console.log("IP: " + k + " => " + JSON.stringify(params[k]));
			if (k == "label_base_index") _label_base_index = parseInt(params[k]);
		}

		init_params = params;

		// PluginHost might not be available on non-index pages
		window.PluginHost && PluginHost.run(PluginHost.HOOK_PARAMS_LOADED, init_params);
	}

	sanity_check_done = true;

	init_second_stage();

}

function quickAddCat(elem) {
	var cat = prompt(__("Please enter category title:"));

	if (cat) {

		var query = "?op=rpc&method=quickAddCat&cat=" + param_escape(cat);

		notify_progress("Loading, please wait...", true);

		new Ajax.Request("backend.php", {
			parameters: query,
			onComplete: function (transport) {
				var response = transport.responseXML;
				var select = response.getElementsByTagName("select")[0];
				var options = select.getElementsByTagName("option");

				dropbox_replace_options(elem, options);

				notify('');

		} });

	}
}

function genUrlChangeKey(feed, is_cat) {
	var ok = confirm(__("Generate new syndication address for this feed?"));

	if (ok) {

		notify_progress("Trying to change address...", true);

		var query = "?op=pref-feeds&method=regenFeedKey&id=" + param_escape(feed) +
			"&is_cat=" + param_escape(is_cat);

		new Ajax.Request("backend.php", {
			parameters: query,
			onComplete: function(transport) {
					var reply = JSON.parse(transport.responseText);
					var new_link = reply.link;

					var e = $('gen_feed_url');

					if (new_link) {

						e.innerHTML = e.innerHTML.replace(/\&amp;key=.*$/,
							"&amp;key=" + new_link);

						e.href = e.href.replace(/\&key=.*$/,
							"&key=" + new_link);

						new Effect.Highlight(e);

						notify('');

					} else {
						notify_error("Could not change feed URL.");
					}
			} });
	}
	return false;
}

function dropbox_replace_options(elem, options) {
	while (elem.hasChildNodes())
		elem.removeChild(elem.firstChild);

	var sel_idx = -1;

	for (var i = 0; i < options.length; i++) {
		var text = options[i].firstChild.nodeValue;
		var value = options[i].getAttribute("value");

		if (value == undefined) value = text;

		var issel = options[i].getAttribute("selected") == "1";

		var option = new Option(text, value, issel);

		if (options[i].getAttribute("disabled"))
			option.setAttribute("disabled", true);

		elem.insert(option);

		if (issel) sel_idx = i;
	}

	// Chrome doesn't seem to just select stuff when you pass new Option(x, y, true)
	if (sel_idx >= 0) elem.selectedIndex = sel_idx;
}

// mode = all, none, invert
function selectTableRows(id, mode) {
	var rows = $(id).rows;

	for (var i = 0; i < rows.length; i++) {
		var row = rows[i];
		var cb = false;
		var dcb = false;

		if (row.id && row.className) {
			var bare_id = row.id.replace(/^[A-Z]*?-/, "");
			var inputs = rows[i].getElementsByTagName("input");

			for (var j = 0; j < inputs.length; j++) {
				var input = inputs[j];

				if (input.getAttribute("type") == "checkbox" &&
						input.id.match(bare_id)) {

					cb = input;
					dcb = dijit.getEnclosingWidget(cb);
					break;
				}
			}

			if (cb || dcb) {
				var issel = row.hasClassName("Selected");

				if (mode == "all" && !issel) {
					row.addClassName("Selected");
					cb.checked = true;
					if (dcb) dcb.set("checked", true);
				} else if (mode == "none" && issel) {
					row.removeClassName("Selected");
					cb.checked = false;
					if (dcb) dcb.set("checked", false);

				} else if (mode == "invert") {

					if (issel) {
						row.removeClassName("Selected");
						cb.checked = false;
						if (dcb) dcb.set("checked", false);
					} else {
						row.addClassName("Selected");
						cb.checked = true;
						if (dcb) dcb.set("checked", true);
					}
				}
			}
		}
	}

}

function getSelectedTableRowIds(id) {
	var rows = [];

	var elem_rows = $(id).rows;

	for (var i = 0; i < elem_rows.length; i++) {
		if (elem_rows[i].hasClassName("Selected")) {
			var bare_id = elem_rows[i].id.replace(/^[A-Z]*?-/, "");
			rows.push(bare_id);
		}
	}

	return rows;
}

function editFeed(feed, event) {
	if (feed <= 0)
		return alert(__("You can't edit this kind of feed."));

	var query = "backend.php?op=pref-feeds&method=editfeed&id=" +
		param_escape(feed);

	console.log(query);

	if (dijit.byId("filterEditDlg"))
		dijit.byId("filterEditDlg").destroyRecursive();

	if (dijit.byId("feedEditDlg"))
		dijit.byId("feedEditDlg").destroyRecursive();

	dialog = new dijit.Dialog({
		id: "feedEditDlg",
		title: __("Edit Feed"),
		style: "width: 600px",
		execute: function() {
			if (this.validate()) {
//					console.log(dojo.objectToQuery(this.attr('value')));

				notify_progress("Saving data...", true);

				new Ajax.Request("backend.php", {
					parameters: dojo.objectToQuery(dialog.attr('value')),
					onComplete: function(transport) {
						dialog.hide();
						notify('');
						updateFeedList();
				}});
			}
		},
		href: query});

	dialog.show();
}

function feedBrowser() {
	var query = "backend.php?op=feeds&method=feedBrowser";

	if (dijit.byId("feedAddDlg"))
		dijit.byId("feedAddDlg").hide();

	if (dijit.byId("feedBrowserDlg"))
		dijit.byId("feedBrowserDlg").destroyRecursive();

	var dialog = new dijit.Dialog({
		id: "feedBrowserDlg",
		title: __("More Feeds"),
		style: "width: 600px",
		getSelectedFeedIds: function () {
			var list = $$("#browseFeedList li[id*=FBROW]");
			var selected = new Array();

			list.each(function (child) {
				var id = child.id.replace("FBROW-", "");

				if (child.hasClassName('Selected')) {
					selected.push(id);
				}
			});

			return selected;
		},
		getSelectedFeeds: function () {
			var list = $$("#browseFeedList li.Selected");
			var selected = new Array();

			list.each(function (child) {
				var title = child.getElementsBySelector("span.fb_feedTitle")[0].innerHTML;
				var url = child.getElementsBySelector("a.fb_feedUrl")[0].href;

				selected.push([title, url]);

			});

			return selected;
		},

		subscribe: function () {
			var mode = this.attr('value').mode;
			var selected = [];

			if (mode == "1")
				selected = this.getSelectedFeeds();
			else
				selected = this.getSelectedFeedIds();

			if (selected.length > 0) {
				dijit.byId("feedBrowserDlg").hide();

				notify_progress("Loading, please wait...", true);

				// we use dojo.toJson instead of JSON.stringify because
				// it somehow escapes everything TWICE, at least in Chrome 9

				var query = "?op=rpc&method=massSubscribe&payload=" +
					param_escape(dojo.toJson(selected)) + "&mode=" + param_escape(mode);

				console.log(query);

				new Ajax.Request("backend.php", {
					parameters: query,
					onComplete: function (transport) {
						notify('');
						updateFeedList();
					}
				});

			} else {
				alert(__("No feeds are selected."));
			}

		},
		update: function () {
			var query = dojo.objectToQuery(dialog.attr('value'));

			Element.show('feed_browser_spinner');

			new Ajax.Request("backend.php", {
				parameters: query,
				onComplete: function (transport) {
					notify('');

					Element.hide('feed_browser_spinner');

					var c = $("browseFeedList");

					var reply = JSON.parse(transport.responseText);

					var r = reply['content'];
					var mode = reply['mode'];

					if (c && r) {
						c.innerHTML = r;
					}

					dojo.parser.parse("browseFeedList");

					if (mode == 2) {
						Element.show(dijit.byId('feed_archive_remove').domNode);
					} else {
						Element.hide(dijit.byId('feed_archive_remove').domNode);
					}

				}
			});
		},
		removeFromArchive: function () {
			var selected = this.getSelectedFeedIds();

			if (selected.length > 0) {

				var pr = __("Remove selected feeds from the archive? Feeds with stored articles will not be removed.");

				if (confirm(pr)) {
					Element.show('feed_browser_spinner');

					var query = "?op=rpc&method=remarchive&ids=" +
						param_escape(selected.toString());
					;

					new Ajax.Request("backend.php", {
						parameters: query,
						onComplete: function (transport) {
							dialog.update();
						}
					});
				}
			}
		},
		execute: function () {
			if (this.validate()) {
				this.subscribe();
			}
		},
		href: query
	});

	dialog.show();
}

function showFeedsWithErrors() {
	var query = "backend.php?op=pref-feeds&method=feedsWithErrors";

	if (dijit.byId("errorFeedsDlg"))
		dijit.byId("errorFeedsDlg").destroyRecursive();

	dialog = new dijit.Dialog({
		id: "errorFeedsDlg",
		title: __("Feeds with update errors"),
		style: "width: 600px",
		getSelectedFeeds: function() {
			return getSelectedTableRowIds("prefErrorFeedList");
		},
		removeSelected: function() {
			var sel_rows = this.getSelectedFeeds();

			console.log(sel_rows);

			if (sel_rows.length > 0) {
				var ok = confirm(__("Remove selected feeds?"));

				if (ok) {
					notify_progress("Removing selected feeds...", true);

					var query = "?op=pref-feeds&method=remove&ids="+
						param_escape(sel_rows.toString());

					new Ajax.Request("backend.php",	{
						parameters: query,
						onComplete: function(transport) {
							notify('');
							dialog.hide();
							updateFeedList();
						} });
				}

			} else {
				alert(__("No feeds are selected."));
			}
		},
		execute: function() {
			if (this.validate()) {
			}
		},
		href: query});

	dialog.show();
}

function get_timestamp() {
	var date = new Date();
	return Math.round(date.getTime() / 1000);
}

function helpDialog(topic) {
	var query = "backend.php?op=backend&method=help&topic=" + param_escape(topic);

	if (dijit.byId("helpDlg"))
		dijit.byId("helpDlg").destroyRecursive();

	dialog = new dijit.Dialog({
		id: "helpDlg",
		title: __("Help"),
		style: "width: 600px",
		href: query,
	});

	dialog.show();
}

function htmlspecialchars_decode (string, quote_style) {
	// http://kevin.vanzonneveld.net
	// +   original by: Mirek Slugen
	// +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
	// +   bugfixed by: Mateusz "loonquawl" Zalega
	// +      input by: ReverseSyntax
	// +      input by: Slawomir Kaniecki
	// +      input by: Scott Cariss
	// +      input by: Francois
	// +   bugfixed by: Onno Marsman
	// +    revised by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
	// +   bugfixed by: Brett Zamir (http://brett-zamir.me)
	// +      input by: Ratheous
	// +      input by: Mailfaker (http://www.weedem.fr/)
	// +      reimplemented by: Brett Zamir (http://brett-zamir.me)
	// +    bugfixed by: Brett Zamir (http://brett-zamir.me)
	// *     example 1: htmlspecialchars_decode("<p>this -&gt; &quot;</p>", 'ENT_NOQUOTES');
	// *     returns 1: '<p>this -> &quot;</p>'
	// *     example 2: htmlspecialchars_decode("&amp;quot;");
	// *     returns 2: '&quot;'
	var optTemp = 0,
		i = 0,
		noquotes = false;
	if (typeof quote_style === 'undefined') {
		quote_style = 2;
	}
	string = string.toString().replace(/&lt;/g, '<').replace(/&gt;/g, '>');
	var OPTS = {
		'ENT_NOQUOTES': 0,
		'ENT_HTML_QUOTE_SINGLE': 1,
		'ENT_HTML_QUOTE_DOUBLE': 2,
		'ENT_COMPAT': 2,
		'ENT_QUOTES': 3,
		'ENT_IGNORE': 4
	};
	if (quote_style === 0) {
		noquotes = true;
	}
	if (typeof quote_style !== 'number') { // Allow for a single string or an array of string flags
		quote_style = [].concat(quote_style);
		for (i = 0; i < quote_style.length; i++) {
			// Resolve string input to bitwise e.g. 'PATHINFO_EXTENSION' becomes 4
			if (OPTS[quote_style[i]] === 0) {
				noquotes = true;
			} else if (OPTS[quote_style[i]]) {
				optTemp = optTemp | OPTS[quote_style[i]];
			}
		}
		quote_style = optTemp;
	}
	if (quote_style & OPTS.ENT_HTML_QUOTE_SINGLE) {
		string = string.replace(/&#0*39;/g, "'"); // PHP doesn't currently escape if more than one 0, but it should
		// string = string.replace(/&apos;|&#x0*27;/g, "'"); // This would also be useful here, but not a part of PHP
	}
	if (!noquotes) {
		string = string.replace(/&quot;/g, '"');
	}
	// Put this in last place to avoid escape being double-decoded
	string = string.replace(/&amp;/g, '&');

	return string;
}


function label_to_feed_id(label) {
	return _label_base_index - 1 - Math.abs(label);
}

function feed_to_label_id(feed) {
	return _label_base_index - 1 + Math.abs(feed);
}

// http://stackoverflow.com/questions/6251937/how-to-get-selecteduser-highlighted-text-in-contenteditable-element-and-replac

function getSelectionText() {
	var text = "";

	if (typeof window.getSelection != "undefined") {
		var sel = window.getSelection();
		if (sel.rangeCount) {
			var container = document.createElement("div");
			for (var i = 0, len = sel.rangeCount; i < len; ++i) {
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

function openUrlPopup(url) {
	var w = window.open("");

	w.opener = null;
	w.location = url;
}
function openArticlePopup(id) {
	var w = window.open("",
		"ttrss_article_popup",
		"height=900,width=900,resizable=yes,status=no,location=no,menubar=no,directories=no,scrollbars=yes,toolbar=no");

	w.opener = null;
	w.location = "backend.php?op=article&method=view&mode=raw&html=1&zoom=1&id=" + id + "&csrf_token=" + getInitParam("csrf_token");
}
