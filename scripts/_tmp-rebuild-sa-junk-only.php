<?php
require '/var/www/wp-load.php';
@set_time_limit( 600 );

$site_json = '/tmp/blindmagic-site.json';
if ( ! is_readable( $site_json ) ) {
	echo "missing /tmp/blindmagic-site.json\n";
	exit( 1 );
}
$site = json_decode( (string) file_get_contents( $site_json ), true );
if ( ! is_array( $site ) ) {
	echo "bad site json\n";
	exit( 1 );
}

$token = Neo_Pulse_App_Google_Mcp_Tokens::get_valid_access_token();
if ( is_wp_error( $token ) ) {
	echo 'TOKEN ERROR ' . $token->get_error_message() . "\n";
	exit( 1 );
}

$workbook = '1b3Vp8gbbQ9cSGRhIjT8vc90VL1L-UOeEnYMcVdL-mpQ';

$read_tab = static function ( string $title ) use ( $workbook, $token ): array {
	$quoted = str_replace( "'", "''", $title );
	$url    = Neo_Pulse_App_Google_Drive_Upload::SHEETS_API_URL . '/' . rawurlencode( $workbook ) . '/values/' . rawurlencode( "'" . $quoted . "'!A:ZZ" );
	$res    = wp_remote_get(
		$url,
		array(
			'timeout' => 60,
			'headers' => array( 'Authorization' => 'Bearer ' . $token ),
		)
	);
	$data = json_decode( wp_remote_retrieve_body( $res ), true );
	return isset( $data['values'] ) && is_array( $data['values'] ) ? $data['values'] : array();
};

$blog = $read_tab( 'Blog' );
echo 'blog_rows=' . count( $blog ) . "\n";

echo "service_area_map junk-only...\n";
$svc = Neo_Pulse_App_Cannibalization_Audit_Pipeline::service_area_map( $site );
if ( is_wp_error( $svc ) ) {
	echo 'SERVICE ERROR ' . $svc->get_error_message() . "\n";
	exit( 1 );
}
$answer = (string) ( $svc['answer'] ?? '' );
file_put_contents( '/tmp/cannibal-service-answer-junk.txt', $answer );
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

$keep        = array();
$self        = 0;
$id          = 1;
$dest_counts = array();
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
	$dest_key = $norm( (string) ( $row[3] ?? '' ) );
	if ( $dest_key !== '' ) {
		$dest_counts[ $dest_key ] = ( $dest_counts[ $dest_key ] ?? 0 ) + 1;
	}
}

$real = max( 0, count( $keep ) - 1 );
echo 'raw=' . count( $rows ) . ' self=' . $self . ' real=' . $real . "\n";
arsort( $dest_counts );
$top = array_slice( $dest_counts, 0, 5, true );
foreach ( $top as $d => $n ) {
	echo 'dest ' . $n . ' -> ' . $d . "\n";
}
if ( $real > 1 ) {
	echo 'sample=' . implode( ',', $keep[1] ) . "\n";
}

$svc_values = count( $keep ) > 1
	? $keep
	: array( array( 'id', 'source', 'matching', 'destination', 'type', 'category', 'status', 'ignore' ) );

$wrote = Neo_Pulse_App_Google_Drive_Upload::write_spreadsheet_tabs(
	$workbook,
	array(
		array( 'title' => 'Blog', 'values' => $blog !== array() ? $blog : array( array( 'id', 'source', 'matching', 'destination', 'type', 'category', 'status', 'ignore' ) ) ),
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
