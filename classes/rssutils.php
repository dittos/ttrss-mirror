<?php
class RSSUtils {
	static function calculate_article_hash($article, $pluginhost) {
		$tmp = "";

		foreach ($article as $k => $v) {
			if ($k != "feed" && isset($v)) {
				$x = strip_tags(is_array($v) ? implode(",", $v) : $v);

				//_debug("$k:" . sha1($x) . ":" . htmlspecialchars($x), true);

				$tmp .= sha1("$k:" . sha1($x));
			}
		}

		return sha1(implode(",", $pluginhost->get_plugin_names()) . $tmp);
	}

	static function update_feedbrowser_cache() {

		$result = db_query("SELECT feed_url, site_url, title, COUNT(id) AS subscribers
			FROM ttrss_feeds WHERE feed_url NOT IN (SELECT feed_url FROM ttrss_feeds
				WHERE private IS true OR auth_login != '' OR auth_pass != '' OR feed_url LIKE '%:%@%/%')
				GROUP BY feed_url, site_url, title ORDER BY subscribers DESC LIMIT 1000");

		db_query("BEGIN");

		db_query("DELETE FROM ttrss_feedbrowser_cache");

		$count = 0;

		while ($line = db_fetch_assoc($result)) {
			$subscribers = db_escape_string($line["subscribers"]);
			$feed_url = db_escape_string($line["feed_url"]);
			$title = db_escape_string($line["title"]);
			$site_url = db_escape_string($line["site_url"]);

			$tmp_result = db_query("SELECT subscribers FROM
				ttrss_feedbrowser_cache WHERE feed_url = '$feed_url'");

			if (db_num_rows($tmp_result) == 0) {

				db_query("INSERT INTO ttrss_feedbrowser_cache
					(feed_url, site_url, title, subscribers) VALUES ('$feed_url',
						'$site_url', '$title', '$subscribers')");

				++$count;

			}

		}

		db_query("COMMIT");

		return $count;

	}

	static function update_daemon_common($limit = DAEMON_FEED_LIMIT, $debug = true) {
		$schema_version = get_schema_version();

		if ($schema_version != SCHEMA_VERSION) {
			die("Schema version is wrong, please upgrade the database.\n");
		}

		if (!SINGLE_USER_MODE && DAEMON_UPDATE_LOGIN_LIMIT > 0) {
			if (DB_TYPE == "pgsql") {
				$login_thresh_qpart = "AND ttrss_users.last_login >= NOW() - INTERVAL '".DAEMON_UPDATE_LOGIN_LIMIT." days'";
			} else {
				$login_thresh_qpart = "AND ttrss_users.last_login >= DATE_SUB(NOW(), INTERVAL ".DAEMON_UPDATE_LOGIN_LIMIT." DAY)";
			}
		} else {
			$login_thresh_qpart = "";
		}

		if (DB_TYPE == "pgsql") {
			$update_limit_qpart = "AND ((
					ttrss_feeds.update_interval = 0
					AND ttrss_user_prefs.value != '-1'
					AND ttrss_feeds.last_updated < NOW() - CAST((ttrss_user_prefs.value || ' minutes') AS INTERVAL)
				) OR (
					ttrss_feeds.update_interval > 0
					AND ttrss_feeds.last_updated < NOW() - CAST((ttrss_feeds.update_interval || ' minutes') AS INTERVAL)
				) OR (ttrss_feeds.last_updated IS NULL
					AND ttrss_user_prefs.value != '-1')
				OR (last_updated = '1970-01-01 00:00:00'
					AND ttrss_user_prefs.value != '-1'))";
		} else {
			$update_limit_qpart = "AND ((
					ttrss_feeds.update_interval = 0
					AND ttrss_user_prefs.value != '-1'
					AND ttrss_feeds.last_updated < DATE_SUB(NOW(), INTERVAL CONVERT(ttrss_user_prefs.value, SIGNED INTEGER) MINUTE)
				) OR (
					ttrss_feeds.update_interval > 0
					AND ttrss_feeds.last_updated < DATE_SUB(NOW(), INTERVAL ttrss_feeds.update_interval MINUTE)
				) OR (ttrss_feeds.last_updated IS NULL
					AND ttrss_user_prefs.value != '-1')
				OR (last_updated = '1970-01-01 00:00:00'
					AND ttrss_user_prefs.value != '-1'))";
		}

		// Test if feed is currently being updated by another process.
		if (DB_TYPE == "pgsql") {
			$updstart_thresh_qpart = "AND (ttrss_feeds.last_update_started IS NULL OR ttrss_feeds.last_update_started < NOW() - INTERVAL '10 minutes')";
		} else {
			$updstart_thresh_qpart = "AND (ttrss_feeds.last_update_started IS NULL OR ttrss_feeds.last_update_started < DATE_SUB(NOW(), INTERVAL 10 MINUTE))";
		}

		$query_limit = $limit ? sprintf("LIMIT %d", $limit) : "";

		// Update the least recently updated feeds first
		$query_order = "ORDER BY last_updated";
		if (DB_TYPE == "pgsql") $query_order .= " NULLS FIRST";

		$query = "SELECT DISTINCT ttrss_feeds.feed_url, ttrss_feeds.last_updated
			FROM
				ttrss_feeds, ttrss_users, ttrss_user_prefs
			WHERE
				ttrss_feeds.owner_uid = ttrss_users.id
				AND ttrss_user_prefs.profile IS NULL
				AND ttrss_users.id = ttrss_user_prefs.owner_uid
				AND ttrss_user_prefs.pref_name = 'DEFAULT_UPDATE_INTERVAL'
				$login_thresh_qpart $update_limit_qpart
				$updstart_thresh_qpart
				$query_order $query_limit";

		$result = db_query($query);

		if ($debug) _debug(sprintf("Scheduled %d feeds to update...", db_num_rows($result)));

		$feeds_to_update = array();
		while ($line = db_fetch_assoc($result)) {
			array_push($feeds_to_update, $line['feed_url']);
		}

		// Update last_update_started before actually starting the batch
		// in order to minimize collision risk for parallel daemon tasks
		if (count($feeds_to_update) > 0) {
			$feeds_quoted = array_map(function ($s) { return "'" . db_escape_string($s) . "'"; }, $feeds_to_update);

			db_query(sprintf("UPDATE ttrss_feeds SET last_update_started = NOW()
				WHERE feed_url IN (%s)", implode(',', $feeds_quoted)));
		}

		$nf = 0;
		$bstarted = microtime(true);

		$batch_owners = array();

		foreach ($feeds_to_update as $feed) {
			if($debug) _debug("Base feed: $feed");

			//update_rss_feed($line["id"], true);

			// since we have the data cached, we can deal with other feeds with the same url
			$tmp_result = db_query("SELECT DISTINCT ttrss_feeds.id,last_updated,ttrss_feeds.owner_uid
			FROM ttrss_feeds, ttrss_users, ttrss_user_prefs WHERE
				ttrss_user_prefs.owner_uid = ttrss_feeds.owner_uid AND
				ttrss_users.id = ttrss_user_prefs.owner_uid AND
				ttrss_user_prefs.pref_name = 'DEFAULT_UPDATE_INTERVAL' AND
				ttrss_user_prefs.profile IS NULL AND
				feed_url = '".db_escape_string($feed)."'
				$update_limit_qpart
				$login_thresh_qpart
			ORDER BY ttrss_feeds.id $query_limit");

			if (db_num_rows($tmp_result) > 0) {
				while ($tline = db_fetch_assoc($tmp_result)) {
					if ($debug) _debug(" => " . $tline["last_updated"] . ", " . $tline["id"] . " " . $tline["owner_uid"]);

					if (array_search($tline["owner_uid"], $batch_owners) === FALSE)
						array_push($batch_owners, $tline["owner_uid"]);

					$fstarted = microtime(true);
					RSSUtils::update_rss_feed($tline["id"], true, false);
					_debug_suppress(false);

					_debug(sprintf("    %.4f (sec)", microtime(true) - $fstarted));

					++$nf;
				}
			}
		}

		if ($nf > 0) {
			_debug(sprintf("Processed %d feeds in %.4f (sec), %.4f (sec/feed avg)", $nf,
				microtime(true) - $bstarted, (microtime(true) - $bstarted) / $nf));
		}

		foreach ($batch_owners as $owner_uid) {
			_debug("Running housekeeping tasks for user $owner_uid...");

			RSSUtils::housekeeping_user($owner_uid);
		}

		// Send feed digests by email if needed.
		Digest::send_headlines_digests($debug);

		return $nf;

	}

	// this is used when subscribing
	static function set_basic_feed_info($feed) {

		$feed = db_escape_string($feed);

		$result = db_query("SELECT feed_url,auth_pass,auth_login,auth_pass_encrypted
					FROM ttrss_feeds WHERE id = '$feed'");

		$auth_pass_encrypted = sql_bool_to_bool(db_fetch_result($result,
			0, "auth_pass_encrypted"));

		$auth_login = db_fetch_result($result, 0, "auth_login");
		$auth_pass = db_fetch_result($result, 0, "auth_pass");

		if ($auth_pass_encrypted && function_exists("mcrypt_decrypt")) {
			require_once "crypt.php";
			$auth_pass = decrypt_string($auth_pass);
		}

		$fetch_url = db_fetch_result($result, 0, "feed_url");

		$feed_data = fetch_file_contents($fetch_url, false,
			$auth_login, $auth_pass, false,
			FEED_FETCH_TIMEOUT,
			0);

		global $fetch_curl_used;

		if (!$fetch_curl_used) {
			$tmp = @gzdecode($feed_data);

			if ($tmp) $feed_data = $tmp;
		}

		$feed_data = trim($feed_data);

		$rss = new FeedParser($feed_data);
		$rss->init();

		if (!$rss->error()) {

			$result = db_query("SELECT title, site_url FROM ttrss_feeds WHERE id = '$feed'");

			$registered_title = db_fetch_result($result, 0, "title");
			$orig_site_url = db_fetch_result($result, 0, "site_url");

			$site_url = db_escape_string(mb_substr(rewrite_relative_url($fetch_url, $rss->get_link()), 0, 245));
			$feed_title = db_escape_string(mb_substr($rss->get_title(), 0, 199));

			if ($feed_title && (!$registered_title || $registered_title == "[Unknown]")) {
				db_query("UPDATE ttrss_feeds SET
					title = '$feed_title' WHERE id = '$feed'");
			}

			if ($site_url && $orig_site_url != $site_url) {
				db_query("UPDATE ttrss_feeds SET
							site_url = '$site_url' WHERE id = '$feed'");
			}
		}
	}

	/**
	 * @SuppressWarnings(PHPMD.UnusedFormalParameter)
	 */
	static function update_rss_feed($feed, $no_cache = false) {

		$debug_enabled = defined('DAEMON_EXTENDED_DEBUG') || $_REQUEST['xdebug'];

		_debug_suppress(!$debug_enabled);
		_debug("start", $debug_enabled);

		$result = db_query("SELECT title FROM ttrss_feeds
			WHERE id = '$feed'");

		if (db_num_rows($result) == 0) {
			_debug("feed $feed NOT FOUND/SKIPPED", $debug_enabled);
			user_error("Attempt to update unknown/invalid feed $feed", E_USER_WARNING);
			return false;
		}

		$title = db_fetch_result($result, 0, "title");

		// feed was batch-subscribed or something, we need to get basic info
		// this is not optimal currently as it fetches stuff separately TODO: optimize
		if ($title == "[Unknown]") {
			_debug("setting basic feed info for $feed...");
			RSSUtils::set_basic_feed_info($feed);
		}

		$result = db_query("SELECT id,update_interval,auth_login,
			feed_url,auth_pass,cache_images,
			mark_unread_on_update, owner_uid,
			auth_pass_encrypted, feed_language
			FROM ttrss_feeds WHERE id = '$feed'");

		$owner_uid = db_fetch_result($result, 0, "owner_uid");
		$mark_unread_on_update = sql_bool_to_bool(db_fetch_result($result,
			0, "mark_unread_on_update"));
		$auth_pass_encrypted = sql_bool_to_bool(db_fetch_result($result,
			0, "auth_pass_encrypted"));

		db_query("UPDATE ttrss_feeds SET last_update_started = NOW()
			WHERE id = '$feed'");

		$auth_login = db_fetch_result($result, 0, "auth_login");
		$auth_pass = db_fetch_result($result, 0, "auth_pass");

		if ($auth_pass_encrypted && function_exists("mcrypt_decrypt")) {
			require_once "crypt.php";
			$auth_pass = decrypt_string($auth_pass);
		}

		$cache_images = sql_bool_to_bool(db_fetch_result($result, 0, "cache_images"));
		$fetch_url = db_fetch_result($result, 0, "feed_url");
		$feed_language = db_escape_string(mb_strtolower(db_fetch_result($result, 0, "feed_language")));
		if (!$feed_language) $feed_language = 'english';

		$feed = db_escape_string($feed);

		$date_feed_processed = date('Y-m-d H:i');

		$cache_filename = CACHE_DIR . "/simplepie/" . sha1($fetch_url) . ".xml";

		$pluginhost = new PluginHost();
		$pluginhost->set_debug($debug_enabled);
		$user_plugins = get_pref("_ENABLED_PLUGINS", $owner_uid);

		$pluginhost->load(PLUGINS, PluginHost::KIND_ALL);
		$pluginhost->load($user_plugins, PluginHost::KIND_USER, $owner_uid);
		$pluginhost->load_data();

		$rss_hash = false;

		$force_refetch = isset($_REQUEST["force_refetch"]);
		$feed_data = "";

		foreach ($pluginhost->get_hooks(PluginHost::HOOK_FETCH_FEED) as $plugin) {
			$feed_data = $plugin->hook_fetch_feed($feed_data, $fetch_url, $owner_uid, $feed, 0, $auth_login, $auth_pass);
		}

		// try cache
		if (!$feed_data &&
			file_exists($cache_filename) &&
			is_readable($cache_filename) &&
			!$auth_login && !$auth_pass &&
			filemtime($cache_filename) > time() - 30) {

			_debug("using local cache [$cache_filename].", $debug_enabled);

			@$feed_data = file_get_contents($cache_filename);

			if ($feed_data) {
				$rss_hash = sha1($feed_data);
			}

		} else {
			_debug("local cache will not be used for this feed", $debug_enabled);
		}

		// fetch feed from source
		if (!$feed_data) {
			_debug("fetching [$fetch_url]...", $debug_enabled);

			if (ini_get("open_basedir") && function_exists("curl_init")) {
				_debug("not using CURL due to open_basedir restrictions");
			}

			$feed_data = fetch_file_contents($fetch_url, false,
				$auth_login, $auth_pass, false,
				$no_cache ? FEED_FETCH_NO_CACHE_TIMEOUT : FEED_FETCH_TIMEOUT,
				0);

			global $fetch_curl_used;

			if (!$fetch_curl_used) {
				$tmp = @gzdecode($feed_data);

				if ($tmp) $feed_data = $tmp;
			}

			$feed_data = trim($feed_data);

			_debug("fetch done.", $debug_enabled);

			// cache vanilla feed data for re-use
			if ($feed_data && !$auth_pass && !$auth_login && is_writable(CACHE_DIR . "/simplepie")) {
				$new_rss_hash = sha1($feed_data);

				if ($new_rss_hash != $rss_hash) {
					_debug("saving $cache_filename", $debug_enabled);
					@file_put_contents($cache_filename, $feed_data);
				}
			}
		}

		if (!$feed_data) {
			global $fetch_last_error;
			global $fetch_last_error_code;

			_debug("unable to fetch: $fetch_last_error [$fetch_last_error_code]", $debug_enabled);

			$error_escaped = '';

			// If-Modified-Since
			if ($fetch_last_error_code != 304) {
				$error_escaped = db_escape_string($fetch_last_error);
			} else {
				_debug("source claims data not modified, nothing to do.", $debug_enabled);
			}

			db_query(
				"UPDATE ttrss_feeds SET last_error = '$error_escaped',
					last_updated = NOW() WHERE id = '$feed'");

			return;
		}

		foreach ($pluginhost->get_hooks(PluginHost::HOOK_FEED_FETCHED) as $plugin) {
			$feed_data = $plugin->hook_feed_fetched($feed_data, $fetch_url, $owner_uid, $feed);
		}

		$rss = new FeedParser($feed_data);
		$rss->init();

		$feed = db_escape_string($feed);

		if (!$rss->error()) {

			// We use local pluginhost here because we need to load different per-user feed plugins
			$pluginhost->run_hooks(PluginHost::HOOK_FEED_PARSED, "hook_feed_parsed", $rss);

			_debug("language: $feed_language", $debug_enabled);
			_debug("processing feed data...", $debug_enabled);

//			db_query("BEGIN");

			if (DB_TYPE == "pgsql") {
				$favicon_interval_qpart = "favicon_last_checked < NOW() - INTERVAL '12 hour'";
			} else {
				$favicon_interval_qpart = "favicon_last_checked < DATE_SUB(NOW(), INTERVAL 12 HOUR)";
			}

			$result = db_query("SELECT owner_uid,favicon_avg_color,
				(favicon_last_checked IS NULL OR $favicon_interval_qpart) AS
						favicon_needs_check
				FROM ttrss_feeds WHERE id = '$feed'");

			$favicon_needs_check = sql_bool_to_bool(db_fetch_result($result, 0,
				"favicon_needs_check"));
			$favicon_avg_color = db_fetch_result($result, 0, "favicon_avg_color");

			$owner_uid = db_fetch_result($result, 0, "owner_uid");

			$site_url = db_escape_string(mb_substr(rewrite_relative_url($fetch_url, $rss->get_link()), 0, 245));

			_debug("site_url: $site_url", $debug_enabled);
			_debug("feed_title: " . $rss->get_title(), $debug_enabled);

			if ($favicon_needs_check || $force_refetch) {

				/* terrible hack: if we crash on floicon shit here, we won't check
				 * the icon avgcolor again (unless the icon got updated) */

				$favicon_file = ICONS_DIR . "/$feed.ico";
				$favicon_modified = @filemtime($favicon_file);

				_debug("checking favicon...", $debug_enabled);

				RSSUtils::check_feed_favicon($site_url, $feed);
				$favicon_modified_new = @filemtime($favicon_file);

				if ($favicon_modified_new > $favicon_modified)
					$favicon_avg_color = '';

				if (file_exists($favicon_file) && function_exists("imagecreatefromstring") && $favicon_avg_color == '') {
					require_once "colors.php";

					db_query("UPDATE ttrss_feeds SET favicon_avg_color = 'fail' WHERE
							id = '$feed'");

					$favicon_color = db_escape_string(
						calculate_avg_color($favicon_file));

					$favicon_colorstring = ",favicon_avg_color = '".$favicon_color."'";
				} else if ($favicon_avg_color == 'fail') {
					_debug("floicon failed on this file, not trying to recalculate avg color", $debug_enabled);
				}

				db_query("UPDATE ttrss_feeds SET favicon_last_checked = NOW()
					$favicon_colorstring
					WHERE id = '$feed'");
			}

			_debug("loading filters & labels...", $debug_enabled);

			$filters = load_filters($feed, $owner_uid);

			if ($debug_enabled) {
					print_r($filters);
			}

			_debug("" . count($filters) . " filters loaded.", $debug_enabled);

			$items = $rss->get_items();

			if (!is_array($items)) {
				_debug("no articles found.", $debug_enabled);

				db_query("UPDATE ttrss_feeds
					SET last_updated = NOW(), last_error = '' WHERE id = '$feed'");

				return; // no articles
			}

			_debug("processing articles...", $debug_enabled);

			$tstart = time();

			foreach ($items as $item) {
				if ($_REQUEST['xdebug'] == 3) {
					print_r($item);
				}

				if (ini_get("max_execution_time") > 0 && time() - $tstart >= ini_get("max_execution_time") * 0.7) {
					_debug("looks like there's too many articles to process at once, breaking out", $debug_enabled);
					break;
				}

				$entry_guid = $item->get_id();
				if (!$entry_guid) $entry_guid = $item->get_link();
				if (!$entry_guid) $entry_guid = RSSUtils::make_guid_from_title($item->get_title());
				if (!$entry_guid) continue;

				$entry_guid = "$owner_uid,$entry_guid";

				$entry_guid_hashed = db_escape_string('SHA1:' . sha1($entry_guid));

				_debug("guid $entry_guid / $entry_guid_hashed", $debug_enabled);

				$entry_timestamp = "";

				$entry_timestamp = $item->get_date();

				_debug("orig date: " . $item->get_date(), $debug_enabled);

				if ($entry_timestamp == -1 || !$entry_timestamp || $entry_timestamp > time()) {
					$entry_timestamp = time();
				}

				$entry_timestamp_fmt = strftime("%Y/%m/%d %H:%M:%S", $entry_timestamp);

				_debug("date $entry_timestamp [$entry_timestamp_fmt]", $debug_enabled);

//				$entry_title = html_entity_decode($item->get_title(), ENT_COMPAT, 'UTF-8');
//				$entry_title = decode_numeric_entities($entry_title);
				$entry_title = $item->get_title();

				$entry_link = rewrite_relative_url($site_url, $item->get_link());

				_debug("title $entry_title", $debug_enabled);
				_debug("link $entry_link", $debug_enabled);

				if (!$entry_title) $entry_title = date("Y-m-d H:i:s", $entry_timestamp);;

				$entry_content = $item->get_content();
				if (!$entry_content) $entry_content = $item->get_description();

				if ($_REQUEST["xdebug"] == 2) {
					print "content: ";
					print htmlspecialchars($entry_content);
					print "\n";
				}

				$entry_comments = db_escape_string(mb_substr($item->get_comments_url(), 0, 245));
				$num_comments = (int) $item->get_comments_count();

				$entry_author = $item->get_author(); // escaped later
				$entry_guid = db_escape_string(mb_substr($entry_guid, 0, 245));

				_debug("author $entry_author", $debug_enabled);
				_debug("num_comments: $num_comments", $debug_enabled);
				_debug("looking for tags...", $debug_enabled);

				// parse <category> entries into tags

				$additional_tags = array();

				$additional_tags_src = $item->get_categories();

				if (is_array($additional_tags_src)) {
					foreach ($additional_tags_src as $tobj) {
						array_push($additional_tags, $tobj);
					}
				}

				$entry_tags = array_unique($additional_tags);

				for ($i = 0; $i < count($entry_tags); $i++)
					$entry_tags[$i] = mb_strtolower($entry_tags[$i], 'utf-8');

				_debug("tags found: " . join(",", $entry_tags), $debug_enabled);

				_debug("done collecting data.", $debug_enabled);

				$result = db_query("SELECT id, content_hash, lang FROM ttrss_entries
					WHERE guid = '".db_escape_string($entry_guid)."' OR guid = '$entry_guid_hashed'");

				if (db_num_rows($result) != 0) {
					$base_entry_id = db_fetch_result($result, 0, "id");
					$entry_stored_hash = db_fetch_result($result, 0, "content_hash");
					$article_labels = Article::get_article_labels($base_entry_id, $owner_uid);
					$entry_language = db_fetch_result($result, 0, "lang");

					$existing_tags = Article::get_article_tags($base_entry_id, $owner_uid);
					$entry_tags = array_unique(array_merge($entry_tags, $existing_tags));

				} else {
					$base_entry_id = false;
					$entry_stored_hash = "";
					$article_labels = array();
					$entry_language = "";
				}

				$article = array("owner_uid" => $owner_uid, // read only
					"guid" => $entry_guid, // read only
					"guid_hashed" => $entry_guid_hashed, // read only
					"title" => $entry_title,
					"content" => $entry_content,
					"link" => $entry_link,
					"labels" => $article_labels, // current limitation: can add labels to article, can't remove them
					"tags" => $entry_tags,
					"author" => $entry_author,
					"force_catchup" => false, // ugly hack for the time being
					"score_modifier" => 0, // no previous value, plugin should recalculate score modifier based on content if needed
					"language" => $entry_language,
					"feed" => array("id" => $feed,
						"fetch_url" => $fetch_url,
						"site_url" => $site_url,
						"cache_images" => $cache_images)
				);

				$entry_plugin_data = "";
				$entry_current_hash = RSSUtils::calculate_article_hash($article, $pluginhost);

				_debug("article hash: $entry_current_hash [stored=$entry_stored_hash]", $debug_enabled);

				if ($entry_current_hash == $entry_stored_hash && !isset($_REQUEST["force_rehash"])) {
					_debug("stored article seems up to date [IID: $base_entry_id], updating timestamp only", $debug_enabled);

					// we keep encountering the entry in feeds, so we need to
					// update date_updated column so that we don't get horrible
					// dupes when the entry gets purged and reinserted again e.g.
					// in the case of SLOW SLOW OMG SLOW updating feeds

					$base_entry_id = db_fetch_result($result, 0, "id");

					db_query("UPDATE ttrss_entries SET date_updated = NOW()
						WHERE id = '$base_entry_id'");

					continue;
				}

				_debug("hash differs, applying plugin filters:", $debug_enabled);

				foreach ($pluginhost->get_hooks(PluginHost::HOOK_ARTICLE_FILTER) as $plugin) {
					_debug("... " . get_class($plugin), $debug_enabled);

					$start = microtime(true);
					$article = $plugin->hook_article_filter($article);

					_debug("=== " . sprintf("%.4f (sec)", microtime(true) - $start), $debug_enabled);

					$entry_plugin_data .= mb_strtolower(get_class($plugin)) . ",";
				}

				if ($_REQUEST["xdebug"] == 2) {
					print "processed content: ";
					print htmlspecialchars($article["content"]);
					print "\n";
				}

				$entry_plugin_data = db_escape_string($entry_plugin_data);

				_debug("plugin data: $entry_plugin_data", $debug_enabled);

				// Workaround: 4-byte unicode requires utf8mb4 in MySQL. See https://tt-rss.org/forum/viewtopic.php?f=1&t=3377&p=20077#p20077
				if (DB_TYPE == "mysql") {
					foreach ($article as $k => $v) {

						// i guess we'll have to take the risk of 4byte unicode labels & tags here
						if (is_string($article[$k])) {
							$article[$k] = preg_replace('/[\x{10000}-\x{10FFFF}]/u', "\xEF\xBF\xBD", $v);
						}
					}
				}

				/* Collect article tags here so we could filter by them: */

				$matched_rules = array();

				$article_filters = RSSUtils::get_article_filters($filters, $article["title"],
					$article["content"], $article["link"], $article["author"],
					$article["tags"], $matched_rules);

				if ($debug_enabled) {
					_debug("matched filter rules: ", $debug_enabled);

					if (count($matched_rules) != 0) {
						print_r($matched_rules);
					}

					_debug("filter actions: ", $debug_enabled);

					if (count($article_filters) != 0) {
						print_r($article_filters);
					}
				}

				$plugin_filter_names = RSSUtils::find_article_filters($article_filters, "plugin");
				$plugin_filter_actions = $pluginhost->get_filter_actions();

				if (count($plugin_filter_names) > 0) {
					_debug("applying plugin filter actions...", $debug_enabled);

					foreach ($plugin_filter_names as $pfn) {
						list($pfclass,$pfaction) = explode(":", $pfn["param"]);

						if (isset($plugin_filter_actions[$pfclass])) {
							$plugin = $pluginhost->get_plugin($pfclass);

							_debug("... $pfclass: $pfaction", $debug_enabled);

							if ($plugin) {
								$start = microtime(true);
								$article = $plugin->hook_article_filter_action($article, $pfaction);

								_debug("=== " . sprintf("%.4f (sec)", microtime(true) - $start), $debug_enabled);
							} else {
								_debug("??? $pfclass: plugin object not found.");
							}
						} else {
							_debug("??? $pfclass: filter plugin not registered.");
						}
					}
				}

				$entry_tags = $article["tags"];
				$entry_guid = db_escape_string($entry_guid);
				$entry_title = db_escape_string($article["title"]);
				$entry_author = db_escape_string(mb_substr($article["author"], 0, 245));
				$entry_link = db_escape_string($article["link"]);
				$entry_content = $article["content"]; // escaped below
				$entry_force_catchup = $article["force_catchup"];
				$article_labels = $article["labels"];
				$entry_score_modifier = (int) $article["score_modifier"];
				$entry_language = db_escape_string($article["language"]);

				if ($debug_enabled) {
					_debug("article labels:", $debug_enabled);

					if (count($article_labels) != 0) {
						print_r($article_labels);
					}
				}

				_debug("force catchup: $entry_force_catchup");

				if ($cache_images && is_writable(CACHE_DIR . '/images'))
					RSSUtils::cache_media($entry_content, $site_url, $debug_enabled);

				$entry_content = db_escape_string($entry_content, false);

				//db_query("BEGIN");

				$result = db_query("SELECT id FROM	ttrss_entries
					WHERE (guid = '$entry_guid' OR guid = '$entry_guid_hashed')");

				if (db_num_rows($result) == 0) {

					_debug("base guid [$entry_guid or $entry_guid_hashed] not found, creating...", $debug_enabled);

					// base post entry does not exist, create it

					db_query(
						"INSERT INTO ttrss_entries
							(title,
							guid,
							link,
							updated,
							content,
							content_hash,
							no_orig_date,
							date_updated,
							date_entered,
							comments,
							num_comments,
							plugin_data,
							lang,
							author)
						VALUES
							('$entry_title',
							'$entry_guid_hashed',
							'$entry_link',
							'$entry_timestamp_fmt',
							'$entry_content',
							'$entry_current_hash',
							false,
							NOW(),
							'$date_feed_processed',
							'$entry_comments',
							'$num_comments',
							'$entry_plugin_data',
							'$entry_language',
							'$entry_author')");

				}

				// now it should exist, if not - bad luck then

				$result = db_query("SELECT id FROM ttrss_entries
					WHERE guid = '$entry_guid' OR guid = '$entry_guid_hashed'");

				$entry_ref_id = 0;
				$entry_int_id = 0;

				if (db_num_rows($result) == 1) {

					_debug("base guid found, checking for user record", $debug_enabled);

					$ref_id = db_fetch_result($result, 0, "id");
					$entry_ref_id = $ref_id;

					/* $stored_guid = db_fetch_result($result, 0, "guid");
					if ($stored_guid != $entry_guid_hashed) {
						if ($debug_enabled) _debug("upgrading compat guid to hashed one", $debug_enabled);

						db_query("UPDATE ttrss_entries SET guid = '$entry_guid_hashed' WHERE
							id = '$ref_id'");
					} */

					if (RSSUtils::find_article_filter($article_filters, "filter")) {
						//db_query("COMMIT"); // close transaction in progress
						continue;
					}

					$score = RSSUtils::calculate_article_score($article_filters) + $entry_score_modifier;

					_debug("initial score: $score [including plugin modifier: $entry_score_modifier]", $debug_enabled);

					// check for user post link to main table

					$query = "SELECT ref_id, int_id FROM ttrss_user_entries WHERE
							ref_id = '$ref_id' AND owner_uid = '$owner_uid'";

//					if ($_REQUEST["xdebug"]) print "$query\n";

					$result = db_query($query);

					// okay it doesn't exist - create user entry
					if (db_num_rows($result) == 0) {

						_debug("user record not found, creating...", $debug_enabled);

						if ($score >= -500 && !RSSUtils::find_article_filter($article_filters, 'catchup') && !$entry_force_catchup) {
							$unread = 'true';
							$last_read_qpart = 'NULL';
						} else {
							$unread = 'false';
							$last_read_qpart = 'NOW()';
						}

						if (RSSUtils::find_article_filter($article_filters, 'mark') || $score > 1000) {
							$marked = 'true';
						} else {
							$marked = 'false';
						}

						if (RSSUtils::find_article_filter($article_filters, 'publish')) {
							$published = 'true';
						} else {
							$published = 'false';
						}

						$last_marked = ($marked == 'true') ? 'NOW()' : 'NULL';
						$last_published = ($published == 'true') ? 'NOW()' : 'NULL';

						$result = db_query(
							"INSERT INTO ttrss_user_entries
								(ref_id, owner_uid, feed_id, unread, last_read, marked,
								published, score, tag_cache, label_cache, uuid,
								last_marked, last_published)
							VALUES ('$ref_id', '$owner_uid', '$feed', $unread,
								$last_read_qpart, $marked, $published, '$score', '', '',
								'', $last_marked, $last_published)");

						$result = db_query(
							"SELECT int_id FROM ttrss_user_entries WHERE
								ref_id = '$ref_id' AND owner_uid = '$owner_uid' AND
								feed_id = '$feed' LIMIT 1");

						if (db_num_rows($result) == 1) {
							$entry_int_id = db_fetch_result($result, 0, "int_id");
						}
					} else {
						_debug("user record FOUND", $debug_enabled);

						$entry_ref_id = db_fetch_result($result, 0, "ref_id");
						$entry_int_id = db_fetch_result($result, 0, "int_id");
					}

					_debug("RID: $entry_ref_id, IID: $entry_int_id", $debug_enabled);

					if (DB_TYPE == "pgsql") {
						$tsvector_combined = db_escape_string(mb_substr($entry_title . ' ' . strip_tags(str_replace('<', ' <', $entry_content)),
							0, 1000000));

						$tsvector_qpart = "tsvector_combined = to_tsvector('$feed_language', '$tsvector_combined'),";

					} else {
						$tsvector_qpart = "";
					}

					db_query("UPDATE ttrss_entries
						SET title = '$entry_title',
							content = '$entry_content',
							content_hash = '$entry_current_hash',
							updated = '$entry_timestamp_fmt',
							$tsvector_qpart
							num_comments = '$num_comments',
							plugin_data = '$entry_plugin_data',
							author = '$entry_author',
							lang = '$entry_language'
						WHERE id = '$ref_id'");

					// update aux data
					db_query("UPDATE ttrss_user_entries
							SET score = '$score' WHERE ref_id = '$ref_id'");

					if ($mark_unread_on_update) {
						_debug("article updated, marking unread as requested.", $debug_enabled);

						db_query("UPDATE ttrss_user_entries
							SET last_read = null, unread = true WHERE ref_id = '$ref_id'");
					}
				}

				//db_query("COMMIT");

				_debug("assigning labels [other]...", $debug_enabled);

				foreach ($article_labels as $label) {
					Labels::add_article($entry_ref_id, $label[1], $owner_uid);
				}

				_debug("assigning labels [filters]...", $debug_enabled);

				RSSUtils::assign_article_to_label_filters($entry_ref_id, $article_filters,
					$owner_uid, $article_labels);

				_debug("looking for enclosures...", $debug_enabled);

				// enclosures

				$enclosures = array();

				$encs = $item->get_enclosures();

				if (is_array($encs)) {
					foreach ($encs as $e) {
						$e_item = array(
							rewrite_relative_url($site_url, $e->link),
							$e->type, $e->length, $e->title, $e->width, $e->height);
						array_push($enclosures, $e_item);
					}
				}

				if ($cache_images && is_writable(CACHE_DIR . '/images'))
					RSSUtils::cache_enclosures($enclosures, $site_url, $debug_enabled);

				if ($debug_enabled) {
					_debug("article enclosures:", $debug_enabled);
					print_r($enclosures);
				}

				//db_query("BEGIN");

//				debugging
//				db_query("DELETE FROM ttrss_enclosures WHERE post_id = '$entry_ref_id'");

				foreach ($enclosures as $enc) {
					$enc_url = db_escape_string($enc[0]);
					$enc_type = db_escape_string($enc[1]);
					$enc_dur = db_escape_string($enc[2]);
					$enc_title = db_escape_string($enc[3]);
					$enc_width = intval($enc[4]);
					$enc_height = intval($enc[5]);

					$result = db_query("SELECT id FROM ttrss_enclosures
						WHERE content_url = '$enc_url' AND post_id = '$entry_ref_id'");

					if (db_num_rows($result) == 0) {
						db_query("INSERT INTO ttrss_enclosures
							(content_url, content_type, title, duration, post_id, width, height) VALUES
							('$enc_url', '$enc_type', '$enc_title', '$enc_dur', '$entry_ref_id', $enc_width, $enc_height)");
					}
				}

				//db_query("COMMIT");

				// check for manual tags (we have to do it here since they're loaded from filters)

				foreach ($article_filters as $f) {
					if ($f["type"] == "tag") {

						$manual_tags = trim_array(explode(",", $f["param"]));

						foreach ($manual_tags as $tag) {
							if (tag_is_valid($tag)) {
								array_push($entry_tags, $tag);
							}
						}
					}
				}

				// Skip boring tags

				$boring_tags = trim_array(explode(",", mb_strtolower(get_pref(
					'BLACKLISTED_TAGS', $owner_uid, ''), 'utf-8')));

				$filtered_tags = array();
				$tags_to_cache = array();

				if ($entry_tags && is_array($entry_tags)) {
					foreach ($entry_tags as $tag) {
						if (array_search($tag, $boring_tags) === false) {
							array_push($filtered_tags, $tag);
						}
					}
				}

				$filtered_tags = array_unique($filtered_tags);

				if ($debug_enabled) {
					_debug("filtered article tags:", $debug_enabled);
					print_r($filtered_tags);
				}

				// Save article tags in the database

				if (count($filtered_tags) > 0) {

					//db_query("BEGIN");

					foreach ($filtered_tags as $tag) {

						$tag = sanitize_tag($tag);
						$tag = db_escape_string($tag);

						if (!tag_is_valid($tag)) continue;

						$result = db_query("SELECT id FROM ttrss_tags
							WHERE tag_name = '$tag' AND post_int_id = '$entry_int_id' AND
							owner_uid = '$owner_uid' LIMIT 1");

						if ($result && db_num_rows($result) == 0) {

							db_query("INSERT INTO ttrss_tags
									(owner_uid,tag_name,post_int_id)
									VALUES ('$owner_uid','$tag', '$entry_int_id')");
						}

						array_push($tags_to_cache, $tag);
					}

					/* update the cache */

					$tags_to_cache = array_unique($tags_to_cache);

					$tags_str = db_escape_string(join(",", $tags_to_cache));

					db_query("UPDATE ttrss_user_entries
						SET tag_cache = '$tags_str' WHERE ref_id = '$entry_ref_id'
						AND owner_uid = $owner_uid");

					//db_query("COMMIT");
				}

				_debug("article processed", $debug_enabled);
			}

			_debug("purging feed...", $debug_enabled);

			purge_feed($feed, 0, $debug_enabled);

			db_query("UPDATE ttrss_feeds
				SET last_updated = NOW(), last_error = '' WHERE id = '$feed'");

//			db_query("COMMIT");

		} else {

			$error_msg = db_escape_string(mb_substr($rss->error(), 0, 245));

			_debug("fetch error: $error_msg", $debug_enabled);

			if (count($rss->errors()) > 1) {
				foreach ($rss->errors() as $error) {
					_debug("+ $error");
				}
			}

			db_query(
				"UPDATE ttrss_feeds SET last_error = '$error_msg',
				last_updated = NOW() WHERE id = '$feed'");

			unset($rss);
			return;
		}

		_debug("done", $debug_enabled);

		return true;
	}

	static function cache_enclosures($enclosures, $site_url, $debug) {
		foreach ($enclosures as $enc) {

			if (preg_match("/(image|audio|video)/", $enc[1])) {

				$src = rewrite_relative_url($site_url, $enc[0]);

				$local_filename = CACHE_DIR . "/images/" . sha1($src);

				if ($debug) _debug("cache_enclosures: downloading: $src to $local_filename");

				if (!file_exists($local_filename)) {
					$file_content = fetch_file_contents($src);

					if ($file_content && strlen($file_content) > MIN_CACHE_FILE_SIZE) {
						file_put_contents($local_filename, $file_content);
					}
				} else {
					touch($local_filename);
				}
			}
		}
	}

	static function cache_media($html, $site_url, $debug) {
		libxml_use_internal_errors(true);

		$charset_hack = '<head>
			<meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
		</head>';

		$doc = new DOMDocument();
		$doc->loadHTML($charset_hack . $html);
		$xpath = new DOMXPath($doc);

		$entries = $xpath->query('(//img[@src])|(//video/source[@src])|(//audio/source[@src])');

		foreach ($entries as $entry) {
			if ($entry->hasAttribute('src') && strpos($entry->getAttribute('src'), "data:") !== 0) {
				$src = rewrite_relative_url($site_url, $entry->getAttribute('src'));

				$local_filename = CACHE_DIR . "/images/" . sha1($src);

				if ($debug) _debug("cache_media: downloading: $src to $local_filename");

				if (!file_exists($local_filename)) {
					$file_content = fetch_file_contents($src);

					if ($file_content && strlen($file_content) > MIN_CACHE_FILE_SIZE) {
						file_put_contents($local_filename, $file_content);
					}
				} else {
					touch($local_filename);
				}
			}
		}
	}

	static function expire_error_log($debug) {
		if ($debug) _debug("Removing old error log entries...");

		if (DB_TYPE == "pgsql") {
			db_query("DELETE FROM ttrss_error_log
				WHERE created_at < NOW() - INTERVAL '7 days'");
		} else {
			db_query("DELETE FROM ttrss_error_log
				WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)");
		}

	}

	static function expire_lock_files($debug) {
		//if ($debug) _debug("Removing old lock files...");

		$num_deleted = 0;

		if (is_writable(LOCK_DIRECTORY)) {
			$files = glob(LOCK_DIRECTORY . "/*.lock");

			if ($files) {
				foreach ($files as $file) {
					if (!file_is_locked(basename($file)) && time() - filemtime($file) > 86400*2) {
						unlink($file);
						++$num_deleted;
					}
				}
			}
		}

		if ($debug) _debug("Removed $num_deleted old lock files.");
	}

	static function expire_cached_files($debug) {
		foreach (array("simplepie", "images", "export", "upload") as $dir) {
			$cache_dir = CACHE_DIR . "/$dir";

//			if ($debug) _debug("Expiring $cache_dir");

			$num_deleted = 0;

			if (is_writable($cache_dir)) {
				$files = glob("$cache_dir/*");

				if ($files) {
					foreach ($files as $file) {
						if (time() - filemtime($file) > 86400*CACHE_MAX_DAYS) {
							unlink($file);

							++$num_deleted;
						}
					}
				}
			}

			if ($debug) _debug("$cache_dir: removed $num_deleted files.");
		}
	}

	/**
	 * Source: http://www.php.net/manual/en/function.parse-url.php#104527
	 * Returns the url query as associative array
	 *
	 * @param    string    query
	 * @return    array    params
	 */
	static function convertUrlQuery($query) {
		$queryParts = explode('&', $query);

		$params = array();

		foreach ($queryParts as $param) {
			$item = explode('=', $param);
			$params[$item[0]] = $item[1];
		}

		return $params;
	}

	static function get_article_filters($filters, $title, $content, $link, $author, $tags, &$matched_rules = false) {
		$matches = array();

		foreach ($filters as $filter) {
			$match_any_rule = $filter["match_any_rule"];
			$inverse = $filter["inverse"];
			$filter_match = false;

			foreach ($filter["rules"] as $rule) {
				$match = false;
				$reg_exp = str_replace('/', '\/', $rule["reg_exp"]);
				$rule_inverse = $rule["inverse"];

				if (!$reg_exp)
					continue;

				switch ($rule["type"]) {
					case "title":
						$match = @preg_match("/$reg_exp/iu", $title);
						break;
					case "content":
						// we don't need to deal with multiline regexps
						$content = preg_replace("/[\r\n\t]/", "", $content);

						$match = @preg_match("/$reg_exp/iu", $content);
						break;
					case "both":
						// we don't need to deal with multiline regexps
						$content = preg_replace("/[\r\n\t]/", "", $content);

						$match = (@preg_match("/$reg_exp/iu", $title) || @preg_match("/$reg_exp/iu", $content));
						break;
					case "link":
						$match = @preg_match("/$reg_exp/iu", $link);
						break;
					case "author":
						$match = @preg_match("/$reg_exp/iu", $author);
						break;
					case "tag":
						foreach ($tags as $tag) {
							if (@preg_match("/$reg_exp/iu", $tag)) {
								$match = true;
								break;
							}
						}
						break;
				}

				if ($rule_inverse) $match = !$match;

				if ($match_any_rule) {
					if ($match) {
						$filter_match = true;
						break;
					}
				} else {
					$filter_match = $match;
					if (!$match) {
						break;
					}
				}
			}

			if ($inverse) $filter_match = !$filter_match;

			if ($filter_match) {
				if (is_array($matched_rules)) array_push($matched_rules, $rule);

				foreach ($filter["actions"] AS $action) {
					array_push($matches, $action);

					// if Stop action encountered, perform no further processing
					if (isset($action["type"]) && $action["type"] == "stop") return $matches;
				}
			}
		}

		return $matches;
	}

	static function find_article_filter($filters, $filter_name) {
		foreach ($filters as $f) {
			if ($f["type"] == $filter_name) {
				return $f;
			};
		}
		return false;
	}

	static function find_article_filters($filters, $filter_name) {
		$results = array();

		foreach ($filters as $f) {
			if ($f["type"] == $filter_name) {
				array_push($results, $f);
			};
		}
		return $results;
	}

	static function calculate_article_score($filters) {
		$score = 0;

		foreach ($filters as $f) {
			if ($f["type"] == "score") {
				$score += $f["param"];
			};
		}
		return $score;
	}

	static function labels_contains_caption($labels, $caption) {
		foreach ($labels as $label) {
			if ($label[1] == $caption) {
				return true;
			}
		}

		return false;
	}

	static function assign_article_to_label_filters($id, $filters, $owner_uid, $article_labels) {
		foreach ($filters as $f) {
			if ($f["type"] == "label") {
				if (!RSSUtils::labels_contains_caption($article_labels, $f["param"])) {
					Labels::add_article($id, $f["param"], $owner_uid);
				}
			}
		}
	}

	static function make_guid_from_title($title) {
		return preg_replace("/[ \"\',.:;]/", "-",
			mb_strtolower(strip_tags($title), 'utf-8'));
	}

	static function cleanup_counters_cache($debug) {
		$result = db_query("DELETE FROM ttrss_counters_cache
			WHERE feed_id > 0 AND
			(SELECT COUNT(id) FROM ttrss_feeds WHERE
				id = feed_id AND
				ttrss_counters_cache.owner_uid = ttrss_feeds.owner_uid) = 0");
		$frows = db_affected_rows($result);

		$result = db_query("DELETE FROM ttrss_cat_counters_cache
			WHERE feed_id > 0 AND
			(SELECT COUNT(id) FROM ttrss_feed_categories WHERE
				id = feed_id AND
				ttrss_cat_counters_cache.owner_uid = ttrss_feed_categories.owner_uid) = 0");
		$crows = db_affected_rows($result);

		if ($debug) _debug("Removed $frows (feeds) $crows (cats) orphaned counter cache entries.");
	}

	static function housekeeping_user($owner_uid) {
		$tmph = new PluginHost();

		load_user_plugins($owner_uid, $tmph);

		$tmph->run_hooks(PluginHost::HOOK_HOUSE_KEEPING, "hook_house_keeping", "");
	}

	static function housekeeping_common($debug) {
		RSSUtils::expire_cached_files($debug);
		RSSUtils::expire_lock_files($debug);
		RSSUtils::expire_error_log($debug);

		$count = RSSUtils::update_feedbrowser_cache();
		_debug("Feedbrowser updated, $count feeds processed.");

		Article::purge_orphans( true);
		RSSUtils::cleanup_counters_cache($debug);

		//$rc = cleanup_tags( 14, 50000);
		//_debug("Cleaned $rc cached tags.");

		PluginHost::getInstance()->run_hooks(PluginHost::HOOK_HOUSE_KEEPING, "hook_house_keeping", "");
	}

	static function check_feed_favicon($site_url, $feed) {
		#		print "FAVICON [$site_url]: $favicon_url\n";

		$icon_file = ICONS_DIR . "/$feed.ico";

		if (!file_exists($icon_file)) {
			$favicon_url = get_favicon_url($site_url);

			if ($favicon_url) {
				// Limiting to "image" type misses those served with text/plain
				$contents = fetch_file_contents($favicon_url); // , "image");

				if ($contents) {
					// Crude image type matching.
					// Patterns gleaned from the file(1) source code.
					if (preg_match('/^\x00\x00\x01\x00/', $contents)) {
						// 0       string  \000\000\001\000        MS Windows icon resource
						//error_log("check_feed_favicon: favicon_url=$favicon_url isa MS Windows icon resource");
					}
					elseif (preg_match('/^GIF8/', $contents)) {
						// 0       string          GIF8            GIF image data
						//error_log("check_feed_favicon: favicon_url=$favicon_url isa GIF image");
					}
					elseif (preg_match('/^\x89PNG\x0d\x0a\x1a\x0a/', $contents)) {
						// 0       string          \x89PNG\x0d\x0a\x1a\x0a         PNG image data
						//error_log("check_feed_favicon: favicon_url=$favicon_url isa PNG image");
					}
					elseif (preg_match('/^\xff\xd8/', $contents)) {
						// 0       beshort         0xffd8          JPEG image data
						//error_log("check_feed_favicon: favicon_url=$favicon_url isa JPG image");
					}
					else {
						//error_log("check_feed_favicon: favicon_url=$favicon_url isa UNKNOWN type");
						$contents = "";
					}
				}

				if ($contents) {
					$fp = @fopen($icon_file, "w");

					if ($fp) {
						fwrite($fp, $contents);
						fclose($fp);
						chmod($icon_file, 0644);
					}
				}
			}
			return $icon_file;
		}
	}



}