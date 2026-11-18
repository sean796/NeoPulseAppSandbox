<?php
/**
 * Smoke tests for Fact Checker helpers.
 *
 * Run: php wordpress-plugins/neo-pulse-app/tests/test-fact-checker.php
 *
 * @package Neo_Pulse_App
 */

$plugin_dir = dirname( __DIR__ );

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', sys_get_temp_dir() . '/neo-pulse-fact-checker-test-abspath/' );
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
if ( ! function_exists( 'wp_parse_url' ) ) {
	function wp_parse_url( $url, $component = -1 ) {
		return parse_url( $url, $component );
	}
}

require_once $plugin_dir . '/includes/editorial-content-audit/class-editorial-content-audit-worker.php';
require_once $plugin_dir . '/includes/fact-checker/class-fact-checker-schedule.php';
require_once $plugin_dir . '/includes/fact-checker/class-fact-checker-worker.php';
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

$defaults = Neo_Pulse_App_Fact_Checker_Schedule::defaults();
assert_true( ( $defaults['to'] ?? '' ) === 'sean@neodigital.ca', 'default recipient is sean@neodigital.ca' );
assert_true( Neo_Pulse_App_Fact_Checker_Schedule::AGENT_ID === 'content.product.fact-check', 'agent id matches assignableId' );

$norm = Neo_Pulse_App_Fact_Checker_Schedule::normalize(
	array(
		'to'   => 'not-an-email',
		'time' => 'not-a-time',
	)
);
assert_true( $norm['to'] === 'sean@neodigital.ca', 'bad email falls back to default' );
assert_true( $norm['time'] === '08:00', 'bad time falls back to default' );

$macro = Neo_Pulse_App_Fact_Checker_Worker::macro_location_context(
	array(
		'name'           => 'Blind Magic',
		'siteUrl'        => 'https://blindmagic.com',
		'serviceCity'    => 'Edmonton',
		'serviceState'   => 'Alberta',
		'serviceCountry' => 'Canada',
		'locations'      => array(
			array(
				'city'    => 'Edmonton',
				'state'   => 'Alberta',
				'country' => 'Canada',
				'street'  => '123 Fake St',
				'phone'   => '780-555-0100',
			),
		),
		'napInfo'        => array(
			'name'  => 'Blind Magic',
			'phone' => '780-555-0100',
		),
	)
);
assert_true( $macro['country'] === 'Canada', 'macro country from service country' );
assert_true( isset( $macro['locations'][0]['city'] ) && $macro['locations'][0]['city'] === 'Edmonton', 'macro location city kept' );
assert_true( ! isset( $macro['locations'][0]['street'] ), 'macro location has no street' );
assert_true( ! isset( $macro['locations'][0]['phone'] ), 'macro location has no phone' );

$link = Neo_Pulse_App_Fact_Checker_Worker::claim_link(
	'https://blindmagic.com/blog/power/',
	'PowerView automation cuts energy use'
);
assert_true(
	strpos( $link, 'https://blindmagic.com/blog/power/#:~:text=' ) === 0,
	'claim link uses text fragment'
);
assert_true(
	Neo_Pulse_App_Fact_Checker_Worker::same_site_host( 'blindmagic.com', 'blindmagic.com' ),
	'client host is the same site'
);
assert_true(
	Neo_Pulse_App_Fact_Checker_Worker::same_site_host( 'www.blindmagic.com', 'blindmagic.com' ),
	'www client host is the same site'
);
assert_true(
	! Neo_Pulse_App_Fact_Checker_Worker::same_site_host( 'www.hunterdouglas.ca', 'blindmagic.com' ),
	'manufacturer host is not the client site'
);
assert_true(
	Neo_Pulse_App_Fact_Checker_Worker::is_competitor_blinds_host( 'www.blindsplanet.ca' ),
	'blindsplanet.ca is a competitor blinds host'
);
assert_true(
	! Neo_Pulse_App_Fact_Checker_Worker::is_competitor_blinds_host( 'www.hunterdouglas.com' ),
	'Hunter Douglas is not a competitor blinds host'
);

$empty_rollup = Neo_Pulse_App_Fact_Checker_Worker::rollup(
	array(
		array(
			'verdict' => 'no_product_claim',
			'pageId'  => 1,
		),
	),
	array(
		'pageCount' => 1,
		'siteName'  => 'Test',
	)
);
assert_true( is_array( $empty_rollup ), 'empty product claims rollup works' );
assert_true( (int) ( $empty_rollup['counts']['claimCount'] ?? -1 ) === 0, 'no_product_claim does not count as material' );

$capped = Neo_Pulse_App_Fact_Checker_Worker::cap_aiseo_score(
	9.0,
	array(
		array(
			'verdict'  => 'unsupported',
			'severity' => 'critical',
			'quote'    => 'Battery lasts 30 days',
		),
	)
);
assert_true( $capped === 4.0, 'critical claims cap AISEO at 4' );

$capped_major = Neo_Pulse_App_Fact_Checker_Worker::cap_aiseo_score(
	8.5,
	array(
		array(
			'verdict'  => 'contradicted',
			'severity' => 'major',
			'quote'    => 'SoftTouch is PowerView',
		),
	)
);
assert_true( $capped_major === 6.0, 'major or contradicted claims cap AISEO at 6' );
assert_true( Neo_Pulse_App_Fact_Checker_Worker::aiseo_letter( 9.2 ) === 'A', 'letter A for 9+' );
assert_true( Neo_Pulse_App_Fact_Checker_Worker::aiseo_letter( 5.0 ) === 'F', 'letter F below 6' );

$material_rollup = Neo_Pulse_App_Fact_Checker_Worker::rollup(
	array(
		array(
			'pageId'           => 2,
			'title'            => 'PowerView Guide',
			'quote'            => 'Cuts heating bills by 30 percent',
			'verdict'          => 'unsupported',
			'severity'         => 'major',
			'suggestedWording' => 'Ask for the current product sheet on energy performance.',
			'aiseoScore'       => 6.0,
		),
	),
	array( 'pageCount' => 1 )
);
assert_true(
	strpos( (string) ( $material_rollup['publication'] ?? '' ), 'Material claims remain unresolved' ) !== false,
	'unresolved claims block full fact-check publication'
);
assert_true(
	(string) ( $material_rollup['counts']['aiseoLetter'] ?? '' ) === 'D',
	'rollup stores AISEO letter'
);

assert_true(
	Neo_Pulse_App_Fact_Checker_Worker::BATCH_SIZE === 1,
	'fact checker processes one page per tick'
);
assert_true(
	Neo_Pulse_App_Fact_Checker_Worker::WEB_MODEL === 'openai/gpt-6-sol:online',
	'uses OpenRouter web model'
);

assert_true(
	Neo_Pulse_App_Agent_Runs_Recipe_Registry::is_valid( 'fact_checker' ),
	'recipe fact_checker is registered'
);

$resolved = Neo_Pulse_App_Skills_Library_Store::resolve_skill_id( 'fact-checker' );
assert_true( $resolved === 'content.product.fact-check', 'skills library resolves fact-checker slug' );

if ( $failed > 0 ) {
	echo "\n$failed assertion(s) failed\n";
	exit( 1 );
}
echo "\nAll Fact Checker smoke tests passed\n";
exit( 0 );
