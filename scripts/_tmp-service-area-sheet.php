<?php
require '/var/www/wp-load.php';
@set_time_limit(400);
$run = Neo_Pulse_App_Agent_Runs_Store::get_run( 1, 2490, false );
$site = $run['plan']['cannibalizationAudit']['site'];
echo "service areas...\n";
$map = Neo_Pulse_App_Cannibalization_Audit_Pipeline::service_area_map( $site );
if ( is_wp_error( $map ) ) {
	echo 'ERROR ' . $map->get_error_message() . "\n";
	exit( 1 );
}
echo 'count=' . (int) ( $map['serviceCount'] ?? 0 ) . ' answer_len=' . strlen( (string) ( $map['answer'] ?? '' ) ) . "\n";
$name   = (string) ( $map['siteName'] ?? 'Blind Magic' );
$folder = Neo_Pulse_App_Cannibalization_Audit_Mail::ensure_folder( $name . ' service areas', 2490 );
echo 'folder=' . ( $folder['folderLink'] ?? ( $folder['error'] ?? '' ) ) . "\n";
if ( empty( $folder['ok'] ) ) {
	exit( 1 );
}
$wrote = Neo_Pulse_App_Cannibalization_Audit_Mail::write_sheet(
	(string) $folder['folderId'],
	array( 'answer' => (string) $map['answer'] ),
	'Pulse Redirect Service Areas'
);
echo 'sheet=' . ( $wrote['sheetLink'] ?? ( $wrote['error'] ?? '' ) ) . "\n";
