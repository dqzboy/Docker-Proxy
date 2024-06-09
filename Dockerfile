FROM nginx:alpine-slim

LABEL maintainer="Jones MAGLOIRE @Joxit"

WORKDIR /usr/share/nginx/html/

ENV NGINX_PROXY_HEADER_Host '$http_host'
ENV NGINX_LISTEN_PORT '80'
ENV SHOW_CATALOG_NB_TAGS 'false'

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY bin/docker-registry-ui.sh /docker-entrypoint.d/90-docker-registry-ui.sh
COPY dist/ /usr/share/nginx/html/
COPY favicon.ico /usr/share/nginx/html/

RUN chown -R nginx:nginx /etc/nginx/ /usr/share/nginx/html/ /var/cache/nginx
