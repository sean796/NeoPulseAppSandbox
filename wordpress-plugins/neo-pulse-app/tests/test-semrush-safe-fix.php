<?php
/**
 * Semrush safe-fix: allowlist, once-per-day schedule key, failed rescan.
 *
 * Run via: php wordpress-plugins/neo-pulse-app/tests/test-semrush-safe-fix.php
 */

$tmp_root = sys_get_temp_dir() . '/neo-pulse-semrush-safe-fix-test-' . getmypid();
$abspath  = $tmp_root . '/site/';

define( 'ABSPATH', $abspath );

function wp_mkdir_p( $dir ) {
	return is_dir( $dir ) || mkdir( $dir, 0777, true );
}
function sanitize_file_name( $name ) {
	return preg_replace( '/[^A-Za-z0-9._-]/', '-', (string) $name );
}
function sanitize_email( $email ) {
	return filter_var( (string) $email, FILTER_SANITIZE_EMAIL ) ?: '';
}
function sanitize_key( $key ) {
	return strtolower( preg_replace( '/[^a-z0-9_\-]/', '', (string) $key ) );
}
function wp_json_encode( $data, $options = 0 ) {
	return json_encode( $data, $options );
}
function wp_generate_password( $length = 12, $special_chars = true ) {
	unset( $special_chars );
	return substr( bin2hex( random_bytes( max( 8, (int) $length ) ) ), 0, (int) $length );
}
function wp_strip_all_tags( $string ) {
	return trim( strip_tags( (string) $string ) );
}
function trailingslashit( $value ) {
	return rtrim( (string) $value, '/' ) . '/';
}
function wp_upload_dir() {
	return array( 'basedir' => ABSPATH . 'wp-content/uploads' );
}
function wp_parse_url( $url, $component = -1 ) {
	return parse_url( $url, $component );
}
function esc_html( $text ) {
	return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' );
}

/** @var array<string,array{code:int,body:string,error?:string}> */
$GLOBALS['neo_pulse_http_stubs'] = array();

function wp_remote_get( $url, $args = array() ) {
	unset( $args );
	$key = (string) $url;
	if ( isset( $GLOBALS['neo_pulse_http_stubs'][ $key ] ) ) {
		$stub = $GLOBALS['neo_pulse_http_stubs'][ $key ];
		if ( ! empty( $stub['error'] ) ) {
			return new WP_Error( 'http', (string) $stub['error'] );
		}
		return array(
			'response' => array( 'code' => (int) $stub['code'] ),
			'body'     => (string) $stub['body'],
		);
	}
	return new WP_Error( 'http', 'unstubbed URL: ' . $key );
}
function wp_remote_retrieve_response_code( $res ) {
	if ( is_wp_error( $res ) ) {
		return 0;
	}
	return (int) ( $res['response']['code'] ?? 0 );
}
function wp_remote_retrieve_body( $res ) {
	if ( is_wp_error( $res ) ) {
		return '';
	}
	return (string) ( $res['body'] ?? '' );
}
function wp_remote_retrieve_header( $res, $header ) {
	unset( $res, $header );
	return '';
}
function is_wp_error( $thing ) {
	return $thing instanceof WP_Error;
}

class WP_Error {
	private $code;
	private $message;
	public function __construct( $code, $message ) {
		$this->code    = $code;
		$this->message = $message;
	}
	public function get_error_message() {
		return (string) $this->message;
	}
}

putenv( 'NEO_PULSE_DATA_DIR=' . $tmp_root . '/neo-pulse-data' );

require_once dirname( __DIR__ ) . '/includes/storage/class-neo-pulse-data-paths.php';
require_once dirname( __DIR__ ) . '/includes/storage/class-json-file-store.php';
require_once dirname( __DIR__ ) . '/includes/semrush/class-semrush-safe-fix-schedule.php';
require_once dirname( __DIR__ ) . '/includes/semrush/class-semrush-safe-fix-audit.php';
require_once dirname( __DIR__ ) . '/includes/semrush/class-semrush-safe-fix-rescan.php';
require_once dirname( __DIR__ ) . '/includes/semrush/class-semrush-safe-fix-runner.php';

$failures = array();
function check( $label, $cond ) {
	global $failures;
	if ( ! $cond ) {
		$failures[] = $label;
		echo "FAIL: {$label}\n";
	} else {
		echo "OK: {$label}\n";
	}
}

// Every run pulls Semrush's error group, not one issue.
check( 'error list includes duplicate titles', Neo_Pulse_App_Semrush_Safe_Fix_Audit::is_allowed_issue_id( 6 ) );
check( 'error list includes broken images', Neo_Pulse_App_Semrush_Safe_Fix_Audit::is_allowed_issue_id( 13 ) );
check( 'error list includes slow pages', Neo_Pulse_App_Semrush_Safe_Fix_Audit::is_allowed_issue_id( 111 ) );
check( 'error list includes broken links', Neo_Pulse_App_Semrush_Safe_Fix_Audit::is_allowed_issue_id( 8 ) );
check( 'warnings are not in the error list', ! Neo_Pulse_App_Semrush_Safe_Fix_Audit::is_allowed_issue_id( 135 ) );
check( 'title length warnings are not errors', ! Neo_Pulse_App_Semrush_Safe_Fix_Audit::is_allowed_issue_id( 102 ) );

// Once-per-day key: Y-m-d in America/Edmonton.
$tz  = new DateTimeZone( Neo_Pulse_App_Semrush_Safe_Fix_Schedule::TZ );
$now = new DateTime( 'now', $tz );
$key = Neo_Pulse_App_Semrush_Safe_Fix_Schedule::run_key( $now );
check( 'run_key is Y-m-d', $key === $now->format( 'Y-m-d' ) );

$schedule = Neo_Pulse_App_Semrush_Safe_Fix_Schedule::normalize(
	array(
		'enabled'    => true,
		'time'       => '07:00',
		'lastRunKey' => '',
	)
);
$due_min = ( (int) $now->format( 'G' ) * 60 ) + (int) $now->format( 'i' );
if ( $due_min >= 7 * 60 ) {
	check( 'due when past 07:00 and never run today', Neo_Pulse_App_Semrush_Safe_Fix_Schedule::is_due_now( $schedule ) );
	$schedule['lastRunKey'] = $key;
	check( 'not due after same-day lastRunKey', ! Neo_Pulse_App_Semrush_Safe_Fix_Schedule::is_due_now( $schedule ) );
} else {
	check( 'not due before 07:00', ! Neo_Pulse_App_Semrush_Safe_Fix_Schedule::is_due_now( $schedule ) );
}

$saved = Neo_Pulse_App_Semrush_Safe_Fix_Schedule::save(
	array(
		'enabled'    => true,
		'time'       => '07:00',
		'to'         => 'sean@neodigital.ca',
		'lastRunKey' => $key,
	)
);
check( 'schedule saves', $saved === true );
$loaded = Neo_Pulse_App_Semrush_Safe_Fix_Schedule::load();
check( 'schedule loads lastRunKey', (string) $loaded['lastRunKey'] === $key );
check( 'schedule default to', (string) $loaded['to'] === 'sean@neodigital.ca' );

// Failed rescan: page not HTTP 200.
$page = 'https://example.test/missing-title/';
$GLOBALS['neo_pulse_http_stubs'][ $page ] = array(
	'code' => 404,
	'body' => 'not found',
);
$rescan = Neo_Pulse_App_Semrush_Safe_Fix_Runner::rescan_row(
	array(
		'pageUrl' => $page,
		'kind'    => 'title',
		'value'   => 'Some Title Here For SEO',
	)
);
check( 'rescan fails on non-200', empty( $rescan['ok'] ) );
check( 'rescan reports page HTTP 404', isset( $rescan['httpStatus'] ) && (int) $rescan['httpStatus'] === 404 );

// Passed rescan: title present and 200.
$GLOBALS['neo_pulse_http_stubs'][ $page ] = array(
	'code' => 200,
	'body' => '<html><head><title>Window Treatments Edmonton</title></head><body></body></html>',
);
$rescan_ok = Neo_Pulse_App_Semrush_Safe_Fix_Runner::rescan_row(
	array(
		'pageUrl' => $page,
		'kind'    => 'title',
		'value'   => 'Window Treatments Edmonton',
	)
);
check( 'rescan ok on 200 with title', ! empty( $rescan_ok['ok'] ) );

// Assigned Agents gate: missing / empty = off; id present = on.
check(
	'unassigned site skips safe-fix',
	! Neo_Pulse_App_Semrush_Safe_Fix_Runner::site_has_safe_fix_assigned(
		array( 'id' => 'site-a', 'name' => 'A' )
	)
);
check(
	'empty assignedAgentIds skips safe-fix',
	! Neo_Pulse_App_Semrush_Safe_Fix_Runner::site_has_safe_fix_assigned(
		array(
			'id'               => 'site-b',
			'assignedAgentIds' => array(),
		)
	)
);
check(
	'other agent id skips safe-fix',
	! Neo_Pulse_App_Semrush_Safe_Fix_Runner::site_has_safe_fix_assigned(
		array(
			'id'               => 'site-c',
			'assignedAgentIds' => array( 'reporting.changelog.app-update-log' ),
		)
	)
);
check(
	'assigned reporting.semrush.safe-fix runs',
	Neo_Pulse_App_Semrush_Safe_Fix_Runner::site_has_safe_fix_assigned(
		array(
			'id'               => 'site-d',
			'assignedAgentIds' => array( 'reporting.semrush.safe-fix' ),
		)
	)
);

// Cleanup.
function remove_tree( $dir ) {
	if ( ! is_dir( $dir ) ) {
		return;
	}
	$iterator = new RecursiveIteratorIterator(
		new RecursiveDirectoryIterator( $dir, FilesystemIterator::SKIP_DOTS ),
		RecursiveIteratorIterator::CHILD_FIRST
	);
	foreach ( $iterator as $entry ) {
		if ( $entry->isDir() ) {
			rmdir( $entry->getPathname() );
		} else {
			unlink( $entry->getPathname() );
		}
	}
	rmdir( $dir );
}
remove_tree( $tmp_root );

if ( count( $failures ) > 0 ) {
	fwrite( STDERR, count( $failures ) . " failure(s)\n" );
	exit( 1 );
}
echo "All Semrush safe-fix checks passed.\n";
exit( 0 );
