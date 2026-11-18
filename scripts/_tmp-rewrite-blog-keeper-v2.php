<?php
require '/var/www/wp-load.php';
@set_time_limit( 400 );

$site = null;
$seed_paths = array(
	'/var/www/wp-content/plugins/neo-pulse-app/../../../../src/components/integrations/default-properties-seed.json',
	'/tmp/default-properties-seed.json',
);
foreach ( $seed_paths as $path ) {
	if ( ! is_readable( $path ) ) {
		continue;
	}
	$decoded = json_decode( (string) file_get_contents( $path ), true );
	foreach ( (array) ( $decoded['sites'] ?? array() ) as $row ) {
		if ( ! is_array( $row ) ) {
			continue;
		}
		if ( stripos( (string) ( $row['siteUrl'] ?? '' ), 'blindmagic.com' ) === false ) {
			continue;
		}
		$site = $row;
		break 2;
	}
}

$mirror = Neo_Pulse_App_Sites_Sync::load_mirror();
foreach ( (array) ( $mirror['sites'] ?? array() ) as $row ) {
	if ( ! is_array( $row ) ) {
		continue;
	}
	if ( stripos( (string) ( $row['siteUrl'] ?? '' ), 'blindmagic.com' ) === false ) {
		continue;
	}
	if ( ! is_array( $site ) ) {
		$site = $row;
	} else {
		foreach ( array( 'id', 'name', 'entitySitemapUrl', 'assignedAgentIds' ) as $key ) {
			if ( empty( $site[ $key ] ) && ! empty( $row[ $key ] ) ) {
				$site[ $key ] = $row[ $key ];
			}
		}
	}
	break;
}

if ( ! is_array( $site ) || trim( (string) ( $site['appPassword'] ?? '' ) ) === '' ) {
	echo "no Blind Magic credentials\n";
	exit( 1 );
}

echo 'site=' . ( $site['siteUrl'] ?? '' ) . "\n";
$blog = Neo_Pulse_App_Cannibalization_Audit_Pipeline::blog_map( $site );
if ( is_wp_error( $blog ) ) {
	echo 'ERR ' . $blog->get_error_message() . "\n";
	exit( 1 );
}

$folder = Neo_Pulse_App_Cannibalization_Audit_Mail::ensure_folder( ( $blog['siteName'] ?? 'Blind Magic' ) . ' keeper by clicks v2', 2492 );
echo 'folder=' . ( $folder['folderLink'] ?? ( $folder['error'] ?? '' ) ) . "\n";
if ( empty( $folder['ok'] ) ) {
	exit( 1 );
}
$wrote = Neo_Pulse_App_Cannibalization_Audit_Mail::write_sheet(
	(string) $folder['folderId'],
	array( 'answer' => (string) $blog['answer'] ),
	'Pulse Redirect'
);
echo 'sheet=' . ( $wrote['sheetLink'] ?? ( $wrote['error'] ?? '' ) ) . "\n";

$a       = (string) $blog['answer'];
$lines   = preg_split( '/\r\n|\n|\r/', $a );
$as_src  = 0;
$as_dest = 0;
$self    = 0;
foreach ( $lines as $line ) {
	if ( stripos( $line, 'hunter-douglas-vs-alta' ) === false ) {
		continue;
	}
	echo $line . "\n";
	if ( preg_match( '#^[^,]*,\s*/?blog/hunter-douglas-vs-alta/#i', $line ) ) {
		++$as_src;
	}
	if ( preg_match( '#https?://[^,\s\"]*hunter-douglas-vs-alta/#i', $line ) ) {
		++$as_dest;
	}
	if ( preg_match( '#^[^,]*,\s*/?blog/hunter-douglas-vs-alta/[^,]*,exact,https?://[^,\s\"]*hunter-douglas-vs-alta/#i', $line ) ) {
		++$self;
	}
}
echo "alta_source_rows=$as_src alta_destination_rows=$as_dest self_rows=$self\n";
file_put_contents( '/tmp/cannibal-blog-answer-v2.txt', $a );
