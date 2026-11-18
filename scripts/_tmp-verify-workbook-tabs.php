<?php
require '/var/www/wp-load.php';
$token = Neo_Pulse_App_Google_Mcp_Tokens::get_valid_access_token();
if ( is_wp_error( $token ) ) {
	echo 'TOKEN ERROR ' . $token->get_error_message() . "\n";
	exit( 1 );
}
$id  = '1b3Vp8gbbQ9cSGRhIjT8vc90VL1L-UOeEnYMcVdL-mpQ';
$url = Neo_Pulse_App_Google_Drive_Upload::SHEETS_API_URL . '/' . rawurlencode( $id ) . '?fields=sheets.properties(title,index)';
$res = wp_remote_get(
	$url,
	array(
		'timeout' => 30,
		'headers' => array( 'Authorization' => 'Bearer ' . $token ),
	)
);
$data = json_decode( wp_remote_retrieve_body( $res ), true );
foreach ( (array) ( $data['sheets'] ?? array() ) as $s ) {
	$p = is_array( $s['properties'] ?? null ) ? $s['properties'] : array();
	echo (int) ( $p['index'] ?? -1 ) . ' ' . (string) ( $p['title'] ?? '' ) . "\n";
}
