/* TODO: this should probably be something like night_mode.js since it does nothing specific to utility scripts */2

Event.observe(window, "load", function() {
    const UtilityJS = {
        apply_night_mode: function (is_night, link) {
            console.log("night mode changed to", is_night);

            if (link) {
                const css_override = is_night ? "themes/night.css" : "css/default.css";

                link.setAttribute("href", css_override + "?" + Date.now());
            }
        },
        setup_night_mode: function() {
            const mql = window.matchMedia('(prefers-color-scheme: dark)');

            const link = new Element("link", {
                rel: "stylesheet",
                id: "theme_auto_css"
            });

            link.onload = function() {
                document.querySelector("body").removeClassName("css_loading");

                if (typeof UtilityApp != "undefined")
                    UtilityApp.init();
            };

            try {
                mql.addEventListener("change", () => {
                    UtilityJS.apply_night_mode(mql.matches, link);
                });
            } catch (e) {
                console.warn("exception while trying to set MQL event listener");
            }

            document.querySelector("head").appendChild(link);

            UtilityJS.apply_night_mode(mql.matches, link);
        }
    };

    UtilityJS.setup_night_mode();
});
