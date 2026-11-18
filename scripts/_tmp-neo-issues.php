<?php
require '/var/www/wp-load.php';
$project = 28187066;
$key     = Neo_Pulse_App_Semrush_Client::api_key();
$auth    = Neo_Pulse_App_Semrush_Client::auth_for_get( $key, array() );
$base    = 'https://api.semrush.com/reports/v1/projects/' . $project . '/siteaudit/snapshots';
$res     = wp_remote_get( add_query_arg( $auth['params'], $base ), array( 'timeout' => 60, 'headers' => array_merge( array( 'Accept' => 'application/json' ), $auth['headers'] ) ) );
$body    = json_decode( (string) wp_remote_retrieve_body( $res ), true );
$list    = isset( $body['snapshots'] ) && is_array( $body['snapshots'] ) ? $body['snapshots'] : ( isset( $body[0] ) ? $body : array() );
$snap    = '';
$best    = 0;
$sample  = array();
foreach ( $list as $row ) {
	if ( ! is_array( $row ) ) {
		continue;
	}
	$id   = (string) ( $row['snapshot_id'] ?? '' );
	$date = (int) ( $row['finish_date'] ?? 0 );
	if ( $sample === array() ) {
		$sample = array_keys( $row );
	}
	if ( $id !== '' && ( $snap === '' || $date > $best ) ) {
		$snap = $id;
		$best = $date;
	}
}
echo 'SNAPSHOT ' . $snap . ' KEYS ' . implode( ',', $sample ) . PHP_EOL;
$ids = array_merge( range( 1, 40 ), range( 100, 130 ) );
foreach ( $ids as $issue ) {
	$full = 'https://api.semrush.com/reports/v1/projects/' . $project . "/siteaudit/snapshot/{$snap}/issue/{$issue}";
	$a    = Neo_Pulse_App_Semrush_Client::auth_for_get( $key, array( 'page' => 1, 'limit' => 5 ) );
	$r    = wp_remote_get( add_query_arg( $a['params'], $full ), array( 'timeout' => 30, 'headers' => array_merge( array( 'Accept' => 'application/json' ), $a['headers'] ) ) );
	$code = (int) wp_remote_retrieve_response_code( $r );
	$decoded = json_decode( (string) wp_remote_retrieve_body( $r ), true );
	$n = 0;
	$total = '';
	if ( is_array( $decoded ) ) {
		$data = isset( $decoded['data'] ) && is_array( $decoded['data'] ) ? $decoded['data'] : array();
		$n = count( $data );
		$total = (string) ( $decoded['total'] ?? $n );
	}
	if ( $code === 200 && (int) $total > 0 ) {
		echo "ISSUE {$issue} rows={$n} total={$total}\n";
	}
}
