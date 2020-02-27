Plugins.Af_Readability = {
	embed: function(id) {
		Notify.progress("Loading, please wait...");

		xhrJson("backend.php",{ op: "pluginhandler", plugin: "af_readability", method: "embed", param: id }, (reply) => {
			const content = $$(App.isCombinedMode() ? ".cdm[data-article-id=" + id + "] .content-inner" :
				".post[data-article-id=" + id + "] .content")[0];

			if (content && reply.content) {
				content.innerHTML = reply.content;
				Notify.close();
			} else {
				Notify.error("Unable to fetch content for this article");
			}
		});
	}
};
