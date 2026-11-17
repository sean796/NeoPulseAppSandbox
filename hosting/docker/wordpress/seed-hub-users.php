<?php
/**
 * Copy local Pulse accounts onto a new hub.
 * Reads NEO_PULSE_HUB_USER_SEED_B64 (mysqldump). Does not print password hashes.
 *
 * @package Neo_Pulse
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit( 1 );
}

/**
 * @param string $sql Full dump.
 * @param string $needle Statement start.
 */
function neo_pulse_seed_statement( string $sql, string $needle ): string {
	$start = strpos( $sql, $needle );
	if ( $start === false ) {
		return '';
	}
	$len    = strlen( $sql );
	$quoted = false;
	for ( $i = $start; $i < $len; $i++ ) {
		$char = $sql[ $i ];
		if ( $quoted ) {
			if ( $char === '\\' ) {
				$i++;
				continue;
			}
			if ( $char === "'" ) {
				$quoted = false;
			}
			continue;
		}
		if ( $char === "'" ) {
			$quoted = true;
			continue;
		}
		if ( $char === ';' ) {
			return substr( $sql, $start, $i - $start + 1 );
		}
	}
	return '';
}

$encoded = trim( (string) getenv( 'NEO_PULSE_HUB_USER_SEED_B64' ) );
$sql     = $encoded !== '' ? base64_decode( $encoded, true ) : false;
if ( ! is_string( $sql ) || $sql === '' ) {
	WP_CLI::error( 'Hub user seed is empty.' );
}

$statement = neo_pulse_seed_statement( $sql, 'INSERT INTO `wp_neo-pulse_users`' );
if ( $statement === '' ) {
	WP_CLI::error( 'Hub user seed is missing the users insert.' );
}

global $wpdb;
$users = Neo_Pulse_App_Teams_Store::users_table();
$wpdb->query( 'DROP TEMPORARY TABLE IF EXISTS neo_seed_users' );
$created = $wpdb->query( 'CREATE TEMPORARY TABLE neo_seed_users LIKE `' . esc_sql( $users ) . '`' );
if ( $created === false ) {
	WP_CLI::error( 'Could not stage hub users.' );
}

$staged = str_replace( 'INSERT INTO `wp_neo-pulse_users`', 'INSERT INTO neo_seed_users', $statement );
if ( $wpdb->query( $staged ) === false ) {
	WP_CLI::error( 'Could not read hub user seed.' );
}

$rows = $wpdb->get_results( 'SELECT email, password_hash, display_name, avatar_url FROM neo_seed_users', ARRAY_A );
if ( ! is_array( $rows ) || $rows === array() ) {
	WP_CLI::error( 'Hub user seed has no accounts.' );
}

$want = array( 'sean@neodigital.ca' => false, 'pulse@neodigital.ca' => false );
foreach ( $rows as $row ) {
	if ( ! is_array( $row ) ) {
		continue;
	}
	$email = strtolower( trim( (string) $row['email'] ) );
	$hash  = (string) $row['password_hash'];
	if ( $email === '' || $hash === '' ) {
		continue;
	}
	$existing = Neo_Pulse_App_Teams_Store::get_user_by_email( $email );
	if ( is_array( $existing ) ) {
		$updated = $wpdb->update(
			$users,
			array(
				'password_hash' => $hash,
				'display_name'  => (string) $row['display_name'],
			),
			array( 'id' => (int) $existing['id'] ),
			array( '%s', '%s' ),
			array( '%d' )
		);
		if ( $updated === false ) {
			WP_CLI::error( 'Could not update ' . $email );
		}
	} else {
		$inserted = $wpdb->insert(
			$users,
			array(
				'email'         => $email,
				'password_hash' => $hash,
				'display_name'  => (string) $row['display_name'],
				'avatar_url'    => isset( $row['avatar_url'] ) ? (string) $row['avatar_url'] : null,
			),
			array( '%s', '%s', '%s', '%s' )
		);
		if ( ! $inserted ) {
			WP_CLI::error( 'Could not add ' . $email );
		}
	}
	if ( array_key_exists( $email, $want ) ) {
		$want[ $email ] = true;
	}
}

foreach ( $want as $email => $ok ) {
	if ( ! $ok ) {
		WP_CLI::error( 'Seed did not include ' . $email );
	}
}

$pulse = Neo_Pulse_App_Teams_Store::get_user_by_email( 'pulse@neodigital.ca' );
$sean  = Neo_Pulse_App_Teams_Store::get_user_by_email( 'sean@neodigital.ca' );
if ( ! is_array( $pulse ) || ! is_array( $sean ) ) {
	WP_CLI::error( 'Restored accounts could not be read back.' );
}

$team_id = (int) $wpdb->get_var(
	$wpdb->prepare(
		'SELECT id FROM ' . $wpdb->prefix . 'neo_pulse_teams WHERE slug = %s',
		'neo-digital-inc'
	)
);
if ( $team_id <= 0 ) {
	Neo_Pulse_App_Teams_Store::create_team( (int) $pulse['id'], 'Neo Digital Inc.', 'Lead SEO/AI Developer' );
	$team_id = (int) $wpdb->get_var(
		$wpdb->prepare(
			'SELECT id FROM ' . $wpdb->prefix . 'neo_pulse_teams WHERE slug = %s',
			'neo-digital-inc'
		)
	);
}
if ( $team_id <= 0 ) {
	WP_CLI::error( 'Could not create the Neo Digital team.' );
}

$membership = Neo_Pulse_App_Teams_Store::get_membership( $team_id, (int) $sean['id'] );
if ( ! is_array( $membership ) ) {
	$added = Neo_Pulse_App_Teams_Store::add_member( $team_id, (int) $sean['id'], 'owner', 'Lead SEO/AI Developer' );
	if ( empty( $added['ok'] ) ) {
		WP_CLI::error( 'Could not add sean@neodigital.ca to the team.' );
	}
}

WP_CLI::log( 'Restored sean@neodigital.ca on team ' . $team_id );
