<?php
require '/var/www/wp-load.php';

$folder_id = '1aQwytrqzxOPqDWUMOZZwHrPisJgBsKma';
$run_id    = 2407;
$path      = Neo_Pulse_App_Data_Paths::editorial_content_audit_work_path( $run_id );
$work      = Neo_Pulse_App_Json_File_Store::read( $path );
if ( ! is_array( $work ) ) {
	fwrite( STDERR, "missing work for run $run_id\n" );
	exit( 1 );
}

$access = Neo_Pulse_App_Google_Mcp_Tokens::get_valid_access_token();
if ( is_wp_error( $access ) ) {
	fwrite( STDERR, 'token: ' . $access->get_error_message() . "\n" );
	exit( 1 );
}

$list_url = add_query_arg(
	array(
		'q'                         => sprintf( "'%s' in parents and trashed = false", $folder_id ),
		'fields'                    => 'files(id,name,mimeType,webViewLink,parents,owners)',
		'supportsAllDrives'         => 'true',
		'includeItemsFromAllDrives' => 'true',
		'pageSize'                  => 50,
	),
	'https://www.googleapis.com/drive/v3/files'
);
$list_res = wp_remote_get(
	$list_url,
	array(
		'timeout' => 30,
		'headers' => array( 'Authorization' => 'Bearer ' . $access ),
	)
);
$code = (int) wp_remote_retrieve_response_code( $list_res );
$body = json_decode( (string) wp_remote_retrieve_body( $list_res ), true );
echo "list_status=$code\n";
$files = is_array( $body ) && isset( $body['files'] ) && is_array( $body['files'] ) ? $body['files'] : array();
echo 'listed=' . count( $files ) . "\n";
foreach ( $files as $f ) {
	echo '- ' . ( $f['name'] ?? '?' ) . ' | ' . ( $f['mimeType'] ?? '?' ) . ' | ' . ( $f['id'] ?? '' ) . ' | ' . ( $f['webViewLink'] ?? '' ) . "\n";
}
if ( isset( $body['error'] ) ) {
	echo 'list_error=' . wp_json_encode( $body['error'] ) . "\n";
}

$findings = isset( $work['findings'] ) && is_array( $work['findings'] ) ? $work['findings'] : array();
$log      = isset( $work['log'] ) && is_array( $work['log'] ) ? $work['log'] : array();
$done     = (int) ( $work['cursor'] ?? 0 );
$total    = isset( $work['inventory']['pages'] ) && is_array( $work['inventory']['pages'] ) ? count( $work['inventory']['pages'] ) : $done;
$site     = 'Advance Blinds & Drapery';

echo "work_cursor=$done findings=" . count( $findings ) . " total=$total\n";
echo 'stored_doc=' . (string) ( $work['driveDocLink'] ?? '' ) . "\n";

$wrote = Neo_Pulse_App_Editorial_Content_Audit_Mail::write_progress(
	$folder_id,
	$site,
	$done,
	$total,
	$log,
	$findings
);
echo 'write_ok=' . ( ! empty( $wrote['ok'] ) ? '1' : '0' ) . "\n";
echo 'write_doc=' . (string) ( $wrote['docLink'] ?? '' ) . "\n";
echo 'write_error=' . (string) ( $wrote['error'] ?? '' ) . "\n";

$list_res2 = wp_remote_get(
	$list_url,
	array(
		'timeout' => 30,
		'headers' => array( 'Authorization' => 'Bearer ' . $access ),
	)
);
$body2  = json_decode( (string) wp_remote_retrieve_body( $list_res2 ), true );
$files2 = is_array( $body2 ) && isset( $body2['files'] ) && is_array( $body2['files'] ) ? $body2['files'] : array();
echo 'listed_after=' . count( $files2 ) . "\n";
foreach ( $files2 as $f ) {
	echo '- ' . ( $f['name'] ?? '?' ) . ' | ' . ( $f['mimeType'] ?? '?' ) . ' | ' . ( $f['webViewLink'] ?? '' ) . "\n";
}
