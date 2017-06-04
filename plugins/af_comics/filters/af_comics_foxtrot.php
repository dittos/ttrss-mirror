<?php
class Af_Comics_Foxtrot extends Af_ComicFilter {

	function supported() {
		return array("Foxtrot");
	}

	function process(&$article) {
		if (strpos($article["guid"], "www.foxtrot.com") !== FALSE) {
				$res = fetch_file_contents($article["link"], false, false, false,
					 false, false, 0,
					 "Mozilla/5.0 (Windows NT 6.1; WOW64; rv:35.0) Gecko/20100101 Firefox/35.0");

				global $fetch_last_error_content;

				if (!$res && $fetch_last_error_content)
					$res = $fetch_last_error_content;

				$doc = new DOMDocument();
				@$doc->loadHTML($res);

				$basenode = false;

				if ($doc) {
					$xpath = new DOMXPath($doc);

					$basenode = $xpath->query('(//div[@class="entry-content"])')->item(0);

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
