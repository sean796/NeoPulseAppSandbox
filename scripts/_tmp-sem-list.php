<?php
require '/var/www/wp-load.php';
$project = 28187066;
$key = Neo_Pulse_App_Semrush_Client::api_key();
function getj( $url, $key, $params = array() ) {
	$a = Neo_Pulse_App_Semrush_Client::auth_for_get( $key, $params );
	$r = wp_remote_get( add_query_arg( $a['params'], $url ), array( 'timeout' => 40, 'headers' => array_merge( array( 'Accept' => 'application/json' ), $a['headers'] ) ) );
	$code = (int) wp_remote_retrieve_response_code( $r );
	$body = (string) wp_remote_retrieve_body( $r );
	return array( $code, $body );
}
list( $code, $body ) = getj( 'https://api.semrush.com/reports/v1/projects/' . $project . '/siteaudit/snapshots', $key );
$data = json_decode( $body, true );
$list = isset( $data['snapshots'] ) ? $data['snapshots'] : ( isset( $data[0] ) ? $data : array() );
$snap = '';
$best = 0;
$row0 = array();
foreach ( $list as $row ) {
	if ( ! is_array( $row ) ) continue;
	$id = (string) ( $row['snapshot_id'] ?? '' );
	$date = (int) ( $row['finish_date'] ?? 0 );
	if ( $id !== '' && ( $snap === '' || $date > $best ) ) {
		$snap = $id;
		$best = $date;
		$row0 = $row;
	}
}
echo "SNAP $snap\nKEYS " . implode( ',', array_keys( $row0 ) ) . "\n";
$paths = array(
	"https://api.semrush.com/reports/v1/projects/$project/siteaudit/snapshot/$snap",
	"https://api.semrush.com/reports/v1/projects/$project/siteaudit/snapshot/$snap/meta",
	"https://api.semrush.com/reports/v1/projects/$project/siteaudit/meta/issues",
	"https://api.semrush.com/reports/v1/projects/$project/siteaudit/issues",
);
foreach ( $paths as $url ) {
	list( $c, $b ) = getj( $url, $key );
	$d = json_decode( $b, true );
	$keys = is_array( $d ) ? implode( ',', array_keys( $d ) ) : substr( $b, 0, 80 );
	echo "HTTP $c " . substr( $url, 40 ) . " KEYS $keys\n";
}
