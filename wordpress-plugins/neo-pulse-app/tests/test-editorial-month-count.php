<?php
/**
 * A scheduled or published WordPress date in the month counts. The clock time does not drop it.
 *
 * Run: php wordpress-plugins/neo-pulse-app/tests/test-editorial-month-count.php
 */

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', sys_get_temp_dir() . '/neo-pulse-editorial-count-test/' );
}

require_once dirname( __DIR__ ) . '/includes/wordpress/class-wp-editorial-counts.php';

$dates = array(
	'2026-12-03',
	'2026-12-06',
	'2026-12-10',
	'2026-12-14',
	'2026-11-14',
	'2027-01-03',
);

$month = Neo_Pulse_App_Wp_Editorial_Counts::month_key_from_after( '2026-12-01T06:00:00.000Z' );
if ( $month !== '2026-12' ) {
	fwrite( STDERR, "month key was {$month}\n" );
	exit( 1 );
}

$count = Neo_Pulse_App_Wp_Editorial_Counts::count_dates_in_month( $dates, $month );
if ( $count !== 4 ) {
	fwrite( STDERR, "December count was {$count}\n" );
	exit( 1 );
}

echo "ok\n";
