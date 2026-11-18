<?php
/**
 * Merge Blind Magic Pulse Redirect + Service Areas into one workbook with two tabs.
 */
require '/var/www/wp-load.php';
@set_time_limit( 300 );

$blog_id    = '1b3Vp8gbbQ9cSGRhIjT8vc90VL1L-UOeEnYMcVdL-mpQ';
$service_id = '16xID81JLsH1HYnOX9srPyDpmdwVUN1sWTV4kEHVIljs';

$token = Neo_Pulse_App_Google_Mcp_Tokens::get_valid_access_token();
if ( is_wp_error( $token ) ) {
	echo 'TOKEN ERROR ' . $token->get_error_message() . "\n";
	exit( 1 );
}

$read_values = static function ( string $spreadsheet_id ) use ( $token ): array {
	$url = Neo_Pulse_App_Google_Drive_Upload::SHEETS_API_URL . '/' . rawurlencode( $spreadsheet_id ) . '/values/' . rawurlencode( 'A:ZZ' );
	$res = wp_remote_get(
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
	$values = isset( $data['values'] ) && is_array( $data['values'] ) ? $data['values'] : array();
	return array( 'ok' => true, 'values' => $values );
};

$blog = $read_values( $blog_id );
if ( empty( $blog['ok'] ) ) {
	echo 'BLOG READ ERROR ' . ( $blog['error'] ?? '' ) . "\n";
	exit( 1 );
}
$svc = $read_values( $service_id );
if ( empty( $svc['ok'] ) ) {
	echo 'SERVICE READ ERROR ' . ( $svc['error'] ?? '' ) . "\n";
	exit( 1 );
}

echo 'blog_rows=' . count( $blog['values'] ) . ' service_rows=' . count( $svc['values'] ) . "\n";

$wrote = Neo_Pulse_App_Google_Drive_Upload::write_spreadsheet_tabs(
	$blog_id,
	array(
		array(
			'title'  => 'Blog',
			'values' => $blog['values'],
		),
		array(
			'title'  => 'Service Areas',
			'values' => $svc['values'],
		),
	)
);
$body = isset( $wrote['body'] ) && is_array( $wrote['body'] ) ? $wrote['body'] : array();
if ( (int) ( $wrote['statusCode'] ?? 500 ) !== 200 ) {
	echo 'WRITE ERROR ' . ( $body['error'] ?? 'unknown' ) . "\n";
	exit( 1 );
}
echo 'tabs=' . implode( ',', (array) ( $body['tabs'] ?? array() ) ) . "\n";

$trashed = Neo_Pulse_App_Google_Drive_Upload::trash_file( array( 'fileId' => $service_id ) );
echo 'trashed_service_file=' . ( (int) ( $trashed['statusCode'] ?? 500 ) === 200 ? 'yes' : 'no' ) . "\n";
echo 'workbook=https://docs.google.com/spreadsheets/d/' . $blog_id . "/edit\n";
echo "done\n";
