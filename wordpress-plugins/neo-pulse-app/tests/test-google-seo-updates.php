<?php
/**
 * Google SEO Updates: dated archive state, Monday due window, inject beside blacklist.
 *
 * Run via: php wordpress-plugins/neo-pulse-app/tests/test-google-seo-updates.php
 */

$tmp_root = sys_get_temp_dir() . '/neo-pulse-google-seo-test-' . getmypid();
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
require_once dirname( __DIR__ ) . '/includes/google-seo-updates/class-google-seo-updates-runner.php';
require_once dirname( __DIR__ ) . '/includes/google-seo-updates/class-google-seo-updates-inject.php';

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

remove_tree( $tmp_root );
wp_mkdir_p( $abspath );

check(
	'slug resolves to google seo skill id',
	Neo_Pulse_App_Skills_Library_Store::resolve_skill_id( 'google-seo-updates' )
		=== Neo_Pulse_App_Skills_Library_Store::SKILL_GOOGLE_SEO_UPDATES
);

$bundle = Neo_Pulse_App_Skills_Library_Store::get_skill( 'google-seo-updates' );
check( 'get_skill returns array', is_array( $bundle ) && ! is_wp_error( $bundle ) );
check(
	'default prompts has one prompt per topic',
	is_array( $bundle )
	&& isset( $bundle['prompts.json']['topics'] )
	&& count( $bundle['prompts.json']['topics'] ) === 5
);

$state = Neo_Pulse_App_Google_Seo_Updates_Runner::normalize_state(
	array(
		'entries' => array(
			array(
				'id'             => '2026-11-18-aaa',
				'date'           => '2026-11-18',
				'title'          => 'Core update week',
				'sourcesChecked' => array( 'https://developers.google.com/search/blog' ),
				'items'          => array(
					array(
						'sourceUrl'   => 'https://developers.google.com/search/blog/2026/11/example',
						'title'       => 'Example',
						'whatChanged' => 'Helpful content clarified.',
						'postRule'    => 'Lead with the answer.',
					),
				),
			),
		),
		'livePrompt' => 'Lead with the answer. Source: https://developers.google.com/search/blog/2026/11/example (2026-11-18)',
		'extract'    => array(
			'system'       => 'extract system',
			'userTemplate' => '{knownUrls}{sourcePack}',
		),
		'rewrite'    => array(
			'system'       => 'rewrite system',
			'userTemplate' => '{entriesJson}',
		),
	)
);
check( 'normalize keeps one dated entry', count( $state['entries'] ) === 1 );
check( 'normalize keeps livePrompt', strpos( $state['livePrompt'], 'Lead with the answer' ) !== false );

$not_due = Neo_Pulse_App_Google_Seo_Updates_Runner::is_monday_due(
	array_merge( $state, array( 'lastRunKey' => 'already' ) )
);
check( 'is_monday_due returns structured result', isset( $not_due['due'], $not_due['reason'] ) );

$injected = Neo_Pulse_App_Google_Seo_Updates_Inject::maybe_inject(
	array(
		array( 'role' => 'system', 'content' => 'You write posts.' ),
		array(
			'role'    => 'user',
			'content' => "=== WORD BLACKLIST (READ ONLY: master rule; read fully before any output) ===\nbanned\n=== END WORD BLACKLIST ===\n\nWrite the section.",
		),
	)
);
// Without a stored livePrompt in this temp data dir, inject should leave messages alone.
check(
	'inject skips when livePrompt empty',
	strpos( (string) $injected[1]['content'], 'GOOGLE SEO RULES' ) === false
);

Neo_Pulse_App_Skills_Library_Store::write_google_seo_archive(
	array(
		'entries'    => $state['entries'],
		'livePrompt' => $state['livePrompt'],
	)
);
$injected2 = Neo_Pulse_App_Google_Seo_Updates_Inject::maybe_inject(
	array(
		array( 'role' => 'system', 'content' => 'You write posts.' ),
		array(
			'role'    => 'user',
			'content' => "=== WORD BLACKLIST (READ ONLY: master rule; read fully before any output) ===\nbanned\n=== END WORD BLACKLIST ===\n\nWrite the section.",
		),
	)
);
check(
	'inject adds google seo block on every action',
	strpos( (string) $injected2[1]['content'], 'GOOGLE SEO RULES' ) !== false
);
check(
	'inject adds system obey line',
	strpos( (string) $injected2[0]['content'], 'GOOGLE SEO RULES' ) !== false
);

$no_bl = Neo_Pulse_App_Google_Seo_Updates_Inject::maybe_inject(
	array(
		array( 'role' => 'system', 'content' => 'You write posts.' ),
		array( 'role' => 'user', 'content' => 'Write the section.' ),
	)
);
check(
	'inject adds google seo block when blacklist is absent',
	strpos( (string) $no_bl[1]['content'], 'GOOGLE SEO RULES' ) !== false
);

if ( count( $failures ) > 0 ) {
	echo "\n" . count( $failures ) . " failed\n";
	exit( 1 );
}
echo "\nAll checks passed\n";
exit( 0 );
