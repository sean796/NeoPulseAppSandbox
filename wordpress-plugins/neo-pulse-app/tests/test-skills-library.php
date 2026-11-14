<?php
/**
 * Skills Library store and route: defaults match live Semrush prompts,
 * invalid JSON save is rejected, field-copy uses saved base.
 *
 * Run via: php wordpress-plugins/neo-pulse-app/tests/test-skills-library.php
 */

$tmp_root = sys_get_temp_dir() . '/neo-pulse-skills-library-test-' . getmypid();
$abspath  = $tmp_root . '/site/';

define( 'ABSPATH', $abspath );

function wp_mkdir_p( $dir ) {
	return is_dir( $dir ) || mkdir( $dir, 0777, true );
}
function sanitize_file_name( $name ) {
	return preg_replace( '/[^A-Za-z0-9._-]/', '-', (string) $name );
}
function sanitize_text_field( $value ) {
	return trim( (string) preg_replace( '/[\r\n\t ]+/', ' ', strip_tags( (string) $value ) ) );
}
function wp_json_encode( $data, $options = 0 ) {
	return json_encode( $data, $options );
}
function wp_generate_password( $length = 12, $special_chars = true ) {
	unset( $special_chars );
	return substr( bin2hex( random_bytes( $length ) ), 0, $length );
}
function trailingslashit( $value ) {
	return rtrim( (string) $value, '/' ) . '/';
}
function wp_upload_dir() {
	return array( 'basedir' => ABSPATH . 'wp-content/uploads' );
}
function is_wp_error( $thing ) {
	return $thing instanceof WP_Error;
}

class WP_Error {
	private $code;
	private $message;
	private $data;
	public function __construct( $code = '', $message = '', $data = '' ) {
		$this->code    = $code;
		$this->message = $message;
		$this->data    = $data;
	}
	public function get_error_message() {
		return (string) $this->message;
	}
	public function get_error_data() {
		return $this->data;
	}
}

putenv( 'NEO_PULSE_DATA_DIR=' . $tmp_root . '/neo-pulse-data' );

class Neo_Pulse_App_Auth_Session {
	public static $user = array( 'id' => 7 );
	public static function require_user(): ?array {
		return self::$user;
	}
}

class Neo_Pulse_App_Api_Dispatcher {
	public static $last = null;
	public static function send_json( $data, int $status = 200 ): void {
		self::$last = array( 'status' => $status, 'data' => $data );
	}
}

require_once dirname( __DIR__ ) . '/includes/storage/class-neo-pulse-data-paths.php';
require_once dirname( __DIR__ ) . '/includes/storage/class-json-file-store.php';
require_once dirname( __DIR__ ) . '/includes/skills-library/class-skills-library-store.php';
require_once dirname( __DIR__ ) . '/includes/skills-library/class-skills-library-route.php';

$failures = array();
function check( $label, $cond ) {
	global $failures;
	if ( ! $cond ) {
		$failures[] = $label;
		echo "FAIL: {$label}\n";
	}
}
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
wp_mkdir_p( $abspath );

$skill_id = Neo_Pulse_App_Skills_Library_Store::SKILL_SAFE_FIX;
$slug     = Neo_Pulse_App_Skills_Library_Store::SKILL_SAFE_FIX_SLUG;
check(
	'slug resolves to full skill id',
	Neo_Pulse_App_Skills_Library_Store::resolve_skill_id( $slug ) === $skill_id
);
$bundle = Neo_Pulse_App_Skills_Library_Store::get_skill( $slug );
check( 'get_skill via slug returns array', is_array( $bundle ) && ! is_wp_error( $bundle ) );

$defaults = Neo_Pulse_App_Skills_Library_Store::default_prompts();
check(
	'default fieldCopy.base matches live Semrush wording',
	is_array( $bundle )
	&& (string) ( $bundle['prompts.json']['fieldCopy']['base'] ?? '' ) === (string) $defaults['fieldCopy']['base']
);
check(
	'default checklist.system matches live Semrush wording',
	is_array( $bundle )
	&& (string) ( $bundle['prompts.json']['checklist']['system'] ?? '' ) === (string) $defaults['checklist']['system']
);

$bad = Neo_Pulse_App_Skills_Library_Store::put_file(
	$skill_id,
	'prompts.json',
	array( 'fieldCopy' => array( 'base' => '' ) )
);
check( 'invalid prompts.json save rejected', is_wp_error( $bad ) );

$ok_put = Neo_Pulse_App_Skills_Library_Store::put_file(
	$skill_id,
	'prompts.json',
	array(
		'fieldCopy' => array(
			'base'            => 'CUSTOM BASE PROMPT.',
			'title'           => ' TITLE RULE.',
			'metaDescription' => ' META RULE.',
			'alt'             => ' ALT RULE.',
			'userTemplate'    => "Page URL: {pageUrl}\nSite: {siteUrl}\n{imageLine}Page excerpt:\n{excerpt}\n\nReturn JSON: {\"{field}\": \"...\"}",
		),
		'checklist' => array(
			'system'       => (string) $defaults['checklist']['system'],
			'userTemplate' => (string) $defaults['checklist']['userTemplate'],
		),
	)
);
check( 'valid prompts.json save ok', $ok_put === true );

$loaded = Neo_Pulse_App_Skills_Library_Store::load_prompts( $skill_id );
check( 'load_prompts returns saved base', is_array( $loaded ) && (string) ( $loaded['fieldCopy']['base'] ?? '' ) === 'CUSTOM BASE PROMPT.' );

Neo_Pulse_App_Api_Dispatcher::$last = null;
Neo_Pulse_App_Skills_Library_Route::dispatch_http( $slug, 'GET', array() );
$get = Neo_Pulse_App_Api_Dispatcher::$last;
check( 'GET skill via slug returns ok', is_array( $get ) && (int) $get['status'] === 200 && ! empty( $get['data']['ok'] ) );
check(
	'GET returns canonical skill id',
	is_array( $get ) && (string) ( $get['data']['skillId'] ?? '' ) === $skill_id
);

Neo_Pulse_App_Api_Dispatcher::$last = null;
Neo_Pulse_App_Skills_Library_Route::dispatch_http(
	$slug . '/schema.json',
	'PUT',
	array( 'document' => array( 'id' => 'x' ) )
);
$schema_put = Neo_Pulse_App_Api_Dispatcher::$last;
check(
	'schema.json PUT rejected',
	is_array( $schema_put ) && (int) $schema_put['status'] === 400
);

Neo_Pulse_App_Api_Dispatcher::$last = null;
Neo_Pulse_App_Skills_Library_Route::dispatch_http(
	$slug . '/evals.json',
	'PUT',
	array(
		'document' => array(
			'skill_name' => 'semrush-safe-fix',
			'evals'      => array(
				array(
					'id'              => 2,
					'prompt'          => 'Write meta description from excerpt.',
					'expected_output' => 'JSON with metaDescription 130-150 chars.',
				),
			),
		),
	)
);
$evals_put = Neo_Pulse_App_Api_Dispatcher::$last;
check( 'evals.json PUT ok', is_array( $evals_put ) && (int) $evals_put['status'] === 200 && ! empty( $evals_put['data']['ok'] ) );

remove_tree( $tmp_root );

if ( count( $failures ) > 0 ) {
	echo 'Failed ' . count( $failures ) . " checks.\n";
	exit( 1 );
}
echo "All Skills Library checks passed.\n";
exit( 0 );
