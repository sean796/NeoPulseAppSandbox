<?php
require '/var/www/wp-load.php';
@set_time_limit( 600 );

$run  = Neo_Pulse_App_Agent_Runs_Store::get_run( 1, 2490, false );
$site = is_array( $run ) ? ( $run['plan']['cannibalizationAudit']['site'] ?? null ) : null;
if ( ! is_array( $site ) ) {
	echo "missing site from run 2490\n";
	exit( 1 );
}

echo "blog map...\n";
$blog = Neo_Pulse_App_Cannibalization_Audit_Pipeline::blog_map( $site );
if ( is_wp_error( $blog ) ) {
	echo 'BLOG ERROR ' . $blog->get_error_message() . "\n";
	exit( 1 );
}
echo 'blog pages=' . (int) ( $blog['pageCount'] ?? 0 ) . ' answer_len=' . strlen( (string) ( $blog['answer'] ?? '' ) ) . "\n";

echo "service map...\n";
$svc = Neo_Pulse_App_Cannibalization_Audit_Pipeline::service_area_map( $site );
if ( is_wp_error( $svc ) ) {
	echo 'SERVICE ERROR ' . $svc->get_error_message() . "\n";
	exit( 1 );
}
echo 'service pages=' . (int) ( $svc['serviceCount'] ?? 0 ) . ' answer_len=' . strlen( (string) ( $svc['answer'] ?? '' ) ) . "\n";

$name   = (string) ( $blog['siteName'] ?? 'Blind Magic' );
$folder = Neo_Pulse_App_Cannibalization_Audit_Mail::ensure_folder( $name . ' keeper by clicks', 2491 );
echo 'folder=' . ( $folder['folderLink'] ?? ( $folder['error'] ?? '' ) ) . "\n";
if ( empty( $folder['ok'] ) ) {
	exit( 1 );
}

$blog_sheet = Neo_Pulse_App_Cannibalization_Audit_Mail::write_sheet(
	(string) $folder['folderId'],
	array( 'answer' => (string) $blog['answer'] ),
	'Pulse Redirect'
);
echo 'blog_sheet=' . ( $blog_sheet['sheetLink'] ?? ( $blog_sheet['error'] ?? '' ) ) . "\n";

$svc_sheet = Neo_Pulse_App_Cannibalization_Audit_Mail::write_sheet(
	(string) $folder['folderId'],
	array( 'answer' => (string) $svc['answer'] ),
	'Pulse Redirect Service Areas'
);
echo 'service_sheet=' . ( $svc_sheet['sheetLink'] ?? ( $svc_sheet['error'] ?? '' ) ) . "\n";

$blog_answer = (string) ( $blog['answer'] ?? '' );
$as_source   = (bool) preg_match( '#(?m)^[^,\n]*,\s*"?blog/hunter-douglas-vs-alta/?\"?\s*,#i', $blog_answer )
	|| (bool) preg_match( '#(?m)^[^,\n]*,blog/hunter-douglas-vs-alta/#i', $blog_answer );
$as_dest     = stripos( $blog_answer, 'hunter-douglas-vs-alta' ) !== false
	&& (bool) preg_match( '#https?://[^,\s\"]*hunter-douglas-vs-alta/#i', $blog_answer );
echo 'alta_as_source=' . ( $as_source ? 'yes' : 'no' ) . "\n";
echo 'alta_as_destination=' . ( $as_dest ? 'yes' : 'no' ) . "\n";
file_put_contents( '/tmp/cannibal-blog-answer.txt', $blog_answer );
file_put_contents( '/tmp/cannibal-service-answer.txt', (string) ( $svc['answer'] ?? '' ) );
echo "saved answers to /tmp/cannibal-*-answer.txt\n";
