<?php
/**
 * Teams DB schema and data access.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Teams_Store {

	const ACCESS_AREAS = array(
		'properties',
		'hosting',
		'api-keys',
		'master-rules',
		'ai-generation',
		'google',
		'email-agent-admin',
		'content-optimizer',
		'generator',
		'gsc-report',
		'sitemap',
		'communication',
		'teams',
	);

	public static function users_table(): string {
		global $wpdb;
		return $wpdb->prefix . 'neo-pulse_users';
	}

	public static function users_table_sql(): string {
		return '`' . self::users_table() . '`';
	}

	public static function install_tables(): void {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$charset = $wpdb->get_charset_collate();
		$users   = self::users_table_sql();
		$teams   = $wpdb->prefix . 'neo_pulse_teams';
		$members = $wpdb->prefix . 'neo_pulse_team_members';
		$invites = $wpdb->prefix . 'neo_pulse_team_invites';
		$presets = $wpdb->prefix . 'neo_pulse_team_job_title_presets';

		dbDelta(
			"CREATE TABLE {$users} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				email varchar(255) NOT NULL,
				password_hash varchar(255) NOT NULL,
				display_name varchar(255) NOT NULL DEFAULT '',
				avatar_url varchar(512) DEFAULT NULL,
				created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (id),
				UNIQUE KEY email (email)
			) {$charset};"
		);

		dbDelta(
			"CREATE TABLE {$teams} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				name varchar(255) NOT NULL,
				slug varchar(255) NOT NULL,
				owner_user_id bigint(20) unsigned NOT NULL,
				seat_limit int(11) NOT NULL DEFAULT 5,
				created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (id),
				UNIQUE KEY slug (slug),
				KEY owner_user_id (owner_user_id)
			) {$charset};"
		);

		dbDelta(
			"CREATE TABLE {$members} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				team_id bigint(20) unsigned NOT NULL,
				user_id bigint(20) unsigned NOT NULL,
				access_role varchar(32) NOT NULL DEFAULT 'viewer',
				job_title varchar(255) NOT NULL DEFAULT '',
				permissions_json longtext,
				profile_json longtext,
				status varchar(32) NOT NULL DEFAULT 'active',
				joined_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				last_active_at datetime DEFAULT NULL,
				PRIMARY KEY (id),
				UNIQUE KEY team_user (team_id, user_id),
				KEY team_id (team_id),
				KEY user_id (user_id)
			) {$charset};"
		);

		dbDelta(
			"CREATE TABLE {$invites} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				team_id bigint(20) unsigned NOT NULL,
				email varchar(255) NOT NULL,
				access_role varchar(32) NOT NULL DEFAULT 'viewer',
				job_title varchar(255) NOT NULL DEFAULT '',
				permissions_json longtext,
				token_hash varchar(64) NOT NULL,
				expires_at datetime NOT NULL,
				invited_by bigint(20) unsigned NOT NULL,
				created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (id),
				KEY team_id (team_id),
				KEY token_hash (token_hash)
			) {$charset};"
		);

		dbDelta(
			"CREATE TABLE {$presets} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				team_id bigint(20) unsigned NOT NULL,
				title varchar(255) NOT NULL,
				sort_order int(11) NOT NULL DEFAULT 0,
				PRIMARY KEY (id),
				KEY team_id (team_id)
			) {$charset};"
		);
	}

	/**
	 * @return array<string,array<string,bool>>
	 */
	public static function permissions_for_role( string $role ): array {
		$all_write = array();
		$all_read  = array();
		foreach ( self::ACCESS_AREAS as $area ) {
			$all_write[ $area ] = array( 'read' => true, 'write' => true );
			$all_read[ $area ]  = array( 'read' => true, 'write' => false );
		}

		switch ( $role ) {
			case 'owner':
			case 'admin':
				return $all_write;
			case 'editor':
				$perms = $all_read;
				foreach ( array( 'properties', 'hosting', 'content-optimizer', 'generator', 'gsc-report', 'sitemap', 'communication' ) as $area ) {
					$perms[ $area ] = array( 'read' => true, 'write' => true );
				}
				return $perms;
			case 'lead':
				$perms = self::permissions_for_role( 'editor' );
				foreach ( array( 'master-rules', 'ai-generation', 'google' ) as $area ) {
					$perms[ $area ] = array( 'read' => true, 'write' => true );
				}
				$perms['teams'] = array( 'read' => true, 'write' => false );
				return $perms;
			case 'viewer':
			default:
				return $all_read;
		}
	}

	/**
	 * @param mixed $json
	 * @return array<string,array<string,bool>>
	 */
	public static function decode_permissions( $json, string $access_role ): array {
		if ( is_string( $json ) && $json !== '' ) {
			$data = json_decode( $json, true );
			if ( is_array( $data ) ) {
				return $data;
			}
		}
		return self::permissions_for_role( $access_role );
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function get_user_by_id( int $user_id ): ?array {
		global $wpdb;
		$row = $wpdb->get_row(
			$wpdb->prepare(
				'SELECT id, email, display_name, avatar_url, created_at FROM ' . self::users_table_sql() . ' WHERE id = %d',
				$user_id
			),
			ARRAY_A
		);
		return is_array( $row ) ? $row : null;
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function get_user_by_email( string $email ): ?array {
		global $wpdb;
		$row = $wpdb->get_row(
			$wpdb->prepare(
				'SELECT * FROM ' . self::users_table_sql() . ' WHERE email = %s',
				sanitize_email( strtolower( trim( $email ) ) )
			),
			ARRAY_A
		);
		return is_array( $row ) ? $row : null;
	}

	/**
	 * Emails for the login picker. No password hashes.
	 *
	 * @return array<int,array{email:string,displayName:string}>
	 */
	public static function list_users_for_picker(): array {
		global $wpdb;
		$rows = $wpdb->get_results(
			'SELECT email, display_name FROM ' . self::users_table_sql() . ' ORDER BY email ASC',
			ARRAY_A
		);
		if ( ! is_array( $rows ) ) {
			return array();
		}
		$out = array();
		foreach ( $rows as $row ) {
			$email = isset( $row['email'] ) ? sanitize_email( strtolower( trim( (string) $row['email'] ) ) ) : '';
			if ( $email === '' ) {
				continue;
			}
			$out[] = array(
				'email'       => $email,
				'displayName' => isset( $row['display_name'] ) ? (string) $row['display_name'] : $email,
			);
		}
		return $out;
	}

	public static function create_user( string $email, string $password, string $display_name ): int {
		global $wpdb;
		$wpdb->insert(
			self::users_table(),
			array(
				'email'         => sanitize_email( strtolower( trim( $email ) ) ),
				'password_hash' => password_hash( $password, PASSWORD_DEFAULT ),
				'display_name'  => sanitize_text_field( $display_name ),
			),
			array( '%s', '%s', '%s' )
		);
		return (int) $wpdb->insert_id;
	}

	public static function verify_password( array $user, string $password ): bool {
		return ! empty( $user['password_hash'] ) && password_verify( $password, (string) $user['password_hash'] );
	}

	public static function update_user_password( int $user_id, string $password ): bool {
		if ( $user_id <= 0 || $password === '' ) {
			return false;
		}
		global $wpdb;
		$updated = $wpdb->update(
			self::users_table(),
			array( 'password_hash' => password_hash( $password, PASSWORD_DEFAULT ) ),
			array( 'id' => $user_id ),
			array( '%s' ),
			array( '%d' )
		);
		return $updated !== false;
	}

	public static function slugify( string $name ): string {
		$slug = sanitize_title( $name );
		if ( $slug === '' ) {
			$slug = 'team-' . wp_generate_password( 8, false );
		}
		return self::unique_slug( $slug );
	}

	private static function unique_slug( string $base ): string {
		global $wpdb;
		$slug = $base;
		$i    = 2;
		while ( $wpdb->get_var( $wpdb->prepare( 'SELECT id FROM ' . $wpdb->prefix . 'neo_pulse_teams WHERE slug = %s', $slug ) ) ) {
			$slug = $base . '-' . $i;
			++$i;
		}
		return $slug;
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	public static function list_teams_for_user( int $user_id ): array {
		global $wpdb;
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				'SELECT t.*, m.access_role, m.job_title
				FROM ' . $wpdb->prefix . 'neo_pulse_teams t
				INNER JOIN ' . $wpdb->prefix . 'neo_pulse_team_members m ON m.team_id = t.id
				WHERE m.user_id = %d AND m.status = %s
				ORDER BY t.name ASC',
				$user_id,
				'active'
			),
			ARRAY_A
		);
		return is_array( $rows ) ? $rows : array();
	}

	/**
	 * @return int[]
	 */
	public static function list_all_team_ids(): array {
		global $wpdb;
		$rows = $wpdb->get_col( 'SELECT id FROM ' . $wpdb->prefix . 'neo_pulse_teams ORDER BY id ASC' );
		if ( ! is_array( $rows ) ) {
			return array();
		}
		return array_values(
			array_filter(
				array_map( 'intval', $rows ),
				static function ( $id ) {
					return $id > 0;
				}
			)
		);
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function get_team( int $team_id ): ?array {
		global $wpdb;
		$row = $wpdb->get_row(
			$wpdb->prepare( 'SELECT * FROM ' . $wpdb->prefix . 'neo_pulse_teams WHERE id = %d', $team_id ),
			ARRAY_A
		);
		return is_array( $row ) ? $row : null;
	}

	public static function count_active_members( int $team_id ): int {
		global $wpdb;
		return (int) $wpdb->get_var(
			$wpdb->prepare(
				'SELECT COUNT(*) FROM ' . $wpdb->prefix . 'neo_pulse_team_members WHERE team_id = %d AND status = %s',
				$team_id,
				'active'
			)
		);
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function get_membership( int $team_id, int $user_id ): ?array {
		global $wpdb;
		$row = $wpdb->get_row(
			$wpdb->prepare(
				'SELECT * FROM ' . $wpdb->prefix . 'neo_pulse_team_members WHERE team_id = %d AND user_id = %d AND status = %s',
				$team_id,
				$user_id,
				'active'
			),
			ARRAY_A
		);
		return is_array( $row ) ? $row : null;
	}

	/**
	 * @param array<string,mixed> $team
	 * @param array<string,mixed> $membership
	 * @return array<string,mixed>
	 */
	public static function format_team_payload( array $team, array $membership ): array {
		$active = self::count_active_members( (int) $team['id'] );
		return array(
			'id'          => (int) $team['id'],
			'name'        => (string) $team['name'],
			'slug'        => (string) $team['slug'],
			'seatLimit'   => (int) $team['seat_limit'],
			'seatsUsed'   => $active,
			'accessRole'  => (string) $membership['access_role'],
			'jobTitle'    => (string) $membership['job_title'],
			'permissions' => self::decode_permissions( $membership['permissions_json'] ?? null, (string) $membership['access_role'] ),
			'createdAt'   => (string) $team['created_at'],
		);
	}

	public static function create_team( int $owner_id, string $name, string $owner_job_title ): array {
		global $wpdb;
		$slug    = self::slugify( $name );
		$wpdb->insert(
			$wpdb->prefix . 'neo_pulse_teams',
			array(
				'name'          => sanitize_text_field( $name ),
				'slug'          => $slug,
				'owner_user_id' => $owner_id,
				'seat_limit'    => 9999,
			),
			array( '%s', '%s', '%d', '%d' )
		);
		$team_id = (int) $wpdb->insert_id;
		$perms   = wp_json_encode( self::permissions_for_role( 'owner' ) );
		$wpdb->insert(
			$wpdb->prefix . 'neo_pulse_team_members',
			array(
				'team_id'          => $team_id,
				'user_id'          => $owner_id,
				'access_role'      => 'owner',
				'job_title'        => sanitize_text_field( $owner_job_title ),
				'permissions_json' => $perms,
				'profile_json'     => wp_json_encode( array() ),
				'status'           => 'active',
			),
			array( '%d', '%d', '%s', '%s', '%s', '%s', '%s' )
		);
		self::seed_job_title_presets( $team_id );
		if ( class_exists( 'Neo_Pulse_App_Chat_Flo' ) ) {
			Neo_Pulse_App_Chat_Flo::ensure_team_member( $team_id );
		}
		$team = self::get_team( $team_id );
		$mem  = self::get_membership( $team_id, $owner_id );
		return self::format_team_payload( $team ?: array(), $mem ?: array() );
	}

	private static function seed_job_title_presets( int $team_id ): void {
		global $wpdb;
		$titles = array(
			'Lead SEO/AI Developer',
			'Lead',
			'SEO Specialist',
			'Content Writer',
			'Account Director',
			'Account Manager',
		);
		foreach ( $titles as $i => $title ) {
			$wpdb->insert(
				$wpdb->prefix . 'neo_pulse_team_job_title_presets',
				array(
					'team_id'    => $team_id,
					'title'      => $title,
					'sort_order' => $i,
				),
				array( '%d', '%s', '%d' )
			);
		}
	}

	/** @param int $team_id */
	public static function ensure_job_title_presets( int $team_id ): void {
		global $wpdb;
		$titles = array(
			'Lead SEO/AI Developer',
			'Lead',
			'SEO Specialist',
			'Content Writer',
			'Account Director',
			'Account Manager',
		);
		$table = $wpdb->prefix . 'neo_pulse_team_job_title_presets';
		foreach ( $titles as $i => $title ) {
			$exists = $wpdb->get_var(
				$wpdb->prepare(
					'SELECT id FROM ' . $table . ' WHERE team_id = %d AND title = %s',
					$team_id,
					$title
				)
			);
			if ( ! $exists ) {
				$wpdb->insert(
					$table,
					array(
						'team_id'    => $team_id,
						'title'      => $title,
						'sort_order' => $i,
					),
					array( '%d', '%s', '%d' )
				);
			}
		}
	}

	public static function add_job_title_preset( int $team_id, string $title ): array {
		$title = sanitize_text_field( trim( $title ) );
		if ( $title === '' ) {
			return array( 'ok' => false, 'error' => 'Title required' );
		}
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_job_title_presets';
		$exists = $wpdb->get_var(
			$wpdb->prepare(
				'SELECT id FROM ' . $table . ' WHERE team_id = %d AND title = %s',
				$team_id,
				$title
			)
		);
		if ( $exists ) {
			return array(
				'ok'     => true,
				'preset' => array(
					'title'     => $title,
					'sortOrder' => (int) $wpdb->get_var(
						$wpdb->prepare(
							'SELECT sort_order FROM ' . $table . ' WHERE team_id = %d AND title = %s',
							$team_id,
							$title
						)
					),
				),
			);
		}
		$sort_order = (int) $wpdb->get_var(
			$wpdb->prepare(
				'SELECT COALESCE(MAX(sort_order), -1) + 1 FROM ' . $table . ' WHERE team_id = %d',
				$team_id
			)
		);
		$inserted = $wpdb->insert(
			$table,
			array(
				'team_id'    => $team_id,
				'title'      => $title,
				'sort_order' => $sort_order,
			),
			array( '%d', '%s', '%d' )
		);
		if ( ! $inserted ) {
			return array( 'ok' => false, 'error' => 'Could not save title' );
		}
		return array(
			'ok'     => true,
			'preset' => array(
				'title'     => $title,
				'sortOrder' => $sort_order,
			),
		);
	}

	/**
	 * Add an existing NEO Pulse user to a team, or reactivate a removed member.
	 *
	 * @return array<string,mixed>
	 */
	public static function add_member( int $team_id, int $user_id, string $access_role, string $job_title ): array {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_members';
		$perms = wp_json_encode( self::permissions_for_role( $access_role ) );
		$row   = $wpdb->get_row(
			$wpdb->prepare(
				'SELECT * FROM ' . $table . ' WHERE team_id = %d AND user_id = %d',
				$team_id,
				$user_id
			),
			ARRAY_A
		);

		if ( is_array( $row ) ) {
			if ( (string) $row['status'] === 'active' ) {
				return array( 'ok' => false, 'error' => 'User is already on this team' );
			}
			$updated = $wpdb->update(
				$table,
				array(
					'access_role'      => $access_role,
					'job_title'        => sanitize_text_field( $job_title ),
					'permissions_json' => $perms,
					'profile_json'     => wp_json_encode( array() ),
					'status'           => 'active',
				),
				array(
					'team_id' => $team_id,
					'user_id' => $user_id,
				),
				array( '%s', '%s', '%s', '%s', '%s' ),
				array( '%d', '%d' )
			);
			if ( $updated === false ) {
				return array( 'ok' => false, 'error' => 'Could not add member' );
			}
		} else {
			$inserted = $wpdb->insert(
				$table,
				array(
					'team_id'          => $team_id,
					'user_id'          => $user_id,
					'access_role'      => $access_role,
					'job_title'        => sanitize_text_field( $job_title ),
					'permissions_json' => $perms,
					'profile_json'     => wp_json_encode( array() ),
					'status'           => 'active',
				),
				array( '%d', '%d', '%s', '%s', '%s', '%s', '%s' )
			);
			if ( ! $inserted ) {
				return array( 'ok' => false, 'error' => 'Could not add member' );
			}
		}

		return array( 'ok' => true );
	}

	/**
	 * Create or reuse a NEO Pulse user and add them to a team (no email).
	 *
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>
	 */
	public static function provision_member( int $team_id, array $body ): array {
		$email        = isset( $body['email'] ) ? sanitize_email( strtolower( trim( (string) $body['email'] ) ) ) : '';
		$access_role  = isset( $body['accessRole'] ) ? sanitize_text_field( (string) $body['accessRole'] ) : 'viewer';
		$job_title    = isset( $body['jobTitle'] ) ? sanitize_text_field( (string) $body['jobTitle'] ) : '';
		$password     = isset( $body['password'] ) ? (string) $body['password'] : '';
		$display_name = isset( $body['displayName'] ) ? sanitize_text_field( (string) $body['displayName'] ) : '';

		if ( $email === '' || ! is_email( $email ) ) {
			return array( 'ok' => false, 'error' => 'Valid email required' );
		}

		$user = self::get_user_by_email( $email );
		if ( $user ) {
			$user_id = (int) $user['id'];
		} else {
			if ( $password === '' ) {
				return array( 'ok' => false, 'error' => 'Password required for new accounts' );
			}
			$user_id = self::create_user( $email, $password, $display_name !== '' ? $display_name : $email );
			if ( $user_id <= 0 ) {
				return array( 'ok' => false, 'error' => 'Could not create user' );
			}
		}

		$result = self::add_member( $team_id, $user_id, $access_role, $job_title );
		if ( empty( $result['ok'] ) ) {
			return $result;
		}

		global $wpdb;
		$wpdb->delete(
			$wpdb->prefix . 'neo_pulse_team_invites',
			array(
				'team_id' => $team_id,
				'email'   => $email,
			),
			array( '%d', '%s' )
		);

		$members = self::list_members( $team_id );
		$found   = null;
		foreach ( $members as $member ) {
			if ( (int) $member['userId'] === $user_id ) {
				$found = $member;
				break;
			}
		}

		return array(
			'ok'     => true,
			'member' => $found,
		);
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	public static function list_members( int $team_id ): array {
		if ( class_exists( 'Neo_Pulse_App_Chat_Flo' ) ) {
			Neo_Pulse_App_Chat_Flo::ensure_team_member( $team_id );
		}
		global $wpdb;
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				'SELECT m.*, u.email, u.display_name, u.avatar_url
				FROM ' . $wpdb->prefix . 'neo_pulse_team_members m
				INNER JOIN ' . self::users_table_sql() . ' u ON u.id = m.user_id
				WHERE m.team_id = %d AND m.status = %s
				ORDER BY m.joined_at ASC',
				$team_id,
				'active'
			),
			ARRAY_A
		);
		if ( ! is_array( $rows ) ) {
			return array();
		}
		$out = array();
		foreach ( $rows as $row ) {
			$profile = json_decode( (string) ( $row['profile_json'] ?? '{}' ), true );
			$out[]   = array(
				'userId'      => (int) $row['user_id'],
				'email'       => (string) $row['email'],
				'displayName' => (string) $row['display_name'],
				'avatarUrl'   => $row['avatar_url'],
				'accessRole'  => (string) $row['access_role'],
				'jobTitle'    => (string) $row['job_title'],
				'permissions' => self::decode_permissions( $row['permissions_json'] ?? null, (string) $row['access_role'] ),
				'profile'     => is_array( $profile ) ? $profile : array(),
				'joinedAt'    => (string) $row['joined_at'],
				'lastActiveAt'=> $row['last_active_at'],
				'isBot'       => class_exists( 'Neo_Pulse_App_Chat_Flo' ) && Neo_Pulse_App_Chat_Flo::is_flo( (int) $row['user_id'] ),
			);
		}
		return $out;
	}

	public static function can_write( array $membership, string $area ): bool {
		$perms = self::decode_permissions( $membership['permissions_json'] ?? null, (string) $membership['access_role'] );
		return ! empty( $perms[ $area ]['write'] );
	}

	public static function can_read( array $membership, string $area ): bool {
		$perms = self::decode_permissions( $membership['permissions_json'] ?? null, (string) $membership['access_role'] );
		return ! empty( $perms[ $area ]['read'] ) || ! empty( $perms[ $area ]['write'] );
	}

	public static function team_workspace_path( int $team_id ): string {
		return Neo_Pulse_App_Data_Paths::subdir( 'teams/' . (string) $team_id ) . '/workspace.json';
	}
}
