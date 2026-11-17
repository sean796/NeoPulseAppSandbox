<?php
/**
 * Money-page internal links: inventory, GSC, OpenRouter plan, Neo MCP apply.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Money_Page_Internal_Links_Pipeline {

	const MAX_MONEY_PAGES      = 80;
	const MAX_BLOG_CANDIDATES  = 80;
	const MAX_QUERIES_PER_PAGE = 8;
	const MAX_LINKS            = 160;
	/** Minimum confirmed links required before the run succeeds. */
	const MIN_APPLIED_LINKS    = 5;
	/** Keep applying until this many when inventory allows. */
	const TARGET_APPLIED_LINKS = 10;
	const KEYWORD_MAX_POSITION = 50.0;
	const DECISION_MODEL       = 'typesafe/jev-1.13';
	const DECISION_MIN_NOUL    = 0.5;

	/** @var array<int,string> */
	const UTILITY_SLUGS = array(
		'blog', 'faq', 'faqs', 'service-area', 'service-areas', 'privacy-policy', 'privacy',
		'terms-of-service', 'terms-of-use', 'terms-and-conditions', 'terms-conditions', 'terms',
		'cookie-policy', 'cookies', 'table-of-contents', 'toc', 'thank-you', 'thankyou',
		'disclaimer', 'accessibility', 'legal', 'gdpr', 'returns-policy', 'refund-policy',
		'sitemap', 'site-map', 'contact', 'contact-us', 'promotion', 'promotions',
		'free-consultation', 'locations',
	);

	/** Pages that are not product or service offers. */
	const NON_MONEY_SLUGS = array(
		'about', 'about-us', 'testimonials', 'testimonial', 'reviews', 'review',
		'gallery', 'galleries', 'interior-gallery', 'exterior-gallery',
		'before-after', 'before-afters', 'before-and-after',
		'portfolio', 'our-work', 'our-team', 'team', 'careers',
	);

	/**
	 * @param array<string,mixed> $site
	 * @return array<string,mixed>|WP_Error
	 */
	public static function build_inventory( array $site ) {
		if ( self::is_custom_shades_blocked( $site ) ) {
			return new WP_Error(
				'neo-pulse_mplinks_custom_shades',
				'Custom Shades of London is not on Neo MCP for this skill yet.'
			);
		}
		$auth = self::auth_from_site( $site );
		if ( is_wp_error( $auth ) ) {
			return $auth;
		}

		$page_sitemap = self::resolve_page_sitemap_url( $site );
		$post_sitemap = self::resolve_post_sitemap_url( $site );
		if ( $page_sitemap === '' ) {
			return new WP_Error( 'neo-pulse_mplinks_sitemap', 'page-sitemap.xml is not configured for this site.' );
		}

		$money_urls = self::filter_money_urls(
			self::parse_sitemap_urls( $page_sitemap, $auth['username'], $auth['appPassword'] )
		);
		$blog_urls = array();
		if ( $post_sitemap !== '' ) {
			$blog_urls = array_values(
				array_unique(
					self::parse_sitemap_urls( $post_sitemap, $auth['username'], $auth['appPassword'] )
				)
			);
		}
		return array(
			'ok'           => true,
			'siteId'       => (string) ( $site['id'] ?? '' ),
			'siteName'     => (string) ( $site['name'] ?? '' ),
			'siteUrl'      => $auth['siteUrl'],
			'pageSitemap'  => $page_sitemap,
			'postSitemap'  => $post_sitemap,
			'moneyUrls'    => $money_urls,
			'blogUrls'     => $blog_urls,
			'moneyCount'   => count( $money_urls ),
			'blogCount'    => count( $blog_urls ),
			'goalMet'      => count( $money_urls ) === 0 || count( $blog_urls ) === 0,
			'message'      => count( $money_urls ) === 0
				? 'No money pages found after utility filter.'
				: ( count( $blog_urls ) === 0 ? 'No supporting blog URLs found.' : '' ),
		);
	}

	/**
	 * @param array<string,mixed> $site
	 * @param array<string,mixed> $inventory
	 * @return array<string,mixed>|WP_Error
	 */
	public static function attach_gsc_queries( array $site, array $inventory ) {
		$site_url = trim( (string) ( $site['siteUrl'] ?? $inventory['siteUrl'] ?? '' ) );
		$urls     = isset( $inventory['moneyUrls'] ) && is_array( $inventory['moneyUrls'] )
			? array_slice( $inventory['moneyUrls'], 0, self::MAX_MONEY_PAGES )
			: array();
		if ( $site_url === '' || $urls === array() ) {
			return new WP_Error( 'neo-pulse_mplinks_gsc', 'No money URLs for GSC.' );
		}

		$range = Neo_Pulse_App_Gsc_Performance::page_perf_range_from_body( array() );
		$dv    = Neo_Pulse_App_Gsc_Service_Account::validate_dates( $range['start'], $range['end'] );
		if ( empty( $dv['valid'] ) ) {
			return new WP_Error( 'neo-pulse_mplinks_gsc', (string) ( $dv['error'] ?? 'Invalid GSC date range' ) );
		}
		$resolved = Neo_Pulse_App_Gsc_Service_Account::resolve_or_fallback(
			$site_url,
			$dv['startDateStr'],
			$dv['endDateStr'],
			'page'
		);
		if ( empty( $resolved['property'] ) ) {
			return new WP_Error( 'neo-pulse_mplinks_gsc', 'No Search Console property matched this site.' );
		}

		$bulk = Neo_Pulse_App_Gsc_Service_Account::search_analytics_query(
			(string) $resolved['property'],
			array(
				'startDate'  => $dv['startDateStr'],
				'endDate'    => $dv['endDateStr'],
				'dimensions' => array( 'page', 'query' ),
				'rowLimit'   => 5000,
			)
		);
		if ( is_wp_error( $bulk ) ) {
			return $bulk;
		}
		$host     = strtolower( (string) wp_parse_url( $site_url, PHP_URL_HOST ) );
		$blog_set = array();
		foreach ( (array) ( $inventory['blogUrls'] ?? array() ) as $blog_url ) {
			$blog_set[ self::norm_url( (string) $blog_url ) ] = true;
		}
		$by_page = array();
		foreach ( (array) ( $bulk['rows'] ?? array() ) as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$keys = isset( $row['keys'] ) && is_array( $row['keys'] ) ? $row['keys'] : array();
			$page = trim( (string) ( $keys[0] ?? '' ) );
			$query = trim( (string) ( $keys[1] ?? '' ) );
			$page_host = strtolower( (string) wp_parse_url( $page, PHP_URL_HOST ) );
			if ( $page === '' || $query === '' || $page_host === '' || $page_host !== $host ) {
				continue;
			}
			if ( isset( $blog_set[ self::norm_url( $page ) ] ) ) {
				continue;
			}
			if ( self::is_utility_url( $page ) || self::is_non_money_page( $page ) || self::is_service_area_url( $page ) ) {
				continue;
			}
			if ( ! isset( $by_page[ $page ] ) ) {
				$by_page[ $page ] = array(
					'url'         => $page,
					'queries'     => array(),
					'impressions' => 0,
				);
			}
			$impressions = (int) ( $row['impressions'] ?? 0 );
			$by_page[ $page ]['impressions'] += $impressions;
			$by_page[ $page ]['queries'][] = array(
				'query'       => $query,
				'clicks'      => (int) ( $row['clicks'] ?? 0 ),
				'impressions' => $impressions,
				'position'    => (float) ( $row['position'] ?? 0 ),
			);
		}
		$money = array();
		foreach ( $by_page as $page ) {
			$queries = $page['queries'];
			usort(
				$queries,
				static function ( $a, $b ) {
					return ( (int) ( $b['impressions'] ?? 0 ) ) <=> ( (int) ( $a['impressions'] ?? 0 ) );
				}
			);
			$page['queries']    = array_slice( $queries, 0, self::MAX_QUERIES_PER_PAGE );
			$page['topKeyword'] = (string) ( $page['queries'][0]['query'] ?? '' );
			$money[]            = $page;
		}
		usort(
			$money,
			static function ( $a, $b ) {
				return ( (int) ( $b['impressions'] ?? 0 ) ) <=> ( (int) ( $a['impressions'] ?? 0 ) );
			}
		);
		$money = array_slice( $money, 0, self::MAX_MONEY_PAGES );

		$kept = self::keep_meaningful_pages( $money );
		if ( is_wp_error( $kept ) ) {
			return $kept;
		}

		$with_keyword = array();
		foreach ( $kept as $page ) {
			$keyword = self::pick_gsc_keyword( (array) ( $page['queries'] ?? array() ) );
			if ( $keyword === null ) {
				$url = trim( (string) ( $page['url'] ?? '' ) );
				if ( $url === '' ) {
					continue;
				}
				// Still plan the page: body text chooses the link; keyword is only a hint.
				$path = trim( (string) wp_parse_url( $url, PHP_URL_PATH ), '/' );
				$parts = array_values( array_filter( explode( '/', $path ) ) );
				$slug  = str_replace( '-', ' ', (string) end( $parts ) );
				$keyword = array(
					'query'       => $slug !== '' ? $slug : 'service',
					'clicks'      => 0,
					'impressions' => (int) ( $page['impressions'] ?? 0 ),
					'position'    => 0.0,
				);
			}
			$page['keyword']            = (string) ( $keyword['query'] ?? '' );
			$page['keywordClicks']      = (int) ( $keyword['clicks'] ?? 0 );
			$page['keywordImpressions'] = (int) ( $keyword['impressions'] ?? 0 );
			$page['keywordPosition']    = (float) ( $keyword['position'] ?? 0 );
			$page['topKeyword']         = $page['keyword'];
			$with_keyword[]             = $page;
		}

		$inventory['moneyPages'] = $with_keyword;
		$inventory['moneyUrls']  = array_values(
			array_map(
				static function ( $row ) {
					return (string) ( $row['url'] ?? '' );
				},
				$with_keyword
			)
		);
		$inventory['moneyCount']  = count( $with_keyword );
		$inventory['gscProperty'] = (string) $resolved['property'];
		$inventory['gscRange']    = array(
			'start' => $dv['startDateStr'],
			'end'   => $dv['endDateStr'],
		);
		return $inventory;
	}

	/**
	 * Decision-logic pass: one noul question per page. Keep pages the model scores as meaningful search demand.
	 *
	 * @param array<int,array<string,mixed>> $money
	 * @return array<int,array<string,mixed>>|WP_Error
	 */
	private static function keep_meaningful_pages( array $money ) {
		$candidates = array();
		foreach ( $money as $page ) {
			if ( (int) ( $page['impressions'] ?? 0 ) < 1 || ( $page['queries'] ?? array() ) === array() ) {
				continue;
			}
			$candidates[] = $page;
		}
		if ( $candidates === array() ) {
			return array();
		}

		$kept = array();
		foreach ( array_chunk( $candidates, 20 ) as $chunk ) {
			$questions = array();
			$state_pages = array();
			foreach ( $chunk as $i => $page ) {
				$queries = array();
				foreach ( array_slice( (array) ( $page['queries'] ?? array() ), 0, 5 ) as $qrow ) {
					if ( ! is_array( $qrow ) ) {
						continue;
					}
					$queries[] = array(
						'query'       => (string) ( $qrow['query'] ?? '' ),
						'impressions' => (int) ( $qrow['impressions'] ?? 0 ),
						'clicks'      => (int) ( $qrow['clicks'] ?? 0 ),
					);
				}
				$state_pages[] = array(
					'url'     => (string) ( $page['url'] ?? '' ),
					'queries' => $queries,
				);
				$questions[ 'p' . $i ] = array(
					'type'         => 'noul',
					'instructions' => 'Using only state.pages[' . $i . '], is this a product or service money page with meaningful commercial search demand?',
					'criteria'     => array(
						'true'  => 'The URL is a product or service offer page, and at least one query is a commercial search for that offer.',
						'false' => 'Blog post, article, testimonial, gallery, about, contact, or any page that is not a product or service.',
					),
				);
			}
			$answers = self::openrouter_decide( $questions, array( 'pages' => $state_pages ) );
			if ( is_wp_error( $answers ) ) {
				return $answers;
			}
			foreach ( $chunk as $i => $page ) {
				$noul = $answers[ 'p' . $i ] ?? null;
				if ( ! is_numeric( $noul ) ) {
					return new WP_Error( 'neo-pulse_mplinks_decide', 'Decision reply missing noul for page ' . $i );
				}
				if ( (float) $noul >= self::DECISION_MIN_NOUL ) {
					$page['decisionNoul'] = (float) $noul;
					$kept[]               = $page;
				}
			}
		}
		return $kept;
	}

	/**
	 * One GSC keyword for a money page: traffic (clicks, else impressions) and position 20 or better.
	 *
	 * @param array<int,array<string,mixed>> $queries
	 * @return array{query:string,clicks:int,impressions:int,position:float}|null
	 */
	private static function pick_gsc_keyword( array $queries ) {
		$best = null;
		foreach ( $queries as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$query = trim( (string) ( $row['query'] ?? '' ) );
			$clicks = (int) ( $row['clicks'] ?? 0 );
			$impressions = (int) ( $row['impressions'] ?? 0 );
			$position = (float) ( $row['position'] ?? 0 );
			if ( $query === '' || $position <= 0 || $position > self::KEYWORD_MAX_POSITION ) {
				continue;
			}
			if ( $clicks < 1 && $impressions < 1 ) {
				continue;
			}
			$score = $clicks > 0 ? ( $clicks * 1000 + $impressions ) : $impressions;
			if ( $best === null || $score > (int) ( $best['score'] ?? 0 ) ) {
				$best = array(
					'query'       => $query,
					'clicks'      => $clicks,
					'impressions' => $impressions,
					'position'    => $position,
					'score'       => $score,
				);
			}
		}
		if ( $best === null ) {
			return null;
		}
		unset( $best['score'] );
		return $best;
	}

	/**
	 * One job per money page: the GSC keyword. Target and anchor come from apply brainstorm.
	 *
	 * @param array<string,mixed> $inventory
	 * @return array<string,mixed>|WP_Error
	 */
	public static function plan_links( array $inventory ) {
		$money = isset( $inventory['moneyPages'] ) && is_array( $inventory['moneyPages'] )
			? $inventory['moneyPages']
			: array();
		$blogs = isset( $inventory['blogUrls'] ) && is_array( $inventory['blogUrls'] )
			? $inventory['blogUrls']
			: array();
		$money_urls = isset( $inventory['moneyUrls'] ) && is_array( $inventory['moneyUrls'] )
			? $inventory['moneyUrls']
			: array();
		$candidates = array();
		foreach ( array_merge( $blogs, $money_urls ) as $url ) {
			$url = trim( (string) $url );
			if ( $url === '' || self::is_service_area_url( $url ) ) {
				continue;
			}
			$candidates[ self::norm_url( $url ) ] = $url;
			if ( count( $candidates ) >= self::MAX_BLOG_CANDIDATES + self::MAX_MONEY_PAGES ) {
				break;
			}
		}
		$links = array();
		foreach ( $money as $page ) {
			if ( ! is_array( $page ) ) {
				continue;
			}
			$money_url = trim( (string) ( $page['url'] ?? '' ) );
			$keyword   = trim( (string) ( $page['keyword'] ?? $page['topKeyword'] ?? '' ) );
			if ( $money_url === '' || $keyword === '' || self::is_non_money_page( $money_url ) || self::is_utility_url( $money_url ) ) {
				continue;
			}
			$mk = self::norm_url( $money_url );
			$dest = array();
			foreach ( $candidates as $key => $url ) {
				if ( $key === $mk ) {
					continue;
				}
				$dest[] = $url;
			}
			if ( $dest === array() ) {
				continue;
			}
			$links[] = array(
				'moneyUrl'           => $money_url,
				'keyword'            => $keyword,
				'keywordClicks'      => (int) ( $page['keywordClicks'] ?? 0 ),
				'keywordImpressions' => (int) ( $page['keywordImpressions'] ?? 0 ),
				'keywordPosition'    => (float) ( $page['keywordPosition'] ?? 0 ),
				'anchorText'         => $keyword,
				'targetUrl'          => '',
				'candidates'         => $dest,
			);
			if ( count( $links ) >= self::MAX_LINKS ) {
				break;
			}
		}
		return array(
			'ok'    => true,
			'links' => $links,
		);
	}

	/**
	 * @param mixed               $raw
	 * @param array<string,mixed> $inventory
	 * @return array<string,mixed>|WP_Error
	 */
	public static function validate_plan( $raw, array $inventory ) {
		if ( ! is_array( $raw ) || ! isset( $raw['links'] ) || ! is_array( $raw['links'] ) ) {
			return new WP_Error( 'neo-pulse_mplinks_plan', 'Plan missing links array' );
		}
		$planned = self::plan_links( $inventory );
		if ( is_wp_error( $planned ) ) {
			return $planned;
		}
		$allowed = array();
		foreach ( (array) ( $planned['links'] ?? array() ) as $row ) {
			$allowed[ self::norm_url( (string) ( $row['moneyUrl'] ?? '' ) ) ] = $row;
		}
		$out = array();
		foreach ( $raw['links'] as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$key = self::norm_url( (string) ( $row['moneyUrl'] ?? '' ) );
			if ( $key === '' || ! isset( $allowed[ $key ] ) ) {
				continue;
			}
			$out[] = $allowed[ $key ];
			if ( count( $out ) >= self::MAX_LINKS ) {
				break;
			}
		}
		return array(
			'ok'    => true,
			'links' => $out !== array() ? $out : array_values( $allowed ),
		);
	}

	/**
	 * @param array<string,mixed>            $site
	 * @param array<int,array<string,mixed>> $links
	 * @return array{applied:array<int,array<string,mixed>>,failed:array<int,array<string,mixed>>,skipped:array<int,array<string,mixed>>}|WP_Error
	 */
	public static function apply_links( array $site, array $links ) {
		// Same credential fields Safe Fix uses: the profile record posted from Pulse Run.
		$site_url = untrailingslashit( trim( (string) ( $site['siteUrl'] ?? '' ) ) );
		$user     = trim( (string) ( $site['username'] ?? '' ) );
		$pass     = (string) ( $site['appPassword'] ?? '' );
		if ( $site_url === '' || $user === '' || $pass === '' ) {
			return new WP_Error( 'neo-pulse_mplinks_auth', 'Site is missing WordPress credentials' );
		}
		$mcp  = new Neo_Pulse_App_Neo_Mcp_Client( $site_url, $user, $pass );
		$info = $mcp->call_tool( 'neo-mcp_site', 'info', array() );
		if ( empty( $info['ok'] ) ) {
			return new WP_Error(
				'neo-pulse_mplinks_mcp',
				(string) ( $info['error'] ?? 'Neo MCP is not available on this site.' )
			);
		}

		$applied       = array();
		$failed        = array();
		$skipped       = array();
		$used_elements = array();
		$groups        = array();
		foreach ( $links as $link ) {
			if ( ! is_array( $link ) ) {
				continue;
			}
			$groups[ (string) ( $link['moneyUrl'] ?? '' ) ][] = $link;
		}
		foreach ( $groups as $group ) {
			if ( count( $applied ) >= self::TARGET_APPLIED_LINKS ) {
				break;
			}
			$rows = self::apply_money_page( $mcp, $group, $used_elements );
			foreach ( $rows as $row ) {
				$status = (string) ( $row['status'] ?? 'failed' );
				if ( $status === 'applied' ) {
					$applied[] = $row;
				} elseif ( $status === 'skipped' ) {
					$skipped[] = $row;
				} else {
					$failed[] = $row;
				}
			}
		}

		return array(
			'applied' => $applied,
			'failed'  => $failed,
			'skipped' => $skipped,
		);
	}

	/**
	 * Resolve the money page, brainstorm from its GSC keyword, place the link, sheet the saved snippet.
	 *
	 * @param array<int,array<string,mixed>> $suggestions
	 * @param array<string,bool>             $used_elements
	 * @return array<int,array<string,mixed>>
	 */
	private static function apply_money_page( Neo_Pulse_App_Neo_Mcp_Client $mcp, array $suggestions, array &$used_elements ): array {
		$job = is_array( $suggestions[0] ?? null ) ? $suggestions[0] : array();
		$money = (string) ( $job['moneyUrl'] ?? '' );
		$keyword = trim( (string) ( $job['keyword'] ?? $job['anchorText'] ?? '' ) );
		$row = array(
			'moneyUrl'   => $money,
			'targetUrl'  => '',
			'anchorHint' => $keyword,
			'anchorText' => '',
			'snippet'    => '',
		);
		if ( $money === '' ) {
			return array(
				array_merge(
					$row,
					array(
						'status' => 'skipped',
						'error'  => 'Missing money page URL',
					)
				),
			);
		}
		$resolved = self::mcp_resolve_post( $mcp, $money );
		if ( empty( $resolved['ok'] ) || empty( $resolved['postId'] ) ) {
			return array(
				array_merge(
					$row,
					array(
						'status' => 'skipped',
						'error'  => (string) ( $resolved['error'] ?? 'Money page not found' ),
					)
				),
			);
		}
		$post_id = (int) $resolved['postId'];
		$chunks  = self::chunks_with_enough_text( self::read_page_copy( $mcp, $post_id ) );
		if ( $chunks === array() ) {
			return array(
				array_merge(
					$row,
					array(
						'status' => 'skipped',
						'error'  => 'Money page has no usable body text',
					)
				),
			);
		}
		$candidates = isset( $job['candidates'] ) && is_array( $job['candidates'] ) ? $job['candidates'] : array();
		$place = self::brainstorm_keyword_link(
			$chunks,
			array(
				'query'       => $keyword,
				'clicks'      => (int) ( $job['keywordClicks'] ?? 0 ),
				'impressions' => (int) ( $job['keywordImpressions'] ?? 0 ),
				'position'    => (float) ( $job['keywordPosition'] ?? 0 ),
			),
			$candidates,
			$money
		);
		if ( is_wp_error( $place ) ) {
			return array(
				array_merge(
					$row,
					array(
						'status' => 'failed',
						'error'  => $place->get_error_message(),
					)
				),
			);
		}
		if ( ! is_array( $place ) ) {
			return array(
				array_merge(
					$row,
					array(
						'status' => 'failed',
						'error'  => 'Could not place a link in the page body text',
					)
				),
			);
		}
		$field  = (string) ( $place['field'] ?? '' );
		$phrase = trim( (string) ( $place['phrase'] ?? '' ) );
		$target = (string) ( $place['targetUrl'] ?? '' );
		$html   = (string) ( $place['html'] ?? '' );
		if ( $field === '' || $phrase === '' || $target === '' || $html === '' ) {
			return array(
				array_merge(
					$row,
					array(
						'status' => 'failed',
						'error'  => 'Could not place a link in the page body text',
					)
				),
			);
		}
		$saved = self::write_page_field( $mcp, $post_id, $field, $html );
		if ( ( $saved['status'] ?? '' ) !== 'ok' ) {
			return array(
				array_merge(
					$row,
					array(
						'status' => 'failed',
						'error'  => (string) ( $saved['error'] ?? 'Neo MCP write failed' ),
					)
				),
			);
		}
		$saved_html = self::read_saved_field_html( $mcp, $post_id, $field );
		$snip       = self::anchor_snippet( $saved_html, $target, $phrase );
		if ( $snip === null || $saved_html === '' || strpos( $saved_html, (string) $snip['snippet'] ) === false ) {
			return array(
				array_merge(
					$row,
					array(
						'status' => 'failed',
						'error'  => 'Neo MCP did not save the link',
					)
				),
			);
		}
		$live = self::verify_page_link( $mcp, $post_id, $money, $target, (string) $snip['anchorText'] );
		if ( $live === null ) {
			return array(
				array_merge(
					$row,
					array(
						'status' => 'failed',
						'error'  => 'Neo MCP link is not on the page',
					)
				),
			);
		}
		return array(
			array_merge(
				$row,
				array(
					'status'     => 'applied',
					'error'      => '',
					'via'        => $field,
					'mode'       => 'page-copy',
					'postId'     => $post_id,
					'targetUrl'  => (string) $live['href'],
					'anchorText' => (string) $live['anchorText'],
					'snippet'    => (string) $live['snippet'],
				)
			),
		);
	}

	/**
	 * @return array<int,array{field:string,html:string,text:string,paragraphs:array<int,string>}>
	 */
	private static function read_page_copy( Neo_Pulse_App_Neo_Mcp_Client $mcp, int $post_id ): array {
		$res  = $mcp->call_tool(
			'neo-mcp_php',
			'run',
			array(
				'code' => 'return (function(){ $id=' . (int) $post_id . '; $chunks=array();'
					. ' $content=(string)get_post_field("post_content",$id);'
					. ' if($content!==""){ $chunks[]=array("field"=>"post_content","html"=>$content); }'
					. ' $raw=get_post_meta($id,"_elementor_data",true); $tree=is_string($raw)?json_decode($raw,true):null; $walk=null;'
					. ' $walk=function($nodes,$parent_is_link=false) use (&$walk,&$chunks){ if(!is_array($nodes)){return;} foreach($nodes as $node){ if(!is_array($node)){continue;}'
					. ' $htag=strtolower((string)($node["settings"]["html_tag"]??"")); $is_link=$parent_is_link||$htag==="a";'
					. ' $eid=(string)($node["id"]??""); $settings=isset($node["settings"])&&is_array($node["settings"])?$node["settings"]:array();'
					. ' if($eid!=="" && !$is_link){ foreach($settings as $sk=>$sv){ if(!is_string($sv)||$sv===""){continue;}'
					. ' if(strpos($sv,"<p")===false && strpos($sv,"<P")===false){continue;}'
					. ' $chunks[]=array("field"=>"elementor:".$eid.":".$sk,"html"=>$sv); } }'
					. ' if(isset($node["elements"])){ $walk($node["elements"],$is_link); } } }; if(is_array($tree)){ $walk($tree,false); }'
					. ' $desc=(string)get_post_meta($id,"description",true);'
					. ' if($desc!==""){ $chunks[]=array("field"=>"description","html"=>$desc); }'
					. ' return array("chunks"=>$chunks); })();',
			)
		);
		$data = is_array( $res['data'] ?? null ) ? $res['data'] : array();
		if ( isset( $data['chunks'] ) && is_array( $data['chunks'] ) ) {
			$chunks = $data['chunks'];
		} else {
			$chunks = array();
		}
		$out = array();
		foreach ( $chunks as $chunk ) {
			if ( ! is_array( $chunk ) ) {
				continue;
			}
			$field = (string) ( $chunk['field'] ?? '' );
			$html  = (string) ( $chunk['html'] ?? '' );
			if ( $field === '' || $html === '' ) {
				continue;
			}
			$paragraphs = self::extract_paragraphs( $html );
			if ( $paragraphs === array() ) {
				continue;
			}
			$text = implode( ' ', $paragraphs );
			if ( self::is_cta_only_copy( $text ) ) {
				continue;
			}
			$out[] = array(
				'field'      => $field,
				'html'       => $html,
				'text'       => substr( $text, 0, 900 ),
				'paragraphs' => $paragraphs,
			);
		}
		return $out;
	}

	/**
	 * Plain text of each <p> body. CTA-only or tiny labels are dropped.
	 *
	 * @return array<int,string>
	 */
	private static function extract_paragraphs( string $html ): array {
		$out = array();
		if ( ! preg_match_all( '/<p\b[^>]*>(.*?)<\/p>/is', $html, $matches ) ) {
			$plain = self::collapse_ws( wp_strip_all_tags( $html ) );
			if ( $plain !== '' && ! self::is_cta_only_copy( $plain ) && str_word_count( $plain ) >= 6 ) {
				return array( $plain );
			}
			return $out;
		}
		foreach ( $matches[1] as $inner ) {
			$plain = trim( (string) preg_replace( '/\s+/', ' ', wp_strip_all_tags( (string) $inner ) ) );
			if ( $plain === '' || self::is_cta_only_copy( $plain ) ) {
				continue;
			}
			if ( str_word_count( $plain ) < 6 ) {
				continue;
			}
			$out[] = $plain;
		}
		return $out;
	}

	private static function collapse_ws( string $text ): string {
		return trim( (string) preg_replace( '/\s+/', ' ', html_entity_decode( $text, ENT_QUOTES | ENT_HTML5, 'UTF-8' ) ) );
	}

	/**
	 * Anchor to wrap: the model's short phrase, or a short slice when it sent the whole paragraph.
	 *
	 * @param array<int,string> $paragraphs
	 */
	private static function anchor_phrase( string $phrase, array $paragraphs ): string {
		$phrase = self::collapse_ws( $phrase );
		$host   = '';
		foreach ( $paragraphs as $paragraph ) {
			$para = self::collapse_ws( (string) $paragraph );
			if ( $para === '' ) {
				continue;
			}
			if ( $phrase !== '' && ( strcasecmp( $para, $phrase ) === 0 || stripos( $para, $phrase ) !== false ) ) {
				$host = $para;
				break;
			}
		}
		if ( $host === '' ) {
			$host = self::collapse_ws( (string) ( $paragraphs[0] ?? '' ) );
		}
		$words = preg_split( '/\s+/', $host );
		$words = is_array( $words ) ? array_values( array_filter( $words ) ) : array();
		if ( count( $words ) < 3 ) {
			return '';
		}
		$picked = preg_split( '/\s+/', $phrase );
		$picked = is_array( $picked ) ? array_values( array_filter( $picked ) ) : array();
		if ( count( $picked ) >= 2 && count( $picked ) <= 5 && strcasecmp( $phrase, $host ) !== 0 && stripos( $host, $phrase ) !== false && ! self::is_cta_only_copy( $phrase ) ) {
			return $phrase;
		}
		$take  = 4;
		$start = (int) max( 0, floor( ( count( $words ) - $take ) / 2 ) );
		return implode( ' ', array_slice( $words, $start, $take ) );
	}

	private static function is_cta_only_copy( string $plain ): bool {
		$plain = trim( (string) preg_replace( '/\s+/', ' ', $plain ) );
		if ( $plain === '' ) {
			return true;
		}
		if ( preg_match( '/^(read\s*more|start a project|talk to us|contact( us)?|get a (free )?consult|see (the )?(plan|results|our work)|learn more|get started)$/i', $plain ) ) {
			return true;
		}
		$words = str_word_count( $plain );
		if ( $words <= 4 && preg_match( '/\b(read\s*more|contact|talk to us|get started|start a project|learn more)\b/i', $plain ) ) {
			return true;
		}
		return false;
	}

	/**
	 * Body text is the context. Choose a candidate URL that fits that text, then wrap words already in it.
	 *
	 * @param array<int,array{field:string,html:string,text?:string,paragraphs?:array<int,string>}> $chunks
	 * @param array{query:string,clicks:int,impressions:int,position:float}                          $keyword
	 * @param array<int,string>                                                                      $candidates
	 * @return array{field:string,targetUrl:string,phrase:string,html:string}|null|WP_Error
	 */
	private static function brainstorm_keyword_link( array $chunks, array $keyword, array $candidates, string $money_url ) {
		$sections = array();
		$by_field = array();
		foreach ( $chunks as $chunk ) {
			$field = (string) $chunk['field'];
			$by_field[ $field ] = $chunk;
			$paragraphs = isset( $chunk['paragraphs'] ) && is_array( $chunk['paragraphs'] )
				? $chunk['paragraphs']
				: self::extract_paragraphs( (string) $chunk['html'] );
			if ( $paragraphs === array() ) {
				continue;
			}
			$sections[] = array(
				'field'      => $field,
				'paragraphs' => $paragraphs,
			);
		}
		$allowed = array();
		$money_key = self::norm_url( $money_url );
		foreach ( $candidates as $url ) {
			$url = trim( (string) $url );
			$key = self::norm_url( $url );
			if ( $url === '' || $key === '' || $key === $money_key || self::is_service_area_url( $url ) ) {
				continue;
			}
			$allowed[ $key ] = $url;
		}
		if ( $sections === array() || $allowed === array() ) {
			return null;
		}
		$default_field = (string) $sections[0]['field'];
		$default_target_key = (string) array_key_first( $allowed );
		$system = 'Return JSON only: {"targetUrl":"https://...","field":"...","anchor":"..."}.'
			. ' pageParagraphs is the body text already on this money page. That text is the context.'
			. ' Read that body text and choose one targetUrl from candidates that fits what the page is about.'
			. ' targetUrl must be copied exactly from candidates. Do not invent or alter the URL.'
			. ' field must be a field from pageParagraphs (prefer the longest body section).'
			. ' anchor is 2-5 contiguous words copied from that field paragraphs. Do not invent words.'
			. ' keyword is only a weak GSC hint. Do not require the keyword words to appear in the anchor.'
			. ' Never use a heading, picture, button, or Read More. Never use an em dash.';
		$user = wp_json_encode(
			array(
				'pageParagraphs' => $sections,
				'candidates'     => array_values( $allowed ),
				'keywordHint'    => $keyword,
			)
		);
		$model = Neo_Pulse_App_Openrouter_Agent_Models::resolve( Neo_Pulse_App_Openrouter_Agent_Models::CATEGORY_BLOG );
		$raw   = self::openrouter_json( $model, $system, $user );
		if ( is_wp_error( $raw ) ) {
			return $raw;
		}
		$field  = (string) ( $raw['field'] ?? '' );
		$target = self::norm_url( (string) ( $raw['targetUrl'] ?? '' ) );
		$phrase = trim( (string) ( $raw['anchor'] ?? $raw['phrase'] ?? '' ) );
		if ( ! isset( $by_field[ $field ] ) ) {
			$field = $default_field;
		}
		if ( ! isset( $allowed[ $target ] ) ) {
			$target = $default_target_key;
		}
		$paragraphs = isset( $by_field[ $field ]['paragraphs'] ) && is_array( $by_field[ $field ]['paragraphs'] )
			? $by_field[ $field ]['paragraphs']
			: array();
		$phrase = self::anchor_phrase( $phrase, $paragraphs );
		if ( $phrase === '' ) {
			$phrase = self::anchor_phrase( '', $paragraphs );
		}
		if ( $phrase === '' ) {
			return null;
		}
		$html    = (string) $by_field[ $field ]['html'];
		$wrapped = self::place_link_in_html( $html, $allowed[ $target ], $phrase, $paragraphs );
		if ( ( $wrapped['status'] ?? '' ) !== 'ok' ) {
			foreach ( $sections as $section ) {
				$try_field = (string) $section['field'];
				if ( $try_field === $field || ! isset( $by_field[ $try_field ] ) ) {
					continue;
				}
				$try_paras = isset( $by_field[ $try_field ]['paragraphs'] ) && is_array( $by_field[ $try_field ]['paragraphs'] )
					? $by_field[ $try_field ]['paragraphs']
					: array();
				$try = self::place_link_in_html( (string) $by_field[ $try_field ]['html'], $allowed[ $target ], '', $try_paras );
				if ( ( $try['status'] ?? '' ) === 'ok' ) {
					$field   = $try_field;
					$phrase  = (string) ( $try['phrase'] ?? '' );
					$wrapped = $try;
					break;
				}
			}
		}
		if ( ( $wrapped['status'] ?? '' ) !== 'ok' ) {
			return null;
		}
		return array(
			'field'     => $field,
			'targetUrl' => $allowed[ $target ],
			'phrase'    => (string) ( $wrapped['phrase'] ?? $phrase ),
			'html'      => (string) $wrapped['html'],
		);
	}

	/**
	 * Put one href on words that already exist in this HTML.
	 *
	 * @param array<int,string> $paragraphs
	 * @return array{status:string,html?:string,phrase?:string,reason?:string}
	 */
	private static function place_link_in_html( string $html, string $target, string $phrase, array $paragraphs ): array {
		$phrase = self::collapse_ws( $phrase );
		if ( $phrase !== '' ) {
			$try = self::wrap_phrase_html( $html, $target, $phrase );
			if ( ( $try['status'] ?? '' ) === 'ok' ) {
				$try['phrase'] = $phrase;
				return $try;
			}
		}
		foreach ( $paragraphs as $paragraph ) {
			$candidate = self::anchor_phrase( '', array( (string) $paragraph ) );
			if ( $candidate === '' ) {
				continue;
			}
			$try = self::wrap_phrase_html( $html, $target, $candidate );
			if ( ( $try['status'] ?? '' ) === 'ok' ) {
				$try['phrase'] = $candidate;
				return $try;
			}
		}
		$try = self::wrap_existing_span( $html, $target );
		if ( ( $try['status'] ?? '' ) === 'ok' ) {
			$try['phrase'] = self::collapse_ws( wp_strip_all_tags( (string) ( $try['html'] ?? '' ) ) );
			if ( preg_match( '/<a\b[^>]*>(.*?)<\/a>/is', (string) ( $try['html'] ?? '' ), $m ) ) {
				$try['phrase'] = self::collapse_ws( wp_strip_all_tags( (string) $m[1] ) );
			}
			return $try;
		}
		return array( 'status' => 'failed', 'reason' => 'Could not wrap body text' );
	}

	/**
	 * @return array{elementId:string,setting:string}|null
	 */
	private static function parse_elementor_field( string $field ): ?array {
		if ( strpos( $field, 'elementor:' ) !== 0 ) {
			return null;
		}
		$rest = substr( $field, strlen( 'elementor:' ) );
		$parts = explode( ':', $rest, 2 );
		$element_id = trim( (string) ( $parts[0] ?? '' ) );
		if ( $element_id === '' ) {
			return null;
		}
		$setting = trim( (string) ( $parts[1] ?? 'editor' ) );
		if ( $setting === '' ) {
			$setting = 'editor';
		}
		return array(
			'elementId' => $element_id,
			'setting'   => $setting,
		);
	}

	private static function write_page_field( Neo_Pulse_App_Neo_Mcp_Client $mcp, int $post_id, string $field, string $html ): array {
		$el = self::parse_elementor_field( $field );
		if ( $el !== null ) {
			$eid_php = var_export( $el['elementId'], true );
			$key_php = var_export( $el['setting'], true );
			$html_php = var_export( $html, true );
			$code       = 'return (function(){ $id=' . (int) $post_id . '; $eid=' . $eid_php . '; $key=' . $key_php . '; $html=' . $html_php . ';'
				. ' if(!class_exists("\\\\Elementor\\\\Plugin")){ return array("status"=>"failed","error"=>"Elementor missing"); }'
				. ' $raw=get_post_meta($id,"_elementor_data",true); $tree=is_string($raw)?json_decode($raw,true):null;'
				. ' if(!is_array($tree)){ return array("status"=>"failed","error"=>"No Elementor data"); }'
				. ' $found=false; $walk=null; $walk=function(&$nodes) use (&$walk,&$found,$eid,$key,$html){ if(!is_array($nodes)||$found){return;}'
				. ' foreach($nodes as &$node){ if(!is_array($node)){continue;}'
				. ' if((string)($node["id"]??"")===$eid){ if(!isset($node["settings"])||!is_array($node["settings"])){ $node["settings"]=array(); }'
				. ' $node["settings"][$key]=$html; $found=true; return; }'
				. ' if(isset($node["elements"])&&is_array($node["elements"])){ $walk($node["elements"]); } } };'
				. ' $walk($tree); if(!$found){ return array("status"=>"failed","error"=>"Elementor element not found"); }'
				. ' $doc=\\\\Elementor\\\\Plugin::$instance->documents->get($id);'
				. ' if($doc){ $doc->save(array("elements"=>$tree)); }'
				. ' else { update_post_meta($id,"_elementor_data",wp_slash(wp_json_encode($tree))); }'
				. ' delete_post_meta($id,"_elementor_css"); clean_post_cache($id);'
				. ' if(isset(\\\\Elementor\\\\Plugin::$instance->files_manager)){ \\\\Elementor\\\\Plugin::$instance->files_manager->clear_cache(); }'
				. ' if(function_exists("rocket_clean_post")){ rocket_clean_post($id); }'
				. ' if(function_exists("w3tc_flush_post")){ w3tc_flush_post($id); }'
				. ' if(class_exists("\\\\WP_Engine_Cache_API") && method_exists("\\\\WP_Engine_Cache_API","purge_post")){ \\\\WP_Engine_Cache_API::purge_post($id); }'
				. ' do_action("litespeed_purge_post",$id); do_action("ce_clear_post_cache",$id);'
				. ' wp_update_post(array("ID"=>$id));'
				. ' return array("status"=>"ok"); })();';
			$res = $mcp->call_tool( 'neo-mcp_php', 'run', array( 'code' => $code ) );
			if ( empty( $res['ok'] ) ) {
				return array( 'status' => 'failed', 'error' => (string) ( $res['error'] ?? 'Neo MCP Elementor write failed' ) );
			}
			$data = self::php_return( $res );
			if ( (string) ( $data['status'] ?? '' ) !== 'ok' ) {
				return array( 'status' => 'failed', 'error' => (string) ( $data['error'] ?? 'Neo MCP Elementor write failed' ) );
			}
			$mcp->call_tool( 'neo-mcp_elementor', 'regenerate-css', array( 'post_id' => $post_id ) );
			return array( 'status' => 'ok' );
		}
		$field_php = var_export( $field, true );
		$html_php  = var_export( $html, true );
		$code      = 'return (function(){ $id=' . (int) $post_id . '; $field=' . $field_php . '; $html=' . $html_php . ';'
			. ' if($field==="post_content"){ $updated=wp_update_post(array("ID"=>$id,"post_content"=>$html),true);'
			. ' if(is_wp_error($updated)){ return array("status"=>"failed","error"=>$updated->get_error_message()); }'
			. ' clean_post_cache($id); return array("status"=>"ok"); }'
			. ' update_post_meta($id,$field,$html); clean_post_cache($id); return array("status"=>"ok"); })();';
		$res = $mcp->call_tool( 'neo-mcp_php', 'run', array( 'code' => $code ) );
		if ( empty( $res['ok'] ) ) {
			return array( 'status' => 'failed', 'error' => (string) ( $res['error'] ?? 'Neo MCP write failed' ) );
		}
		$data = self::php_return( $res );
		if ( (string) ( $data['status'] ?? '' ) !== 'ok' ) {
			return array( 'status' => 'failed', 'error' => (string) ( $data['error'] ?? 'Neo MCP write failed' ) );
		}
		return array( 'status' => 'ok' );
	}

	private static function read_saved_field_html( Neo_Pulse_App_Neo_Mcp_Client $mcp, int $post_id, string $field ): string {
		$el = self::parse_elementor_field( $field );
		if ( $el !== null ) {
			$eid_php = var_export( $el['elementId'], true );
			$key_php = var_export( $el['setting'], true );
			$res     = $mcp->call_tool(
				'neo-mcp_php',
				'run',
				array(
					'code' => 'return (function(){ $id=' . (int) $post_id . '; $eid=' . $eid_php . '; $key=' . $key_php . ';'
						. ' wp_cache_delete($id,"post_meta"); $raw=get_post_meta($id,"_elementor_data",true);'
						. ' $tree=is_string($raw)?json_decode($raw,true):null; $found="";'
						. ' $walk=null; $walk=function($nodes) use (&$walk,&$found,$eid,$key){ if(!is_array($nodes)||$found!==""){return;}'
						. ' foreach($nodes as $node){ if(!is_array($node)){continue;}'
						. ' if((string)($node["id"]??"")===$eid){ $found=(string)($node["settings"][$key]??""); return; }'
						. ' if(isset($node["elements"])){ $walk($node["elements"]); } } };'
						. ' if(is_array($tree)){ $walk($tree); } return array("html"=>$found); })();',
				)
			);
			if ( empty( $res['ok'] ) ) {
				return '';
			}
			$data = self::php_return( $res );
			return (string) ( $data['html'] ?? '' );
		}
		$field_php = var_export( $field, true );
		$code      = 'return (function(){ $id=' . (int) $post_id . '; $field=' . $field_php . ';'
			. ' if($field==="post_content"){ return array("html"=>(string)get_post_field("post_content",$id)); }'
			. ' return array("html"=>(string)get_post_meta($id,$field,true)); })();';
		$res = $mcp->call_tool( 'neo-mcp_php', 'run', array( 'code' => $code ) );
		if ( empty( $res['ok'] ) ) {
			return '';
		}
		$data = self::php_return( $res );
		return (string) ( $data['html'] ?? '' );
	}

	/**
	 * Apply one top-down link on the money page via Neo MCP (Elementor first, classic fallback).
	 *
	 * @param Neo_Pulse_App_Neo_Mcp_Client $mcp
	 * @param array<string,mixed>          $link
	 * @param array<string,bool>           $used_elements Keys "postId:elementId" already woven this run.
	 * @return array<string,mixed>
	 */
	private static function apply_one_link( Neo_Pulse_App_Neo_Mcp_Client $mcp, array $link, array &$used_elements ): array {
		$money  = (string) ( $link['moneyUrl'] ?? '' );
		$target = (string) ( $link['targetUrl'] ?? '' );
		$hint   = (string) ( $link['anchorText'] ?? '' );
		$base   = array(
			'moneyUrl'   => $money,
			'targetUrl'  => $target,
			'anchorHint' => $hint,
			// anchorText = exact on-page phrase inside <a>…</a> after apply (Ctrl+F this).
			'anchorText' => '',
		);
		if ( $money === '' || $target === '' || $hint === '' ) {
			return array_merge( $base, array( 'status' => 'failed', 'error' => 'Missing moneyUrl, targetUrl, or anchorText' ) );
		}

		$resolved = self::mcp_resolve_post( $mcp, $money );
		if ( empty( $resolved['ok'] ) || empty( $resolved['postId'] ) ) {
			return array_merge(
				$base,
				array(
					'status' => 'failed',
					'error'  => (string) ( $resolved['error'] ?? 'Money page not found' ),
				)
			);
		}
		$post_id = (int) $resolved['postId'];

		$result = ! empty( $resolved['elementor'] )
			? self::mcp_apply_elementor_link( $mcp, $post_id, $target, $hint, $used_elements )
			: self::mcp_apply_classic_link( $mcp, $post_id, $target, $hint );

		$row = array_merge( $base, $result );
		$row['anchorHint'] = $hint;
		$row['snippet']    = (string) ( $result['snippet'] ?? '' );
		if ( (string) ( $row['status'] ?? '' ) === 'applied' ) {
			$used = trim( (string) ( $result['anchorText'] ?? '' ) );
			$href = trim( (string) ( $result['targetUrl'] ?? '' ) );
			if ( $used === '' || $href === '' || $row['snippet'] === '' ) {
				$row['status']     = 'failed';
				$row['error']      = 'Link was not saved with a searchable anchor snippet';
				$row['targetUrl']  = '';
				$row['anchorText'] = '';
				$row['snippet']    = '';
			} else {
				$row['targetUrl']  = $href;
				$row['anchorText'] = $used;
			}
		} else {
			$row['targetUrl']  = '';
			$row['anchorText'] = '';
			$row['snippet']    = '';
		}
		return $row;
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function mcp_resolve_post( Neo_Pulse_App_Neo_Mcp_Client $mcp, string $money_url ): array {
		$url_php = var_export( $money_url, true );
		$code    = 'return (function(){ $url=' . $url_php . '; $id=(int)url_to_postid($url); if(!$id){ $id=(int)url_to_postid(trailingslashit($url)); }'
			. ' if(!$id){ $path=trim((string)parse_url($url,PHP_URL_PATH),"/"); if($path!==""){ $page=get_page_by_path($path); if($page&&!empty($page->ID)){ $id=(int)$page->ID; } } }'
			. ' if(!$id){ return array("ok"=>false,"error"=>"Money page not found"); }'
			. ' $el=(string)get_post_meta($id,"_elementor_edit_mode",true); return array("ok"=>true,"postId"=>$id,"elementor"=>($el==="builder")); })();';
		$res    = $mcp->call_tool( 'neo-mcp_php', 'run', array( 'code' => $code ) );
		if ( empty( $res['ok'] ) ) {
			return array( 'ok' => false, 'error' => (string) ( $res['error'] ?? 'Neo MCP resolve failed' ) );
		}
		$data = self::php_return( $res );
		if ( empty( $data['ok'] ) || empty( $data['postId'] ) ) {
			return array( 'ok' => false, 'error' => (string) ( $data['error'] ?? 'Money page not found' ) );
		}
		return array(
			'ok'        => true,
			'postId'    => (int) ( $data['postId'] ?? 0 ),
			'elementor' => ! empty( $data['elementor'] ),
		);
	}

	/**
	 * Wrap an existing phrase in the page copy. The plan anchor is a suggestion only.
	 * The returned anchorText is the exact phrase Neo MCP wrapped.
	 *
	 * @param array<string,bool> $used_elements
	 * @return array<string,mixed>
	 */
	private static function mcp_apply_elementor_link(
		Neo_Pulse_App_Neo_Mcp_Client $mcp,
		int $post_id,
		string $target,
		string $anchor_hint,
		array &$used_elements
	): array {
		$widgets = self::elementor_text_widgets( $mcp, $post_id );
		if ( $widgets === array() ) {
			return array( 'status' => 'failed', 'error' => 'No Elementor text-editor widgets on money page' );
		}

		foreach ( $widgets as $w ) {
			$existing = self::anchor_snippet( (string) ( $w['html'] ?? '' ), $target, '' );
			if ( $existing !== null ) {
				return array(
					'status'     => 'applied',
					'error'      => '',
					'via'        => 'elementor',
					'mode'       => 'existing',
					'postId'     => $post_id,
					'elementId'  => (string) ( $w['id'] ?? '' ),
					'targetUrl'  => (string) $existing['href'],
					'anchorText' => (string) $existing['anchorText'],
					'snippet'    => (string) $existing['snippet'],
				);
			}
		}

		$pool = array();
		foreach ( $widgets as $w ) {
			$eid = (string) ( $w['id'] ?? '' );
			if ( $eid === '' || isset( $used_elements[ $post_id . ':' . $eid ] ) ) {
				continue;
			}
			if ( strlen( trim( (string) ( $w['plain'] ?? '' ) ) ) < 20 ) {
				continue;
			}
			$pool[] = $w;
		}
		if ( $pool === array() ) {
			return array( 'status' => 'failed', 'error' => 'No Elementor text section left to wrap', 'via' => 'elementor' );
		}

		$candidates = array();
		foreach ( $pool as $w ) {
			$candidates[] = array(
				'id'    => (string) $w['id'],
				'title' => (string) ( $w['title'] ?? '' ),
				'html'  => substr( (string) ( $w['html'] ?? '' ), 0, 900 ),
			);
		}
		$pick = self::suggest_weave_placement( $candidates, $target, $anchor_hint );
		if ( is_wp_error( $pick ) ) {
			return array( 'status' => 'failed', 'error' => $pick->get_error_message(), 'via' => 'elementor' );
		}
		$element_id = (string) ( $pick['elementId'] ?? '' );
		$phrase     = trim( (string) ( $pick['phrase'] ?? '' ) );
		$html       = self::widget_html( $widgets, $element_id );
		$wrapped    = ( $phrase !== '' && $html !== '' )
			? self::wrap_phrase_html( $html, $target, $phrase )
			: array( 'status' => 'failed', 'reason' => 'Weave did not return an existing phrase' );
		if ( ( $wrapped['status'] ?? '' ) !== 'ok' ) {
			foreach ( $pool as $w ) {
				$try_html = (string) ( $w['html'] ?? '' );
				$try      = self::wrap_phrase_html( $try_html, $target, $phrase );
				if ( ( $try['status'] ?? '' ) !== 'ok' ) {
					$try = self::wrap_existing_span( $try_html, $target );
				}
				if ( ( $try['status'] ?? '' ) === 'ok' ) {
					$wrapped    = $try;
					$element_id = (string) ( $w['id'] ?? '' );
					$html       = $try_html;
					break;
				}
			}
		}
		$mode = 'weave';
		if ( ( $wrapped['status'] ?? '' ) !== 'ok' || $element_id === '' ) {
			$rebalanced = self::rebalance_overloaded_pool( $pool, $target, $anchor_hint, $phrase );
			if ( ( $rebalanced['status'] ?? '' ) !== 'ok' ) {
				return array(
					'status' => 'failed',
					'error'  => (string) ( $rebalanced['reason'] ?? $wrapped['reason'] ?? 'Existing phrase was not in the section' ),
					'via'    => 'elementor',
				);
			}
			$wrapped    = $rebalanced;
			$element_id = (string) ( $rebalanced['elementId'] ?? '' );
			$mode       = 'rebalance';
		}
		$next_html = (string) $wrapped['html'];
		$saved     = self::write_page_field( $mcp, $post_id, 'elementor:' . $element_id, $next_html );
		if ( ( $saved['status'] ?? '' ) !== 'ok' ) {
			return array(
				'status' => 'failed',
				'error'  => (string) ( $saved['error'] ?? 'Neo MCP Elementor update failed' ),
				'via'    => 'elementor',
			);
		}

		$used_elements[ $post_id . ':' . $element_id ] = true;
		$stored = self::read_saved_field_html( $mcp, $post_id, 'elementor:' . $element_id );
		$snip   = self::anchor_snippet( $stored, $target, '' );
		if ( $snip === null || $stored === '' || strpos( $stored, (string) $snip['snippet'] ) === false ) {
			return array( 'status' => 'failed', 'error' => 'Neo MCP did not save the link', 'via' => 'elementor' );
		}
		return array(
			'status'     => 'applied',
			'error'      => '',
			'via'        => 'elementor',
			'mode'       => $mode,
			'postId'     => $post_id,
			'elementId'  => $element_id,
			'targetUrl'  => (string) $snip['href'],
			'anchorText' => (string) $snip['anchorText'],
			'snippet'    => (string) $snip['snippet'],
		);
	}

	/**
	 * @return array<int,array{id:string,title:string,html:string,plain:string}>
	 */
	private static function elementor_text_widgets( Neo_Pulse_App_Neo_Mcp_Client $mcp, int $post_id ): array {
		$found = $mcp->call_tool(
			'neo-mcp_elementor',
			'find',
			array(
				'post_id'     => $post_id,
				'widget_type' => 'text-editor',
				'limit'       => 40,
			)
		);
		if ( empty( $found['ok'] ) ) {
			return array();
		}
		$payload = is_array( $found['data'] ) ? $found['data'] : array();
		$rows    = array();
		if ( isset( $payload['found'] ) && is_array( $payload['found'] ) ) {
			$rows = $payload['found'];
		} elseif ( is_array( $payload ) && isset( $payload[0]['id'] ) ) {
			$rows = $payload;
		} else {
			$text = trim( (string) ( $found['text'] ?? '' ) );
			if ( $text !== '' ) {
				$decoded = json_decode( $text, true );
				if ( is_array( $decoded ) && isset( $decoded['found'] ) && is_array( $decoded['found'] ) ) {
					$rows = $decoded['found'];
				}
			}
		}

		$out = array();
		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$element_id = (string) ( $row['id'] ?? '' );
			if ( $element_id === '' ) {
				continue;
			}
			$get = $mcp->call_tool(
				'neo-mcp_elementor',
				'get-element',
				array(
					'post_id'    => $post_id,
					'element_id' => $element_id,
				)
			);
			if ( empty( $get['ok'] ) ) {
				continue;
			}
			$el = is_array( $get['data'] ) ? $get['data'] : array();
			if ( isset( $el['return'] ) && is_array( $el['return'] ) ) {
				$el = $el['return'];
			}
			$html = isset( $el['settings']['editor'] ) ? (string) $el['settings']['editor'] : '';
			$out[] = array(
				'id'    => $element_id,
				'title' => (string) ( $row['text'] ?? $row['title'] ?? '' ),
				'html'  => $html,
				'plain' => trim( wp_strip_all_tags( $html ) ),
			);
		}
		return $out;
	}

	/**
	 * @param array<int,array{id:string,title:string,plain:string,html?:string}> $candidates
	 * @return array<string,mixed>|WP_Error
	 */
	private static function suggest_weave_placement( array $candidates, string $target, string $anchor_hint ) {
		$system = 'You choose an existing phrase to wrap in a link. Return JSON only: {"elementId":"...","phrase":"..."}.'
			. ' phrase must be copied EXACTLY from that candidate html (contiguous characters, 2-8 words, no tags inside the phrase).'
			. ' Do not rewrite, add, or paraphrase any page copy. anchorHint is only a topic suggestion for which existing words to wrap.'
			. ' Do not skip. Always return one phrase that is already in the html. Never use an em dash.';
		$user   = wp_json_encode(
			array(
				'targetUrl'  => $target,
				'anchorHint' => $anchor_hint,
				'candidates' => $candidates,
			)
		);
		$model = Neo_Pulse_App_Openrouter_Agent_Models::resolve( Neo_Pulse_App_Openrouter_Agent_Models::CATEGORY_BLOG );
		$raw   = self::openrouter_json( $model, $system, $user );
		if ( is_wp_error( $raw ) ) {
			return $raw;
		}
		if ( ! is_array( $raw ) ) {
			return new WP_Error( 'neo-pulse_mplinks_weave', 'Weave suggestion was not an object' );
		}
		return $raw;
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function mcp_apply_classic_link(
		Neo_Pulse_App_Neo_Mcp_Client $mcp,
		int $post_id,
		string $target,
		string $anchor_hint
	): array {
		$post_js = (string) (int) $post_id;
		$read    = $mcp->call_tool(
			'neo-mcp_php',
			'run',
			array(
				'code' => 'return (function(){ $post_id=' . $post_js . '; $content=(string)get_post_field("post_content",$post_id); return array("ok"=>true,"html"=>$content,"plain"=>wp_strip_all_tags($content)); })();',
			)
		);
		if ( empty( $read['ok'] ) ) {
			return array( 'status' => 'failed', 'error' => (string) ( $read['error'] ?? 'Neo MCP classic read failed' ) );
		}
		$data = self::php_return( $read );
		$html = (string) ( $data['html'] ?? '' );
		$existing = self::anchor_snippet( $html, $target, '' );
		if ( $existing !== null ) {
			return array(
				'status'     => 'applied',
				'error'      => '',
				'via'        => 'post_content',
				'mode'       => 'existing',
				'postId'     => $post_id,
				'targetUrl'  => (string) $existing['href'],
				'anchorText' => (string) $existing['anchorText'],
				'snippet'    => (string) $existing['snippet'],
			);
		}
		$pick = self::suggest_weave_placement(
			array(
				array(
					'id'    => 'classic',
					'title' => 'post_content',
					'html'  => substr( $html, 0, 1200 ),
				),
			),
			$target,
			$anchor_hint
		);
		if ( is_wp_error( $pick ) ) {
			return array( 'status' => 'failed', 'error' => $pick->get_error_message(), 'via' => 'post_content' );
		}
		$phrase   = trim( (string) ( $pick['phrase'] ?? '' ) );
		$injected = self::wrap_phrase_html( $html, $target, $phrase );
		if ( ( $injected['status'] ?? '' ) !== 'ok' ) {
			$injected = self::wrap_existing_span( $html, $target );
		}
		if ( ( $injected['status'] ?? '' ) !== 'ok' ) {
			$injected = self::rebalance_overloaded_html( $html, $target, $anchor_hint, $phrase );
		}
		if ( ( $injected['status'] ?? '' ) !== 'ok' ) {
			return array(
				'status' => 'failed',
				'error'  => (string) ( $injected['reason'] ?? 'Existing phrase was not in the page copy' ),
				'via'    => 'post_content',
			);
		}

		$next_js = wp_json_encode( (string) $injected['html'] );
		$write   = $mcp->call_tool(
			'neo-mcp_php',
			'run',
			array(
				'code' => 'return (function(){ $post_id=' . $post_js . '; $next=' . $next_js . ';'
					. ' $updated=wp_update_post(array("ID"=>$post_id,"post_content"=>$next),true);'
					. ' if(is_wp_error($updated)){ return array("status"=>"failed","reason"=>$updated->get_error_message()); }'
					. ' return array("status"=>"applied","postId"=>$post_id,"mode"=>"weave"); })();',
			)
		);
		if ( empty( $write['ok'] ) ) {
			return array( 'status' => 'failed', 'error' => (string) ( $write['error'] ?? 'Neo MCP classic write failed' ) );
		}
		$wrote = self::php_return( $write );
		if ( (string) ( $wrote['status'] ?? '' ) !== 'applied' ) {
			return array(
				'status' => 'failed',
				'error'  => (string) ( $wrote['reason'] ?? 'Classic write failed' ),
				'via'    => 'post_content',
			);
		}
		$snip = self::anchor_snippet( (string) $injected['html'], $target, '' );
		if ( $snip === null ) {
			return array( 'status' => 'failed', 'error' => 'Saved HTML has no anchor for the target URL', 'via' => 'post_content' );
		}
		return array(
			'status'     => 'applied',
			'error'      => '',
			'via'        => 'post_content',
			'mode'       => 'weave',
			'postId'     => $post_id,
			'targetUrl'  => (string) $snip['href'],
			'anchorText' => (string) $snip['anchorText'],
			'snippet'    => (string) $snip['snippet'],
		);
	}

	/**
	 * @param array<int,array{id:string,html:string}> $widgets
	 */
	private static function widget_html( array $widgets, string $element_id ): string {
		foreach ( $widgets as $w ) {
			if ( (string) ( $w['id'] ?? '' ) === $element_id ) {
				return (string) ( $w['html'] ?? '' );
			}
		}
		return '';
	}

	/**
	 * Keep sections with real body copy, longest first. Skip empty / CTA-only pages.
	 *
	 * @param array<int,array{field:string,html:string,text:string,paragraphs:array<int,string>}> $chunks
	 * @return array<int,array{field:string,html:string,text:string,paragraphs:array<int,string>}>
	 */
	private static function chunks_with_enough_text( array $chunks ): array {
		$scored = array();
		foreach ( $chunks as $chunk ) {
			if ( ! is_array( $chunk ) ) {
				continue;
			}
			$paragraphs = isset( $chunk['paragraphs'] ) && is_array( $chunk['paragraphs'] ) ? $chunk['paragraphs'] : array();
			if ( $paragraphs === array() ) {
				continue;
			}
			$text  = self::collapse_ws( (string) ( $chunk['text'] ?? implode( ' ', $paragraphs ) ) );
			$words = str_word_count( $text );
			if ( $words < 12 ) {
				continue;
			}
			$scored[] = array(
				'words' => $words,
				'chunk' => $chunk,
			);
		}
		if ( $scored === array() ) {
			return array();
		}
		usort(
			$scored,
			static function ( $a, $b ) {
				return (int) $b['words'] <=> (int) $a['words'];
			}
		);
		$out = array();
		foreach ( $scored as $row ) {
			$out[] = $row['chunk'];
		}
		return $out;
	}

	/**
	 * Confirm the page output Neo MCP renders contains the agreed link.
	 *
	 * @return array{anchorText:string,snippet:string,href:string}|null
	 */
	private static function verify_page_link( Neo_Pulse_App_Neo_Mcp_Client $mcp, int $post_id, string $money_url, string $target, string $phrase ): ?array {
		if ( $target === '' ) {
			return null;
		}
		$code = 'return (function(){ $id=' . (int) $post_id . '; $html="";'
			. ' if(class_exists("\\\\Elementor\\\\Plugin")){'
			. ' $html=(string)\\\\Elementor\\\\Plugin::$instance->frontend->get_builder_content_for_display($id,true);'
			. ' }'
			. ' if($html===""){ $html=(string)get_post_field("post_content",$id); }'
			. ' $desc=(string)get_post_meta($id,"description",true); if($desc!==""){ $html.="\\n".$desc; }'
			. ' return array("html"=>$html); })();';
		$res = $mcp->call_tool( 'neo-mcp_php', 'run', array( 'code' => $code ) );
		if ( ! empty( $res['ok'] ) ) {
			$data = self::php_return( $res );
			$body = (string) ( $data['html'] ?? '' );
			$snip = self::anchor_snippet( $body, $target, $phrase );
			if ( $snip !== null ) {
				return $snip;
			}
		}
		$money_url = trim( $money_url );
		if ( $money_url === '' ) {
			return null;
		}
		$url_php = var_export( $money_url, true );
		$fetched = $mcp->call_tool(
			'neo-mcp_php',
			'run',
			array(
				'code' => 'return (function(){ $url=' . $url_php . ';'
					. ' $r=wp_remote_get($url,array("timeout"=>45,"redirection"=>3,"sslverify"=>true,"headers"=>array("Cache-Control"=>"no-cache","Pragma"=>"no-cache")));'
					. ' if(is_wp_error($r)){ return array("ok"=>false); }'
					. ' $code=(int)wp_remote_retrieve_response_code($r); $body=(string)wp_remote_retrieve_body($r);'
					. ' if($code<200||$code>=300){ return array("ok"=>false); }'
					. ' return array("ok"=>true,"body"=>$body); })();',
			)
		);
		if ( empty( $fetched['ok'] ) ) {
			return null;
		}
		$data = self::php_return( $fetched );
		if ( empty( $data['ok'] ) ) {
			return null;
		}
		return self::anchor_snippet( (string) ( $data['body'] ?? '' ), $target, $phrase );
	}

	/**
	 * Exact `<a href>` from saved HTML for the agreed target only.
	 *
	 * @return array{anchorText:string,snippet:string,href:string}|null
	 */
	private static function anchor_snippet( string $html, string $target, string $prefer_text = '' ): ?array {
		if ( $html === '' || $target === '' ) {
			return null;
		}
		if ( ! preg_match_all( '/<a\b[^>]*href=(["\'])([^"\']+)\1[^>]*>(.*?)<\/a>/is', $html, $matches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE ) ) {
			return null;
		}
		$want = self::norm_url( $target );
		$best = null;
		foreach ( $matches as $hit ) {
			$raw_href = html_entity_decode( (string) $hit[2][0], ENT_QUOTES, 'UTF-8' );
			$href     = self::norm_url( $raw_href );
			if ( $href !== $want ) {
				continue;
			}
			$inner = self::collapse_ws( wp_strip_all_tags( (string) $hit[3][0] ) );
			$tag   = (string) $hit[0][0];
			$pos   = (int) $hit[0][1];
			$start = max( 0, $pos - 80 );
			$snippet = substr( $html, $start, strlen( $tag ) + 160 );
			if ( strpos( $html, $snippet ) === false || strpos( $snippet, $tag ) === false ) {
				continue;
			}
			$row = array(
				'anchorText' => $inner,
				'snippet'    => $snippet,
				'href'       => $raw_href,
			);
			if ( $prefer_text !== '' && strcasecmp( $inner, self::collapse_ws( $prefer_text ) ) === 0 ) {
				return $row;
			}
			if ( $best === null ) {
				$best = $row;
			}
		}
		if ( $prefer_text !== '' && $best === null ) {
			return null;
		}
		return $best;
	}

	/**
	 * Wrap an existing phrase already in the HTML. Never append new sentences.
	 *
	 * @return array{status:string,html?:string,mode?:string,reason?:string}
	 */
	/**
	 * When the copy is already full of text links, unwrap the weaker ones so the new suggestion can be placed.
	 *
	 * @param array<int,array<string,mixed>> $pool
	 * @return array{status:string,html?:string,elementId?:string,mode?:string,reason?:string}
	 */
	private static function rebalance_overloaded_pool( array $pool, string $target, string $hint, string $phrase ): array {
		$best = null;
		foreach ( $pool as $widget ) {
			$count = count( self::text_links( (string) ( $widget['html'] ?? '' ) ) );
			if ( $best === null || $count > (int) $best['count'] ) {
				$best = array(
					'count'  => $count,
					'widget' => $widget,
				);
			}
		}
		if ( $best === null || (int) $best['count'] < 1 ) {
			return array( 'status' => 'failed', 'reason' => 'No text links to rebalance' );
		}
		$widget = $best['widget'];
		$placed = self::rebalance_overloaded_html( (string) ( $widget['html'] ?? '' ), $target, $hint, $phrase );
		if ( ( $placed['status'] ?? '' ) !== 'ok' ) {
			return $placed;
		}
		$placed['elementId'] = (string) ( $widget['id'] ?? '' );
		return $placed;
	}

	/**
	 * @return array{status:string,html?:string,mode?:string,reason?:string}
	 */
	private static function rebalance_overloaded_html( string $html, string $target, string $hint, string $phrase ): array {
		$existing = self::text_links( $html );
		if ( $existing === array() ) {
			return array( 'status' => 'failed', 'reason' => 'No text links to rebalance' );
		}
		$remove = self::choose_links_to_remove( $existing, $target, $hint );
		if ( is_wp_error( $remove ) ) {
			return array( 'status' => 'failed', 'reason' => $remove->get_error_message() );
		}
		$next = self::unwrap_hrefs( $html, $remove );
		$try  = $phrase !== '' ? self::wrap_phrase_html( $next, $target, $phrase ) : array( 'status' => 'failed' );
		if ( ( $try['status'] ?? '' ) !== 'ok' ) {
			$try = self::wrap_existing_span( $next, $target );
		}
		if ( ( $try['status'] ?? '' ) !== 'ok' ) {
			return $try;
		}
		$try['mode'] = 'rebalance';
		return $try;
	}

	/**
	 * @return array<int,array{href:string,text:string}>
	 */
	private static function text_links( string $html ): array {
		if ( ! preg_match_all( '/<a\b[^>]*href=(["\'])([^"\']+)\1[^>]*>(.*?)<\/a>/is', $html, $matches, PREG_SET_ORDER ) ) {
			return array();
		}
		$out = array();
		foreach ( $matches as $hit ) {
			$text = trim( wp_strip_all_tags( (string) $hit[3] ) );
			$href = html_entity_decode( (string) $hit[2], ENT_QUOTES, 'UTF-8' );
			if ( $text === '' || $href === '' ) {
				continue;
			}
			$out[] = array(
				'href' => $href,
				'text' => $text,
			);
		}
		return $out;
	}

	/**
	 * @param array<int,array{href:string,text:string}> $existing
	 * @return array<int,string>|WP_Error
	 */
	private static function choose_links_to_remove( array $existing, string $target, string $hint ) {
		$system = 'Return JSON only: {"removeHrefs":["https://..."]}.'
			. ' This page has too many text links to place another one. Prioritize the incoming suggestion.'
			. ' removeHrefs are existing links to unwrap. Keep their visible words and drop the link.'
			. ' Do not remove the incoming target. Remove the least useful links first, and remove at least one.'
			. ' Never use an em dash.';
		$user   = wp_json_encode(
			array(
				'incomingTarget' => $target,
				'incomingHint'   => $hint,
				'existingLinks'  => $existing,
			)
		);
		$model = Neo_Pulse_App_Openrouter_Agent_Models::resolve( Neo_Pulse_App_Openrouter_Agent_Models::CATEGORY_BLOG );
		$raw   = self::openrouter_json( $model, $system, $user );
		if ( is_wp_error( $raw ) ) {
			return $raw;
		}
		$allowed = array();
		foreach ( $existing as $link ) {
			$allowed[ self::norm_url( (string) $link['href'] ) ] = (string) $link['href'];
		}
		$hrefs = array();
		foreach ( (array) ( $raw['removeHrefs'] ?? array() ) as $href ) {
			$key = self::norm_url( (string) $href );
			if ( isset( $allowed[ $key ] ) && $key !== self::norm_url( $target ) ) {
				$hrefs[] = $allowed[ $key ];
			}
		}
		if ( $hrefs === array() ) {
			foreach ( $existing as $link ) {
				if ( self::norm_url( (string) $link['href'] ) !== self::norm_url( $target ) ) {
					$hrefs[] = (string) $link['href'];
					break;
				}
			}
		}
		return $hrefs;
	}

	/**
	 * @param array<int,string> $hrefs
	 */
	private static function unwrap_hrefs( string $html, array $hrefs ): string {
		foreach ( $hrefs as $href ) {
			$quoted = preg_quote( $href, '/' );
			$html   = (string) preg_replace( '/<a\b[^>]*href=(["\'])' . $quoted . '\\1[^>]*>(.*?)<\/a>/is', '$2', $html );
		}
		return $html;
	}

	private static function match_is_body_copy( string $html, int $pos, string $matched ): bool {
		if ( preg_match( '/<(?:a|img|button|h[1-6]|figure|picture|svg|div|ul|ol|li|p)\b/i', $matched ) ) {
			return false;
		}
		if ( preg_match( '/\bread\s*more\b/i', $matched ) ) {
			return false;
		}
		$before = substr( $html, 0, $pos );
		$open_a = preg_match_all( '/<a\b/i', $before );
		$close_a = preg_match_all( '/<\/a>/i', $before );
		if ( (int) $open_a !== (int) $close_a ) {
			return false;
		}
		if ( preg_match( '/<(?:img|button|h[1-6]|figure|picture|svg)\b[^>]*$/is', $before ) ) {
			return false;
		}
		if ( preg_match( '/<(?:h[1-6]|figure|picture|button)\b[^>]*>(?:(?!<\/(?:h[1-6]|figure|picture|button)>).)*$/is', $before ) ) {
			return false;
		}
		if ( ! preg_match( '/<p\b[^>]*>(?:(?!<\/p>).)*$/is', $before ) ) {
			return false;
		}
		return true;
	}

	/**
	 * The match must sit inside one <p> and leave other words in that paragraph.
	 */
	private static function match_is_partial_paragraph( string $html, int $pos, string $matched ): bool {
		$before = substr( $html, 0, $pos );
		if ( ! preg_match( '/<p\b[^>]*>((?:(?!<\/p>).)*)$/is', $before, $open ) ) {
			return false;
		}
		$after = substr( $html, $pos + strlen( $matched ) );
		if ( ! preg_match( '/^((?:(?!<\/p>).)*)<\/p>/is', $after, $close ) ) {
			return false;
		}
		$inner = self::collapse_ws( wp_strip_all_tags( (string) $open[1] . $matched . (string) $close[1] ) );
		$piece = self::collapse_ws( wp_strip_all_tags( $matched ) );
		if ( $inner === '' || $piece === '' || strcasecmp( $inner, $piece ) === 0 ) {
			return false;
		}
		$inner_words = preg_split( '/\s+/', $inner );
		$piece_words = preg_split( '/\s+/', $piece );
		$inner_count = is_array( $inner_words ) ? count( array_filter( $inner_words ) ) : 0;
		$piece_count = is_array( $piece_words ) ? count( array_filter( $piece_words ) ) : 0;
		return $piece_count >= 2 && $piece_count <= 5 && $piece_count < $inner_count;
	}

	private static function wrap_phrase_html( string $html, string $target, string $phrase ): array {
		$phrase = trim( (string) preg_replace( '/\s+/', ' ', html_entity_decode( $phrase, ENT_QUOTES | ENT_HTML5, 'UTF-8' ) ) );
		$words  = preg_split( '/\s+/', $phrase );
		$words  = is_array( $words ) ? array_values( array_filter( $words, static function ( $word ) {
			return $word !== '';
		} ) ) : array();
		if ( count( $words ) < 2 || count( $words ) > 5 ) {
			return array( 'status' => 'failed', 'reason' => 'Anchor must be 2-5 words inside a paragraph' );
		}
		if ( stripos( $html, '<p' ) === false ) {
			$pos = stripos( $html, $phrase );
			if ( $pos === false ) {
				return array( 'status' => 'failed', 'reason' => 'Suggested phrase not found in section HTML' );
			}
			$matched = substr( $html, $pos, strlen( $phrase ) );
			$link    = '<a href="' . esc_url( $target ) . '">' . $matched . '</a>';
			return array(
				'status' => 'ok',
				'mode'   => 'weave',
				'html'   => substr( $html, 0, $pos ) . $link . substr( $html, $pos + strlen( $matched ) ),
			);
		}
		$parts = array();
		foreach ( $words as $word ) {
			$parts[] = preg_quote( $word, '/' );
		}
		// Allow whitespace and inline tags between the words inside a paragraph.
		$pattern = '/' . implode( '(?:\s|<[^>]+>)+', $parts ) . '/i';
		if ( preg_match_all( $pattern, $html, $matches, PREG_OFFSET_CAPTURE ) ) {
			foreach ( $matches[0] as $hit ) {
				$matched = (string) $hit[0];
				$pos     = (int) $hit[1];
				if ( ! self::match_is_body_copy( $html, $pos, $matched ) || ! self::match_is_partial_paragraph( $html, $pos, $matched ) ) {
					continue;
				}
				$link = '<a href="' . esc_url( $target ) . '">' . $matched . '</a>';
				return array(
					'status' => 'ok',
					'mode'   => 'weave',
					'html'   => substr( $html, 0, $pos ) . $link . substr( $html, $pos + strlen( $matched ) ),
				);
			}
		}
		return array( 'status' => 'failed', 'reason' => 'Suggested phrase not found in section HTML' );
	}

	/**
	 * Wrap a short run of words already in the section when the suggestion does not match.
	 *
	 * @return array{status:string,html?:string,mode?:string,reason?:string}
	 */
	private static function wrap_existing_span( string $html, string $target ): array {
		$plain = trim( (string) preg_replace( '/\s+/', ' ', wp_strip_all_tags( $html ) ) );
		$words = preg_split( '/\s+/', $plain );
		$words = is_array( $words ) ? array_values( array_filter( $words, static function ( $word ) {
			return $word !== '';
		} ) ) : array();
		if ( count( $words ) < 4 ) {
			return array( 'status' => 'failed', 'reason' => 'Not enough copy to wrap' );
		}
		$start = (int) floor( count( $words ) / 3 );
		$slice = array_slice( $words, $start, 5 );
		return self::wrap_phrase_html( $html, $target, implode( ' ', $slice ) );
	}

	/**
	 * @param array<string,mixed> $site
	 */
	public static function is_custom_shades_blocked( array $site ): bool {
		$hay = strtolower(
			trim( (string) ( $site['name'] ?? '' ) ) . ' ' . trim( (string) ( $site['siteUrl'] ?? '' ) )
		);
		return strpos( $hay, 'custom shades of london' ) !== false
			|| strpos( $hay, 'customshadesoflondon' ) !== false;
	}

	/**
	 * @param array<int,string> $urls
	 * @return array<int,string>
	 */
	public static function filter_money_urls( array $urls ): array {
		$out = array();
		foreach ( $urls as $url ) {
			$url = trim( (string) $url );
			if ( $url === '' || self::is_utility_url( $url ) || self::is_service_area_url( $url ) ) {
				continue;
			}
			$out[] = $url;
			if ( count( $out ) >= self::MAX_MONEY_PAGES ) {
				break;
			}
		}
		return array_values( array_unique( $out ) );
	}

	public static function is_non_money_page( string $url ): bool {
		$path  = strtolower( trim( (string) wp_parse_url( $url, PHP_URL_PATH ), '/' ) );
		$parts = array_values( array_filter( explode( '/', $path ) ) );
		$slug  = $parts[ count( $parts ) - 1 ] ?? '';
		if ( in_array( 'blog', $parts, true ) ) {
			return true;
		}
		if ( $slug !== '' && in_array( $slug, self::NON_MONEY_SLUGS, true ) ) {
			return true;
		}
		foreach ( $parts as $part ) {
			if ( strpos( $part, 'gallery' ) !== false || strpos( $part, 'testimonial' ) !== false ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param array<string,mixed> $inventory
	 */
	private static function is_blog_target( string $url, array $inventory ): bool {
		$want = self::norm_url( $url );
		foreach ( (array) ( $inventory['blogUrls'] ?? array() ) as $blog ) {
			if ( self::norm_url( (string) $blog ) === $want ) {
				return true;
			}
		}
		return false;
	}

	public static function is_utility_url( string $url ): bool {
		$path = (string) wp_parse_url( $url, PHP_URL_PATH );
		$path = strtolower( trim( $path, '/' ) );
		if ( $path === '' ) {
			return true;
		}
		$parts = array_values( array_filter( explode( '/', $path ) ) );
		$slug  = $parts[ count( $parts ) - 1 ] ?? '';
		if ( in_array( $slug, self::UTILITY_SLUGS, true ) ) {
			return true;
		}
		if ( count( $parts ) === 1 && in_array( $parts[0], self::UTILITY_SLUGS, true ) ) {
			return true;
		}
		return false;
	}

	public static function is_service_area_url( string $url ): bool {
		$h = strtolower( $url );
		return strpos( $h, 'service-area' ) !== false
			|| strpos( $h, 'service_area' ) !== false
			|| strpos( $h, '/location/' ) !== false;
	}

	/**
	 * @param array<string,mixed> $site
	 * @return array{siteUrl:string,username:string,appPassword:string}|WP_Error
	 */
	private static function auth_from_site( array $site ) {
		$auth = array(
			'siteUrl'     => untrailingslashit( trim( (string) ( $site['siteUrl'] ?? '' ) ) ),
			'username'    => trim( (string) ( $site['username'] ?? '' ) ),
			'appPassword' => (string) ( $site['appPassword'] ?? '' ),
		);
		if ( $auth['siteUrl'] === '' || $auth['username'] === '' || $auth['appPassword'] === '' ) {
			return new WP_Error( 'neo-pulse_mplinks_auth', 'Site is missing WordPress credentials' );
		}
		return $auth;
	}

	/**
	 * @param array<string,mixed> $site
	 */
	private static function resolve_page_sitemap_url( array $site ): string {
		$children = isset( $site['sitemaps']['childSitemaps'] ) && is_array( $site['sitemaps']['childSitemaps'] )
			? $site['sitemaps']['childSitemaps']
			: array();
		foreach ( $children as $child ) {
			$child = trim( (string) $child );
			if ( $child !== '' && self::sitemap_looks_like_page( $child ) ) {
				return $child;
			}
		}
		$base = untrailingslashit( trim( (string) ( $site['siteUrl'] ?? '' ) ) );
		return $base !== '' ? $base . '/page-sitemap.xml' : '';
	}

	/**
	 * @param array<string,mixed> $site
	 */
	private static function resolve_post_sitemap_url( array $site ): string {
		$children = isset( $site['sitemaps']['childSitemaps'] ) && is_array( $site['sitemaps']['childSitemaps'] )
			? $site['sitemaps']['childSitemaps']
			: array();
		foreach ( $children as $child ) {
			$child = trim( (string) $child );
			if ( $child !== '' && self::sitemap_looks_like_post( $child ) ) {
				return $child;
			}
		}
		$base = untrailingslashit( trim( (string) ( $site['siteUrl'] ?? '' ) ) );
		return $base !== '' ? $base . '/post-sitemap.xml' : '';
	}

	private static function sitemap_looks_like_page( string $haystack ): bool {
		$h = strtolower( $haystack );
		if ( self::is_service_area_url( $h ) ) {
			return false;
		}
		return strpos( $h, 'page-sitemap' ) !== false || strpos( $h, 'pages-sitemap' ) !== false;
	}

	private static function sitemap_looks_like_post( string $haystack ): bool {
		$h = strtolower( $haystack );
		if ( self::is_service_area_url( $h ) || self::sitemap_looks_like_page( $h ) ) {
			return false;
		}
		return strpos( $h, 'post-sitemap' ) !== false || strpos( $h, 'posts' ) !== false;
	}

	/**
	 * @return array<int,string>
	 */
	private static function parse_sitemap_urls( string $sitemap_url, string $username, string $password ): array {
		$response = wp_remote_get(
			$sitemap_url,
			array(
				'timeout' => 20,
				'headers' => array(
					'Authorization' => 'Basic ' . base64_encode( $username . ':' . $password ),
				),
			)
		);
		if ( is_wp_error( $response ) ) {
			return array();
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( $code < 200 || $code >= 300 ) {
			return array();
		}
		$body = (string) wp_remote_retrieve_body( $response );
		$urls = array();
		if ( preg_match_all( '/<loc>\s*([^<\s]+)\s*<\/loc>/i', $body, $matches ) ) {
			foreach ( $matches[1] as $loc ) {
				$loc = trim( html_entity_decode( (string) $loc, ENT_QUOTES, 'UTF-8' ) );
				if ( strpos( $loc, 'http' ) === 0 ) {
					$urls[] = $loc;
				}
			}
		}
		return $urls;
	}

	private static function norm_url( string $url ): string {
		$url = strtolower( untrailingslashit( trim( $url ) ) );
		return $url;
	}

	/**
	 * Neo MCP PHP only exposes the function return value. Echoed JSON is not the status.
	 *
	 * @param array<string,mixed> $res
	 * @return array<string,mixed>
	 */
	private static function php_return( array $res ): array {
		$data = $res['data'] ?? null;
		if ( is_string( $data ) && $data !== '' ) {
			$decoded = json_decode( $data, true );
			if ( is_array( $decoded ) ) {
				$data = $decoded;
			}
		}
		if ( is_array( $data ) ) {
			if ( isset( $data['return'] ) && ( is_array( $data['return'] ) || is_string( $data['return'] ) ) ) {
				$inner = $data['return'];
				if ( is_string( $inner ) ) {
					$decoded = json_decode( $inner, true );
					return is_array( $decoded ) ? $decoded : array();
				}
				return $inner;
			}
			if ( isset( $data['status'] ) || isset( $data['ok'] ) || isset( $data['postId'] ) ) {
				return $data;
			}
		}
		$text = trim( (string) ( $res['text'] ?? '' ) );
		if ( $text !== '' ) {
			$decoded = json_decode( $text, true );
			if ( is_array( $decoded ) ) {
				if ( isset( $decoded['return'] ) && is_array( $decoded['return'] ) ) {
					return $decoded['return'];
				}
				if ( isset( $decoded['status'] ) || isset( $decoded['ok'] ) || isset( $decoded['postId'] ) ) {
					return $decoded;
				}
			}
		}
		return array();
	}

	/**
	 * @return array<string,mixed>|WP_Error
	 */
	private static function openrouter_json( string $model, string $system, string $user ) {
		$api_key = class_exists( 'Neo_Pulse_App_Secrets' ) ? Neo_Pulse_App_Secrets::openrouter_api_key() : '';
		if ( $api_key === '' ) {
			return new WP_Error( 'neo-pulse_openrouter', 'OpenRouter API key is not configured on the server' );
		}
		$headers = class_exists( 'Neo_Pulse_App_Openrouter_Attribution' )
			? Neo_Pulse_App_Openrouter_Attribution::request_headers( $api_key )
			: array(
				'Authorization' => 'Bearer ' . $api_key,
				'Content-Type'  => 'application/json',
			);
		$res = wp_remote_post(
			'https://openrouter.ai/api/v1/chat/completions',
			array(
				'timeout' => 120,
				'headers' => $headers,
				'body'    => wp_json_encode(
					array(
						'model'           => $model,
						'temperature'     => 0.2,
						'max_tokens'      => 2048,
						'response_format' => array( 'type' => 'json_object' ),
						'messages'        => array(
							array(
								'role'    => 'system',
								'content' => $system,
							),
							array(
								'role'    => 'user',
								'content' => $user,
							),
						),
					)
				),
			)
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		$body = (string) wp_remote_retrieve_body( $res );
		if ( $code < 200 || $code >= 300 ) {
			return new WP_Error( 'neo-pulse_openrouter_http', 'OpenRouter HTTP ' . $code );
		}
		$decoded = json_decode( $body, true );
		$message = is_array( $decoded ) && isset( $decoded['choices'][0]['message'] ) && is_array( $decoded['choices'][0]['message'] )
			? $decoded['choices'][0]['message']
			: array();
		$content = self::openrouter_message_text( $message );
		$parsed  = json_decode( $content, true );
		if ( ! is_array( $parsed ) ) {
			$start = strpos( $content, '{' );
			$end   = strrpos( $content, '}' );
			if ( $start !== false && $end !== false && $end > $start ) {
				$parsed = json_decode( substr( $content, $start, $end - $start + 1 ), true );
			}
		}
		if ( ! is_array( $parsed ) ) {
			return new WP_Error( 'neo-pulse_openrouter_json', 'OpenRouter HTTP reply could not be read' );
		}
		return $parsed;
	}

	/**
	 * @param array<string,mixed> $message
	 */
	private static function openrouter_message_text( array $message ): string {
		$content = $message['content'] ?? '';
		if ( is_string( $content ) ) {
			return trim( $content );
		}
		if ( is_array( $content ) ) {
			$parts = array();
			foreach ( $content as $part ) {
				if ( is_array( $part ) && isset( $part['text'] ) && is_string( $part['text'] ) ) {
					$text = trim( $part['text'] );
					if ( $text !== '' ) {
						$parts[] = $text;
					}
				} elseif ( is_string( $part ) && trim( $part ) !== '' ) {
					$parts[] = trim( $part );
				}
			}
			if ( $parts !== array() ) {
				return trim( implode( "\n", $parts ) );
			}
		}
		if ( isset( $message['reasoning'] ) && is_string( $message['reasoning'] ) ) {
			$text = trim( $message['reasoning'] );
			if ( $text !== '' ) {
				return $text;
			}
		}
		return '';
	}

	/**
	 * OpenRouter decision-logic call. Returns noul probability keyed by question name.
	 *
	 * @param array<string,array<string,mixed>> $questions
	 * @param array<string,mixed>               $state
	 * @return array<string,float>|WP_Error
	 */
	private static function openrouter_decide( array $questions, array $state ) {
		$api_key = class_exists( 'Neo_Pulse_App_Secrets' ) ? Neo_Pulse_App_Secrets::openrouter_api_key() : '';
		if ( $api_key === '' ) {
			return new WP_Error( 'neo-pulse_openrouter', 'OpenRouter API key is not configured on the server' );
		}
		$headers = class_exists( 'Neo_Pulse_App_Openrouter_Attribution' )
			? Neo_Pulse_App_Openrouter_Attribution::request_headers( $api_key )
			: array(
				'Authorization' => 'Bearer ' . $api_key,
				'Content-Type'  => 'application/json',
			);
		$res = wp_remote_post(
			'https://openrouter.ai/api/alpha/decisions',
			array(
				'timeout' => 90,
				'headers' => $headers,
				'body'    => wp_json_encode(
					array(
						'model'     => self::DECISION_MODEL,
						'questions' => $questions,
						'state'     => $state,
					)
				),
			)
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		$body = (string) wp_remote_retrieve_body( $res );
		if ( $code < 200 || $code >= 300 ) {
			return new WP_Error( 'neo-pulse_mplinks_decide', 'OpenRouter decision HTTP ' . $code );
		}
		$decoded = json_decode( $body, true );
		$answers = is_array( $decoded ) && isset( $decoded['answers'] ) && is_array( $decoded['answers'] )
			? $decoded['answers']
			: array();
		$out = array();
		foreach ( $questions as $name => $_question ) {
			$noul = $answers[ $name ]['noul'] ?? null;
			if ( ! is_numeric( $noul ) ) {
				return new WP_Error( 'neo-pulse_mplinks_decide', 'Decision reply missing noul for ' . $name );
			}
			$out[ $name ] = (float) $noul;
		}
		return $out;
	}
}
