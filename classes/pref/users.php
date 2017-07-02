<?php
class Pref_Users extends Handler_Protected {
		function before($method) {
			if (parent::before($method)) {
				if ($_SESSION["access_level"] < 10) {
					print __("Your access level is insufficient to open this tab.");
					return false;
				}
				return true;
			}
			return false;
		}

		function csrf_ignore($method) {
			$csrf_ignored = array("index", "edit", "userdetails");

			return array_search($method, $csrf_ignored) !== false;
		}

		function edit() {
			global $access_level_names;

			print '<div dojoType="dijit.layout.TabContainer" style="height : 400px">
				<div dojoType="dijit.layout.ContentPane" title="'.__('Edit user').'">';

			print "<form id=\"user_edit_form\" onsubmit='return false' dojoType=\"dijit.form.Form\">";

			$id = (int) $this->dbh->escape_string($_REQUEST["id"]);

			print_hidden("id", "$id");
			print_hidden("op", "pref-users");
			print_hidden("method", "editSave");

			$result = $this->dbh->query("SELECT * FROM ttrss_users WHERE id = '$id'");

			$login = $this->dbh->fetch_result($result, 0, "login");
			$access_level = $this->dbh->fetch_result($result, 0, "access_level");
			$email = $this->dbh->fetch_result($result, 0, "email");

			$sel_disabled = ($id == $_SESSION["uid"] || $login == "admin") ? "disabled" : "";

			print "<div class=\"dlgSec\">".__("User")."</div>";
			print "<div class=\"dlgSecCont\">";

			if ($sel_disabled) {
				print_hidden("login", "$login");
			}

			print "<input size=\"30\" style=\"font-size : 16px\"
				dojoType=\"dijit.form.ValidationTextBox\" required=\"1\"
				$sel_disabled
				name=\"login\" value=\"$login\">";

			print "</div>";

			print "<div class=\"dlgSec\">".__("Authentication")."</div>";
			print "<div class=\"dlgSecCont\">";

			print __('Access level: ') . " ";

			if (!$sel_disabled) {
				print_select_hash("access_level", $access_level, $access_level_names,
					"dojoType=\"dijit.form.Select\" $sel_disabled");
			} else {
				print_select_hash("", $access_level, $access_level_names,
					"dojoType=\"dijit.form.Select\" $sel_disabled");
				print_hidden("access_level", "$access_level");
			}

			print "<hr/>";

			print "<input dojoType=\"dijit.form.TextBox\" type=\"password\" size=\"20\" placeholder=\"Change password\"
				name=\"password\">";

			print "</div>";

			print "<div class=\"dlgSec\">".__("Options")."</div>";
			print "<div class=\"dlgSecCont\">";

			print "<input dojoType=\"dijit.form.TextBox\" size=\"30\" name=\"email\" placeholder=\"E-mail\"
				value=\"$email\">";

			print "</div>";

			print "</table>";

			print "</form>";

			print '</div>'; #tab
			print "<div href=\"backend.php?op=pref-users&method=userdetails&id=$id\"
				dojoType=\"dijit.layout.ContentPane\" title=\"".__('User details')."\">";

			print '</div>';
			print '</div>';

			print "<div class=\"dlgButtons\">
				<button dojoType=\"dijit.form.Button\" type=\"submit\">".
				__('Save')."</button>
				<button dojoType=\"dijit.form.Button\" onclick=\"dijit.byId('userEditDlg').hide()\">".
				__('Cancel')."</button></div>";

			return;
		}

		function userdetails() {
			$id = (int) $this->dbh->escape_string($_REQUEST["id"]);

			$result = $this->dbh->query("SELECT login,
				".SUBSTRING_FOR_DATE."(last_login,1,16) AS last_login,
				access_level,
				(SELECT COUNT(int_id) FROM ttrss_user_entries
					WHERE owner_uid = id) AS stored_articles,
				".SUBSTRING_FOR_DATE."(created,1,16) AS created
				FROM ttrss_users
				WHERE id = '$id'");

			if ($this->dbh->num_rows($result) == 0) {
				print "<h1>".__('User not found')."</h1>";
				return;
			}

			print "<table width='100%'>";

			$last_login = make_local_datetime(
				$this->dbh->fetch_result($result, 0, "last_login"), true);

			$created = make_local_datetime(
				$this->dbh->fetch_result($result, 0, "created"), true);

			$stored_articles = $this->dbh->fetch_result($result, 0, "stored_articles");

			print "<tr><td>".__('Registered')."</td><td>$created</td></tr>";
			print "<tr><td>".__('Last logged in')."</td><td>$last_login</td></tr>";

			$result = $this->dbh->query("SELECT COUNT(id) as num_feeds FROM ttrss_feeds
				WHERE owner_uid = '$id'");

			$num_feeds = $this->dbh->fetch_result($result, 0, "num_feeds");

			print "<tr><td>".__('Subscribed feeds count')."</td><td>$num_feeds</td></tr>";
			print "<tr><td>".__('Stored articles')."</td><td>$stored_articles</td></tr>";

			print "</table>";

			print "<h1>".__('Subscribed feeds')."</h1>";

			$result = $this->dbh->query("SELECT id,title,site_url FROM ttrss_feeds
				WHERE owner_uid = '$id' ORDER BY title");

			print "<ul class=\"userFeedList\">";

			while ($line = $this->dbh->fetch_assoc($result)) {

				$icon_file = ICONS_URL."/".$line["id"].".ico";

				if (file_exists($icon_file) && filesize($icon_file) > 0) {
					$feed_icon = "<img class=\"tinyFeedIcon\" src=\"$icon_file\">";
				} else {
					$feed_icon = "<img class=\"tinyFeedIcon\" src=\"images/blank_icon.gif\">";
				}

				print "<li>$feed_icon&nbsp;<a href=\"".$line["site_url"]."\">".$line["title"]."</a></li>";

			}

			if ($this->dbh->num_rows($result) < $num_feeds) {
				// FIXME - add link to show ALL subscribed feeds here somewhere
				print "<li><img
					class=\"tinyFeedIcon\" src=\"images/blank_icon.gif\">&nbsp;...</li>";
			}

			print "</ul>";
		}

		function editSave() {
			$login = $this->dbh->escape_string(trim($_REQUEST["login"]));
			$uid = $this->dbh->escape_string($_REQUEST["id"]);
			$access_level = (int) $_REQUEST["access_level"];
			$email = $this->dbh->escape_string(trim($_REQUEST["email"]));
			$password = $_REQUEST["password"];

			if ($password) {
				$salt = substr(bin2hex(get_random_bytes(125)), 0, 250);
				$pwd_hash = encrypt_password($password, $salt, true);
				$pass_query_part = "pwd_hash = '$pwd_hash', salt = '$salt',";
			} else {
				$pass_query_part = "";
			}

			$this->dbh->query("UPDATE ttrss_users SET $pass_query_part login = '$login',
				access_level = '$access_level', email = '$email', otp_enabled = false
				WHERE id = '$uid'");

		}

		function remove() {
			$ids = explode(",", $this->dbh->escape_string($_REQUEST["ids"]));

			foreach ($ids as $id) {
				if ($id != $_SESSION["uid"] && $id != 1) {
					$this->dbh->query("DELETE FROM ttrss_tags WHERE owner_uid = '$id'");
					$this->dbh->query("DELETE FROM ttrss_feeds WHERE owner_uid = '$id'");
					$this->dbh->query("DELETE FROM ttrss_users WHERE id = '$id'");
				}
			}
		}

		function add() {

			$login = $this->dbh->escape_string(trim($_REQUEST["login"]));
			$tmp_user_pwd = make_password(8);
			$salt = substr(bin2hex(get_random_bytes(125)), 0, 250);
			$pwd_hash = encrypt_password($tmp_user_pwd, $salt, true);

			$result = $this->dbh->query("SELECT id FROM ttrss_users WHERE
				login = '$login'");

			if ($this->dbh->num_rows($result) == 0) {

				$this->dbh->query("INSERT INTO ttrss_users
					(login,pwd_hash,access_level,last_login,created, salt)
					VALUES ('$login', '$pwd_hash', 0, null, NOW(), '$salt')");


				$result = $this->dbh->query("SELECT id FROM ttrss_users WHERE
					login = '$login' AND pwd_hash = '$pwd_hash'");

				if ($this->dbh->num_rows($result) == 1) {

					$new_uid = $this->dbh->fetch_result($result, 0, "id");

					print format_notice(T_sprintf("Added user <b>%s</b> with password <b>%s</b>",
						$login, $tmp_user_pwd));

					initialize_user($new_uid);

				} else {

					print format_warning(T_sprintf("Could not create user <b>%s</b>", $login));

				}
			} else {
				print format_warning(T_sprintf("User <b>%s</b> already exists.", $login));
			}
		}

		static function resetUserPassword($uid, $show_password) {

			$result = db_query("SELECT login,email
				FROM ttrss_users WHERE id = '$uid'");

			$login = db_fetch_result($result, 0, "login");
			$email = db_fetch_result($result, 0, "email");

			$new_salt = substr(bin2hex(get_random_bytes(125)), 0, 250);
			$tmp_user_pwd = make_password(8);

			$pwd_hash = encrypt_password($tmp_user_pwd, $new_salt, true);

			db_query("UPDATE ttrss_users SET pwd_hash = '$pwd_hash', salt = '$new_salt', otp_enabled = false
				WHERE id = '$uid'");

			if ($show_password) {
				print T_sprintf("Changed password of user <b>%s</b> to <b>%s</b>", $login, $tmp_user_pwd);
			} else {
				print_notice(T_sprintf("Sending new password of user <b>%s</b> to <b>%s</b>", $login, $email));
			}

			require_once 'classes/ttrssmailer.php';

			if ($email) {
				require_once "lib/MiniTemplator.class.php";

				$tpl = new MiniTemplator;

				$tpl->readTemplateFromFile("templates/resetpass_template.txt");

				$tpl->setVariable('LOGIN', $login);
				$tpl->setVariable('NEWPASS', $tmp_user_pwd);

				$tpl->addBlock('message');

				$message = "";

				$tpl->generateOutputToString($message);

				$mail = new ttrssMailer();

				$rc = $mail->quickMail($email, $login,
					__("[tt-rss] Password change notification"),
					$message, false);

				if (!$rc) print_error($mail->ErrorInfo);
			}
		}

		function resetPass() {
			$uid = $this->dbh->escape_string($_REQUEST["id"]);
			Pref_Users::resetUserPassword($uid, true);
		}

		function index() {

			global $access_level_names;

			print "<div id=\"pref-user-wrap\" dojoType=\"dijit.layout.BorderContainer\" gutters=\"false\">";
			print "<div id=\"pref-user-header\" dojoType=\"dijit.layout.ContentPane\" region=\"top\">";

			print "<div id=\"pref-user-toolbar\" dojoType=\"dijit.Toolbar\">";

			$user_search = $this->dbh->escape_string($_REQUEST["search"]);

			if (array_key_exists("search", $_REQUEST)) {
				$_SESSION["prefs_user_search"] = $user_search;
			} else {
				$user_search = $_SESSION["prefs_user_search"];
			}

			print "<div style='float : right; padding-right : 4px;'>
				<input dojoType=\"dijit.form.TextBox\" id=\"user_search\" size=\"20\" type=\"search\"
					value=\"$user_search\">
				<button dojoType=\"dijit.form.Button\" onclick=\"updateUsersList()\">".
					__('Search')."</button>
				</div>";

			$sort = $this->dbh->escape_string($_REQUEST["sort"]);

			if (!$sort || $sort == "undefined") {
				$sort = "login";
			}

			print "<div dojoType=\"dijit.form.DropDownButton\">".
					"<span>" . __('Select')."</span>";
			print "<div dojoType=\"dijit.Menu\" style=\"display: none;\">";
			print "<div onclick=\"selectTableRows('prefUserList', 'all')\"
				dojoType=\"dijit.MenuItem\">".__('All')."</div>";
			print "<div onclick=\"selectTableRows('prefUserList', 'none')\"
				dojoType=\"dijit.MenuItem\">".__('None')."</div>";
			print "</div></div>";

			print "<button dojoType=\"dijit.form.Button\" onclick=\"addUser()\">".__('Create user')."</button>";

			print "
				<button dojoType=\"dijit.form.Button\" onclick=\"editSelectedUser()\">".
				__('Edit')."</button dojoType=\"dijit.form.Button\">
				<button dojoType=\"dijit.form.Button\" onclick=\"removeSelectedUsers()\">".
				__('Remove')."</button dojoType=\"dijit.form.Button\">
				<button dojoType=\"dijit.form.Button\" onclick=\"resetSelectedUserPass()\">".
				__('Reset password')."</button dojoType=\"dijit.form.Button\">";

			PluginHost::getInstance()->run_hooks(PluginHost::HOOK_PREFS_TAB_SECTION,
				"hook_prefs_tab_section", "prefUsersToolbar");

			print "</div>"; #toolbar
			print "</div>"; #pane
			print "<div id=\"pref-user-content\" dojoType=\"dijit.layout.ContentPane\" region=\"center\">";

			print "<div id=\"sticky-status-msg\"></div>";

			if ($user_search) {

				$user_search = explode(" ", $user_search);
				$tokens = array();

				foreach ($user_search as $token) {
					$token = trim($token);
					array_push($tokens, "(UPPER(login) LIKE UPPER('%$token%'))");
				}

				$user_search_query = "(" . join($tokens, " AND ") . ") AND ";

			} else {
				$user_search_query = "";
			}

			$result = $this->dbh->query("SELECT
					tu.id,
					login,access_level,email,
					".SUBSTRING_FOR_DATE."(last_login,1,16) as last_login,
					".SUBSTRING_FOR_DATE."(created,1,16) as created,
					(SELECT COUNT(id) FROM ttrss_feeds WHERE owner_uid = tu.id) AS num_feeds
				FROM
					ttrss_users tu
				WHERE
					$user_search_query
					tu.id > 0
				ORDER BY $sort");

			if ($this->dbh->num_rows($result) > 0) {

			print "<p><table width=\"100%\" cellspacing=\"0\"
				class=\"prefUserList\" id=\"prefUserList\">";

			print "<tr class=\"title\">
						<td align='center' width=\"5%\">&nbsp;</td>
						<td width='20%'><a href=\"#\" onclick=\"updateUsersList('login')\">".__('Login')."</a></td>
						<td width='20%'><a href=\"#\" onclick=\"updateUsersList('access_level')\">".__('Access Level')."</a></td>
						<td width='10%'><a href=\"#\" onclick=\"updateUsersList('num_feeds')\">".__('Subscribed feeds')."</a></td>
						<td width='20%'><a href=\"#\" onclick=\"updateUsersList('created')\">".__('Registered')."</a></td>
						<td width='20%'><a href=\"#\" onclick=\"updateUsersList('last_login')\">".__('Last login')."</a></td></tr>";

			$lnum = 0;

			while ($line = $this->dbh->fetch_assoc($result)) {

				$uid = $line["id"];

				print "<tr id=\"UMRR-$uid\">";

				$line["login"] = htmlspecialchars($line["login"]);

				$line["created"] = make_local_datetime($line["created"], false);
				$line["last_login"] = make_local_datetime($line["last_login"], false);

				print "<td align='center'><input onclick='toggleSelectRow2(this);'
					dojoType=\"dijit.form.CheckBox\" type=\"checkbox\"
					id=\"UMCHK-$uid\"></td>";

				$onclick = "onclick='editUser($uid, event)' title='".__('Click to edit')."'";

				print "<td $onclick><img src='images/user.png' class='markedPic' alt=''> " . $line["login"] . "</td>";

				if (!$line["email"]) $line["email"] = "&nbsp;";

				print "<td $onclick>" .	$access_level_names[$line["access_level"]] . "</td>";
				print "<td $onclick>" . $line["num_feeds"] . "</td>";
				print "<td $onclick>" . $line["created"] . "</td>";
				print "<td $onclick>" . $line["last_login"] . "</td>";

				print "</tr>";

				++$lnum;
			}

			print "</table>";

			} else {
				print "<p>";
				if (!$user_search) {
					print_warning(__('No users defined.'));
				} else {
					print_warning(__('No matching users found.'));
				}
				print "</p>";

			}

			print "</div>"; #pane

			PluginHost::getInstance()->run_hooks(PluginHost::HOOK_PREFS_TAB,
				"hook_prefs_tab", "prefUsers");

			print "</div>"; #container

		}
	}
