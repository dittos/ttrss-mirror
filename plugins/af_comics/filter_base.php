<?php
abstract class Af_ComicFilter {
	public abstract function supported();
	public abstract function process(&$article);

	public function on_subscribe($url) {
		return false;
	}

	public function on_basic_info($url) {
		return false;
	}

	public function on_fetch($url) {
		return false;
	}
}
