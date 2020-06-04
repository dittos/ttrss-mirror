'use strict'

/* global require, App */

/* exported Plugins */
const Plugins = {};

require(["dojo/_base/kernel",
	"dojo/_base/declare",
	"dojo/ready",
	"dojo/parser",
	"fox/App",
	"dojo/_base/loader",
	"dojo/_base/html",
	"dojo/query",
	"dijit/ProgressBar",
	"dijit/ColorPalette",
	"dijit/Dialog",
	"dijit/form/Button",
	"dijit/form/ComboButton",
	"dijit/form/CheckBox",
	"dijit/form/DropDownButton",
	"dijit/form/FilteringSelect",
	"dijit/form/Form",
	"dijit/form/RadioButton",
	"dijit/form/Select",
	"dijit/form/MultiSelect",
	"dijit/form/SimpleTextarea",
	"dijit/form/TextBox",
	"dijit/form/ComboBox",
	"dijit/form/ValidationTextBox",
	"dijit/InlineEditBox",
	"dijit/layout/AccordionContainer",
	"dijit/layout/BorderContainer",
	"dijit/layout/ContentPane",
	"dijit/layout/TabContainer",
	"dijit/PopupMenuItem",
	"dijit/Menu",
	"dijit/Toolbar",
	"dijit/Tree",
	"dijit/tree/dndSource",
	"dijit/tree/ForestStoreModel",
	"dojo/data/ItemFileWriteStore",
	"fox/PluginHost",
	"fox/CommonFilters",
	"fox/CommonDialogs",
	"fox/Feeds",
	"fox/Headlines",
	"fox/Article",
	"fox/FeedStoreModel",
	"fox/FeedTree",
	"fox/Toolbar",
	"fox/form/ValidationTextArea",
	"fox/form/Select",
	"fox/form/ComboButton",
	"fox/form/DropDownButton"], function (dojo, declare, ready, parser) {

	ready(function () {
		try {
			App.init(parser, false);
		} catch (e) {
			if (typeof App != "undefined" && App.Error)
				App.Error.report(e);
			else
				alert(e + "\n\n" + e.stack);
		}
	});
});

/* exported hash_get */
function hash_get(key) {
	const kv = window.location.hash.substring(1).toQueryParams();
	return kv[key];
}

/* exported hash_set */
function hash_set(key, value) {
	const kv = window.location.hash.substring(1).toQueryParams();
	kv[key] = value;
	window.location.hash = $H(kv).toQueryString();
}
