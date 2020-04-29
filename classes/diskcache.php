<?php
class DiskCache {
	private $dir;

	public function __construct($dir) {
		$this->dir = CACHE_DIR . "/" . clean_filename($dir);
	}

	public function getDir() {
		return $this->dir;
	}

	public function makeDir() {
		if (!is_dir($this->dir)) {
			return mkdir($this->dir);
		}
	}

	public function isWritable($filename = "") {
		if ($filename) {
			if (file_exists($this->getFullPath($filename)))
				return is_writable($this->getFullPath($filename));
			else
				return is_writable($this->dir);
		} else {
			return is_writable($this->dir);
		}
	}

	public function exists($filename) {
		return file_exists($this->getFullPath($filename));
	}

	public function getSize($filename) {
		if ($this->exists($filename))
			return filesize($this->getFullPath($filename));
		else
			return -1;
	}

	public function getFullPath($filename) {
		$filename = clean_filename($filename);

		return $this->dir . "/" . $filename;
	}

	public function put($filename, $data) {
		return file_put_contents($this->getFullPath($filename), $data);
	}

	public function touch($filename) {
		return touch($this->getFullPath($filename));
	}

	public function get($filename) {
		if ($this->exists($filename))
			return file_get_contents($this->getFullPath($filename));
		else
			return null;
	}

	public function getMimeType($filename) {
		if ($this->exists($filename))
			return mime_content_type($this->getFullPath($filename));
		else
			return null;
	}

	public function send($filename) {
		header("Content-Disposition: inline; filename=\"$filename\"");

		return send_local_file($this->getFullPath($filename));
	}

	public function getUrl($filename) {
		return get_self_url_prefix() . "/public.php?op=cached_url&file=" . basename($this->dir) . "/" . $filename;
	}

	// check for locally cached (media) URLs and rewrite to local versions
	// this is called separately after sanitize() and plugin render article hooks to allow
	// plugins work on original source URLs used before caching
	// NOTE: URLs should be already absolutized because this is called after sanitize()
	static public function rewriteUrls($str)
	{
		$res = trim($str);
		if (!$res) return '';

		$doc = new DOMDocument();
		if ($doc->loadHTML('<?xml encoding="UTF-8">' . $res)) {
			$xpath = new DOMXPath($doc);
			$cache = new DiskCache("images");

			$entries = $xpath->query('(//img[@src]|//source[@src|@srcset]|//video[@poster|@src])');

			$need_saving = false;

			foreach ($entries as $entry) {
				foreach (array('src', 'poster') as $attr) {
					if ($entry->hasAttribute($attr)) {
						$url = $entry->getAttribute($attr);
						$cached_filename = sha1($url);

						if ($cache->exists($cached_filename)) {
							$url = $cache->getUrl($cached_filename);

							$entry->setAttribute($attr, $url);
							$entry->removeAttribute("srcset");

							$need_saving = true;
						}
					}
				}

				if ($entry->hasAttribute("srcset")) {
					$tokens = explode(",", $entry->getAttribute('srcset'));

					for ($i = 0; $i < count($tokens); $i++) {
						$token = trim($tokens[$i]);

						list ($url, $width) = explode(" ", $token, 2);
						$cached_filename = sha1($url);

						if ($cache->exists($cached_filename)) {
							$tokens[$i] = $cache->getUrl($cached_filename) . " " . $width;

							$need_saving = true;
						}
					}

					$entry->setAttribute("srcset", implode(", ", $tokens));
				}
			}

			if ($need_saving) {
				$doc->removeChild($doc->firstChild); //remove doctype
				$res = $doc->saveHTML();
			}
		}
		return $res;
	}

	static function expire() {
		$dirs = array_filter(glob(CACHE_DIR . "/*"), "is_dir");

		foreach ($dirs as $cache_dir) {
			$num_deleted = 0;

			if (is_writable($cache_dir) && !file_exists("$cache_dir/.no-auto-expiry")) {
				$files = glob("$cache_dir/*");

				if ($files) {
					foreach ($files as $file) {
						if (time() - filemtime($file) > 86400*CACHE_MAX_DAYS) {
							unlink($file);

							++$num_deleted;
						}
					}
				}

				Debug::log("Expired $cache_dir: removed $num_deleted files.");
			}
		}
	}
}
