#!/bin/sh

sed -i "s~\${REGISTRY_URL}~${REGISTRY_URL}~" index.html
sed -i "s~\${REGISTRY_TITLE}~${REGISTRY_TITLE}~" index.html
sed -i "s~\${PULL_URL}~${PULL_URL}~" index.html
sed -i "s~\${SINGLE_REGISTRY}~${SINGLE_REGISTRY}~" index.html
sed -i "s~\${CATALOG_ELEMENTS_LIMIT}~${CATALOG_ELEMENTS_LIMIT}~" index.html
sed -i "s~\${SHOW_CONTENT_DIGEST}~${SHOW_CONTENT_DIGEST}~" index.html
sed -i "s~\${SHOW_TAG_HISTORY}~${SHOW_TAG_HISTORY}~" index.html
sed -i "s~\${DEFAULT_REGISTRIES}~${DEFAULT_REGISTRIES}~" index.html
sed -i "s~\${READ_ONLY_REGISTRIES}~${READ_ONLY_REGISTRIES}~" index.html
sed -i "s~\${SHOW_CATALOG_NB_TAGS}~${SHOW_CATALOG_NB_TAGS}~" index.html
sed -i "s~\${HISTORY_CUSTOM_LABELS}~${HISTORY_CUSTOM_LABELS}~" index.html
sed -i "s~\${USE_CONTROL_CACHE_HEADER}~${USE_CONTROL_CACHE_HEADER}~" index.html
sed -i "s~\${TAGLIST_ORDER}~${TAGLIST_ORDER}~" index.html
sed -i "s~\${CATALOG_DEFAULT_EXPANDED}~${CATALOG_DEFAULT_EXPANDED}~" index.html
sed -i "s~\${CATALOG_MIN_BRANCHES}~${CATALOG_MIN_BRANCHES}~" index.html
sed -i "s~\${CATALOG_MAX_BRANCHES}~${CATALOG_MAX_BRANCHES}~" index.html
sed -i "s~\${TAGLIST_PAGE_SIZE}~${TAGLIST_PAGE_SIZE}~" index.html
sed -i "s~\${REGISTRY_SECURED}~${REGISTRY_SECURED}~" index.html

grep -o 'THEME[A-Z_]*' index.html | while read e; do
  sed -i "s~\${$e}~$(printenv $e)~" index.html
done

if [ -z "${DELETE_IMAGES}" ] || [ "${DELETE_IMAGES}" = false ] ; then
  sed -i "s/\${DELETE_IMAGES}/false/" index.html
else
  sed -i "s/\${DELETE_IMAGES}/true/" index.html
fi

get_nginx_proxy_headers() {
  (
    env &&
    if [ -f "/etc/nginx/.env" ]; then
      cat /etc/nginx/.env
      # Force new line
      echo ""
    fi
  ) | while read e; do
    if [ -n "$(echo $e | grep -o '^NGINX_PROXY_HEADER_')" ]; then
      key=$(echo ${e%%=*} | sed 's/^NGINX_PROXY_HEADER_//' | sed 's/_/-/g')
      value=${e#*=}
      echo -n "proxy_set_header ${key} \"${value}\"; "
    fi
  done
}

get_nginx_proxy_pass_headers() {
  (
    env &&
    if [ -f "/etc/nginx/.env" ]; then
      cat /etc/nginx/.env
      # Force new line
      echo ""
    fi
  ) | while read e; do
    if [ -n "$(echo $e | grep -o '^NGINX_PROXY_PASS_HEADER_')" ]; then
      key=$(echo ${e%%=*} | sed 's/^NGINX_PROXY_PASS_HEADER_//' | sed 's/_/-/g')
      echo -n "proxy_pass_header \"${key}\"; "
    fi
  done
}

if [ -n "${NGINX_PROXY_PASS_URL}" ] ; then
  sed -i "s,\${NGINX_PROXY_PASS_URL},${NGINX_PROXY_PASS_URL}," /etc/nginx/conf.d/default.conf
  sed -i "s^\${NGINX_PROXY_HEADERS}^$(get_nginx_proxy_headers)^" /etc/nginx/conf.d/default.conf
  sed -i "s^\${NGINX_PROXY_PASS_HEADERS}^$(get_nginx_proxy_pass_headers)^" /etc/nginx/conf.d/default.conf
  sed -i "s,#! , ," /etc/nginx/conf.d/default.conf # The space is important here, to not interfer with #!r
  if [ -n "${NGINX_RESOLVER}" ]; then
    sed -i "s,\${NGINX_RESOLVER},${NGINX_RESOLVER}," /etc/nginx/conf.d/default.conf
    sed -i "s,#r,," /etc/nginx/conf.d/default.conf
  else
    sed -i "s,#!r, ," /etc/nginx/conf.d/default.conf # The space is for cosmetic here
  fi
fi

if [ "$(whoami)" != "root" ]; then
  if [ "$NGINX_LISTEN_PORT" = "80" ]; then
    NGINX_LISTEN_PORT="8080"
  fi
  sed -i "/user  nginx;/d" /etc/nginx/nginx.conf
  sed -i "s,/var/run/nginx.pid,/tmp/nginx.pid," /etc/nginx/nginx.conf
fi

if [ "$NGINX_LISTEN_PORT" != "80" ]; then
  sed -i "s,listen       80;,listen       $NGINX_LISTEN_PORT;," /etc/nginx/conf.d/default.conf
fi
