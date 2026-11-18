<?php
require '/var/www/wp-load.php';
@set_time_limit( 600 );

$seed_paths = array(
	'/var/www/wp-content/plugins/neo-pulse-app/../..',
);
$seed = null;
$candidates = array(
	'/var/www/default-properties-seed.json',
	'/tmp/default-properties-seed.json',
);
foreach ( $candidates as $p ) {
	if ( is_readable( $p ) ) {
		$seed = json_decode( (string) file_get_contents( $p ), true );
		break;
	}
}

$site = null;
if ( is_array( $seed ) ) {
	foreach ( (array) ( $seed['sites'] ?? array() ) as $row ) {
		if ( ! is_array( $row ) ) {
			continue;
		}
		$url = (string) ( $row['siteUrl'] ?? '' );
		if ( stripos( $url, 'blindmagic.com' ) !== false ) {
			$site = $row;
			break;
		}
	}
}

if ( ! is_array( $site ) && class_exists( 'Neo_Pulse_App_Integrations_Sites' ) ) {
	// try integrations store if present
}

if ( ! is_array( $site ) ) {
	// Fall back to hardcoded Blind Magic credentials from seed snapshot passed in env file on host.
	$raw = getenv( 'BLIND_MAGIC_SITE_JSON' );
	if ( is_string( $raw ) && $raw !== '' ) {
		$site = json_decode( $raw, true );
	}
}

if ( ! is_array( $site ) ) {
	echo "no Blind Magic site\n";
	exit( 1 );
}

echo 'site=' . (string) ( $site['siteUrl'] ?? '' ) . "\n";
$svc = Neo_Pulse_App_Cannibalization_Audit_Pipeline::service_area_map( $site );
if ( is_wp_error( $svc ) ) {
	echo 'SERVICE ERROR ' . $svc->get_error_message() . "\n";
	exit( 1 );
}
$answer = (string) ( $svc['answer'] ?? '' );
file_put_contents( '/tmp/cannibal-service-answer-v2.txt', $answer );
echo 'answer_len=' . strlen( $answer ) . "\n";

$norm = static function ( string $value ): string {
	$value = trim( $value );
	if ( $value === '' ) {
		return '';
	}
	if ( stripos( $value, 'http://' ) === 0 || stripos( $value, 'https://' ) === 0 ) {
		$parts = wp_parse_url( $value );
		$value = is_array( $parts ) && isset( $parts['path'] ) ? (string) $parts['path'] : '';
	}
	$value = strtolower( (string) preg_replace( '#/+#', '/', $value ) );
	$value = ltrim( $value, '/' );
	if ( $value !== '' && substr( $value, -1 ) !== '/' ) {
		$value .= '/';
	}
	return $value;
};

$rows = array();
foreach ( preg_split( '/\r\n|\n|\r/', $answer ) as $line ) {
	$line = trim( (string) $line );
	if ( $line === '' ) {
		continue;
	}
	$rows[] = str_getcsv( $line );
}
$keep = array();
$self = 0;
$id   = 1;
foreach ( $rows as $i => $row ) {
	if ( ! is_array( $row ) ) {
		continue;
	}
	if ( $i === 0 && strtolower( trim( (string) ( $row[0] ?? '' ) ) ) === 'id' ) {
		$keep[] = $row;
		continue;
	}
	$src = $norm( (string) ( $row[1] ?? '' ) );
	$dst = $norm( (string) ( $row[3] ?? '' ) );
	if ( $src !== '' && $dst !== '' && $src === $dst ) {
		++$self;
		continue;
	}
	$row[0] = (string) $id;
	$keep[] = $row;
	++$id;
}
echo 'raw=' . count( $rows ) . ' self=' . $self . ' real=' . max( 0, count( $keep ) - 1 ) . "\n";
if ( count( $keep ) > 1 ) {
	echo 'sample=' . implode( ',', $keep[1] ) . "\n";
}

$blog_raw  = file_get_contents( '/tmp/cannibal-blog-answer.txt' );
$blog_keep = array();
$bid       = 1;
foreach ( preg_split( '/\r\n|\n|\r/', (string) $blog_raw ) as $i => $line ) {
	$line = trim( (string) $line );
	if ( $line === '' ) {
		continue;
	}
	$row = str_getcsv( $line );
	if ( $i === 0 && strtolower( trim( (string) ( $row[0] ?? '' ) ) ) === 'id' ) {
		$blog_keep[] = $row;
		continue;
	}
	$src = $norm( (string) ( $row[1] ?? '' ) );
	$dst = $norm( (string) ( $row[3] ?? '' ) );
	if ( $src !== '' && $dst !== '' && $src === $dst ) {
		continue;
	}
	$row[0] = (string) $bid;
	$blog_keep[] = $row;
	++$bid;
}
echo 'blog_real=' . max( 0, count( $blog_keep ) - 1 ) . "\n";

$workbook = '1b3Vp8gbbQ9cSGRhIjT8vc90VL1L-UOeEnYMcVdL-mpQ';
$svc_values = count( $keep ) > 1
	? $keep
	: array( array( 'id', 'source', 'matching', 'destination', 'type', 'category', 'status', 'ignore' ) );
$wrote = Neo_Pulse_App_Google_Drive_Upload::write_spreadsheet_tabs(
	$workbook,
	array(
		array( 'title' => 'Blog', 'values' => $blog_keep ),
		array( 'title' => 'Service Areas', 'values' => $svc_values ),
	)
);
$body = isset( $wrote['body'] ) && is_array( $wrote['body'] ) ? $wrote['body'] : array();
if ( (int) ( $wrote['statusCode'] ?? 500 ) !== 200 ) {
	echo 'WRITE ERROR ' . ( $body['error'] ?? 'unknown' ) . "\n";
	exit( 1 );
}
echo "done\n";
echo 'https://docs.google.com/spreadsheets/d/' . $workbook . "/edit\n";
