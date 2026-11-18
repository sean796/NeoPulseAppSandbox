<?php
require '/var/www/wp-load.php';
@set_time_limit(400);
$run = Neo_Pulse_App_Agent_Runs_Store::get_run( 1, 2490, false );
if ( ! is_array( $run ) ) {
	echo "missing\n";
	exit( 1 );
}
$saved = $run['plan']['cannibalizationAudit'];
echo "resume finish 2490 status=" . $run['status'] . "\n";
$out = Neo_Pulse_App_Cannibalization_Audit_Runner::finish(
	array(
		'runId'  => 2490,
		'teamId' => 1,
		'userId' => (int) ( $saved['userId'] ?? 0 ),
		'source' => (string) ( $saved['source'] ?? 'pulse_assist' ),
		'siteId' => (string) ( $saved['siteId'] ?? '' ),
		'site'   => $saved['site'],
		'to'     => (string) ( $saved['to'] ?? '' ),
	)
);
echo wp_json_encode( $out ) . "\n";
$fresh = Neo_Pulse_App_Agent_Runs_Store::get_run( 1, 2490, false );
echo 'status=' . ( $fresh['status'] ?? '?' ) . "\n";
echo 'sheet=' . ( $fresh['result']['googleDriveSheetWebViewLink'] ?? '' ) . "\n";
echo 'error=' . ( $fresh['errorMessage'] ?? '' ) . "\n";
