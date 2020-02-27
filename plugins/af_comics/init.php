<?php
class Af_Comics extends Plugin {

	private $host;
	private $filters = array();

	function about() {
		return array(2.0,
			"Fixes RSS feeds of assorted comic strips",
			"fox");
	}

	function init($host) {
		$this->host = $host;

		$host->add_hook($host::HOOK_FETCH_FEED, $this);
		$host->add_hook($host::HOOK_FEED_BASIC_INFO, $this);
		$host->add_hook($host::HOOK_SUBSCRIBE_FEED, $this);
		$host->add_hook($host::HOOK_ARTICLE_FILTER, $this);
		$host->add_hook($host::HOOK_PREFS_TAB, $this);

		require_once __DIR__ . "/filter_base.php";

		$filters = array_merge(glob(__DIR__ . "/filters.local/*.php"), glob(__DIR__ . "/filters/*.php"));
		$names = [];

		foreach ($filters as $file) {
			$filter_name = preg_replace("/\..*$/", "", basename($file));

			if (array_search($filter_name, $names) === FALSE) {
				if (!class_exists($filter_name)) {
					require_once $file;
				}

				array_push($names, $filter_name);

				$filter = new $filter_name();

				if (is_subclass_of($filter, "Af_ComicFilter")) {
					array_push($this->filters, $filter);
					array_push($names, $filter_name);
				}
			}
		}
	}

	function hook_prefs_tab($args) {
		if ($args != "prefFeeds") return;

		print "<div dojoType=\"dijit.layout.AccordionPane\" 
			title=\"<i class='material-icons'>photo</i> ".__('Feeds supported by af_comics')."\">";

		print "<p>" . __("The following comics are currently supported:") . "</p>";

		$comics = [];

		foreach ($this->filters as $f) {
			foreach ($f->supported() as $comic) {
				array_push($comics, $comic);
			}
		}

		asort($comics);

		print "<ul class='panel panel-scrollable list list-unstyled'>";
		foreach ($comics as $comic) {
			print "<li>$comic</li>";
		}
		print "</ul>";

		print_notice("To subscribe to GoComics use the comic's regular web page as the feed URL (e.g. for the <em>Garfield</em> comic use <code>http://www.gocomics.com/garfield</code>).");

		print_notice('Drop any updated filters into <code>filters.local</code> in plugin directory.');

		print "</div>";
	}

	function hook_article_filter($article) {
		foreach ($this->filters as $f) {
			if ($f->process($article))
				break;
		}

		return $article;
	}

	function hook_fetch_feed($feed_data, $fetch_url, $owner_uid, $feed, $last_article_timestamp, $auth_login, $auth_pass) {
		foreach ($this->filters as $f) {
			$res = $f->on_fetch($fetch_url);

			if ($res)
				return $res;
		}

		return $feed_data;
	}

	function hook_subscribe_feed($contents, $url, $auth_login, $auth_pass) {
		foreach ($this->filters as $f) {
			$res = $f->on_subscribe($url);

			if ($res)
				return $res;
		}

		return $contents;
	}

	function hook_feed_basic_info($basic_info, $fetch_url, $owner_uid, $feed, $auth_login, $auth_pass) {
		foreach ($this->filters as $f) {
			$res = $f->on_basic_info($fetch_url);

			if ($res)
				return $res;
		}

		return $basic_info;
	}

	function api_version() {
		return 2;
	}

}
