<?php
class Counters {

	static function getAllCounters() {
		$data = Counters::getGlobalCounters();

		$data = array_merge($data, Counters::getVirtCounters());
		$data = array_merge($data, Counters::getLabelCounters());
		$data = array_merge($data, Counters::getFeedCounters());
		$data = array_merge($data, Counters::getCategoryCounters());

		return $data;
	}

	static private function getCategoryChildrenCounters($cat_id, $owner_uid) {
		$pdo = Db::pdo();

		$sth = $pdo->prepare("SELECT id FROM ttrss_feed_categories WHERE parent_cat = ?
				AND owner_uid = ?");
		$sth->execute([$cat_id, $owner_uid]);

		$unread = 0;
		$marked = 0;

		while ($line = $sth->fetch()) {
			list ($tmp_unread, $tmp_marked) = Counters::getCategoryChildrenCounters($line["id"], $owner_uid);

			$unread += $tmp_unread + Feeds::getCategoryUnread($line["id"], $owner_uid);
			$marked += $tmp_marked + Feeds::getCategoryMarked($line["id"], $owner_uid);
		}

		return [$unread, $marked];
	}

	static function getCategoryCounters() {
		$ret = [];

		/* Labels category */

		$cv = array("id" => -2, "kind" => "cat",
			"counter" => Feeds::getCategoryUnread(-2));

		array_push($ret, $cv);

		$pdo = DB::pdo();

		$sth = $pdo->prepare("SELECT fc.id,
				SUM(CASE WHEN unread THEN 1 ELSE 0 END) AS count,
       			SUM(CASE WHEN marked THEN 1 ELSE 0 END) AS count_marked,
       			(SELECT COUNT(id) FROM ttrss_feed_categories fcc
       			WHERE fcc.parent_cat = fc.id) AS num_children
			FROM ttrss_feed_categories fc
    			LEFT JOIN ttrss_feeds f ON (f.cat_id = fc.id)
    			LEFT JOIN ttrss_user_entries ue ON (ue.feed_id = f.id)
			WHERE fc.owner_uid = :uid
			GROUP BY fc.id
		UNION
			SELECT 0,
				SUM(CASE WHEN unread THEN 1 ELSE 0 END) AS count,
			   	SUM(CASE WHEN marked THEN 1 ELSE 0 END) AS count_marked,
			   	0
			FROM ttrss_feeds f, ttrss_user_entries ue
			WHERE f.cat_id IS NULL AND
			    ue.feed_id = f.id AND
			    ue.owner_uid = :uid");

		$sth->execute(["uid" => $_SESSION['uid']]);

		while ($line = $sth->fetch()) {
			if ($line["num_children"] > 0) {
				list ($child_counter, $child_marked_counter) = Counters::getCategoryChildrenCounters($line["id"], $_SESSION["uid"]);
			} else {
				$child_counter = 0;
				$child_marked_counter = 0;
			}

			$cv = [
				"id" => (int)$line["id"],
				"kind" => "cat",
				"markedcounter" => (int) $line["count_marked"] + $child_marked_counter,
				"counter" => (int) $line["count"] + $child_counter
			];

			array_push($ret, $cv);
		}

		array_push($ret, $cv);

		return $ret;
	}


	static function getFeedCounters($active_feed = false) {

		$ret = [];

		$pdo = Db::pdo();

		$sth = $pdo->prepare("SELECT f.id,
				f.title,
				".SUBSTRING_FOR_DATE."(f.last_updated,1,19) AS last_updated,
				f.last_error,
				SUM(CASE WHEN unread THEN 1 ELSE 0 END) AS count,
				SUM(CASE WHEN marked THEN 1 ELSE 0 END) AS count_marked
			FROM ttrss_feeds f, ttrss_user_entries ue
			WHERE f.id = ue.feed_id AND ue.owner_uid = :uid
			GROUP BY f.id");

		$sth->execute(["uid" => $_SESSION['uid']]);

		while ($line = $sth->fetch()) {

			$id = $line["id"];
			$last_error = htmlspecialchars($line["last_error"]);
			$last_updated = make_local_datetime($line['last_updated'], false);

			if (Feeds::feedHasIcon($id)) {
				$has_img = filemtime(Feeds::getIconFile($id));
			} else {
				$has_img = false;
			}

			if (date('Y') - date('Y', strtotime($line['last_updated'])) > 2)
				$last_updated = '';

			$cv = [
				"id" => $id,
				"updated" => $last_updated,
				"counter" => (int) $line["count"],
				"markedcounter" => (int) $line["count_marked"],
				"has_img" => (int) $has_img
			];

			if ($last_error)
				$cv["error"] = $last_error;

			if ($active_feed && $id == $active_feed)
				$cv["title"] = truncate_string($line["title"], 30);

			array_push($ret, $cv);

		}

		return $ret;
	}

	static function getGlobalCounters($global_unread = -1) {
		$ret = [];

		if ($global_unread == -1) {
			$global_unread = Feeds::getGlobalUnread();
		}

		$cv = [
			"id" => "global-unread",
			"counter" => (int) $global_unread
		];

		array_push($ret, $cv);

		$pdo = Db::pdo();

		$sth = $pdo->prepare("SELECT COUNT(id) AS fn FROM
			ttrss_feeds WHERE owner_uid = ?");
		$sth->execute([$_SESSION['uid']]);
		$row = $sth->fetch();

		$subscribed_feeds = $row["fn"];

		$cv = [
			"id" => "subscribed-feeds",
			"counter" => (int) $subscribed_feeds
		];

		array_push($ret, $cv);

		return $ret;
	}

	static function getVirtCounters() {

		$ret = [];

		for ($i = 0; $i >= -4; $i--) {

			$count = getFeedUnread($i);

			if ($i == 0 || $i == -1 || $i == -2)
				$auxctr = Feeds::getFeedArticles($i, false);
			else
				$auxctr = 0;

			$cv = [
				"id" => $i,
				"counter" => (int) $count,
				"auxcounter" => (int) $auxctr
			];

			if ($i == -1)
				$cv["markedcounter"] = $auxctr;

			array_push($ret, $cv);
		}

		$feeds = PluginHost::getInstance()->get_feeds(-1);

		if (is_array($feeds)) {
			foreach ($feeds as $feed) {
				$cv = [
					"id" => PluginHost::pfeed_to_feed_id($feed['id']),
					"counter" => $feed['sender']->get_unread($feed['id'])
				];

				if (method_exists($feed['sender'], 'get_total'))
					$cv["auxcounter"] = $feed['sender']->get_total($feed['id']);

				array_push($ret, $cv);
			}
		}

		return $ret;
	}

	static function getLabelCounters($descriptions = false) {

		$ret = [];

		$pdo = Db::pdo();

		$sth = $pdo->prepare("SELECT id,
       			caption,
       			SUM(CASE WHEN u1.unread = true THEN 1 ELSE 0 END) AS count_unread,
       			SUM(CASE WHEN u1.marked = true THEN 1 ELSE 0 END) AS count_marked,
       			COUNT(u1.unread) AS total
			FROM ttrss_labels2 LEFT JOIN ttrss_user_labels2 ON
				(ttrss_labels2.id = label_id)
					LEFT JOIN ttrss_user_entries AS u1 ON u1.ref_id = article_id
						WHERE ttrss_labels2.owner_uid = :uid AND u1.owner_uid = :uid
							GROUP BY ttrss_labels2.id, ttrss_labels2.caption");
		$sth->execute([":uid" => $_SESSION['uid']]);

		while ($line = $sth->fetch()) {

			$id = Labels::label_to_feed_id($line["id"]);

			$cv = [
				"id" => $id,
				"counter" => (int) $line["count_unread"],
				"auxcounter" => (int) $line["total"],
				"markedcounter" => (int) $line["count_marked"]
			];

			if ($descriptions)
				$cv["description"] = $line["caption"];

			array_push($ret, $cv);
		}

		return $ret;
	}
}
