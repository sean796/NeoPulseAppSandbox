<?php
require '/var/www/wp-load.php';
$sheet_id = '1_8sbSVZly8dW5Iz9H1sXogNNxS08d2TolP48dftEgU0';
$access   = Neo_Pulse_App_Google_Mcp_Tokens::get_valid_access_token();
if ( is_wp_error( $access ) ) {
	fwrite( STDERR, $access->get_error_message() . "\n" );
	exit( 1 );
}
$url = 'https://www.googleapis.com/drive/v3/files/' . rawurlencode( $sheet_id ) . '/export?mimeType=text/csv';
$res = wp_remote_get(
	$url,
	array(
		'timeout' => 30,
		'headers' => array( 'Authorization' => 'Bearer ' . $access ),
	)
);
$code = (int) wp_remote_retrieve_response_code( $res );
$body = (string) wp_remote_retrieve_body( $res );
echo "export_http=$code bytes=" . strlen( $body ) . " lines=" . substr_count( $body, "\n" ) . PHP_EOL;
echo implode( "\n", array_slice( explode( "\n", $body ), 0, 5 ) ) . PHP_EOL;
