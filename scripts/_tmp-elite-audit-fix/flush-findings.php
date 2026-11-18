<?php
require '/var/www/wp-load.php';

$path = '/data/neo-pulse-data/editorial-content-audit/run-2408.json';
$work = json_decode( (string) file_get_contents( $path ), true );
if ( ! is_array( $work ) ) {
	fwrite( STDERR, "missing run-2408\n" );
	exit( 1 );
}
$folder = trim( (string) ( $work['driveFolderId'] ?? '' ) );
$findings = isset( $work['findings'] ) && is_array( $work['findings'] ) ? $work['findings'] : array();
$log = isset( $work['log'] ) && is_array( $work['log'] ) ? $work['log'] : array();
$done = (int) ( $work['cursor'] ?? 0 );
$total = isset( $work['inventory']['pages'] ) && is_array( $work['inventory']['pages'] ) ? count( $work['inventory']['pages'] ) : $done;
echo "cursor=$done findings=" . count( $findings ) . " folder=$folder\n";
if ( $folder === '' ) {
	fwrite( STDERR, "no folder\n" );
	exit( 1 );
}
$wrote = Neo_Pulse_App_Editorial_Content_Audit_Mail::write_progress(
	$folder,
	'Advance Blinds & Drapery',
	$done,
	$total,
	$log,
	$findings
);
echo wp_json_encode( $wrote, JSON_PRETTY_PRINT ) . PHP_EOL;
if ( empty( $wrote['ok'] ) ) {
	exit( 1 );
}
$work['driveDocLink'] = (string) ( $wrote['docLink'] ?? '' );
$work['driveSheetLink'] = (string) ( $wrote['sheetLink'] ?? '' );
$work['driveError'] = '';
Neo_Pulse_App_Json_File_Store::write( $path, $work );

$sheet_id = '';
if ( preg_match( '#/spreadsheets/d/([^/]+)#', (string) ( $wrote['sheetLink'] ?? '' ), $m ) ) {
	$sheet_id = $m[1];
}
if ( $sheet_id === '' ) {
	exit( 0 );
}
$access = Neo_Pulse_App_Google_Mcp_Tokens::get_valid_access_token();
$res = wp_remote_get(
	'https://sheets.googleapis.com/v4/spreadsheets/' . rawurlencode( $sheet_id ) . '/values/A1:J5',
	array(
		'timeout' => 30,
		'headers' => array( 'Authorization' => 'Bearer ' . $access ),
	)
);
echo 'verify_http=' . (int) wp_remote_retrieve_response_code( $res ) . PHP_EOL;
$body = json_decode( (string) wp_remote_retrieve_body( $res ), true );
$rows = is_array( $body['values'] ?? null ) ? $body['values'] : array();
echo 'verify_rows=' . count( $rows ) . PHP_EOL;
foreach ( array_slice( $rows, 0, 3 ) as $row ) {
	echo 'row=' . wp_json_encode( $row ) . PHP_EOL;
}
