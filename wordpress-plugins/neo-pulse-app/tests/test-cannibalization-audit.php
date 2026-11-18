<?php
/**
 * Smoke: Cannibalization Audit recipe + skills library slug.
 *
 * Run: php wordpress-plugins/neo-pulse-app/tests/test-cannibalization-audit.php
 *
 * @package Neo_Pulse_App
 */

$plugin_dir = dirname( __DIR__ );

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', sys_get_temp_dir() . '/neo-pulse-cannibalization-audit-test-abspath/' );
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
if ( ! function_exists( 'sanitize_key' ) ) {
	function sanitize_key( $key ) {
		$key = strtolower( (string) $key );
		return preg_replace( '/[^a-z0-9_\-]/', '', $key );
	}
}

require_once $plugin_dir . '/includes/agent-runs/class-agent-runs-recipe-registry.php';
require_once $plugin_dir . '/includes/skills-library/class-skills-library-store.php';

function assert_true( $cond, string $message ): void {
	if ( ! $cond ) {
		fwrite( STDERR, "FAIL: {$message}\n" );
		exit( 1 );
	}
	fwrite( STDOUT, "OK: {$message}\n" );
}

assert_true(
	Neo_Pulse_App_Agent_Runs_Recipe_Registry::is_valid( 'cannibalization_audit' ),
	'recipe cannibalization_audit is registered'
);

$resolved = Neo_Pulse_App_Skills_Library_Store::resolve_skill_id( 'cannibalization-audit' );
assert_true( ! ( $resolved instanceof WP_Error ) && $resolved === 'content.blog.cannibalization-audit', 'skills library resolves cannibalization-audit slug' );

$resolved2 = Neo_Pulse_App_Skills_Library_Store::resolve_skill_id( 'content.blog.cannibalization-audit' );
assert_true( ! ( $resolved2 instanceof WP_Error ) && $resolved2 === 'content.blog.cannibalization-audit', 'skills library resolves full assignable id' );

fwrite( STDOUT, "All cannibalization-audit smoke checks passed.\n" );
