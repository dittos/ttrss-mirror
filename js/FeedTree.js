/* global dijit */
define(["dojo/_base/declare", "dojo/dom-construct", "dijit/Tree", "dijit/Menu"], function (declare, domConstruct) {

	return declare("fox.FeedTree", dijit.Tree, {
		_onContainerKeydown: function(/* Event */ e) {
			return; // Stop dijit.Tree from interpreting keystrokes
		},
		_onContainerKeypress: function(/* Event */ e) {
			return; // Stop dijit.Tree from interpreting keystrokes
		},
		_createTreeNode: function(args) {
			const tnode = new dijit._TreeNode(args);

			const iconName = args.item.icon ? String(args.item.icon[0]) : null;
			let iconNode;

			if (iconName) {
				if (iconName.indexOf("/") == -1) {
					iconNode = dojo.create("i", { className: "material-icons icon icon-" + iconName, innerHTML: iconName });
				} else {
					iconNode = dojo.create('img', { className: 'icon' });
					if (args.item.icon && args.item.icon[0]) {
						iconNode.src = args.item.icon[0];
					} else {
						iconNode.src = 'images/blank_icon.gif';
					}
				}
			}

			if (iconNode)
				domConstruct.place(iconNode, tnode.iconNode, 'only');

			const id = args.item.id[0];
			const bare_id = parseInt(id.substr(id.indexOf(':')+1));

			if (bare_id < LABEL_BASE_INDEX) {
				const label = dojo.create('i', { className: "material-icons icon icon-label", innerHTML: "label" });

				//const fg_color = args.item.fg_color[0];
				const bg_color = args.item.bg_color[0];

				label.setStyle({
					color: bg_color,
					});

				domConstruct.place(label, tnode.iconNode, 'only');
			}

			if (id.match("FEED:")) {
				let menu = new dijit.Menu();
				menu.row_id = bare_id;

				menu.addChild(new dijit.MenuItem({
					label: __("Mark as read"),
					onClick: function() {
						Feeds.catchupFeed(this.getParent().row_id);
					}}));

				if (bare_id > 0) {
					menu.addChild(new dijit.MenuItem({
						label: __("Edit feed"),
						onClick: function() {
							CommonDialogs.editFeed(this.getParent().row_id, false);
						}}));

					menu.addChild(new dijit.MenuItem({
						label: __("Debug feed"),
						onClick: function() {
							window.open("backend.php?op=feeds&method=update_debugger&feed_id=" + this.getParent().row_id +
								"&csrf_token=" + App.getInitParam("csrf_token"));
						}}));
				}

				menu.bindDomNode(tnode.domNode);
				tnode._menu = menu;
			}

			if (id.match("CAT:") && bare_id >= 0) {
				let menu = new dijit.Menu();
				menu.row_id = bare_id;

				menu.addChild(new dijit.MenuItem({
					label: __("Mark as read"),
					onClick: function() {
						Feeds.catchupFeed(this.getParent().row_id, true);
					}}));

				menu.addChild(new dijit.MenuItem({
					label: __("(Un)collapse"),
					onClick: function() {
						dijit.byId("feedTree").collapseCat(this.getParent().row_id);
					}}));

				menu.bindDomNode(tnode.domNode);
				tnode._menu = menu;
			}

			if (id.match("CAT:")) {
				tnode.loadingNode = dojo.create('img', { className: 'loadingNode', src: 'images/blank_icon.gif'});
				domConstruct.place(tnode.loadingNode, tnode.labelNode, 'after');
			}

			if (id.match("CAT:") && bare_id == -1) {
				let menu = new dijit.Menu();
				menu.row_id = bare_id;

				menu.addChild(new dijit.MenuItem({
					label: __("Mark all feeds as read"),
					onClick: function() {
						Feeds.catchupAll();
					}}));

				menu.bindDomNode(tnode.domNode);
				tnode._menu = menu;
			}

			tnode.markedCounterNode = dojo.create('span', { className: 'counterNode marked', innerHTML: args.item.markedcounter });
			domConstruct.place(tnode.markedCounterNode, tnode.rowNode, 'first');

			tnode.auxCounterNode = dojo.create('span', { className: 'counterNode aux', innerHTML: args.item.auxcounter });
			domConstruct.place(tnode.auxCounterNode, tnode.rowNode, 'first');

			tnode.unreadCounterNode = dojo.create('span', { className: 'counterNode unread', innerHTML: args.item.unread });
			domConstruct.place(tnode.unreadCounterNode, tnode.rowNode, 'first');

			return tnode;
		},
		postCreate: function() {
			this.connect(this.model, "onChange", "updateCounter");
			this.inherited(arguments);
		},
		updateCounter: function (item) {
			const tree = this;

			//console.log("updateCounter: " + item.id[0] + " " + item.unread + " " + tree);

			let treeNode = tree._itemNodesMap[item.id];

			if (treeNode) {
				treeNode = treeNode[0];

				treeNode.unreadCounterNode.innerHTML = item.unread;
				treeNode.auxCounterNode.innerHTML = item.auxcounter;
				treeNode.markedCounterNode.innerHTML = item.markedcounter;
			}
		},
		getTooltip: function (item) {
			return [item.updated, item.error].filter(x => x && x != "").join(" - ");
		},
		getIconClass: function (item, opened) {
			return (!item || this.model.mayHaveChildren(item)) ? (opened ? "dijitFolderOpened" : "dijitFolderClosed") : "feed-icon";
		},
		getLabelClass: function (item, opened) {
			return (item.unread <= 0) ? "dijitTreeLabel" : "dijitTreeLabel Unread";
		},
		getRowClass: function (item, opened) {
			let rc = "dijitTreeRow";

			const is_cat = String(item.id).indexOf('CAT:') != -1;

			if (!is_cat && item.error != '') rc += " Error";
			if (item.unread > 0) rc += " Unread";
			if (item.auxcounter > 0) rc += " Has_Aux";
			if (item.markedcounter > 0) rc += " Has_Marked";
			if (item.updates_disabled > 0) rc += " UpdatesDisabled";
			if (item.bare_id >= LABEL_BASE_INDEX && item.bare_id < 0 && !is_cat || item.bare_id == 0 && !is_cat) rc += " Special";
			if (item.bare_id == -1 && is_cat) rc += " AlwaysVisible";
			if (item.bare_id < LABEL_BASE_INDEX) rc += " Label";

			return rc;
		},
		getLabel: function(item) {
			let name = String(item.name);

			/* Horrible */
			name = name.replace(/&quot;/g, "\"");
			name = name.replace(/&amp;/g, "&");
			name = name.replace(/&mdash;/g, "-");
			name = name.replace(/&lt;/g, "<");
			name = name.replace(/&gt;/g, ">");

			return name;
		},
		expandParentNodes: function(feed, is_cat, list) {
			try {
				for (let i = 0; i < list.length; i++) {
					const id = String(list[i].id);
					let item = this._itemNodesMap[id];

					if (item) {
						item = item[0];
						this._expandNode(item);
					}
				}
			} catch (e) {
				App.Error.report(e);
			}
		},
		findNodeParentsAndExpandThem: function(feed, is_cat, root, parents) {
			// expands all parents of specified feed to properly mark it as active
			// my fav thing about frameworks is doing everything myself
			try {
				const test_id = is_cat ? 'CAT:' + feed : 'FEED:' + feed;

				if (!root) {
					if (!this.model || !this.model.store) return false;

					const items = this.model.store._arrayOfTopLevelItems;

					for (let i = 0; i < items.length; i++) {
						if (String(items[i].id) == test_id) {
							this.expandParentNodes(feed, is_cat, parents);
						} else {
							this.findNodeParentsAndExpandThem(feed, is_cat, items[i], []);
						}
					}
				} else if (root.items) {
						parents.push(root);

						for (let i = 0; i < root.items.length; i++) {
							if (String(root.items[i].id) == test_id) {
								this.expandParentNodes(feed, is_cat, parents);
							} else {
								this.findNodeParentsAndExpandThem(feed, is_cat, root.items[i], parents.slice(0));
							}
						}
					} else if (String(root.id) == test_id) {
							this.expandParentNodes(feed, is_cat, parents.slice(0));
						}
			} catch (e) {
				App.Error.report(e);
			}
		},
		selectFeed: function(feed, is_cat) {
			this.findNodeParentsAndExpandThem(feed, is_cat, false, false);

			let treeNode;

			if (is_cat)
				treeNode = this._itemNodesMap['CAT:' + feed];
			else
				treeNode = this._itemNodesMap['FEED:' + feed];

			if (treeNode) {
				treeNode = treeNode[0];
				if (!is_cat) this._expandNode(treeNode);
				this.set("selectedNodes", [treeNode]);
				this.focusNode(treeNode);

				// focus headlines to route key events there
				setTimeout(() => {
					$("headlines-frame").focus();

					if (treeNode) {
						const node = treeNode.rowNode;
						const tree = this.domNode;

						if (node && tree) {
							// scroll tree to selection if needed
							if (node.offsetTop < tree.scrollTop || node.offsetTop > tree.scrollTop + tree.clientHeight) {
								$("feedTree").scrollTop = node.offsetTop;
							}
						}
					}

				}, 0);
			}
		},
		setFeedIcon: function(feed, is_cat, src) {
			let treeNode;

			if (is_cat)
				treeNode = this._itemNodesMap['CAT:' + feed];
			else
				treeNode = this._itemNodesMap['FEED:' + feed];

			if (treeNode) {
				treeNode = treeNode[0];
				const icon = dojo.create('img', { src: src, className: 'icon' });
				domConstruct.place(icon, treeNode.iconNode, 'only');
				return true;
			}
			return false;
		},
		setFeedExpandoIcon: function(feed, is_cat, src) {
			let treeNode;

			if (is_cat)
				treeNode = this._itemNodesMap['CAT:' + feed];
			else
				treeNode = this._itemNodesMap['FEED:' + feed];

			if (treeNode) {
				treeNode = treeNode[0];
				if (treeNode.loadingNode) {
					treeNode.loadingNode.src = src;
					return true;
				} else {
					const icon = dojo.create('img', { src: src, className: 'loadingExpando' });
					domConstruct.place(icon, treeNode.expandoNode, 'only');
					return true;
				}
			}

			return false;
		},
		hasCats: function() {
			return this.model.hasCats();
		},
		collapseCat: function(id) {
			if (!this.model.hasCats()) return;

			const tree = this;

			const node = tree._itemNodesMap['CAT:' + id][0];
			const item = tree.model.store._itemsByIdentity['CAT:' + id];

			if (node && item) {
				if (!node.isExpanded)
					tree._expandNode(node);
				else
					tree._collapseNode(node);

			}
		},
		getNextFeed: function (feed, is_cat) {
			let treeItem;

			if (is_cat) {
				treeItem = this.model.store._itemsByIdentity['CAT:' + feed];
			} else {
				treeItem = this.model.store._itemsByIdentity['FEED:' + feed];
			}

			const items = this.model.store._arrayOfAllItems;
			let item = items[0];

			for (let i = 0; i < items.length; i++) {
				if (items[i] == treeItem) {

					for (let j = i+1; j < items.length; j++) {
						const id = String(items[j].id);
						const box = this._itemNodesMap[id];

						if (box) {
							const row = box[0].rowNode;
							const cat = box[0].rowNode.parentNode.parentNode;

							if (Element.visible(cat) && Element.visible(row)) {
								item = items[j];
								break;
							}
						}
					}
					break;
				}
			}

			if (item) {
				return [this.model.store.getValue(item, 'bare_id'),
					!this.model.store.getValue(item, 'id').match('FEED:')];
			} else {
				return false;
			}
		},
		getPreviousFeed: function (feed, is_cat) {
			let treeItem;

			if (is_cat) {
				treeItem = this.model.store._itemsByIdentity['CAT:' + feed];
			} else {
				treeItem = this.model.store._itemsByIdentity['FEED:' + feed];
			}

			const items = this.model.store._arrayOfAllItems;
			let item = items[0] == treeItem ? items[items.length-1] : items[0];

			for (let i = 0; i < items.length; i++) {
				if (items[i] == treeItem) {

					for (let j = i-1; j > 0; j--) {
						const id = String(items[j].id);
						const box = this._itemNodesMap[id];

						if (box) {
							const row = box[0].rowNode;
							const cat = box[0].rowNode.parentNode.parentNode;

							if (Element.visible(cat) && Element.visible(row)) {
								item = items[j];
								break;
							}
						}

					}
					break;
				}
			}

			if (item) {
				return [this.model.store.getValue(item, 'bare_id'),
					!this.model.store.getValue(item, 'id').match('FEED:')];
			} else {
				return false;
			}

		},
		getFeedCategory: function(feed) {
			try {
				return this.getNodesByItem(this.model.store.
					_itemsByIdentity["FEED:" + feed])[0].
				getParent().item.bare_id[0];

			} catch (e) {
				return false;
			}
		},
	});
});

