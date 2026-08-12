#!/bin/sh
# Avisos de cabserver -> ntfy. Convierte /salud, que hay que ir a mirar, en algo
# que llega solo.
#
# NO reimplementa umbrales. El juicio de que es "ok", "atencion" o "falla" vive
# en lib/salud/evaluar.ts y se consulta por /api/salud: dos copias de esa tabla
# terminarian discrepando, y la pantalla y el aviso dirian cosas distintas del
# mismo servidor.
#
# Avisa por TRANSICIONES, no por estados. Un rojo que sigue rojo no vuelve a
# sonar: repetir el mismo grito cada cinco minutos es la forma mas rapida de que
# alguien silencie el canal, y un canal silenciado no avisa de nada.
#
# Modos:
#   alerta-cabserver.sh            transiciones (cada 5 min por timer)
#   alerta-cabserver.sh --resumen  parte del dia (una vez, 07:30)
set -u

# Los caminos se pueden sobrescribir por entorno. En produccion nadie lo hace;
# existe para poder probar el script contra respuestas guardadas (file://...)
# sin tocar el estado real ni mandar avisos de verdad.
CONF="${ALERTA_CONF:-/etc/alerta-cabserver.conf}"
ENV_PANEL="${ALERTA_ENV_PANEL:-/srv/apps/compose/panel-enlace/.env}"
DIR_ESTADO="${ALERTA_DIR_ESTADO:-/var/lib/alerta-cabserver}"
ESTADO="$DIR_ESTADO/estado.tsv"

# Cuantas filas ciegas hacen falta para llamarlo "murio el colector" en vez de
# quince fallas sueltas. Cuando el colector se cae, TODAS las filas del host
# quedan sin datos a la vez: mandar una notificacion por cada una convierte el
# primer incidente real en quince mensajes.
UMBRAL_COLECTOR=5
# Un mismo hecho no se repite dentro de esta ventana, para que un servicio que
# parpadea no despierte a nadie cada cinco minutos.
SILENCIO_SEG=1800

[ -r "$CONF" ] || { echo "alerta-cabserver: falta $CONF" >&2; exit 1; }
. "$CONF"
: "${NTFY_URL:?}" "${NTFY_TOPIC:?}" "${NTFY_USER:?}" "${NTFY_PASS:?}"
HEARTBEAT_URL="${HEARTBEAT_URL:-}"
PANEL_URL="${PANEL_URL:-http://127.0.0.1:8083/api/salud}"

mkdir -p "$DIR_ESTADO"
[ -f "$ESTADO" ] || : > "$ESTADO"
AHORA=$(date +%s)
NUEVO=$(mktemp) || exit 1
FALLAS=$(mktemp) || exit 1
CURAS=$(mktemp) || exit 1
trap 'rm -f "$NUEVO" "$FALLAS" "$CURAS"' EXIT

# Las credenciales del panel no se copian a un segundo archivo: se leen del
# unico lugar donde ya viven.
leer_env() { sed -n "s/^$1=//p" "$ENV_PANEL" 2>/dev/null | head -1; }

# Los titulos van en ASCII a proposito: ntfy manda el titulo en una cabecera
# HTTP y los acentos llegan rotos a algunos clientes. El cuerpo si lleva tildes.
avisar() { # titulo prioridad tags cuerpo
  # Con ALERTA_SIMULACRO el aviso se escribe en un archivo en vez de salir a la
  # red: es lo que permite probar las transiciones sin mandarle quince
  # notificaciones de mentira al telefono. Ver ops/prueba-alertas.sh.
  if [ -n "${ALERTA_SIMULACRO:-}" ]; then
    printf '[%s] %s\n%s\n' "$2" "$1" "$4" >> "$ALERTA_SIMULACRO"
    return 0
  fi
  curl -s -m 10 -u "$NTFY_USER:$NTFY_PASS" \
    -H "Title: $1" -H "Priority: $2" -H "Tags: $3" \
    --data-binary "$4" "$NTFY_URL/$NTFY_TOPIC" >/dev/null 2>&1
}

previo()   { awk -F'\t' -v k="$1" '$1==k {print $2; exit}' "$ESTADO"; }
ultimo()   { awk -F'\t' -v k="$1" '$1==k {print $3+0; exit}' "$ESTADO"; }

RESUMEN=0
[ "${1:-}" = "--resumen" ] && RESUMEN=1

# --- leer el juicio del panel -----------------------------------------------
RESPUESTA=$(curl -s -m 15 -u "$(leer_env APP_USERNAME):$(leer_env APP_PASSWORD)" "$PANEL_URL" 2>/dev/null)
if ! printf '%s' "$RESPUESTA" | jq -e '.bloques' >/dev/null 2>&1; then
  # Que el panel no conteste desde el propio servidor ya es la noticia. Se
  # emite como una fila mas para que pase por el mismo filtro de transiciones y
  # no repita el aviso cada cinco minutos.
  FILAS=$(printf 'panel\tfalla\tPanel-Enlace\tno responde en el propio servidor; /api/salud no contesta\n')
else
  FILAS=$(printf '%s' "$RESPUESTA" | jq -r '.bloques[].filas[] | [.clave, .estado, .etiqueta, .detalle] | @tsv')
  # ¿Se cayo el colector? Sus filas se reconocen por el detalle que escribe
  # evaluar.ts cuando deja de creerle a la foto.
  CIEGAS=$(printf '%s\n' "$FILAS" | awk -F'\t' '$2=="sin-datos" && ($4 ~ /^sin noticias del servidor/ || $4 ~ /^el colector nunca/) {n++} END {print n+0}')
  if [ "$CIEGAS" -ge "$UMBRAL_COLECTOR" ]; then
    DETALLE=$(printf '%s\n' "$FILAS" | awk -F'\t' '$2=="sin-datos" && ($4 ~ /^sin noticias/ || $4 ~ /^el colector nunca/) {print $4; exit}')
    FILAS=$(printf '%s\n' "$FILAS" | awk -F'\t' '!($2=="sin-datos" && ($4 ~ /^sin noticias del servidor/ || $4 ~ /^el colector nunca/))'
            printf 'colector\tfalla\tColector del servidor\t%s — sin el, /salud no sabe nada del host\n' "$DETALLE")
  fi
fi

# --- comparar contra la foto anterior ---------------------------------------
printf '%s\n' "$FILAS" | while IFS="$(printf '\t')" read -r clave estado etiqueta detalle; do
  [ -n "${clave:-}" ] || continue
  antes=$(previo "$clave")
  desde=$(ultimo "$clave")
  sello=$AHORA

  if [ "$estado" = "falla" ] && [ "$antes" != "falla" ]; then
    if [ -z "$desde" ] || [ $((AHORA - desde)) -ge "$SILENCIO_SEG" ]; then
      printf -- '- %s: %s\n' "$etiqueta" "$detalle" >> "$FALLAS"
    else
      sello=$desde   # dentro del silencio: se anota el cambio, no se grita
    fi
  elif [ "$antes" = "falla" ] && [ "$estado" != "falla" ]; then
    printf -- '- %s: %s\n' "$etiqueta" "$detalle" >> "$CURAS"
  else
    [ -n "$desde" ] && sello=$desde
  fi

  printf '%s\t%s\t%s\n' "$clave" "$estado" "$sello" >> "$NUEVO"
done

# Una foto vacia no reemplaza a la anterior: dejaria a todas las claves sin
# pasado y el proximo ciclo volveria a gritar cosas que ya se avisaron.
[ -s "$NUEVO" ] && cp "$NUEVO" "$ESTADO"

# --- notificar ---------------------------------------------------------------
if [ -s "$FALLAS" ]; then
  avisar "cabserver: falla" urgent "rotating_light" "$(cat "$FALLAS")"
fi
if [ -s "$CURAS" ]; then
  avisar "cabserver: recuperado" default "white_check_mark" "$(cat "$CURAS")"
fi

if [ "$RESUMEN" = 1 ]; then
  # El parte llega TODOS los dias, tambien cuando no hay nada que contar. Un
  # resumen que solo aparece con malas noticias es otra alarma mas; uno que
  # llega siempre convierte su ausencia en informacion: si no llego, el aviso
  # esta roto.
  PENDIENTES=$(printf '%s\n' "$FILAS" | awk -F'\t' '$2!="ok" {printf "- %s (%s): %s\n", $3, $2, $4}')
  TOTAL=$(printf '%s\n' "$FILAS" | awk 'NF {n++} END {print n+0}')
  MAL=$(printf '%s\n' "$PENDIENTES" | awk 'NF {n++} END {print n+0}')
  if [ "$MAL" -eq 0 ]; then
    CUERPO="Las $TOTAL comprobaciones en verde."
  else
    CUERPO="$MAL de $TOTAL comprobaciones fuera de verde:
$PENDIENTES"
  fi
  avisar "cabserver: parte del dia" low "sunny" "$CUERPO"
fi

# --- latido hacia afuera -----------------------------------------------------
# Lo unico que puede avisar de que cabserver murio, porque no lo manda cabserver
# cuando pasa: lo delata que DEJE de llegar. Sin esto, un servidor apagado se ve
# exactamente igual que un servidor sin problemas.
[ -n "$HEARTBEAT_URL" ] && curl -s -m 10 -o /dev/null "$HEARTBEAT_URL"

exit 0
