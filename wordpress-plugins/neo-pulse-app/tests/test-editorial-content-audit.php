<?php
/**
 * Smoke tests for editorial content audit helpers.
 *
 * Run: php wordpress-plugins/neo-pulse-app/tests/test-editorial-content-audit.php
 *
 * @package Neo_Pulse_App
 */

$plugin_dir = dirname( __DIR__ );

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', sys_get_temp_dir() . '/neo-pulse-editorial-audit-test-abspath/' );
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
if ( ! function_exists( 'sanitize_email' ) ) {
	function sanitize_email( $email ) {
		$email = strtolower( trim( (string) $email ) );
		return filter_var( $email, FILTER_SANITIZE_EMAIL ) ?: '';
	}
}
if ( ! function_exists( 'is_email' ) ) {
	function is_email( $email ) {
		return (bool) filter_var( (string) $email, FILTER_VALIDATE_EMAIL );
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
if ( ! function_exists( 'wp_strip_all_tags' ) ) {
	function wp_strip_all_tags( $string ) {
		return trim( strip_tags( (string) $string ) );
	}
}

require_once $plugin_dir . '/includes/editorial-content-audit/class-editorial-content-audit-schedule.php';
require_once $plugin_dir . '/includes/editorial-content-audit/class-editorial-content-audit-worker.php';
require_once $plugin_dir . '/includes/agent-runs/class-agent-runs-recipe-registry.php';
require_once $plugin_dir . '/includes/skills-library/class-skills-library-store.php';

$failed = 0;

function assert_true( $cond, $msg ) {
	global $failed;
	if ( $cond ) {
		echo "OK  $msg\n";
		return;
	}
	++$failed;
	echo "FAIL $msg\n";
}

$defaults = Neo_Pulse_App_Editorial_Content_Audit_Schedule::defaults();
assert_true( ( $defaults['to'] ?? '' ) === 'sean@neodigital.ca', 'default recipient is sean@neodigital.ca' );
assert_true( Neo_Pulse_App_Editorial_Content_Audit_Schedule::AGENT_ID === 'content.editorial.audit', 'agent id matches assignableId' );

$norm = Neo_Pulse_App_Editorial_Content_Audit_Schedule::normalize(
	array(
		'to'   => 'not-an-email',
		'time' => 'not-a-time',
	)
);
assert_true( $norm['to'] === 'sean@neodigital.ca', 'bad email falls back to default' );
assert_true( $norm['time'] === '08:00', 'bad time falls back to default' );

$blind = Neo_Pulse_App_Editorial_Content_Audit_Worker::public_name(
	array(
		'id'      => 'wp-1791924906059-12',
		'name'    => 'Shutter Spot',
		'siteUrl' => 'https://shutterspot.com/',
	)
);
assert_true( $blind === 'Blind Spot', 'Blind Spot public name for shutterspot.com' );

$prop = Neo_Pulse_App_Editorial_Content_Audit_Worker::property_context(
	array(
		'name'           => 'In the Shade',
		'siteUrl'        => 'https://intheshadeflorida.com',
		'serviceCity'    => 'Stuart',
		'serviceState'   => 'Florida',
		'serviceCountry' => 'United States',
		'locations'      => array(
			array(
				'city'  => 'Stuart',
				'state' => 'Florida',
				'phone' => '+1-772-223-1212',
			),
			array(
				'city'  => 'Port St. Lucie',
				'phone' => '(772) 607-9911',
			),
		),
		'napInfo'        => array(
			'name'  => 'In The Shade',
			'phone' => '+1-772-223-1212',
		),
	)
);
assert_true( $prop['name'] === 'In The Shade', 'NAP name wins for public brand' );
assert_true( in_array( 'Stuart', $prop['cities'], true ), 'service city listed' );
assert_true( in_array( 'Port St. Lucie', $prop['cities'], true ), 'additional city listed' );

$empty_rollup = Neo_Pulse_App_Editorial_Content_Audit_Worker::rollup(
	array(),
	array(
		'pageCount' => 2,
		'siteName'  => 'Test',
	)
);
assert_true( is_array( $empty_rollup ) && ! is_wp_error( $empty_rollup ), 'empty findings rollup works without OpenRouter' );
assert_true( (int) ( $empty_rollup['counts']['findingCount'] ?? -1 ) === 0, 'empty rollup finding count is 0' );

assert_true(
	Neo_Pulse_App_Editorial_Content_Audit_Worker::BATCH_SIZE === 1,
	'audit processes one page per tick'
);
assert_true(
	Neo_Pulse_App_Editorial_Content_Audit_Worker::DRIVE_EVERY === 1,
	'Drive progress writes after every page'
);

assert_true(
	Neo_Pulse_App_Agent_Runs_Recipe_Registry::is_valid( 'editorial_content_audit' ),
	'recipe editorial_content_audit is registered'
);

$resolved = Neo_Pulse_App_Skills_Library_Store::resolve_skill_id( 'editorial-content-audit' );
assert_true( $resolved === 'content.editorial.audit', 'skills library resolves editorial-content-audit slug' );

if ( $failed > 0 ) {
	echo "\n$failed assertion(s) failed\n";
	exit( 1 );
}
echo "\nAll editorial content audit smoke tests passed\n";
exit( 0 );
