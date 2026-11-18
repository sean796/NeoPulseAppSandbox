<?php
require '/var/www/wp-load.php';
@set_time_limit( 600 );

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

$raw = file_get_contents( '/tmp/cannibal-service-answer.txt' );
$rows = array();
foreach ( preg_split( '/\r\n|\n|\r/', (string) $raw ) as $line ) {
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
echo 'service_raw=' . count( $rows ) . ' self=' . $self . ' real=' . ( count( $keep ) - 1 ) . "\n";
if ( count( $keep ) > 1 ) {
	echo 'sample_real=' . implode( ',', $keep[1] ) . "\n";
}

$blog_raw = file_get_contents( '/tmp/cannibal-blog-answer.txt' );
$blog_rows = array();
foreach ( preg_split( '/\r\n|\n|\r/', (string) $blog_raw ) as $line ) {
	$line = trim( (string) $line );
	if ( $line === '' ) {
		continue;
	}
	$blog_rows[] = str_getcsv( $line );
}
$blog_keep = array();
$blog_self = 0;
$bid       = 1;
foreach ( $blog_rows as $i => $row ) {
	if ( ! is_array( $row ) ) {
		continue;
	}
	if ( $i === 0 && strtolower( trim( (string) ( $row[0] ?? '' ) ) ) === 'id' ) {
		$blog_keep[] = $row;
		continue;
	}
	$src = $norm( (string) ( $row[1] ?? '' ) );
	$dst = $norm( (string) ( $row[3] ?? '' ) );
	if ( $src !== '' && $dst !== '' && $src === $dst ) {
		++$blog_self;
		continue;
	}
	$row[0] = (string) $bid;
	$blog_keep[] = $row;
	++$bid;
}
echo 'blog_raw=' . count( $blog_rows ) . ' self=' . $blog_self . ' real=' . ( count( $blog_keep ) - 1 ) . "\n";

// Rebuild Service Areas with a fresh OpenRouter pass (fixed prompt).
$run  = Neo_Pulse_App_Agent_Runs_Store::get_run( 1, 2490, false );
$site = is_array( $run ) ? ( $run['plan']['cannibalizationAudit']['site'] ?? null ) : null;
if ( ! is_array( $site ) ) {
	echo "missing site from run 2490\n";
	exit( 1 );
}

echo "regenerating service-area map...\n";
$svc = Neo_Pulse_App_Cannibalization_Audit_Pipeline::service_area_map( $site );
if ( is_wp_error( $svc ) ) {
	echo 'SERVICE ERROR ' . $svc->get_error_message() . "\n";
	exit( 1 );
}
$answer = (string) ( $svc['answer'] ?? '' );
file_put_contents( '/tmp/cannibal-service-answer-v2.txt', $answer );
echo 'new_answer_len=' . strlen( $answer ) . "\n";

$new_rows = array();
foreach ( preg_split( '/\r\n|\n|\r/', $answer ) as $line ) {
	$line = trim( (string) $line );
	if ( $line === '' ) {
		continue;
	}
	$new_rows[] = str_getcsv( $line );
}
$new_keep = array();
$new_self = 0;
$nid      = 1;
foreach ( $new_rows as $i => $row ) {
	if ( ! is_array( $row ) ) {
		continue;
	}
	if ( $i === 0 && strtolower( trim( (string) ( $row[0] ?? '' ) ) ) === 'id' ) {
		$new_keep[] = $row;
		continue;
	}
	$src = $norm( (string) ( $row[1] ?? '' ) );
	$dst = $norm( (string) ( $row[3] ?? '' ) );
	if ( $src !== '' && $dst !== '' && $src === $dst ) {
		++$new_self;
		continue;
	}
	$row[0] = (string) $nid;
	$new_keep[] = $row;
	++$nid;
}
echo 'new_raw=' . count( $new_rows ) . ' self=' . $new_self . ' real=' . ( count( $new_keep ) - 1 ) . "\n";
if ( count( $new_keep ) > 1 ) {
	echo 'new_sample=' . implode( ',', $new_keep[1] ) . "\n";
}

$workbook = '1b3Vp8gbbQ9cSGRhIjT8vc90VL1L-UOeEnYMcVdL-mpQ';
$wrote    = Neo_Pulse_App_Google_Drive_Upload::write_spreadsheet_tabs(
	$workbook,
	array(
		array(
			'title'  => 'Blog',
			'values' => $blog_keep,
		),
		array(
			'title'  => 'Service Areas',
			'values' => count( $new_keep ) > 1 ? $new_keep : array( array( 'id', 'source', 'matching', 'destination', 'type', 'category', 'status', 'ignore' ) ),
		),
	)
);
$body = isset( $wrote['body'] ) && is_array( $wrote['body'] ) ? $wrote['body'] : array();
if ( (int) ( $wrote['statusCode'] ?? 500 ) !== 200 ) {
	echo 'WRITE ERROR ' . ( $body['error'] ?? 'unknown' ) . "\n";
	exit( 1 );
}
echo "workbook updated\n";
echo 'https://docs.google.com/spreadsheets/d/' . $workbook . "/edit\n";
