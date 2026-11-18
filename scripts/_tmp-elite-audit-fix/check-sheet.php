<?php
require '/var/www/wp-load.php';

$sheet_id = '1lrmG_DX8uiV0mK1IiqMOdI7JCZ0WGXDrx-wOML7RO5s';
$dir      = Neo_Pulse_App_Data_Paths::root() . '/editorial-content-audit';
$latest   = null;
$latest_mtime = 0;
foreach ( glob( $dir . '/run-*.json' ) ?: array() as $path ) {
	$mtime = filemtime( $path );
	if ( $mtime > $latest_mtime ) {
		$latest_mtime = $mtime;
		$latest       = $path;
	}
}
echo 'latest=' . ( $latest ?: 'none' ) . PHP_EOL;
if ( ! $latest ) {
	exit( 1 );
}
$work = json_decode( (string) file_get_contents( $latest ), true );
$findings = is_array( $work['findings'] ?? null ) ? $work['findings'] : array();
echo 'cursor=' . (int) ( $work['cursor'] ?? -1 ) . ' findings=' . count( $findings ) . PHP_EOL;
echo 'folder=' . (string) ( $work['driveFolderId'] ?? '' ) . PHP_EOL;
echo 'doc=' . (string) ( $work['driveDocLink'] ?? '' ) . PHP_EOL;
echo 'sheetStored=' . (string) ( $work['driveSheetLink'] ?? '' ) . PHP_EOL;
if ( count( $findings ) > 0 ) {
	echo 'firstFinding=' . wp_json_encode( $findings[0] ) . PHP_EOL;
}

$csv = Neo_Pulse_App_Editorial_Content_Audit_Mail::csv_public( $findings );
echo "csv_bytes=" . strlen( $csv ) . " csv_lines=" . substr_count( $csv, "\n" ) . PHP_EOL;
echo "csv_head=\n" . implode( "\n", array_slice( explode( "\n", $csv ), 0, 4 ) ) . "\n";

$access = Neo_Pulse_App_Google_Mcp_Tokens::get_valid_access_token();
if ( is_wp_error( $access ) ) {
	fwrite( STDERR, $access->get_error_message() . "\n" );
	exit( 1 );
}
$url = 'https://sheets.googleapis.com/v4/spreadsheets/' . rawurlencode( $sheet_id ) . '/values/A1:J20';
$res = wp_remote_get(
	$url,
	array(
		'timeout' => 30,
		'headers' => array( 'Authorization' => 'Bearer ' . $access ),
	)
);
echo 'sheet_http=' . (int) wp_remote_retrieve_response_code( $res ) . PHP_EOL;
echo 'sheet_body=' . substr( (string) wp_remote_retrieve_body( $res ), 0, 1500 ) . PHP_EOL;
