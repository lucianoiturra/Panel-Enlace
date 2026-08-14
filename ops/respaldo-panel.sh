#!/bin/sh
# Volcado diario de la base de Panel-Enlace a /srv/apps/backups/panel-enlace.
#
# Antes esto era un `while true; sleep 86400` dentro del contenedor
# panel-backup. Dormir 86400 segundos no es "todos los dias a tal hora": es
# "cada 24 horas contadas desde que arranco el contenedor", asi que cualquier
# reinicio movia el respaldo a esa hora para siempre. Un reinicio a las 14:00
# dejaba el volcado a las 14:00, en plena clase y con la base moviendose.
# El timer de systemd lo clava a las 02:45, media hora antes de que el respaldo
# al USB (03:15) se lleve esta carpeta.
set -u

DESTINO=/srv/apps/backups/panel-enlace
COPIAS=14
TS=$(date +%Y%m%d-%H%M%S)
ARCHIVO="$DESTINO/panel-$TS.sql.gz"
CRUDO=$(mktemp) || exit 1
ERROR=$(mktemp) || exit 1
trap 'rm -f "$CRUDO" "$ERROR" "$ARCHIVO.parcial"' EXIT

mkdir -p "$DESTINO"

# "pg_dump | gzip" escondia los fallos: en sh el estado de una tuberia es el del
# ULTIMO comando, y gzip comprime feliz una entrada vacia. El 2026-08-12 dos
# volcados fallidos quedaron archivados como buenos, de 20 bytes cada uno. Por
# eso se vuelca a disco, se miran codigo de salida Y tamano, y recien entonces
# la copia aparece con su nombre definitivo.
if ! docker exec panel-db pg_dump -U panel -d panel > "$CRUDO" 2>"$ERROR"; then
  echo "respaldo $TS FALLO: $(tail -1 "$ERROR")" >&2
  exit 1
fi

BYTES=$(wc -c < "$CRUDO")
if [ "$BYTES" -lt 10240 ]; then
  echo "respaldo $TS FALLO: el volcado trajo solo $BYTES bytes" >&2
  exit 1
fi

gzip -c "$CRUDO" > "$ARCHIVO.parcial" || { echo "respaldo $TS FALLO: gzip" >&2; exit 1; }
mv "$ARCHIVO.parcial" "$ARCHIVO"
echo "respaldo $TS ok ($BYTES bytes sin comprimir)"

# La poda va al final y a proposito no aborta el servicio: perder una copia
# vieja no invalida la que se acaba de escribir.
ls -1t "$DESTINO"/panel-*.sql.gz 2>/dev/null | tail -n +$((COPIAS + 1)) | xargs -r rm -f
