<?php

class Af_Comics_NerfNow extends Af_ComicFilter {

	function supported() {
		return array("Nerf NOW!!");
	}

	function process(&$article) {
		if (strpos($article["guid"], "nerfnow.com") !== FALSE) {

				// The comic web site supports HTTPS but the feed uses hardcoded HTTP
				// for the article link so let's fix this if the feed URL uses HTTPS
				if (substr($article["feed_url"], 0, 8 ) === "https://") {
					$article["link"] = str_replace('http://', 'https://', $article["link"]);
				}

				// Fetch the original article and use HTTPS
				$res = fetch_file_contents($article["link"], false, false, false,
					 false, false, 0,
					 "Mozilla/5.0 (Windows NT 6.1; WOW64; rv:50.0) Gecko/20100101 Firefox/50.0");

				global $fetch_last_error_content;

				if (!$res && $fetch_last_error_content)
					$res = $fetch_last_error_content;

				$doc = new DOMDocument();
				@$doc->loadHTML($res);

				$basenode = false;

				if ($doc) {
					$xpath = new DOMXPath($doc);

					// Get the image container and comment section
					$basenode = $xpath->query('(//div[@id="comic"])')->item(0);
					$comment = $xpath->query('(//div[@class="comment"])')->item(0);
					if ($basenode && $comment) {
						$basenode->appendChild($comment);
					}

					if ($basenode) {
						$article["content"] = $doc->saveXML($basenode);
					}
				}

			return true;
		}

		return false;
	}
}
?>
