<?php
/**
 * Money-page internal links schedule + recipe + skills library smoke test.
 *
 * Run via: php wordpress-plugins/neo-pulse-app/tests/test-money-page-internal-links.php
 *
 * @package Neo_Pulse_App
 */

$plugin_dir = dirname( __DIR__ );

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', sys_get_temp_dir() . '/neo-pulse-money-links-test-abspath/' );
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
if ( ! function_exists( 'sanitize_email' ) ) {
	function sanitize_email( $email ) {
		return filter_var( (string) $email, FILTER_SANITIZE_EMAIL );
	}
}
if ( ! function_exists( 'is_email' ) ) {
	function is_email( $email ) {
		return (bool) filter_var( (string) $email, FILTER_VALIDATE_EMAIL );
	}
}
if ( ! function_exists( 'wp_json_encode' ) ) {
	function wp_json_encode( $data ) {
		return json_encode( $data );
	}
}

require_once $plugin_dir . '/includes/storage/class-neo-pulse-data-paths.php';
require_once $plugin_dir . '/includes/money-page-internal-links/class-money-page-internal-links-schedule.php';
require_once $plugin_dir . '/includes/money-page-internal-links/class-money-page-internal-links-pipeline.php';
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

$defaults = Neo_Pulse_App_Money_Page_Internal_Links_Schedule::defaults();
assert_true( $defaults['time'] === '07:30', 'default schedule time is 07:30' );
assert_true( $defaults['timezone'] === 'America/Edmonton', 'default timezone is America/Edmonton' );
assert_true( $defaults['to'] === 'sean@neodigital.ca', 'default report recipient is sean@neodigital.ca' );
assert_true(
	Neo_Pulse_App_Money_Page_Internal_Links_Schedule::AGENT_ID === 'content.internal-links.money-pages',
	'assignable agent id matches'
);

$normalized = Neo_Pulse_App_Money_Page_Internal_Links_Schedule::normalize(
	array(
		'enabled' => true,
		'time'    => '7:30',
		'to'      => 'Sean@NeoDigital.ca',
	)
);
assert_true( $normalized['time'] === '07:30', 'normalizes time to HH:MM' );
assert_true( $normalized['to'] === 'sean@neodigital.ca', 'normalizes report recipient email' );

assert_true(
	Neo_Pulse_App_Agent_Runs_Recipe_Registry::is_valid( 'money_page_internal_links' ),
	'recipe money_page_internal_links is registered'
);

$resolved = Neo_Pulse_App_Skills_Library_Store::resolve_skill_id( 'content-internal-links-money-pages' );
assert_true( $resolved === 'content.internal-links.money-pages', 'skills library resolves money links slug' );

$prompts_ok = Neo_Pulse_App_Skills_Library_Store::validate_prompts(
	array(
		'linkPlan' => array(
			'system'       => 'Return JSON only.',
			'userTemplate' => 'Inventory: {inventoryJson}',
		),
	),
	'content.internal-links.money-pages'
);
assert_true( $prompts_ok === true, 'linkPlan prompts validate for money links skill' );

$bad = Neo_Pulse_App_Skills_Library_Store::validate_prompts(
	array(
		'schedule' => array(
			'system'       => 'x',
			'userTemplate' => 'x',
		),
	),
	'content.internal-links.money-pages'
);
assert_true( is_wp_error( $bad ), 'money links prompts require linkPlan object' );

$blocked = Neo_Pulse_App_Money_Page_Internal_Links_Pipeline::build_inventory(
	array(
		'id'      => 'custom-shades',
		'name'    => 'Custom Shades of London',
		'siteUrl' => 'https://www.customshadesoflondon.ca/',
	)
);
assert_true( is_wp_error( $blocked ), 'Custom Shades is blocked until Neo MCP is approved' );

if ( $failures > 0 ) {
	fwrite( STDERR, "\n{$failures} failure(s)\n" );
	exit( 1 );
}

fwrite( STDOUT, "\nAll money-page internal links smoke checks passed.\n" );
exit( 0 );
