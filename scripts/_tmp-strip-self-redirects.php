<?php
require '/var/www/wp-load.php';
@set_time_limit( 300 );

$id    = '1b3Vp8gbbQ9cSGRhIjT8vc90VL1L-UOeEnYMcVdL-mpQ';
$token = Neo_Pulse_App_Google_Mcp_Tokens::get_valid_access_token();
if ( is_wp_error( $token ) ) {
	echo 'TOKEN ERROR ' . $token->get_error_message() . "\n";
	exit( 1 );
}

$norm = static function ( string $value ): string {
	$value = trim( $value );
	if ( $value === '' ) {
		return '';
	}
	if ( stripos( $value, 'http://' ) === 0 || stripos( $value, 'https://' ) === 0 ) {
		$parts = wp_parse_url( $value );
		$path  = is_array( $parts ) && isset( $parts['path'] ) ? (string) $parts['path'] : '';
	} else {
		$path = $value;
	}
	$path = strtolower( (string) preg_replace( '#/+#', '/', $path ) );
	$path = ltrim( $path, '/' );
	if ( $path !== '' && substr( $path, -1 ) !== '/' ) {
		$path .= '/';
	}
	return $path;
};

$is_self = static function ( array $row ) use ( $norm ): bool {
	$source = isset( $row[1] ) ? (string) $row[1] : '';
	$dest   = isset( $row[3] ) ? (string) $row[3] : '';
	$src    = $norm( $source );
	$dst    = $norm( $dest );
	return $src !== '' && $dst !== '' && $src === $dst;
};

$read_tab = static function ( string $title ) use ( $id, $token ): array {
	$quoted = str_replace( "'", "''", $title );
	$url    = Neo_Pulse_App_Google_Drive_Upload::SHEETS_API_URL . '/' . rawurlencode( $id ) . '/values/' . rawurlencode( "'" . $quoted . "'!A:ZZ" );
	$res    = wp_remote_get(
		$url,
		array(
			'timeout' => 60,
			'headers' => array( 'Authorization' => 'Bearer ' . $token ),
		)
	);
	if ( is_wp_error( $res ) ) {
		return array( 'ok' => false, 'error' => $res->get_error_message() );
	}
	$code = (int) wp_remote_retrieve_response_code( $res );
	$data = json_decode( wp_remote_retrieve_body( $res ), true );
	if ( $code < 200 || $code >= 300 || ! is_array( $data ) ) {
		$msg = is_array( $data ) && ! empty( $data['error']['message'] )
			? (string) $data['error']['message']
			: 'read failed';
		return array( 'ok' => false, 'error' => $msg );
	}
	return array(
		'ok'     => true,
		'values' => isset( $data['values'] ) && is_array( $data['values'] ) ? $data['values'] : array(),
	);
};

$clean = static function ( array $rows ) use ( $is_self ): array {
	$out      = array();
	$dropped  = 0;
	$id_num   = 1;
	foreach ( $rows as $i => $row ) {
		if ( ! is_array( $row ) ) {
			continue;
		}
		$is_hdr = $i === 0 && strtolower( trim( (string) ( $row[0] ?? '' ) ) ) === 'id';
		if ( $is_hdr ) {
			$out[] = $row;
			continue;
		}
		if ( $is_self( $row ) ) {
			++$dropped;
			continue;
		}
		$row[0] = (string) $id_num;
		$out[]  = $row;
		++$id_num;
	}
	return array( 'values' => $out, 'dropped' => $dropped );
};

$tabs = array( 'Blog', 'Service Areas' );
$out_tabs = array();
foreach ( $tabs as $title ) {
	$read = $read_tab( $title );
	if ( empty( $read['ok'] ) ) {
		echo 'READ ERROR ' . $title . ' ' . ( $read['error'] ?? '' ) . "\n";
		exit( 1 );
	}
	$before = count( $read['values'] );
	$fixed  = $clean( $read['values'] );
	echo $title . ' before=' . $before . ' after=' . count( $fixed['values'] ) . ' dropped=' . $fixed['dropped'] . "\n";
	$out_tabs[] = array(
		'title'  => $title,
		'values' => $fixed['values'],
	);
}

$wrote = Neo_Pulse_App_Google_Drive_Upload::write_spreadsheet_tabs( $id, $out_tabs );
$body  = isset( $wrote['body'] ) && is_array( $wrote['body'] ) ? $wrote['body'] : array();
if ( (int) ( $wrote['statusCode'] ?? 500 ) !== 200 ) {
	echo 'WRITE ERROR ' . ( $body['error'] ?? 'unknown' ) . "\n";
	exit( 1 );
}
echo "cleaned\n";
echo 'workbook=https://docs.google.com/spreadsheets/d/' . $id . "/edit\n";
