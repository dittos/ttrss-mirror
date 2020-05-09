Plugins.Af_Readability = {
    orig_attr_name: 'data-readability-orig-content',
    self: this,
    embed: function(id) {
        const content = $$(App.isCombinedMode() ? ".cdm[data-article-id=" + id + "] .content-inner" :
            ".post[data-article-id=" + id + "] .content")[0];

        if (content.hasAttribute(self.orig_attr_name)) {
            content.innerHTML = content.getAttribute(self.orig_attr_name);
            content.removeAttribute(self.orig_attr_name);

            if (App.isCombinedMode()) Article.cdmMoveToId(id);

            return;
        }

        Notify.progress("Loading, please wait...");

        xhrJson("backend.php",{ op: "pluginhandler", plugin: "af_readability", method: "embed", param: id }, (reply) => {

            if (content && reply.content) {
                content.setAttribute(self.orig_attr_name, content.innerHTML);
                content.innerHTML = reply.content;
                Notify.close();

                if (App.isCombinedMode()) Article.cdmMoveToId(id);

            } else {
                Notify.error("Unable to fetch full text for this article");
            }
        });
    }
};
