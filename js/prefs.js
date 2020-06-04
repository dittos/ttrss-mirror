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
	"dijit/ColorPalette",
	"dijit/Dialog",
	"dijit/form/Button",
	"dijit/form/CheckBox",
	"dijit/form/DropDownButton",
	"dijit/form/FilteringSelect",
	"dijit/form/MultiSelect",
	"dijit/form/Form",
	"dijit/form/RadioButton",
	"dijit/form/ComboButton",
	"dijit/form/Select",
	"dijit/form/SimpleTextarea",
	"dijit/form/TextBox",
	"dijit/form/NumberSpinner",
	"dijit/form/ValidationTextBox",
	"dijit/InlineEditBox",
	"dijit/layout/AccordionContainer",
	"dijit/layout/AccordionPane",
	"dijit/layout/BorderContainer",
	"dijit/layout/ContentPane",
	"dijit/layout/TabContainer",
	"dijit/Menu",
	"dijit/ProgressBar",
	"dijit/Toolbar",
	"dijit/Tree",
	"dijit/tree/dndSource",
	"dojo/data/ItemFileWriteStore",
	"lib/CheckBoxStoreModel",
	"lib/CheckBoxTree",
	"fox/CommonDialogs",
	"fox/CommonFilters",
	"fox/PrefUsers",
	"fox/PrefHelpers",
	"fox/PrefFeedStore",
	"fox/PrefFilterStore",
	"fox/PrefFeedTree",
	"fox/PrefFilterTree",
	"fox/PrefLabelTree",
	"fox/Toolbar",
	"fox/form/ValidationTextArea",
	"fox/form/Select",
	"fox/form/ComboButton",
	"fox/form/DropDownButton"], function (dojo, declare, ready, parser) {

	ready(function () {
		try {
			App.init(parser, true);
		} catch (e) {
			if (typeof App != "undefined" && App.Error)
				App.Error.report(e);
			else
				alert(e + "\n\n" + e.stack);
		}
	});
});
