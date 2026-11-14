<?php
/**
 * /api/auth/* route handlers.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Auth_Route_Handlers {

	/**
	 * @param string              $subpath Route after auth/.
	 * @param string              $method  HTTP method.
	 * @param array<string,mixed> $body    JSON body.
	 */
	public static function dispatch( string $subpath, string $method, array $body ): void {
		self::send_no_cache_headers();
		$subpath = trim( $subpath, '/' );
		$method  = strtoupper( $method );

		if ( $subpath === 'me' && $method === 'GET' ) {
			self::me();
			return;
		}
		if ( $subpath === 'login' && $method === 'POST' ) {
			self::login( $body );
			return;
		}
		if ( $subpath === 'logout' && $method === 'POST' ) {
			self::logout();
			return;
		}
		if ( $subpath === 'register' && $method === 'POST' ) {
			self::register( $body );
			return;
		}
		if ( $subpath === 'forgot' && $method === 'POST' ) {
			self::forgot( $body );
			return;
		}
		if ( $subpath === 'reset' && $method === 'POST' ) {
			self::reset_password( $body );
			return;
		}

		if ( $subpath === 'bootstrap' && $method === 'POST' ) {
			self::bootstrap( $body );
			return;
		}

		if ( $subpath === 'setup-admin' && $method === 'POST' ) {
			self::setup_admin( $body );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
	}

	private static function send_no_cache_headers(): void {
		if ( headers_sent() ) {
			return;
		}
		header( 'Cache-Control: private, no-store, no-cache, must-revalidate, max-age=0' );
		header( 'Pragma: no-cache' );
		header( 'Expires: 0' );
		header( 'Vary: Authorization, Cookie', false );
		header( 'X-WPE-No-Cache: 1' );
	}

	private static function me(): void {
		$user = Neo_Pulse_App_Auth_Session::require_user();
		if ( ! $user ) {
			$user = self::bridge_wordpress_user();
		}
		if ( ! $user ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'username' => null, 'user' => null ) );
			return;
		}

		$user_id  = (int) $user['id'];
		$teams    = Neo_Pulse_App_Teams_Store::list_teams_for_user( $user_id );
		$team_id  = Neo_Pulse_App_Auth_Session::active_team_id();
		$payload  = null;
		$perms    = null;

		if ( $team_id === null && count( $teams ) > 0 ) {
			$team_id = (int) $teams[0]['id'];
			Neo_Pulse_App_Auth_Session::set_active_team( $team_id );
		}

		if ( $team_id !== null ) {
			$team = Neo_Pulse_App_Teams_Store::get_team( $team_id );
			$mem  = Neo_Pulse_App_Teams_Store::get_membership( $team_id, $user_id );
			if ( $team && $mem ) {
				$payload = Neo_Pulse_App_Teams_Store::format_team_payload( $team, $mem );
				$perms   = $payload['permissions'];
			}
		}

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'           => true,
				'username'     => (string) $user['email'],
				'user'         => array(
					'id'          => $user_id,
					'email'       => (string) $user['email'],
					'displayName' => (string) $user['display_name'],
					'avatarUrl'   => $user['avatar_url'],
				),
				'teams'        => array_map(
					static function ( $row ) {
						return array(
							'id'   => (int) $row['id'],
							'name' => (string) $row['name'],
							'slug' => (string) $row['slug'],
						);
					},
					$teams
				),
				'activeTeam'   => $payload,
				'permissions'  => $perms,
			)
		);
	}

	/**
	 * WordPress admin session opens the app without a separate login.
	 *
	 * @return array<string,mixed>|null
	 */
	private static function bridge_wordpress_user(): ?array {
		if ( ! is_user_logged_in() ) {
			return null;
		}

		$wp_user = wp_get_current_user();
		if ( ! ( $wp_user instanceof WP_User ) || $wp_user->ID <= 0 ) {
			return null;
		}

		$email = sanitize_email( strtolower( trim( (string) $wp_user->user_email ) ) );
		if ( $email === '' ) {
			return null;
		}

		$user = Neo_Pulse_App_Teams_Store::get_user_by_email( $email );
		if ( ! $user ) {
			return null;
		}

		$user_id = (int) $user['id'];
		$teams   = Neo_Pulse_App_Teams_Store::list_teams_for_user( $user_id );
		$team_id = count( $teams ) > 0 ? (int) $teams[0]['id'] : null;
		Neo_Pulse_App_Auth_Session::set_session( $user_id, $team_id );

		return $user;
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function login( array $body ): void {
		$login    = isset( $body['username'] ) ? (string) $body['username'] : ( isset( $body['email'] ) ? (string) $body['email'] : '' );
		$password = isset( $body['password'] ) ? (string) $body['password'] : '';
		$user     = Neo_Pulse_App_Teams_Store::get_user_by_email( $login );
		if ( ! $user || ! Neo_Pulse_App_Teams_Store::verify_password( $user, $password ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Invalid credentials' ), 401 );
			return;
		}
		$user_id = (int) $user['id'];
		$teams   = Neo_Pulse_App_Teams_Store::list_teams_for_user( $user_id );
		$team_id = count( $teams ) > 0 ? (int) $teams[0]['id'] : null;
		Neo_Pulse_App_Auth_Session::set_session( $user_id, $team_id );
		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'   => true,
				'user' => array(
					'username'    => (string) $user['email'],
					'email'       => (string) $user['email'],
					'displayName' => (string) $user['display_name'],
				),
				'sessionToken' => Neo_Pulse_App_Auth_Session::current_token(),
			)
		);
	}

	private static function logout(): void {
		Neo_Pulse_App_Auth_Session::clear();
		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true ) );
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function register( array $body ): void {
		$token        = isset( $body['inviteToken'] ) ? (string) $body['inviteToken'] : '';
		$email        = isset( $body['email'] ) ? (string) $body['email'] : '';
		$password     = isset( $body['password'] ) ? (string) $body['password'] : '';
		$display_name = isset( $body['displayName'] ) ? (string) $body['displayName'] : '';

		if ( $token === '' || $email === '' || $password === '' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Missing required fields' ), 400 );
			return;
		}

		$invite = Neo_Pulse_App_Teams_Invites::find_by_token( $token );
		if ( ! $invite ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Invalid or expired invite' ), 400 );
			return;
		}
		if ( strtolower( trim( $email ) ) !== strtolower( trim( (string) $invite['email'] ) ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Email does not match invite' ), 400 );
			return;
		}

		$existing = Neo_Pulse_App_Teams_Store::get_user_by_email( $email );
		if ( $existing ) {
			$user_id = (int) $existing['id'];
		} else {
			$user_id = Neo_Pulse_App_Teams_Store::create_user( $email, $password, $display_name !== '' ? $display_name : $email );
		}

		$accepted = Neo_Pulse_App_Teams_Invites::accept( $invite, $user_id );
		if ( ! $accepted['ok'] ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( $accepted, 400 );
			return;
		}

		Neo_Pulse_App_Auth_Session::set_session( $user_id, (int) $invite['team_id'] );
		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true ) );
	}

	/**
	 * First account when no users exist yet.
	 *
	 * @param array<string,mixed> $body
	 */
	private static function bootstrap( array $body ): void {
		global $wpdb;
		$count = (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . Neo_Pulse_App_Teams_Store::users_table_sql() );
		if ( $count > 0 ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Bootstrap not available' ), 403 );
			return;
		}

		$email        = isset( $body['email'] ) ? (string) $body['email'] : '';
		$password     = isset( $body['password'] ) ? (string) $body['password'] : '';
		$display_name = isset( $body['displayName'] ) ? (string) $body['displayName'] : '';

		if ( $email === '' || $password === '' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Missing required fields' ), 400 );
			return;
		}

		$user_id = Neo_Pulse_App_Teams_Store::create_user( $email, $password, $display_name !== '' ? $display_name : $email );
		if ( $user_id <= 0 ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Could not create user. Reactivate neo-pulse-app plugin.' ), 500 );
			return;
		}
		Neo_Pulse_App_Auth_Session::set_user( $user_id );
		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true ) );
	}

	/**
	 * Install tables and create or update owner account + agency team.
	 *
	 * @param array<string,mixed> $body
	 */
	private static function setup_admin( array $body ): void {
		global $wpdb;
		Neo_Pulse_App_Teams_Store::install_tables();

		$email        = isset( $body['email'] ) ? sanitize_email( strtolower( trim( (string) $body['email'] ) ) ) : '';
		$password     = isset( $body['password'] ) ? (string) $body['password'] : '';
		$display_name = isset( $body['displayName'] ) ? sanitize_text_field( (string) $body['displayName'] ) : '';
		$team_name    = isset( $body['teamName'] ) ? sanitize_text_field( (string) $body['teamName'] ) : 'Neo Digital Inc.';
		$job_title    = isset( $body['jobTitle'] ) ? sanitize_text_field( (string) $body['jobTitle'] ) : 'Lead SEO/AI Developer';

		if ( $email === '' || $password === '' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Missing email or password' ), 400 );
			return;
		}

		$count = (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . Neo_Pulse_App_Teams_Store::users_table_sql() );
		$setup_key = isset( $body['setupKey'] ) ? (string) $body['setupKey'] : '';
		$allowed   = $count === 0;
		$configured_setup_key = '';
		if ( defined( 'NEO_PULSE_APP_SETUP_KEY' ) && NEO_PULSE_APP_SETUP_KEY !== '' ) {
			$configured_setup_key = (string) NEO_PULSE_APP_SETUP_KEY;
		} elseif ( getenv( 'NEO_PULSE_APP_SETUP_KEY' ) ) {
			$configured_setup_key = trim( (string) getenv( 'NEO_PULSE_APP_SETUP_KEY' ) );
		}
		if ( $configured_setup_key !== '' && $setup_key !== '' ) {
			$allowed = $allowed || hash_equals( $configured_setup_key, $setup_key );
		}

		if ( ! $allowed ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Setup not allowed' ), 403 );
			return;
		}

		$existing = Neo_Pulse_App_Teams_Store::get_user_by_email( $email );
		if ( $existing ) {
			$user_id = (int) $existing['id'];
			$wpdb->update(
				Neo_Pulse_App_Teams_Store::users_table(),
				array(
					'password_hash' => password_hash( $password, PASSWORD_DEFAULT ),
					'display_name'  => $display_name !== '' ? $display_name : (string) $existing['display_name'],
				),
				array( 'id' => $user_id ),
				array( '%s', '%s' ),
				array( '%d' )
			);
		} else {
			$user_id = Neo_Pulse_App_Teams_Store::create_user( $email, $password, $display_name !== '' ? $display_name : $email );
		}

		if ( $user_id <= 0 ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Could not create user' ), 500 );
			return;
		}

		$teams = Neo_Pulse_App_Teams_Store::list_teams_for_user( $user_id );
		if ( count( $teams ) === 0 ) {
			Neo_Pulse_App_Teams_Store::create_team( $user_id, $team_name, $job_title );
		} else {
			$team_id = (int) $teams[0]['id'];
			$wpdb->update(
				$wpdb->prefix . 'neo_pulse_team_members',
				array(
					'access_role' => 'owner',
					'job_title'   => $job_title,
					'permissions_json' => wp_json_encode( Neo_Pulse_App_Teams_Store::permissions_for_role( 'owner' ) ),
				),
				array(
					'team_id' => $team_id,
					'user_id' => $user_id,
				),
				array( '%s', '%s', '%s' ),
				array( '%d', '%d' )
			);
		}

		$teams   = Neo_Pulse_App_Teams_Store::list_teams_for_user( $user_id );
		$team_id = count( $teams ) > 0 ? (int) $teams[0]['id'] : null;
		Neo_Pulse_App_Auth_Session::set_session( $user_id, $team_id );

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'   => true,
				'email'=> $email,
				'role' => 'owner',
				'team' => $team_name,
			)
		);
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function forgot( array $body ): void {
		$email = sanitize_email( strtolower( trim( (string) ( $body['email'] ?? '' ) ) ) );
		$user  = $email !== '' ? Neo_Pulse_App_Teams_Store::get_user_by_email( $email ) : null;
		if ( ! $user ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'No account for that email' ), 404 );
			return;
		}
		$token = bin2hex( random_bytes( 32 ) );
		$all   = get_option( 'neo_pulse_password_resets', array() );
		if ( ! is_array( $all ) ) {
			$all = array();
		}
		$all[ $email ] = array(
			'token_hash' => hash( 'sha256', $token ),
			'expires'    => time() + 1800,
		);
		update_option( 'neo_pulse_password_resets', $all, false );
		$link = self::reset_link( $token );
		$sent = self::send_reset_mail( $email, $link );
		if ( empty( $sent['ok'] ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => (string) ( $sent['error'] ?? 'Email was not sent' ) ), 500 );
			return;
		}
		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true ) );
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function reset_password( array $body ): void {
		$token    = trim( (string) ( $body['token'] ?? '' ) );
		$password = (string) ( $body['password'] ?? '' );
		if ( $token === '' || strlen( $password ) < 8 ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Password must be at least 8 characters' ), 400 );
			return;
		}
		$all = get_option( 'neo_pulse_password_resets', array() );
		if ( ! is_array( $all ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Reset link is not valid' ), 400 );
			return;
		}
		$wanted = hash( 'sha256', $token );
		$email  = '';
		foreach ( $all as $candidate => $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$known = (string) ( $row['token_hash'] ?? '' );
			if ( $known !== '' && hash_equals( $known, $wanted ) ) {
				$email = (string) $candidate;
				if ( (int) ( $row['expires'] ?? 0 ) < time() ) {
					unset( $all[ $email ] );
					update_option( 'neo_pulse_password_resets', $all, false );
					Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Reset link expired' ), 400 );
					return;
				}
				break;
			}
		}
		if ( $email === '' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Reset link is not valid' ), 400 );
			return;
		}
		$user = Neo_Pulse_App_Teams_Store::get_user_by_email( $email );
		if ( ! $user || ! Neo_Pulse_App_Teams_Store::update_user_password( (int) $user['id'], $password ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Could not save password' ), 500 );
			return;
		}
		unset( $all[ $email ] );
		update_option( 'neo_pulse_password_resets', $all, false );
		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true ) );
	}

	private static function reset_link( string $token ): string {
		$host = (string) wp_parse_url( home_url(), PHP_URL_HOST );
		$base = ( strpos( $host, 'onrender.com' ) !== false )
			? 'https://neo-pulse-static.onrender.com'
			: untrailingslashit( home_url() );
		return $base . '/login?reset=' . rawurlencode( $token );
	}

	/**
	 * Send from the existing changelog AgentMail inbox. Do not create an inbox.
	 *
	 * @return array{ok:bool,error?:string}
	 */
	private static function send_reset_mail( string $to, string $link ): array {
		$api_key = class_exists( 'Neo_Pulse_App_Secrets' ) ? Neo_Pulse_App_Secrets::agentmail_api_key() : '';
		$inbox   = $api_key !== '' ? self::changelog_inbox_id( $api_key ) : '';
		$text    = "Reset your Neo Pulse password.\n\n" . $link . "\n\nThis link expires in 30 minutes.\n";
		if ( $inbox === '' ) {
			return Neo_Pulse_App_Mail::send( $to, 'Reset your Neo Pulse password', $text );
		}
		$res = wp_remote_post(
			'https://api.agentmail.to/v0/inboxes/' . rawurlencode( $inbox ) . '/messages/send',
			array(
				'timeout' => 30,
				'headers' => array(
					'Authorization' => 'Bearer ' . $api_key,
					'Content-Type'  => 'application/json',
				),
				'body'    => wp_json_encode(
					array(
						'to'      => $to,
						'subject' => 'Reset your Neo Pulse password',
						'text'    => $text,
					)
				),
			)
		);
		if ( is_wp_error( $res ) ) {
			return array( 'ok' => false, 'error' => $res->get_error_message() );
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		if ( $code < 200 || $code >= 300 ) {
			return array( 'ok' => false, 'error' => 'AgentMail HTTP ' . $code );
		}
		return array( 'ok' => true );
	}

	private static function changelog_inbox_id( string $api_key ): string {
		$res = wp_remote_get(
			'https://api.agentmail.to/v0/inboxes',
			array(
				'timeout' => 20,
				'headers' => array(
					'Authorization' => 'Bearer ' . $api_key,
					'Accept'        => 'application/json',
				),
			)
		);
		if ( is_wp_error( $res ) ) {
			return '';
		}
		$data = json_decode( (string) wp_remote_retrieve_body( $res ), true );
		$list = array();
		if ( isset( $data['inboxes'] ) && is_array( $data['inboxes'] ) ) {
			$list = $data['inboxes'];
		} elseif ( is_array( $data ) ) {
			$list = $data;
		}
		foreach ( $list as $inbox ) {
			if ( ! is_array( $inbox ) ) {
				continue;
			}
			$username = (string) ( $inbox['username'] ?? '' );
			$address  = (string) ( $inbox['email'] ?? $inbox['address'] ?? '' );
			if ( $username === 'neo-pulse-changelog' || strpos( $address, 'neo-pulse-changelog' ) !== false ) {
				return (string) ( $inbox['inbox_id'] ?? $inbox['inboxId'] ?? $inbox['id'] ?? '' );
			}
		}
		return '';
	}
}
