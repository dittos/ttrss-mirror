<?php
class Af_Comics_Gocomics extends Af_ComicFilter {

	function supported() {
		return ["GoComics (see note below)"];
	}

	function process(&$article) {
		return false;
	}

	public function on_subscribe($url) {
		if (preg_match('#^https?://www\.gocomics\.com/([-a-z0-9]+)$#i', $url))
			return '<?xml version="1.0" encoding="utf-8"?>'; // Get is_html() to return false.
		else
			return false;
	}

	public function on_basic_info($url) {
		if (preg_match('#^https?://www\.gocomics\.com/([-a-z0-9]+)$#i', $url, $matches))
			return ['title' => ucfirst($matches[1]), 'site_url' => $matches[0]];
		else
			return false;
	}

	public function on_fetch($url) {
		if (preg_match('#^https?://(?:feeds\.feedburner\.com/uclick|www\.gocomics\.com)/([-a-z0-9]+)$#i', $url, $comic)) {
			$site_url = 'https://www.gocomics.com/' . $comic[1];

			$article_link = $site_url . date('/Y/m/d');

			$body = fetch_file_contents(array('url' => $article_link, 'type' => 'text/html', 'followlocation' => false));

			$feed_title = htmlspecialchars($comic[1]);
			$site_url = htmlspecialchars($site_url);
			$article_link = htmlspecialchars($article_link);

			$tpl = new Templator();

			$tpl->readTemplateFromFile('templates/generated_feed.txt');

			$tpl->setVariable('FEED_TITLE', $feed_title, true);
			$tpl->setVariable('VERSION', get_version(), true);
			$tpl->setVariable('FEED_URL', htmlspecialchars($url), true);
			$tpl->setVariable('SELF_URL', $site_url, true);

			if ($body) {
				$doc = new DOMDocument();

				if (@$doc->loadHTML($body)) {
					$xpath = new DOMXPath($doc);

					$node = $xpath->query('//picture[contains(@class, "item-comic-image")]/img')->item(0);

					if ($node) {
						$title = $xpath->query('//h1')->item(0);

						if ($title) {
							$title = clean(trim($title->nodeValue));
						} else {
							$title = date('l, F d, Y');
						}

						foreach (['srcset', 'sizes', 'data-srcset', 'width'] as $attr ) {
							$node->removeAttribute($attr);
						}

						$tpl->setVariable('ARTICLE_ID', $article_link, true);
						$tpl->setVariable('ARTICLE_LINK', $article_link, true);
						$tpl->setVariable('ARTICLE_UPDATED_ATOM', date('c', mktime(11, 0, 0)), true);
						$tpl->setVariable('ARTICLE_TITLE', htmlspecialchars($title), true);
						$tpl->setVariable('ARTICLE_EXCERPT', '', true);
						$tpl->setVariable('ARTICLE_CONTENT', $doc->saveHTML($node), true);

						$tpl->setVariable('ARTICLE_AUTHOR', '', true);
						$tpl->setVariable('ARTICLE_SOURCE_LINK', $site_url, true);
						$tpl->setVariable('ARTICLE_SOURCE_TITLE', $feed_title, true);

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
