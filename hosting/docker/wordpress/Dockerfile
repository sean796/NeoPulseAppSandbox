FROM wordpress:6.9.4-php8.3-apache

RUN apt-get update \
  && apt-get install -y --no-install-recommends less mariadb-client curl ffmpeg \
  && curl -fsSL https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar -o /usr/local/bin/wp \
  && chmod +x /usr/local/bin/wp \
  && rm -rf /var/lib/apt/lists/*

COPY hosting/docker/wordpress/docker-entrypoint.sh /usr/local/bin/neo-host-wp-entrypoint.sh
RUN chmod +x /usr/local/bin/neo-host-wp-entrypoint.sh

COPY wordpress-plugins/neo-pulse-wp /usr/src/neo-pulse-wp
COPY wordpress-plugins/neo-pulse-app /usr/src/neo-pulse-app

ENTRYPOINT ["/usr/local/bin/neo-host-wp-entrypoint.sh"]
CMD ["apache2-foreground"]
