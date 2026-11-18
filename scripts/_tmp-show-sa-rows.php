<?php
require '/var/www/wp-load.php';
$token = Neo_Pulse_App_Google_Mcp_Tokens::get_valid_access_token();
$id    = '1b3Vp8gbbQ9cSGRhIjT8vc90VL1L-UOeEnYMcVdL-mpQ';
$url   = Neo_Pulse_App_Google_Drive_Upload::SHEETS_API_URL . '/' . rawurlencode( $id ) . '/values/' . rawurlencode( "'Service Areas'!A:D" );
$res   = wp_remote_get( $url, array( 'timeout' => 60, 'headers' => array( 'Authorization' => 'Bearer ' . $token ) ) );
$data  = json_decode( wp_remote_retrieve_body( $res ), true );
$rows  = isset( $data['values'] ) && is_array( $data['values'] ) ? $data['values'] : array();
echo 'rows=' . count( $rows ) . "\n";
foreach ( $rows as $row ) {
	echo implode( ' | ', $row ) . "\n";
}
