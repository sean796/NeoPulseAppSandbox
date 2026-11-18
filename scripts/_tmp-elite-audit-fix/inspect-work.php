<?php
require '/var/www/wp-load.php';
$dir = Neo_Pulse_App_Data_Paths::root() . '/editorial-content-audit';
echo 'root=' . Neo_Pulse_App_Data_Paths::root() . PHP_EOL;
echo 'dir=' . $dir . PHP_EOL;
if ( ! is_dir( $dir ) ) {
	echo "no work dir\n";
	exit( 0 );
}
foreach ( glob( $dir . '/*' ) ?: array() as $path ) {
	$base = basename( $path );
	$size = filesize( $path );
	echo $base . ' bytes=' . $size . PHP_EOL;
	$raw  = file_get_contents( $path );
	$data = json_decode( (string) $raw, true );
	if ( ! is_array( $data ) ) {
		continue;
	}
	echo '  cursor=' . (int) ( $data['cursor'] ?? -1 )
		. ' findings=' . count( (array) ( $data['findings'] ?? array() ) )
		. ' driveFolderId=' . (string) ( $data['driveFolderId'] ?? '' )
		. ' driveError=' . (string) ( $data['driveError'] ?? '' )
		. ' driveDocLink=' . (string) ( $data['driveDocLink'] ?? '' )
		. PHP_EOL;
}
