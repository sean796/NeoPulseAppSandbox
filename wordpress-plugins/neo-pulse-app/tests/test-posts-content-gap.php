<?php
/**
 * Posts content gap schedule + recipe registration smoke test.
 *
 * Run via: php wordpress-plugins/neo-pulse-app/tests/test-posts-content-gap.php
 *
 * @package Neo_Pulse_App
 */

$plugin_dir = dirname( __DIR__ );

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', sys_get_temp_dir() . '/neo-pulse-posts-gap-test-abspath/' );
}
if ( ! is_dir( ABSPATH ) ) {
	mkdir( ABSPATH, 0777, true );
}

if ( ! class_exists( 'WP_Error' ) ) {
	class WP_Error {
		/** @var array<string,array<int,string>> */
		public $errors = array();

		public function __construct( $code = '', $message = '', $data = '' ) {
			$this->errors[ (string) $code ] = array( (string) $message );
		}

		public function get_error_message() {
			foreach ( $this->errors as $messages ) {
				return (string) ( $messages[0] ?? '' );
			}
			return '';
		}
	}
}

if ( ! function_exists( 'is_wp_error' ) ) {
	function is_wp_error( $thing ) {
		return $thing instanceof WP_Error;
	}
}
if ( ! function_exists( 'sanitize_key' ) ) {
	function sanitize_key( $key ) {
		$key = strtolower( (string) $key );
		return preg_replace( '/[^a-z0-9_\-]/', '', $key );
	}
}
if ( ! function_exists( 'sanitize_text_field' ) ) {
	function sanitize_text_field( $str ) {
		return trim( (string) $str );
	}
}
if ( ! function_exists( 'wp_json_encode' ) ) {
	function wp_json_encode( $data ) {
		return json_encode( $data );
	}
}

require_once $plugin_dir . '/includes/storage/class-neo-pulse-data-paths.php';
require_once $plugin_dir . '/includes/posts-content-gap/class-posts-content-gap-schedule.php';
require_once $plugin_dir . '/includes/posts-content-gap/class-posts-content-gap-pipeline.php';
require_once $plugin_dir . '/includes/agent-runs/class-agent-runs-recipe-registry.php';
require_once $plugin_dir . '/includes/skills-library/class-skills-library-store.php';

$failures = 0;

function assert_true( $cond, $message ) {
	global $failures;
	if ( ! $cond ) {
		fwrite( STDERR, "FAIL: {$message}\n" );
		$failures++;
		return;
	}
	fwrite( STDOUT, "OK: {$message}\n" );
}

$defaults = Neo_Pulse_App_Posts_Content_Gap_Schedule::defaults();
assert_true( $defaults['time'] === '07:00', 'default schedule time is 07:00' );
assert_true( $defaults['timezone'] === 'America/Edmonton', 'default timezone is America/Edmonton' );

$normalized = Neo_Pulse_App_Posts_Content_Gap_Schedule::normalize(
	array(
		'enabled' => true,
		'time'    => '7:00',
	)
);
assert_true( $normalized['time'] === '07:00', 'normalizes time to HH:MM' );

assert_true(
	Neo_Pulse_App_Agent_Runs_Recipe_Registry::is_valid( 'posts_content_gap_check' ),
	'recipe posts_content_gap_check is registered'
);

$resolved = Neo_Pulse_App_Skills_Library_Store::resolve_skill_id( 'content-posts-gap-check' );
assert_true( $resolved === 'content.posts.gap-check', 'skills library resolves content-posts-gap-check slug' );

$prompts_ok = Neo_Pulse_App_Skills_Library_Store::validate_prompts(
	array(
		'schedule' => array(
			'system'       => 'Return JSON only.',
			'userTemplate' => 'Count: {countJson}',
		),
	),
	'content.posts.gap-check'
);
assert_true( $prompts_ok === true, 'schedule prompts validate for posts gap skill' );

$bad = Neo_Pulse_App_Skills_Library_Store::validate_prompts(
	array(
		'fieldCopy' => array( 'base' => 'x' ),
		'checklist' => array( 'system' => 'x' ),
	),
	'content.posts.gap-check'
);
assert_true( is_wp_error( $bad ), 'posts gap prompts require schedule object' );

assert_true(
	Neo_Pulse_App_Posts_Content_Gap_Pipeline::blogs_per_month_for_site( array( 'name' => 'Tailored Interiors' ) ) === 2,
	'Tailored Interiors is standard (2 blogs)'
);
assert_true(
	Neo_Pulse_App_Posts_Content_Gap_Pipeline::blogs_per_month_for_site( array( 'name' => 'Advance Blinds' ) ) === 1,
	'Advance Blinds is lite (1 blog)'
);

$count_fixture = array(
	'siteId'          => 'tailored-interiors',
	'month'           => '2026-12',
	'gap'             => 2,
	'occupiedDates'   => array( '2026-12-05' ),
	'lastAllowedDay'  => '2026-12-26',
	'publishTimeHint' => '09:00',
);
$valid = Neo_Pulse_App_Posts_Content_Gap_Pipeline::validate_schedule_plan(
	$count_fixture,
	array(
		'publishDates' => array( '2026-12-10', '2026-12-17' ),
		'publishTime'  => '09:00',
	)
);
assert_true( ! empty( $valid['ok'] ), 'valid schedule plan passes' );

$occupied_fail = Neo_Pulse_App_Posts_Content_Gap_Pipeline::validate_schedule_plan(
	$count_fixture,
	array(
		'publishDates' => array( '2026-12-05', '2026-12-17' ),
		'publishTime'  => '09:00',
	)
);
assert_true( empty( $occupied_fail['ok'] ), 'occupied date fails validation' );

$payload = Neo_Pulse_App_Posts_Content_Gap_Pipeline::build_post_creator_payload(
	$count_fixture,
	$valid['plan']
);
assert_true(
	( $payload['keywordSource'] ?? '' ) === 'gsc' && ( $payload['postCount'] ?? 0 ) === 2,
	'Blog Ideas payload uses GSC and gap count'
);

if ( $failures > 0 ) {
	fwrite( STDERR, "{$failures} failure(s)\n" );
	exit( 1 );
}

fwrite( STDOUT, "All posts content gap checks passed.\n" );
exit( 0 );
