<?php
/**
 * Skill run schedule: hourly slots, daily, weekly, monthly.
 *
 * Run via: php wordpress-plugins/neo-pulse-app/tests/test-skill-run-schedule.php
 */

define( 'ABSPATH', sys_get_temp_dir() . '/neo-pulse-skill-schedule-test/' );

require_once dirname( __DIR__ ) . '/includes/skills/class-skill-run-schedule.php';

function check( string $label, bool $ok ): void {
	if ( ! $ok ) {
		fwrite( STDERR, "FAIL {$label}\n" );
		exit( 1 );
	}
	fwrite( STDOUT, "ok {$label}\n" );
}

$tz  = new DateTimeZone( 'America/Edmonton' );
$now = new DateTime( '2026-11-17 07:05:00', $tz );
$site = array(
	'id' => 'site-1',
	'skillSchedules' => array(
		'content.posts.gap-check' => array(
			'cadence' => 'daily',
			'intervalHours' => 24,
			'time' => '07:00',
			'dayOfMonth' => 17,
		),
	),
);

$due = Neo_Pulse_App_Skill_Run_Schedule::due_for_site( $site, 'content.posts.gap-check', $now );
check( 'legacy day of month is monthly and due on the 17th after 07:00', ! empty( $due['due'] ) && $due['runKey'] === '2026-11-17-420' );

$other = new DateTime( '2026-11-16 07:05:00', $tz );
$not_day = Neo_Pulse_App_Skill_Run_Schedule::due_for_site( $site, 'content.posts.gap-check', $other );
check( 'not due on a different day of the month', empty( $not_day['due'] ) );

$site['skillSchedules']['content.posts.gap-check']['lastRunKey'] = '2026-11-17-420';
$again = Neo_Pulse_App_Skill_Run_Schedule::due_for_site( $site, 'content.posts.gap-check', $now );
check( 'not due twice in the same slot', empty( $again['due'] ) );

$daily = array( 'id' => 'site-2' );
$morning = Neo_Pulse_App_Skill_Run_Schedule::due_for_site( $daily, 'reporting.semrush.safe-fix', $now );
check( 'missing schedule defaults to daily 07:00', ! empty( $morning['due'] ) );

$early = new DateTime( '2026-11-17 06:30:00', $tz );
$before = Neo_Pulse_App_Skill_Run_Schedule::due_for_site( $daily, 'reporting.semrush.safe-fix', $early );
check( 'not due before 07:00', empty( $before['due'] ) );

$explicit_daily = array(
	'skillSchedules' => array(
		'reporting.semrush.safe-fix' => array(
			'cadence' => 'daily',
			'time' => '07:00',
		),
	),
);
$any_day = Neo_Pulse_App_Skill_Run_Schedule::due_for_site( $explicit_daily, 'reporting.semrush.safe-fix', $other );
check( 'explicit daily is due on any day after 07:00', ! empty( $any_day['due'] ) );

$hourly_site = array(
	'skillSchedules' => array(
		'reporting.semrush.safe-fix' => array(
			'intervalHours' => 2,
			'time' => '07:00',
		),
	),
);
$later = new DateTime( '2026-11-17 09:10:00', $tz );
$slot = Neo_Pulse_App_Skill_Run_Schedule::due_for_site( $hourly_site, 'reporting.semrush.safe-fix', $later );
check( 'two hour interval uses the 08:00 slot from midnight', ! empty( $slot['due'] ) && $slot['runKey'] === '2026-11-17-480' );

$hourly_morning = new DateTime( '2026-11-17 00:05:00', $tz );
$midnight_slot = Neo_Pulse_App_Skill_Run_Schedule::due_for_site( $hourly_site, 'reporting.semrush.safe-fix', $hourly_morning );
check( 'two hour interval is due at midnight with a saved 07:00 time', ! empty( $midnight_slot['due'] ) && $midnight_slot['runKey'] === '2026-11-17-0' );

$weekly = array(
	'skillSchedules' => array(
		'reporting.semrush.safe-fix' => array(
			'cadence' => 'weekly',
			'dayOfWeek' => 2,
			'time' => '07:00',
		),
	),
);
$tuesday = Neo_Pulse_App_Skill_Run_Schedule::due_for_site( $weekly, 'reporting.semrush.safe-fix', $now );
check( 'weekly Tuesday is due on Tuesday', ! empty( $tuesday['due'] ) && $tuesday['runKey'] === '2026-11-17-420' );
$not_tuesday = Neo_Pulse_App_Skill_Run_Schedule::due_for_site( $weekly, 'reporting.semrush.safe-fix', $other );
check( 'weekly Tuesday is not due on Monday', empty( $not_tuesday['due'] ) );

$sunday_site = array(
	'skillSchedules' => array(
		'reporting.semrush.safe-fix' => array(
			'cadence' => 'weekly',
			'dayOfWeek' => 0,
			'time' => '07:00',
		),
	),
);
$sunday = new DateTime( '2026-11-15 07:05:00', $tz );
$sunday_due = Neo_Pulse_App_Skill_Run_Schedule::due_for_site( $sunday_site, 'reporting.semrush.safe-fix', $sunday );
check( 'weekly Sunday (0) is due on Sunday', ! empty( $sunday_due['due'] ) );

$month_end = array(
	'skillSchedules' => array(
		'reporting.semrush.safe-fix' => array(
			'cadence' => 'monthly',
			'dayOfMonth' => 31,
			'time' => '07:00',
		),
	),
);
$feb28 = new DateTime( '2026-02-28 07:05:00', $tz );
$feb27 = new DateTime( '2026-02-27 07:05:00', $tz );
$feb_due = Neo_Pulse_App_Skill_Run_Schedule::due_for_site( $month_end, 'reporting.semrush.safe-fix', $feb28 );
$feb_early = Neo_Pulse_App_Skill_Run_Schedule::due_for_site( $month_end, 'reporting.semrush.safe-fix', $feb27 );
check( 'monthly day 31 runs on the last day of February', ! empty( $feb_due['due'] ) && $feb_due['runKey'] === '2026-02-28-420' );
check( 'monthly day 31 is not due the day before month end', empty( $feb_early['due'] ) );

$leap = new DateTime( '2028-02-29 07:05:00', $tz );
$leap_before = new DateTime( '2028-02-28 07:05:00', $tz );
$leap_due = Neo_Pulse_App_Skill_Run_Schedule::due_for_site( $month_end, 'reporting.semrush.safe-fix', $leap );
$leap_skip = Neo_Pulse_App_Skill_Run_Schedule::due_for_site( $month_end, 'reporting.semrush.safe-fix', $leap_before );
check( 'monthly day 31 runs on Feb 29 in a leap year', ! empty( $leap_due['due'] ) );
check( 'monthly day 31 skips Feb 28 in a leap year', empty( $leap_skip['due'] ) );

fwrite( STDOUT, "All skill run schedule checks passed.\n" );
