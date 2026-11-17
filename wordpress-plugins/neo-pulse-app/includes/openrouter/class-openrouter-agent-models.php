<?php
/**
 * Centralized OpenRouter pipeline agent category models for PHP backend handlers.
 *
 * Mirrors frontend Pipeline Agent categories plus Decision (checker / router).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Openrouter_Agent_Models {

	const CATEGORY_RESEARCH  = 'research';
	const CATEGORY_BLOG      = 'blog';
	const CATEGORY_IMAGE     = 'image';
	const CATEGORY_META      = 'meta';
	const CATEGORY_REPORT    = 'report';
	const CATEGORY_ADS       = 'ads';
	const CATEGORY_VIDEO     = 'video';
	const CATEGORY_DECISION  = 'decision';

	const DEFAULT_RESEARCH_MODEL = 'deepseek/deepseek-v4.1-flash';
	const DEFAULT_BLOG_MODEL     = 'google/gemini-2.5-flash';
	const DEFAULT_IMAGE_MODEL    = 'google/gemini-3.1-flash-image';
	const DEFAULT_META_MODEL     = 'google/gemini-2.5-flash';
	const DEFAULT_REPORT_MODEL   = 'deepseek/deepseek-v4.1-flash';
	const DEFAULT_ADS_MODEL      = 'deepseek/deepseek-v4.1-flash';
	const DEFAULT_VIDEO_MODEL    = 'heygen/video-1';
	const DEFAULT_DECISION_MODEL = 'google/gemini-3.8-flash';

	/**
	 * Resolve the OpenRouter model id for a pipeline agent category.
	 *
	 * @param string $category One of research, blog, image, meta, report, ads, video, decision.
	 * @param string $override Optional explicit model id from request payload.
	 * @return string
	 */
	public static function resolve( string $category, string $override = '' ): string {
		$trimmed = trim( $override );
		if ( $trimmed !== '' && strpos( $trimmed, '/' ) !== false ) {
			return $trimmed;
		}

		switch ( strtolower( trim( $category ) ) ) {
			case self::CATEGORY_RESEARCH:
				return self::DEFAULT_RESEARCH_MODEL;
			case self::CATEGORY_BLOG:
				return self::DEFAULT_BLOG_MODEL;
			case self::CATEGORY_IMAGE:
				return self::DEFAULT_IMAGE_MODEL;
			case self::CATEGORY_META:
				return self::DEFAULT_META_MODEL;
			case self::CATEGORY_REPORT:
				return self::DEFAULT_REPORT_MODEL;
			case self::CATEGORY_ADS:
				return self::DEFAULT_ADS_MODEL;
			case self::CATEGORY_VIDEO:
				return self::DEFAULT_VIDEO_MODEL;
			case self::CATEGORY_DECISION:
				return self::DEFAULT_DECISION_MODEL;
			default:
				return self::DEFAULT_BLOG_MODEL;
		}
	}
}
