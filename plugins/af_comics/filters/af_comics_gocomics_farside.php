<?php
class Af_Comics_Gocomics_FarSide extends Af_ComicFilter {

	function supported() {
		return ["The Far Side (needs cache media)"];
	}

	function process(&$article) {
		return false;
	}

	public function on_subscribe($url) {
		if (preg_match("#^https?://www\.thefarside\.com#", $url))
			return '<?xml version="1.0" encoding="utf-8"?>'; // Get is_html() to return false.
		else
			return false;
	}

	public function on_basic_info($url) {
		if (preg_match("#^https?://www.thefarside.com/#", $url))
			return ['title' => "The Far Side", 'site_url' => 'https://www.thefarside.com'];
		else
			return false;
	}

	public function on_fetch($url) {
		if (preg_match("#^https?://www\.thefarside\.com#", $url)) {

			$article_link = htmlspecialchars("https://www.thefarside.com" . date('/Y/m/d'));

			$tpl = new Templator();

			$tpl->readTemplateFromFile('templates/generated_feed.txt');

			$tpl->setVariable('FEED_TITLE', "The Far Side", true);
			$tpl->setVariable('VERSION', get_version(), true);
			$tpl->setVariable('FEED_URL', htmlspecialchars($url), true);
			$tpl->setVariable('SELF_URL', htmlspecialchars($url), true);

			$body = fetch_file_contents(['url' => $article_link, 'type' => 'text/html', 'followlocation' => false]);

			if ($body) {
				$doc = new DOMDocument();

				if (@$doc->loadHTML($body)) {
					$xpath = new DOMXPath($doc);

					$content_node = $xpath->query('//*[contains(@class,"js-daily-dose")]')->item(0);

					if ($content_node) {
						$imgs = $xpath->query('//img[@data-src]', $content_node);

						foreach ($imgs as $img) {
							$img->setAttribute('src', $img->getAttribute('data-src'));
						}

						$junk_elems = $xpath->query("//*[@data-shareable-popover]");

						foreach ($junk_elems as $junk)
							$junk->parentNode->removeChild($junk);

						$title = $xpath->query('//h3')->item(0);

						if ($title) {
							$title = clean(trim($title->nodeValue));
						} else {
							$title = date('l, F d, Y');
						}

						$tpl->setVariable('ARTICLE_ID', htmlspecialchars($article_link), true);
						$tpl->setVariable('ARTICLE_LINK', htmlspecialchars($article_link), true);
						$tpl->setVariable('ARTICLE_UPDATED_ATOM', date('c', mktime(11, 0, 0)), true);
						$tpl->setVariable('ARTICLE_TITLE', htmlspecialchars($title), true);
						$tpl->setVariable('ARTICLE_EXCERPT', '', true);
						$tpl->setVariable('ARTICLE_CONTENT', "<p> " . $doc->saveHTML($content_node) . "</p>", true);

						$tpl->setVariable('ARTICLE_AUTHOR', '', true);
						$tpl->setVariable('ARTICLE_SOURCE_LINK', htmlspecialchars($article_link), true);
						$tpl->setVariable('ARTICLE_SOURCE_TITLE', "The Far Side", true);

						$tpl->addBlock('entry');
					}
				}
			}

			$tpl->addBlock('feed');

			if ($tpl->generateOutputToString($tmp_data))
				return $tmp_data;
		}

		return false;
	}
}
