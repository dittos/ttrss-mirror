<?php
class Af_Comics_Cad extends Af_ComicFilter {

	function supported() {
		return array("Ctrl+Alt+Del");
	}

	function process(&$article) {
		if (strpos($article["link"], "cad-comic.com/comic/") !== FALSE) {
			if (strpos($article["title"], "News:") === FALSE)
			if (in_array($article["tags"], "blog") === FALSE) {

				$doc = new DOMDocument();

				if (@$doc->loadHTML(fetch_file_contents($article["link"]))) {
					$xpath = new DOMXPath($doc);

					$basenode = $xpath->query('(//div[@class="comicpage"])')->item(0);

					// Remove unwanted previous/next comic links
					foreach($xpath->query('//div[contains(attribute::class, "arrow")]') as $element ) {
						$element->parentNode->removeChild($element);
					}

					// The CAD web site always uses HTTP for internal links and images
					// so we fix it here if the article link points to HTTPS
					if ($basenode && substr($article['link'], 0, 8 ) === "https://") {
						foreach($basenode->getElementsByTagName('a') as $element) {
							$element->setAttribute('href', preg_replace("/^http:/", "https:", $element->getAttribute('href')) );
						}
						foreach($basenode->getElementsByTagName('img') as $element) {
							$element->setAttribute('src', preg_replace("/^http:/", "https:", $element->getAttribute('src')) );
						}
					}

					// Get the text section (if present)
					$post_text = $xpath->query('//div[@id="comicblog"]/div[@class="post-text-area"]')->item(0);
					if ($post_text) {
						if ($basenode) {
							// Append to comic
							$basenode->appendChild($post_text);
						} else {
							// Failsafe if no comic picture is present
							$basenode = $post_text;
						}
					}

					if ($basenode) {
						$article["content"] = $doc->saveXML($basenode);
					}

				}

			}

			return true;
		}

		return false;
	}
}