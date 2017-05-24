<?php
class FeedItem_Json extends FeedItem_Common {

	/* for JSON feed only $elem is passed which is the actual entry as an object */
	function __construct($elem, $doc, $xpath) {
		$this->elem = $elem;
		$this->doc = $doc;
	}

	function get_id() {
		return $this->elem->id;
	}

	function get_date() {
		return isset($this->elem->date_published) ? strtotime($this->elem->date_published) : false;
	}

	function get_author() {
		$author = false;

		if (isset($this->author)) {
			$author = $this->author;
		} else if (isset($this->doc->author)) {
			$author = $this->doc->author;
		}

		if ($author && $author->name) {
			return $author->name;
		}
	}

	function get_comments_url() {
		return false;
	}

	function get_comments_count() {
		return false;
	}

	function get_link() {
		return isset($this->elem->url) ? $this->elem->url : false;
	}

	function get_title() {
		return $this->elem->title;
	}

	function get_content() {
		return isset($this->elem->content_html) ? $this->elem->content_html : $this->elem->content_text;
	}

	function get_description() {
		return isset($this->elem->summary) ? $this->elem->summary : false;
	}

	function get_categories() {
		$cats = array();

		if (is_array($this->elem->tags)) {
			foreach ($this->elem->tags as $cat) {
				array_push($cats, trim($cat));
			}
		}

		return $cats;
	}

	function get_enclosures() {
		$encs = array();

		if (is_array($this->elem->attachments)) {
			foreach ($this->elem->attachments as $enclosure) {

				$enc = new FeedEnclosure();

				$enc->type = $enclosure["mime_type"];
				$enc->link = $enclosure["url"];
				@$enc->length = $enclosure["size_in_bytes"];

				array_push($encs, $enc);

			}
		}

		return $encs;
	}

}