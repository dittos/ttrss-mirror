'use strict';

/* global __, Article, Ajax, Headlines, Filters */
/* global xhrPost, xhrJson, dojo, dijit, PluginHost, Notify, $$, Feeds, Cookie */
/* global CommonDialogs, Plugins, Effect */

const App = {
   _initParams: [],
	_rpc_seq: 0,
	hotkey_prefix: 0,
	hotkey_prefix_pressed: false,
	hotkey_prefix_timeout: 0,
   global_unread: -1,
   _widescreen_mode: false,
   _loading_progress: 0,
   hotkey_actions: {},
   is_prefs: false,
   LABEL_BASE_INDEX: -1024,
   Scrollable: {
		scrollByPages: function (elem, page_offset) {
			if (!elem) return;

			/* keep a line or so from the previous page  */
			const offset = (elem.offsetHeight - (page_offset > 0 ? 50 : -50)) * page_offset;

			this.scroll(elem, offset);
		},
		scroll: function(elem, offset) {
			if (!elem) return;

			elem.scrollTop += offset;
		},
		isChildVisible: function(elem, ctr) {
			if (!elem) return;

			const ctop = ctr.scrollTop;
			const cbottom = ctop + ctr.offsetHeight;

			const etop = elem.offsetTop;
			const ebottom = etop + elem.offsetHeight;

			return etop >= ctop && ebottom <= cbottom ||
				etop < ctop && ebottom > ctop || ebottom > cbottom && etop < cbottom;
		},
		fitsInContainer: function (elem, ctr) {
			if (!elem) return;

			return elem.offsetTop + elem.offsetHeight <= ctr.scrollTop + ctr.offsetHeight &&
				elem.offsetTop >= ctr.scrollTop;
		}
   },
   label_to_feed_id: function(label) {
      return this.LABEL_BASE_INDEX - 1 - Math.abs(label);
   },
   feed_to_label_id: function(feed) {
      return this.LABEL_BASE_INDEX - 1 + Math.abs(feed);
   },
   getInitParam: function(k) {
		return this._initParams[k];
	},
	setInitParam: function(k, v) {
		this._initParams[k] = v;
	},
	nightModeChanged: function(is_night, link) {
		console.log("night mode changed to", is_night);

		if (link) {
			const css_override = is_night ? "themes/night.css" : "themes/light.css";
			link.setAttribute("href", css_override + "?" + Date.now());
		}
	},
	setupNightModeDetection: function(callback) {
		if (!$("theme_css")) {
			const mql = window.matchMedia('(prefers-color-scheme: dark)');

			try {
				mql.addEventListener("change", () => {
					this.nightModeChanged(mql.matches, $("theme_auto_css"));
				});
			} catch (e) {
				console.warn("exception while trying to set MQL event listener");
			}

			const link = new Element("link", {
				rel: "stylesheet",
				id: "theme_auto_css"
			});

			if (callback) {
						link.onload = function () {
							document.querySelector("body").removeClassName("css_loading");
							callback();
						};

						link.onerror = function(event) {
							alert("Fatal error while loading application stylesheet: " + link.getAttribute("href"));
						}
					}

			this.nightModeChanged(mql.matches, link);

			document.querySelector("head").appendChild(link);
		} else {
			document.querySelector("body").removeClassName("css_loading");

			if (callback) callback();
		}
	},
	enableCsrfSupport: function() {
		const _this = this;

		Ajax.Base.prototype.initialize = Ajax.Base.prototype.initialize.wrap(
			function (callOriginal, options) {

				if (_this.getInitParam("csrf_token") != undefined) {
					Object.extend(options, options || { });

					if (Object.isString(options.parameters))
						options.parameters = options.parameters.toQueryParams();
					else if (Object.isHash(options.parameters))
						options.parameters = options.parameters.toObject();

					options.parameters["csrf_token"] = _this.getInitParam("csrf_token");
				}

				return callOriginal(options);
			}
		);
	},
	urlParam: function(param) {
		return String(window.location.href).parseQuery()[param];
	},
	next_seq: function() {
		this._rpc_seq += 1;
		return this._rpc_seq;
	},
	get_seq: function() {
		return this._rpc_seq;
	},
	setLoadingProgress: function(p) {
		this._loading_progress += p;

		if (dijit.byId("loading_bar"))
			dijit.byId("loading_bar").update({progress: this._loading_progress});

		if (this._loading_progress >= 90) {
			$("overlay").hide();
		}

	},
	isCombinedMode: function() {
		return this.getInitParam("combined_display_mode");
	},
	getActionByHotkeySequence: function(sequence) {
		const hotkeys_map = this.getInitParam("hotkeys");

		for (const seq in hotkeys_map[1]) {
			if (hotkeys_map[1].hasOwnProperty(seq)) {
				if (seq == sequence) {
					return hotkeys_map[1][seq];
				}
			}
		}
	},
	keyeventToAction: function(event) {

		const hotkeys_map = this.getInitParam("hotkeys");
		const keycode = event.which;
		const keychar = String.fromCharCode(keycode);

		if (keycode == 27) { // escape and drop prefix
			this.hotkey_prefix = false;
		}

		if (!this.hotkey_prefix && hotkeys_map[0].indexOf(keychar) != -1) {

			this.hotkey_prefix = keychar;
			$("cmdline").innerHTML = keychar;
			Element.show("cmdline");

			window.clearTimeout(this.hotkey_prefix_timeout);
			this.hotkey_prefix_timeout = window.setTimeout(() => {
				this.hotkey_prefix = false;
				Element.hide("cmdline");
			}, 3 * 1000);

			event.stopPropagation();

			return false;
		}

		Element.hide("cmdline");

		let hotkey_name = "";

		if (event.type == "keydown") {
			hotkey_name = "(" + keycode + ")";

			// ensure ^*char notation
			if (event.shiftKey) hotkey_name = "*" + hotkey_name;
			if (event.ctrlKey) hotkey_name = "^" + hotkey_name;
			if (event.altKey) hotkey_name = "+" + hotkey_name;
			if (event.metaKey) hotkey_name = "%" + hotkey_name;
		} else {
			hotkey_name = keychar ? keychar : "(" + keycode + ")";
		}

		let hotkey_full = this.hotkey_prefix ? this.hotkey_prefix + " " + hotkey_name : hotkey_name;
		this.hotkey_prefix = false;

		let action_name = this.getActionByHotkeySequence(hotkey_full);

		// check for mode-specific hotkey
		if (!action_name) {
			hotkey_full = (this.isCombinedMode() ? "{C}" : "{3}") + hotkey_full;

			action_name = this.getActionByHotkeySequence(hotkey_full);
		}

		console.log('keyeventToAction', hotkey_full, '=>', action_name);

		return action_name;
	},
	cleanupMemory: function(root) {
		const dijits = dojo.query("[widgetid]", dijit.byId(root).domNode).map(dijit.byNode);

		dijits.each(function (d) {
			dojo.destroy(d.domNode);
		});

		$$("#" + root + " *").each(function (i) {
			i.parentNode ? i.parentNode.removeChild(i) : true;
		});
   },
   // htmlspecialchars()-alike for headlines data-content attribute
   escapeHtml: function(text) {
      const map = {
         '&': '&amp;',
         '<': '&lt;',
         '>': '&gt;',
         '"': '&quot;',
         "'": '&#039;'
      };

      return text.replace(/[&<>"']/g, function(m) { return map[m]; });
   },
   displayIfChecked: function(checkbox, elemId) {
      if (checkbox.checked) {
         Effect.Appear(elemId, {duration : 0.5});
      } else {
         Effect.Fade(elemId, {duration : 0.5});
      }
   },
   helpDialog: function(topic) {
		const query = "backend.php?op=backend&method=help&topic=" + encodeURIComponent(topic);

		if (dijit.byId("helpDlg"))
			dijit.byId("helpDlg").destroyRecursive();

		const dialog = new dijit.Dialog({
			id: "helpDlg",
			title: __("Help"),
			style: "width: 600px",
			href: query,
		});

		dialog.show();
	},
	displayDlg: function(title, id, param, callback) {
		Notify.progress("Loading, please wait...", true);

		const query = {op: "dlg", method: id, param: param};

		xhrPost("backend.php", query, (transport) => {
			try {
				const content = transport.responseText;

				let dialog = dijit.byId("infoBox");

				if (!dialog) {
					dialog = new dijit.Dialog({
						title: title,
						id: 'infoBox',
						style: "width: 600px",
						onCancel: function () {
							return true;
						},
						onExecute: function () {
							return true;
						},
						onClose: function () {
							return true;
						},
						content: content
					});
				} else {
					dialog.attr('title', title);
					dialog.attr('content', content);
				}

				dialog.show();

				Notify.close();

				if (callback) callback(transport);
			} catch (e) {
				this.Error.report(e);
			}
		});

		return false;
	},
	handleRpcJson: function(transport) {

		const netalert = $$("#toolbar .net-alert")[0];

		try {
			const reply = JSON.parse(transport.responseText);

			if (reply) {
				const error = reply['error'];

				if (error) {
					const code = error['code'];
					const msg = error['message'];

					console.warn("[handleRpcJson] received fatal error ", code, msg);

					if (code != 0) {
						/* global ERRORS */
						this.Error.fatal(ERRORS[code], {info: msg, code: code});
						return false;
					}
				}

				const seq = reply['seq'];

				if (seq && this.get_seq() != seq) {
					console.log("[handleRpcJson] sequence mismatch: ", seq, '!=', this.get_seq());
					return true;
				}

				const message = reply['message'];

				if (message == "UPDATE_COUNTERS") {
					console.log("need to refresh counters...");
					Feeds.requestCounters(true);
				}

				const counters = reply['counters'];

				if (counters)
					Feeds.parseCounters(counters);

				const runtime_info = reply['runtime-info'];

				if (runtime_info)
					this.parseRuntimeInfo(runtime_info);

				if (netalert) netalert.hide();

				return reply;

			} else {
				if (netalert) netalert.show();

				Notify.error("Communication problem with server.");
			}

		} catch (e) {
			if (netalert) netalert.show();

			Notify.error("Communication problem with server.");

			console.error(e);
		}

		return false;
	},
	parseRuntimeInfo: function(data) {
		for (const k in data) {
			if (data.hasOwnProperty(k)) {
				const v = data[k];

				console.log("RI:", k, "=>", v);

				if (k == "daemon_is_running" && v != 1) {
					Notify.error("<span onclick=\"App.explainError(1)\">Update daemon is not running.</span>", true);
					return;
				}

				if (k == "recent_log_events") {
					const alert = $$(".log-alert")[0];

					if (alert) {
						v > 0 ? alert.show() : alert.hide();
					}
				}

				if (k == "daemon_stamp_ok" && v != 1) {
					Notify.error("<span onclick=\"App.explainError(3)\">Update daemon is not updating feeds.</span>", true);
					return;
				}

				if (k == "max_feed_id" || k == "num_feeds") {
					if (this.getInitParam(k) != v) {
						console.log("feed count changed, need to reload feedlist.");
						Feeds.reload();
					}
				}

				this.setInitParam(k, v);
			}
		}

		PluginHost.run(PluginHost.HOOK_RUNTIME_INFO_LOADED, data);
	},
	backendSanityCallback: function(transport) {
		const reply = JSON.parse(transport.responseText);

		/* global ERRORS */

		if (!reply) {
			this.Error.fatal(ERRORS[3], {info: transport.responseText});
			return;
		}

		if (reply['error']) {
			const code = reply['error']['code'];

			if (code && code != 0) {
				return this.Error.fatal(ERRORS[code],
					{code: code, info: reply['error']['message']});
			}
		}

		console.log("sanity check ok");

		const params = reply['init-params'];

		if (params) {
			console.log('reading init-params...');

			for (const k in params) {
				if (params.hasOwnProperty(k)) {
					switch (k) {
						case "label_base_index":
							this.LABEL_BASE_INDEX = parseInt(params[k]);
							break;
						case "cdm_auto_catchup":
							if (params[k] == 1) {
								const hl = $("headlines-frame");
								if (hl) hl.addClassName("auto_catchup");
							}
							break;
						case "hotkeys":
							// filter mnemonic definitions (used for help panel) from hotkeys map
							// i.e. *(191)|Ctrl-/ -> *(191)
                     {
                        const tmp = [];
                        for (const sequence in params[k][1]) {
                           if (params[k][1].hasOwnProperty(sequence)) {
                              const filtered = sequence.replace(/\|.*$/, "");
                              tmp[filtered] = params[k][1][sequence];
                           }
                        }

                        params[k][1] = tmp;
                     }
							break;
					}

					console.log("IP:", k, "=>", params[k]);
					this.setInitParam(k, params[k]);
				}
			}

			// PluginHost might not be available on non-index pages
			if (typeof PluginHost !== 'undefined')
				PluginHost.run(PluginHost.HOOK_PARAMS_LOADED, this._initParams);
		}

		this.initSecondStage();
	},
	explainError: function(code) {
		return this.displayDlg(__("Error explained"), "explainError", code);
	},
	Error: {
		fatal: function (error, params) {
			params = params || {};

			if (params.code) {
				if (params.code == 6) {
					window.location.href = "index.php";
					return;
				} else if (params.code == 5) {
					window.location.href = "public.php?op=dbupdate";
					return;
				}
			}

			return this.report(error,
				Object.extend({title: __("Fatal error")}, params));
		},
		report: function(error, params) {
			params = params || {};

			if (!error) return;

			console.error("[Error.report]", error, params);

			const message = params.message ? params.message : error.toString();

			try {
				xhrPost("backend.php",
					{op: "rpc", method: "log",
						file: params.filename ? params.filename : error.fileName,
						line: params.lineno ? params.lineno : error.lineNumber,
						msg: message,
						context: error.stack},
					(transport) => {
						console.warn("[Error.report] log response", transport.responseText);
					});
			} catch (re) {
				console.error("[Error.report] exception while saving logging error on server", re);
			}

			try {
				if (dijit.byId("exceptionDlg"))
					dijit.byId("exceptionDlg").destroyRecursive();

				let stack_msg = "";

				if (error.stack)
					stack_msg += `<div><b>Stack trace:</b></div>
						<textarea name="stack" readonly="1">${error.stack}</textarea>`;

				if (params.info)
					stack_msg += `<div><b>Additional information:</b></div>
						<textarea name="stack" readonly="1">${params.info}</textarea>`;

				const content = `<div class="error-contents">
						<p class="message">${message}</p>
						${stack_msg}
						<div class="dlgButtons">
							<button dojoType="dijit.form.Button"
								onclick="dijit.byId('exceptionDlg').hide()">${__('Close this window')}</button>
						</div>
					</div>`;

				const dialog = new dijit.Dialog({
					id: "exceptionDlg",
					title: params.title || __("Unhandled exception"),
					style: "width: 600px",
					content: content
				});

				dialog.show();
			} catch (de) {
				console.error("[Error.report] exception while showing error dialog", de);

				alert(error.stack ? error.stack : message);
			}

		},
		onWindowError: function (message, filename, lineno, colno, error) {
			// called without context (this) from window.onerror
			App.Error.report(error,
				{message: message, filename: filename, lineno: lineno, colno: colno});
		},
	},
	isPrefs() {
		return this.is_prefs;
   },
   init: function(parser, is_prefs) {
      this.is_prefs = is_prefs;
      window.onerror = this.Error.onWindowError;

      this.setupNightModeDetection(() => {
         parser.parse();

         console.log('is_prefs', this.is_prefs);

         if (!this.checkBrowserFeatures())
            return;

         this.setLoadingProgress(30);
         this.initHotkeyActions();

         const a = document.createElement('audio');
         const hasAudio = !!a.canPlayType;
         const hasSandbox = "sandbox" in document.createElement("iframe");
         const hasMp3 = !!(a.canPlayType && a.canPlayType('audio/mpeg;').replace(/no/, ''));
         const clientTzOffset = new Date().getTimezoneOffset() * 60;

         const params = {
            op: "rpc", method: "sanityCheck", hasAudio: hasAudio,
            hasMp3: hasMp3,
            clientTzOffset: clientTzOffset,
            hasSandbox: hasSandbox
         };

         xhrPost("backend.php", params, (transport) => {
            try {
               this.backendSanityCallback(transport);
            } catch (e) {
               this.Error.report(e);
            }
         });
      });
   },
   checkBrowserFeatures: function() {
      let errorMsg = "";

      ['MutationObserver'].each(function(wf) {
         if (!(wf in window)) {
            errorMsg = `Browser feature check failed: <code>window.${wf}</code> not found.`;
            throw new Error(errorMsg);
         }
      });

      if (errorMsg) {
         this.Error.fatal(errorMsg, {info: navigator.userAgent});
      }

      return errorMsg == "";
   },
   initSecondStage: function() {
      this.enableCsrfSupport();

      document.onkeydown = (event) => { return this.hotkeyHandler(event) };
      document.onkeypress = (event) => { return this.hotkeyHandler(event) };

      if (this.is_prefs) {

         this.setLoadingProgress(70);
         Notify.close();

         let tab = this.urlParam('tab');

         if (tab) {
            tab = dijit.byId(tab + "Tab");
            if (tab) {
               dijit.byId("pref-tabs").selectChild(tab);

               switch (this.urlParam('method')) {
                  case "editfeed":
                     window.setTimeout(() => {
                        CommonDialogs.editFeed(this.urlParam('methodparam'))
                     }, 100);
                     break;
                  default:
                     console.warn("initSecondStage, unknown method:", this.urlParam("method"));
               }
            }
         } else {
            let tab = localStorage.getItem("ttrss:prefs-tab");

            if (tab) {
               tab = dijit.byId(tab);
               if (tab) {
                  dijit.byId("pref-tabs").selectChild(tab);
               }
            }
         }

         dojo.connect(dijit.byId("pref-tabs"), "selectChild", function (elem) {
            localStorage.setItem("ttrss:prefs-tab", elem.id);
         });

      } else {

         Feeds.reload();
         Article.close();

         if (parseInt(Cookie.get("ttrss_fh_width")) > 0) {
            dijit.byId("feeds-holder").domNode.setStyle(
               {width: Cookie.get("ttrss_fh_width") + "px"});
         }

         dijit.byId("main").resize();

         dojo.connect(dijit.byId('feeds-holder'), 'resize',
            (args) => {
               if (args && args.w >= 0) {
                  Cookie.set("ttrss_fh_width", args.w, this.getInitParam("cookie_lifetime"));
               }
            });

         dojo.connect(dijit.byId('content-insert'), 'resize',
            (args) => {
               if (args && args.w >= 0 && args.h >= 0) {
                  Cookie.set("ttrss_ci_width", args.w, this.getInitParam("cookie_lifetime"));
                  Cookie.set("ttrss_ci_height", args.h, this.getInitParam("cookie_lifetime"));
               }
            });

         const toolbar = document.forms["toolbar-main"];

         dijit.getEnclosingWidget(toolbar.view_mode).attr('value',
            this.getInitParam("default_view_mode"));

         dijit.getEnclosingWidget(toolbar.order_by).attr('value',
            this.getInitParam("default_view_order_by"));

         this.setLoadingProgress(50);

         this._widescreen_mode = this.getInitParam("widescreen");
         this.switchPanelMode(this._widescreen_mode);

         Headlines.initScrollHandler();

         if (this.getInitParam("simple_update")) {
            console.log("scheduling simple feed updater...");
            window.setInterval(() => { Feeds.updateRandom() }, 30 * 1000);
         }

         if (this.getInitParam('check_for_updates')) {
            window.setInterval(() => {
               this.checkForUpdates();
            }, 3600 * 1000);
         }

         console.log("second stage ok");

         PluginHost.run(PluginHost.HOOK_INIT_COMPLETE, null);

      }

   },
   checkForUpdates: function() {
      console.log('checking for updates...');

      xhrJson("backend.php", {op: 'rpc', method: 'checkforupdates'})
         .then((reply) => {
            console.log('update reply', reply);

            if (reply.id) {
               $("updates-available").show();
            } else {
               $("updates-available").hide();
            }
         });
   },
   updateTitle: function() {
      let tmp = "Tiny Tiny RSS";

      if (this.global_unread > 0) {
         tmp = "(" + this.global_unread + ") " + tmp;
      }

      document.title = tmp;
   },
   onViewModeChanged: function() {
      const view_mode = document.forms["toolbar-main"].view_mode.value;

      $$("body")[0].setAttribute("view-mode", view_mode);

      return Feeds.reloadCurrent('');
   },
   hotkeyHandler: function(event) {
      if (event.target.nodeName == "INPUT" || event.target.nodeName == "TEXTAREA") return;

      // Arrow buttons and escape are not reported via keypress, handle them via keydown.
      // escape = 27, left = 37, up = 38, right = 39, down = 40, pgup = 33, pgdn = 34, insert = 45, delete = 46
      if (event.type == "keydown" && event.which != 27 && (event.which < 33 || event.which > 46)) return;

      const action_name = this.keyeventToAction(event);

      if (action_name) {
         const action_func = this.hotkey_actions[action_name];

         if (action_func != null) {
            action_func(event);
            event.stopPropagation();
            return false;
         }
      }
   },
   switchPanelMode: function(wide) {
      const article_id = Article.getActive();

      if (wide) {
         dijit.byId("headlines-wrap-inner").attr("design", 'sidebar');
         dijit.byId("content-insert").attr("region", "trailing");

         dijit.byId("content-insert").domNode.setStyle({width: '50%',
            height: 'auto',
            borderTopWidth: '0px' });

         if (parseInt(Cookie.get("ttrss_ci_width")) > 0) {
            dijit.byId("content-insert").domNode.setStyle(
               {width: Cookie.get("ttrss_ci_width") + "px" });
         }

         $("headlines-frame").setStyle({ borderBottomWidth: '0px' });
         $("headlines-frame").addClassName("wide");

      } else {

         dijit.byId("content-insert").attr("region", "bottom");

         dijit.byId("content-insert").domNode.setStyle({width: 'auto',
            height: '50%',
            borderTopWidth: '0px'});

         if (parseInt(Cookie.get("ttrss_ci_height")) > 0) {
            dijit.byId("content-insert").domNode.setStyle(
               {height: Cookie.get("ttrss_ci_height") + "px" });
         }

         $("headlines-frame").setStyle({ borderBottomWidth: '1px' });
         $("headlines-frame").removeClassName("wide");

      }

      Article.close();

      if (article_id) Article.view(article_id);

      xhrPost("backend.php", {op: "rpc", method: "setpanelmode", wide: wide ? 1 : 0});
   },
   initHotkeyActions: function() {
      if (this.is_prefs) {

         this.hotkey_actions["feed_subscribe"] = () => {
            CommonDialogs.quickAddFeed();
         };

         this.hotkey_actions["create_label"] = () => {
            CommonDialogs.addLabel();
         };

         this.hotkey_actions["create_filter"] = () => {
            Filters.quickAddFilter();
         };

         this.hotkey_actions["help_dialog"] = () => {
            this.helpDialog("main");
         };

      } else {

         this.hotkey_actions["next_feed"] = () => {
            const rv = dijit.byId("feedTree").getNextFeed(
               Feeds.getActive(), Feeds.activeIsCat());

            if (rv) Feeds.open({feed: rv[0], is_cat: rv[1], delayed: true})
         };
         this.hotkey_actions["prev_feed"] = () => {
            const rv = dijit.byId("feedTree").getPreviousFeed(
               Feeds.getActive(), Feeds.activeIsCat());

            if (rv) Feeds.open({feed: rv[0], is_cat: rv[1], delayed: true})
         };
         this.hotkey_actions["next_article_or_scroll"] = (event) => {
            if (this.isCombinedMode())
               Headlines.scroll(Headlines.line_scroll_offset, event);
            else
               Headlines.move('next');
         };
         this.hotkey_actions["prev_article_or_scroll"] = (event) => {
            if (this.isCombinedMode())
               Headlines.scroll(-Headlines.line_scroll_offset, event);
            else
               Headlines.move('prev');
         };
         this.hotkey_actions["next_article_noscroll"] = () => {
            Headlines.move('next');
         };
         this.hotkey_actions["prev_article_noscroll"] = () => {
            Headlines.move('prev');
         };
         this.hotkey_actions["next_article_noexpand"] = () => {
            Headlines.move('next', {no_expand: true});
         };
         this.hotkey_actions["prev_article_noexpand"] = () => {
            Headlines.move('prev', {no_expand: true});
         };
         this.hotkey_actions["search_dialog"] = () => {
            Feeds.search();
         };
         this.hotkey_actions["cancel_search"] = () => {
            Feeds.cancelSearch();
         };
         this.hotkey_actions["toggle_mark"] = () => {
            Headlines.selectionToggleMarked();
         };
         this.hotkey_actions["toggle_publ"] = () => {
            Headlines.selectionTogglePublished();
         };
         this.hotkey_actions["toggle_unread"] = () => {
            Headlines.selectionToggleUnread({no_error: 1});
         };
         this.hotkey_actions["edit_tags"] = () => {
            const id = Article.getActive();
            if (id) {
               Article.editTags(id);
            }
         };
         this.hotkey_actions["open_in_new_window"] = () => {
            if (Article.getActive()) {
               Article.openInNewWindow(Article.getActive());
            }
         };
         this.hotkey_actions["catchup_below"] = () => {
            Headlines.catchupRelativeTo(1);
         };
         this.hotkey_actions["catchup_above"] = () => {
            Headlines.catchupRelativeTo(0);
         };
         this.hotkey_actions["article_scroll_down"] = (event) => {
            if (this.isCombinedMode())
               Headlines.scroll(Headlines.line_scroll_offset, event);
            else
               Article.scroll(Headlines.line_scroll_offset, event);
         };
         this.hotkey_actions["article_scroll_up"] = (event) => {
            if (this.isCombinedMode())
               Headlines.scroll(-Headlines.line_scroll_offset, event);
            else
               Article.scroll(-Headlines.line_scroll_offset, event);
         };
         this.hotkey_actions["next_headlines_page"] = (event) => {
            Headlines.scrollByPages(1, event);
         };
         this.hotkey_actions["prev_headlines_page"] = (event) => {
            Headlines.scrollByPages(-1, event);
         };
         this.hotkey_actions["article_page_down"] = (event) => {
            if (this.isCombinedMode())
               Headlines.scrollByPages(1, event);
            else
               Article.scrollByPages(1, event);
         };
         this.hotkey_actions["article_page_up"] = (event) => {
            if (this.isCombinedMode())
               Headlines.scrollByPages(-1, event);
            else
               Article.scrollByPages(-1, event);
         };
         this.hotkey_actions["close_article"] = () => {
            if (this.isCombinedMode()) {
               Article.cdmUnsetActive();
            } else {
               Article.close();
            }
         };
         this.hotkey_actions["email_article"] = () => {
            if (typeof Plugins.Mail != "undefined") {
               Plugins.Mail.onHotkey(Headlines.getSelected());
            } else {
               alert(__("Please enable mail or mailto plugin first."));
            }
         };
         this.hotkey_actions["select_all"] = () => {
            Headlines.select('all');
         };
         this.hotkey_actions["select_unread"] = () => {
            Headlines.select('unread');
         };
         this.hotkey_actions["select_marked"] = () => {
            Headlines.select('marked');
         };
         this.hotkey_actions["select_published"] = () => {
            Headlines.select('published');
         };
         this.hotkey_actions["select_invert"] = () => {
            Headlines.select('invert');
         };
         this.hotkey_actions["select_none"] = () => {
            Headlines.select('none');
         };
         this.hotkey_actions["feed_refresh"] = () => {
            if (typeof Feeds.getActive() != "undefined") {
               Feeds.open({feed: Feeds.getActive(), is_cat: Feeds.activeIsCat()});
            }
         };
         this.hotkey_actions["feed_unhide_read"] = () => {
            Feeds.toggleUnread();
         };
         this.hotkey_actions["feed_subscribe"] = () => {
            CommonDialogs.quickAddFeed();
         };
         this.hotkey_actions["feed_debug_update"] = () => {
            if (!Feeds.activeIsCat() && parseInt(Feeds.getActive()) > 0) {
               window.open("backend.php?op=feeds&method=update_debugger&feed_id=" + Feeds.getActive() +
                  "&csrf_token=" + this.getInitParam("csrf_token"));
            } else {
               alert("You can't debug this kind of feed.");
            }
         };

         this.hotkey_actions["feed_debug_viewfeed"] = () => {
            Feeds.open({feed: Feeds.getActive(), is_cat: Feeds.activeIsCat(), viewfeed_debug: true});
         };

         this.hotkey_actions["feed_edit"] = () => {
            if (Feeds.activeIsCat())
               alert(__("You can't edit this kind of feed."));
            else
               CommonDialogs.editFeed(Feeds.getActive());
         };
         this.hotkey_actions["feed_catchup"] = () => {
            if (typeof Feeds.getActive() != "undefined") {
               Feeds.catchupCurrent();
            }
         };
         this.hotkey_actions["feed_reverse"] = () => {
            Headlines.reverse();
         };
         this.hotkey_actions["feed_toggle_vgroup"] = () => {
            xhrPost("backend.php", {op: "rpc", method: "togglepref", key: "VFEED_GROUP_BY_FEED"}, () => {
               Feeds.reloadCurrent();
            })
         };
         this.hotkey_actions["catchup_all"] = () => {
            Feeds.catchupAll();
         };
         this.hotkey_actions["cat_toggle_collapse"] = () => {
            if (Feeds.activeIsCat()) {
               dijit.byId("feedTree").collapseCat(Feeds.getActive());
            }
         };
         this.hotkey_actions["goto_read"] = () => {
            Feeds.open({feed: -6});
         };
         this.hotkey_actions["goto_all"] = () => {
            Feeds.open({feed: -4});
         };
         this.hotkey_actions["goto_fresh"] = () => {
            Feeds.open({feed: -3});
         };
         this.hotkey_actions["goto_marked"] = () => {
            Feeds.open({feed: -1});
         };
         this.hotkey_actions["goto_published"] = () => {
            Feeds.open({feed: -2});
         };
         this.hotkey_actions["goto_tagcloud"] = () => {
            this.displayDlg(__("Tag cloud"), "printTagCloud");
         };
         this.hotkey_actions["goto_prefs"] = () => {
            document.location.href = "prefs.php";
         };
         this.hotkey_actions["select_article_cursor"] = () => {
            const id = Article.getUnderPointer();
            if (id) {
               const row = $("RROW-" + id);

               if (row)
                  row.toggleClassName("Selected");
            }
         };
         this.hotkey_actions["create_label"] = () => {
            CommonDialogs.addLabel();
         };
         this.hotkey_actions["create_filter"] = () => {
            Filters.quickAddFilter();
         };
         this.hotkey_actions["collapse_sidebar"] = () => {
            Feeds.toggle();
         };
         this.hotkey_actions["toggle_full_text"] = () => {
            if (typeof Plugins.Af_Readability != "undefined") {
               if (Article.getActive())
                  Plugins.Af_Readability.embed(Article.getActive());
            } else {
               alert(__("Please enable af_readability first."));
            }
         };
         this.hotkey_actions["toggle_widescreen"] = () => {
            if (!this.isCombinedMode()) {
               this._widescreen_mode = !this._widescreen_mode;

               // reset stored sizes because geometry changed
               Cookie.set("ttrss_ci_width", 0);
               Cookie.set("ttrss_ci_height", 0);

               this.switchPanelMode(this._widescreen_mode);
            } else {
               alert(__("Widescreen is not available in combined mode."));
            }
         };
         this.hotkey_actions["help_dialog"] = () => {
            this.helpDialog("main");
         };
         this.hotkey_actions["toggle_combined_mode"] = () => {
            const value = this.isCombinedMode() ? "false" : "true";

            xhrPost("backend.php", {op: "rpc", method: "setpref", key: "COMBINED_DISPLAY_MODE", value: value}, () => {
               this.setInitParam("combined_display_mode",
                  !this.getInitParam("combined_display_mode"));

               Article.close();
               Headlines.renderAgain();
            })
         };
         this.hotkey_actions["toggle_cdm_expanded"] = () => {
            const value = this.getInitParam("cdm_expanded") ? "false" : "true";

            xhrPost("backend.php", {op: "rpc", method: "setpref", key: "CDM_EXPANDED", value: value}, () => {
               this.setInitParam("cdm_expanded", !this.getInitParam("cdm_expanded"));
               Headlines.renderAgain();
            });
         };
      }
   },
   onActionSelected: function(opid) {
      switch (opid) {
         case "qmcPrefs":
            document.location.href = "prefs.php";
            break;
         case "qmcLogout":
            document.location.href = "backend.php?op=logout";
            break;
         case "qmcTagCloud":
            this.displayDlg(__("Tag cloud"), "printTagCloud");
            break;
         case "qmcSearch":
            Feeds.search();
            break;
         case "qmcAddFeed":
            CommonDialogs.quickAddFeed();
            break;
         case "qmcDigest":
            window.location.href = "backend.php?op=digest";
            break;
         case "qmcEditFeed":
            if (Feeds.activeIsCat())
               alert(__("You can't edit this kind of feed."));
            else
               CommonDialogs.editFeed(Feeds.getActive());
            break;
         case "qmcRemoveFeed":
            {
               const actid = Feeds.getActive();

               if (!actid) {
                  alert(__("Please select some feed first."));
                  return;
               }

               if (Feeds.activeIsCat()) {
                  alert(__("You can't unsubscribe from the category."));
                  return;
               }

               const fn = Feeds.getName(actid);

               if (confirm(__("Unsubscribe from %s?").replace("%s", fn))) {
                  CommonDialogs.unsubscribeFeed(actid);
               }
            }
            break;
         case "qmcCatchupAll":
            Feeds.catchupAll();
            break;
         case "qmcShowOnlyUnread":
            Feeds.toggleUnread();
            break;
         case "qmcToggleWidescreen":
            if (!this.isCombinedMode()) {
               this._widescreen_mode = !this._widescreen_mode;

               // reset stored sizes because geometry changed
               Cookie.set("ttrss_ci_width", 0);
               Cookie.set("ttrss_ci_height", 0);

               this.switchPanelMode(this._widescreen_mode);
            } else {
               alert(__("Widescreen is not available in combined mode."));
            }
            break;
         case "qmcHKhelp":
            this.helpDialog("main");
            break;
         default:
            console.log("quickMenuGo: unknown action: " + opid);
      }
   }
}

