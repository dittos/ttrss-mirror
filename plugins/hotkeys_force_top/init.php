<?php
class Hotkeys_Force_Top extends Plugin {
        private $host;

        function about() {
                return array(1.0,
                        "Force open article to the top",
                        "itsamenathan");
        }

        function init($host) {
                $this->host = $host;

        }

        function get_js() {
                return file_get_contents(__DIR__ . "/init.js");
        }

        function api_version() {
                return 2;
        }

}
