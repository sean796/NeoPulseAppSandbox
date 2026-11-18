<?php
/**
 * Window treatments vertical: library skill, site gate, inject beside blacklist.
 *
 * Run via: php wordpress-plugins/neo-pulse-app/tests/test-window-treatments-vertical.php
 */

$tmp_root = sys_get_temp_dir() . '/neo-pulse-wt-vertical-test-' . getmypid();
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
function wp_generate_uuid4() {
	$data = random_bytes( 16 );
	$data[6] = chr( ( ord( $data[6] ) & 0x0f ) | 0x40 );
	$data[8] = chr( ( ord( $data[8] ) & 0x3f ) | 0x80 );
	return vsprintf( '%s%s-%s-%s-%s-%s%s%s', str_split( bin2hex( $data ), 4 ) );
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
function wp_strip_all_tags( $string ) {
	return strip_tags( (string) $string );
}
function wp_parse_url( $url, $component = -1 ) {
	return parse_url( $url, $component );
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

require_once dirname( __DIR__ ) . '/includes/storage/class-neo-pulse-data-paths.php';
require_once dirname( __DIR__ ) . '/includes/storage/class-json-file-store.php';
require_once dirname( __DIR__ ) . '/includes/skills-library/class-skills-library-store.php';
require_once dirname( __DIR__ ) . '/includes/vertical-benchmark/class-vertical-benchmark-taxonomy.php';
require_once dirname( __DIR__ ) . '/includes/integrations/class-sites-sync.php';
require_once dirname( __DIR__ ) . '/includes/window-treatments-vertical/class-window-treatments-vertical-inject.php';

$failures = array();
function check( $label, $cond ) {
	global $failures;
	if ( $cond ) {
		echo "OK  $label\n";
		return;
	}
	$failures[] = $label;
	echo "FAIL  $label\n";
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

check(
	'resolve skill id',
	Neo_Pulse_App_Skills_Library_Store::resolve_skill_id( 'window-treatments-vertical' )
		=== Neo_Pulse_App_Skills_Library_Store::SKILL_WINDOW_TREATMENTS_VERTICAL
);

$bundle = Neo_Pulse_App_Skills_Library_Store::get_skill( 'window-treatments-vertical' );
check( 'bundle loads', ! is_wp_error( $bundle ) );
check(
	'default livePrompt present',
	is_array( $bundle ) && strpos( (string) ( $bundle['prompts.json']['livePrompt'] ?? '' ), 'WINDOW TREATMENTS RULES' ) !== false
);

$blind_magic = array(
	'id'                  => 'wp-blind-magic',
	'name'                => 'Blind Magic',
	'siteUrl'             => 'https://blindmagic.com',
	'benchmarkCustomTag'  => 'Window treatments',
);
$tailored = array(
	'id'                 => 'wp-tailored',
	'name'               => 'Tailored Interiors',
	'siteUrl'            => 'https://tailoredinteriors.ca',
	'benchmarkCustomTag' => 'Interior design',
);
$phoenix = array(
	'id'                 => 'wp-phoenix',
	'name'               => 'Phoenix Painting',
	'siteUrl'            => 'https://phoenixpainting.ca',
	'benchmarkCustomTag' => 'Painting',
);

check( 'gate Blind Magic', Neo_Pulse_App_Window_Treatments_Vertical_Inject::site_uses_skill( $blind_magic ) );
check( 'gate Tailored Interiors', Neo_Pulse_App_Window_Treatments_Vertical_Inject::site_uses_skill( $tailored ) );
check( 'gate excludes Phoenix', ! Neo_Pulse_App_Window_Treatments_Vertical_Inject::site_uses_skill( $phoenix ) );

Neo_Pulse_App_Json_File_Store::write(
	Neo_Pulse_App_Data_Paths::sites_path(),
	array(
		'sites' => array( $blind_magic, $phoenix ),
	)
);

$messages = array(
	array(
		'role'    => 'system',
		'content' => 'You write blogs.',
	),
	array(
		'role'    => 'user',
		'content' => "=== WORD BLACKLIST (READ ONLY: master rule; read fully before any output) ===\nbanned\n=== END WORD BLACKLIST ===\n\nWrite a post.",
	),
);

$skipped = Neo_Pulse_App_Window_Treatments_Vertical_Inject::maybe_inject( $messages, array() );
check( 'inject skips without siteId', strpos( $skipped[1]['content'], 'WINDOW TREATMENTS RULES' ) === false );

$skipped_paint = Neo_Pulse_App_Window_Treatments_Vertical_Inject::maybe_inject(
	$messages,
	array( 'siteId' => 'wp-phoenix' )
);
check( 'inject skips painting site', strpos( $skipped_paint[1]['content'], 'WINDOW TREATMENTS RULES' ) === false );

$injected = Neo_Pulse_App_Window_Treatments_Vertical_Inject::maybe_inject(
	$messages,
	array( 'siteId' => 'wp-blind-magic' )
);
check(
	'inject adds block for blinds site',
	strpos( $injected[1]['content'], Neo_Pulse_App_Window_Treatments_Vertical_Inject::BLOCK_OPEN ) !== false
);
check(
	'inject adds system obey line',
	strpos( $injected[0]['content'], Neo_Pulse_App_Window_Treatments_Vertical_Inject::SYSTEM_OBEY ) !== false
);

$again = Neo_Pulse_App_Window_Treatments_Vertical_Inject::maybe_inject(
	$injected,
	array( 'siteId' => 'wp-blind-magic' )
);
check( 'inject is idempotent', $again[1]['content'] === $injected[1]['content'] );

$no_bl = Neo_Pulse_App_Window_Treatments_Vertical_Inject::maybe_inject(
	array(
		array( 'role' => 'user', 'content' => 'Hello' ),
	),
	array( 'siteId' => 'wp-blind-magic' )
);
check( 'inject skips without blacklist', strpos( $no_bl[0]['content'], 'WINDOW TREATMENTS RULES' ) === false );

remove_tree( $tmp_root );

if ( count( $failures ) > 0 ) {
	fwrite( STDERR, 'FAILED: ' . implode( ', ', $failures ) . "\n" );
	exit( 1 );
}
echo "All window-treatments-vertical checks passed.\n";
exit( 0 );
