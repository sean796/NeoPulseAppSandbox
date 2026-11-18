<?php
/**
 * Cannibalization map: collapse chains to one keeper.
 *
 * Run: php wordpress-plugins/neo-pulse-app/tests/test-cannibalization-audit-map.php
 *
 * @package Neo_Pulse_App
 */

$plugin_dir = dirname( __DIR__ );

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', sys_get_temp_dir() . '/neo-pulse-cannibalization-audit-map/' );
}
if ( ! is_dir( ABSPATH ) ) {
	mkdir( ABSPATH, 0777, true );
}
if ( ! function_exists( 'wp_parse_url' ) ) {
	function wp_parse_url( $url, $component = -1 ) {
		return parse_url( $url, $component );
	}
}
if ( ! function_exists( 'untrailingslashit' ) ) {
	function untrailingslashit( $value ) {
		return rtrim( (string) $value, '/\\' );
	}
}

require_once $plugin_dir . '/includes/cannibalization-audit/class-cannibalization-audit-pipeline.php';

function assert_true( $cond, string $message ): void {
	if ( ! $cond ) {
		fwrite( STDERR, "FAIL: {$message}\n" );
		exit( 1 );
	}
	fwrite( STDOUT, "OK: {$message}\n" );
}

$by_url = array(
	'https://blindmagic.com/blog/roman-shades'      => array( 'url' => 'https://blindmagic.com/blog/roman-shades/' ),
	'https://blindmagic.com/blog/roman-shades-cost' => array( 'url' => 'https://blindmagic.com/blog/roman-shades-cost/' ),
	'https://blindmagic.com/blog/roman-shade'       => array( 'url' => 'https://blindmagic.com/blog/roman-shade/' ),
);

$chain = new ReflectionMethod( 'Neo_Pulse_App_Cannibalization_Audit_Pipeline', 'point_at_keepers' );
$chain->setAccessible( true );
$collapsed = $chain->invoke(
	null,
	array(
		'https://blindmagic.com/blog/roman-shades-cost' => array(
			'from' => 'https://blindmagic.com/blog/roman-shades-cost/',
			'to'   => 'https://blindmagic.com/blog/roman-shades/',
		),
		'https://blindmagic.com/blog/roman-shades'      => array(
			'from' => 'https://blindmagic.com/blog/roman-shades/',
			'to'   => 'https://blindmagic.com/blog/roman-shade/',
		),
	),
	$by_url
);

assert_true(
	( $collapsed['https://blindmagic.com/blog/roman-shades-cost']['to'] ?? '' ) === 'https://blindmagic.com/blog/roman-shade/',
	'a chain collapses onto the final keeper'
);
assert_true(
	( $collapsed['https://blindmagic.com/blog/roman-shades']['to'] ?? '' ) === 'https://blindmagic.com/blog/roman-shade/',
	'the middle URL also points at the final keeper'
);

fwrite( STDOUT, "All cannibalization map checks passed.\n" );
