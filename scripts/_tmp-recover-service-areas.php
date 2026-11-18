<?php
require '/var/www/wp-load.php';
@set_time_limit( 300 );

echo "tmp files:\n";
foreach ( glob( '/tmp/cannibal-*-answer.txt' ) as $f ) {
	echo $f . ' bytes=' . filesize( $f ) . ' lines=' . substr_count( file_get_contents( $f ), "\n" ) . "\n";
}

$token = Neo_Pulse_App_Google_Mcp_Tokens::get_valid_access_token();
if ( is_wp_error( $token ) ) {
	echo 'TOKEN ERROR ' . $token->get_error_message() . "\n";
	exit( 1 );
}

$service_id = '16xID81JLsH1HYnOX9srPyDpmdwVUN1sWTV4kEHVIljs';
$url        = Neo_Pulse_App_Google_Drive_Upload::SHEETS_API_URL . '/' . rawurlencode( $service_id ) . '/values/' . rawurlencode( 'A:ZZ' );
$res        = wp_remote_get(
	$url,
	array(
		'timeout' => 60,
		'headers' => array( 'Authorization' => 'Bearer ' . $token ),
	)
);
$code = (int) wp_remote_retrieve_response_code( $res );
$data = json_decode( wp_remote_retrieve_body( $res ), true );
echo "trashed_sheet_http={$code}\n";
$rows = isset( $data['values'] ) && is_array( $data['values'] ) ? $data['values'] : array();
echo 'trashed_rows=' . count( $rows ) . "\n";
if ( isset( $rows[0] ) ) {
	echo 'hdr=' . implode( ',', $rows[0] ) . "\n";
}
if ( isset( $rows[1] ) ) {
	echo 'r1=' . implode( ',', $rows[1] ) . "\n";
}
if ( isset( $rows[2] ) ) {
	echo 'r2=' . implode( ',', $rows[2] ) . "\n";
}

$workbook = '1b3Vp8gbbQ9cSGRhIjT8vc90VL1L-UOeEnYMcVdL-mpQ';
$blog_url = Neo_Pulse_App_Google_Drive_Upload::SHEETS_API_URL . '/' . rawurlencode( $workbook ) . '/values/' . rawurlencode( "'Blog'!A:ZZ" );
$blog_res = wp_remote_get(
	$blog_url,
	array(
		'timeout' => 60,
		'headers' => array( 'Authorization' => 'Bearer ' . $token ),
	)
);
$blog_data = json_decode( wp_remote_retrieve_body( $blog_res ), true );
$blog_rows = isset( $blog_data['values'] ) && is_array( $blog_data['values'] ) ? $blog_data['values'] : array();
echo 'blog_rows_now=' . count( $blog_rows ) . "\n";
$self = 0;
for ( $i = 1; $i < count( $blog_rows ); $i++ ) {
	$src = isset( $blog_rows[ $i ][1] ) ? (string) $blog_rows[ $i ][1] : '';
	$dst = isset( $blog_rows[ $i ][3] ) ? (string) $blog_rows[ $i ][3] : '';
	$np  = static function ( $v ) {
		$v = trim( (string) $v );
		if ( $v === '' ) {
			return '';
		}
		if ( stripos( $v, 'http' ) === 0 ) {
			$p = wp_parse_url( $v );
			$v = is_array( $p ) && isset( $p['path'] ) ? (string) $p['path'] : '';
		}
		$v = strtolower( (string) preg_replace( '#/+#', '/', $v ) );
		$v = ltrim( $v, '/' );
		if ( $v !== '' && substr( $v, -1 ) !== '/' ) {
			$v .= '/';
		}
		return $v;
	};
	if ( $np( $src ) !== '' && $np( $src ) === $np( $dst ) ) {
		++$self;
	}
}
echo "blog_self_left={$self}\n";

$svc_url = Neo_Pulse_App_Google_Drive_Upload::SHEETS_API_URL . '/' . rawurlencode( $workbook ) . '/values/' . rawurlencode( "'Service Areas'!A:ZZ" );
$svc_res = wp_remote_get(
	$svc_url,
	array(
		'timeout' => 60,
		'headers' => array( 'Authorization' => 'Bearer ' . $token ),
	)
);
$svc_data = json_decode( wp_remote_retrieve_body( $svc_res ), true );
$svc_now  = isset( $svc_data['values'] ) && is_array( $svc_data['values'] ) ? $svc_data['values'] : array();
echo 'service_tab_rows_now=' . count( $svc_now ) . "\n";
if ( isset( $svc_now[0] ) ) {
	echo 'svc0=' . implode( ',', $svc_now[0] ) . "\n";
}
