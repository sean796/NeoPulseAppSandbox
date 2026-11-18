<?php
/**
 * Prove findings sheet keeps the same file ID across two write_progress calls.
 */
require '/var/www/wp-load.php';

$folder = Neo_Pulse_App_Editorial_Content_Audit_Mail::ensure_folder( 'Sheet Inplace Verify', 999001 );
if ( empty( $folder['ok'] ) ) {
	fwrite( STDERR, 'folder failed: ' . ( $folder['error'] ?? '?' ) . PHP_EOL );
	exit( 1 );
}
$folder_id = (string) $folder['folderId'];
echo 'folderId=' . $folder_id . PHP_EOL;
echo 'folderLink=' . (string) ( $folder['folderLink'] ?? '' ) . PHP_EOL;

$rows1 = array(
	array(
		'pageId'    => 1,
		'url'       => 'https://example.com/a',
		'title'     => 'A',
		'status'    => 'publish',
		'type'      => 'post',
		'severity'  => 'high',
		'certainty' => 'high',
		'quote'     => 'q1',
		'problem'   => 'problem one',
		'fix'       => 'fix one',
	),
);
$rows2   = $rows1;
$rows2[] = array(
	'pageId'    => 2,
	'url'       => 'https://example.com/b',
	'title'     => 'B',
	'status'    => 'publish',
	'type'      => 'post',
	'severity'  => 'medium',
	'certainty' => 'high',
	'quote'     => 'q2',
	'problem'   => 'problem two',
	'fix'       => 'fix two',
);

$first = Neo_Pulse_App_Editorial_Content_Audit_Mail::write_progress(
	$folder_id,
	'Sheet inplace verify',
	1,
	2,
	array( '1 A' ),
	$rows1
);
if ( empty( $first['ok'] ) ) {
	fwrite( STDERR, 'first write failed: ' . ( $first['error'] ?? '?' ) . PHP_EOL );
	exit( 2 );
}

$second = Neo_Pulse_App_Editorial_Content_Audit_Mail::write_progress(
	$folder_id,
	'Sheet inplace verify',
	2,
	2,
	array( '1 A', '2 B' ),
	$rows2
);
if ( empty( $second['ok'] ) ) {
	fwrite( STDERR, 'second write failed: ' . ( $second['error'] ?? '?' ) . PHP_EOL );
	exit( 3 );
}

$link1 = (string) ( $first['sheetLink'] ?? '' );
$link2 = (string) ( $second['sheetLink'] ?? '' );
echo 'sheetLink1=' . $link1 . PHP_EOL;
echo 'sheetLink2=' . $link2 . PHP_EOL;
echo 'docLink1=' . (string) ( $first['docLink'] ?? '' ) . PHP_EOL;
echo 'docLink2=' . (string) ( $second['docLink'] ?? '' ) . PHP_EOL;

$id1 = '';
$id2 = '';
if ( preg_match( '#/d/([a-zA-Z0-9_-]+)#', $link1, $m ) ) {
	$id1 = $m[1];
}
if ( preg_match( '#/d/([a-zA-Z0-9_-]+)#', $link2, $m ) ) {
	$id2 = $m[1];
}
echo 'id1=' . $id1 . PHP_EOL;
echo 'id2=' . $id2 . PHP_EOL;
if ( $id1 === '' || $id1 !== $id2 ) {
	fwrite( STDERR, "FAIL: spreadsheet ID changed\n" );
	exit( 4 );
}
echo "OK same spreadsheet ID across writes\n";
exit( 0 );
