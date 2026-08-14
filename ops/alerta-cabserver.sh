#!/bin/sh
# Avisos de cabserver -> Telegram. Convierte /salud, que hay que ir a mirar,
# en algo que llega solo.
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
HEARTBEAT_URL="${HEARTBEAT_URL:-}"
PANEL_URL="${PANEL_URL:-http://127.0.0.1:8083/api/salud}"
MON_URL="${MON_URL:-http://127.0.0.1:8083/api/monitoreo}"
MACS_VISTAS="$DIR_ESTADO/macs-vistas.txt"
# El transporte -- incluida la cola que retiene los avisos mientras no hay
# internet -- vive aparte porque el aviso del encendido usa el mismo.
AVISAR="${ALERTA_AVISAR:-/usr/local/sbin/avisar-telegram.sh}"
# Un transporte que no existe convierte todos los avisos en silencio, que es
# la forma mas cara de fallar: por fuera se ve igual que "no pasa nada".
# Mejor no arrancar y que systemd marque la unidad como fallida.
[ -x "$AVISAR" ] || { echo "alerta-cabserver: falta o no ejecuta $AVISAR" >&2; exit 1; }

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

# El titulo ya no viaja en una cabecera HTTP como en ntfy, asi que puede
# llevar tildes y emoji. El simulacro y la cola de reintento (los avisos que
# no salieron por falta de internet) viven en el transporte, no aca.
avisar() { # titulo prioridad cuerpo
  "$AVISAR" "$1" "$2" "$3" || true
}

# Segundos -> "42 min" / "2 h 15 min". Un aviso de recuperacion que no dice
# cuanto duro obliga a ir a buscar la hora de la caida a otra parte, y quien
# lo lee a las siete de la manana no la va a ir a buscar.
duracion() {
  if [ "$1" -lt 3600 ]; then
    printf '%d min' $(( ($1 + 30) / 60 ))
  else
    printf '%d h %d min' $(( $1 / 3600 )) $(( ($1 % 3600) / 60 ))
  fi
}

# Bloque de red del parte diario. Sale de /api/monitoreo, que ya cruza los 40
# cubiculos documentados contra la red viva: rehacer ese cruce aca daria dos
# verdades distintas del mismo dato el dia que una de las dos cambie.
bloque_red() {
  MON=$(curl -s -m 15 -u "$(leer_env APP_USERNAME):$(leer_env APP_PASSWORD)" "$MON_URL" 2>/dev/null)
  if ! printf '%s' "$MON" | jq -e '.resumen' >/dev/null 2>&1; then
    echo 'Red: sin datos (el panel no respondio)'
    return
  fi

  CIFRAS=$(printf '%s' "$MON" | jq -r '[.resumen.enLinea, (.resumen.total - .resumen.sinComputador), .resumen.sinVerse, .resumen.ipDistinta] | @tsv')
  AJENOS=$(printf '%s' "$MON" | jq -r '.sinDocumentar[] | select(.presente) | [.mac, .fabricante, .ip] | @tsv')
  echo "Red: $(echo "$CIFRAS" | cut -f1) de $(echo "$CIFRAS" | cut -f2) cubiculos en linea, $(echo "$CIFRAS" | cut -f3) sin verse, $(echo "$CIFRAS" | cut -f4) con IP distinta"
  echo "Otros equipos vivos en la red: $(echo "$AJENOS" | grep -c .)"

  # Las MAC nuevas van SOLO en el parte, nunca como aviso suelto. Hay ~77
  # equipos sin documentar, casi todos celulares, y iOS rota su MAC de WiFi
  # sola: avisar en el momento de cada MAC nueva seria un chorro permanente, y
  # un canal con chorro permanente termina silenciado. Una vez al dia se lee.
  VIVAS=$(echo "$AJENOS" | cut -f1 | grep -v '^$' | sort -u)
  if [ ! -f "$MACS_VISTAS" ]; then
    # Primera corrida: se siembra. Si no, el primer parte listaria los 77
    # equipos de siempre como si acabaran de aparecer.
    echo "$VIVAS" > "$MACS_VISTAS"
    echo "MAC nuevas: primera medicion, se anotan las $(echo "$VIVAS" | grep -c .) actuales como conocidas"
    return
  fi

  NUEVAS=$(echo "$VIVAS" | grep -vxF -f "$MACS_VISTAS")
  CUANTAS=$(echo "$NUEVAS" | grep -c .)
  if [ "$CUANTAS" -eq 0 ]; then
    echo 'MAC nuevas desde ayer: ninguna'
  else
    echo "MAC nuevas desde ayer: $CUANTAS"
    for mac in $NUEVAS; do
      fila=$(echo "$AJENOS" | grep -F "$mac" | head -1)
      echo "- $(echo "$fila" | cut -f1) ($(echo "$fila" | cut -f2)) en $(echo "$fila" | cut -f3)"
    done | head -8
    if [ "$CUANTAS" -gt 8 ]; then
      echo "  (y $((CUANTAS - 8)) mas)"
    fi
  fi
  echo "$VIVAS" >> "$MACS_VISTAS"
  sort -u "$MACS_VISTAS" -o "$MACS_VISTAS"
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
    # $desde es la epoca en que empezo la falla: el sello se conserva mientras
    # el estado no cambia, asi que restarlo da la duracion del incidente.
    if [ -n "$desde" ] && [ "$desde" -gt 0 ]; then
      printf -- '- %s: %s (estuvo mal %s)\n' "$etiqueta" "$detalle" \
        "$(duracion $((AHORA - desde)))" >> "$CURAS"
    else
      printf -- '- %s: %s\n' "$etiqueta" "$detalle" >> "$CURAS"
    fi
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
  avisar "🔴 cabserver: falla" urgent "$(cat "$FALLAS")"
fi
if [ -s "$CURAS" ]; then
  avisar "🟢 cabserver: recuperado" default "$(cat "$CURAS")"
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
  avisar "🌞 Parte del dia - cabserver" low "$CUERPO

$(bloque_red)"
fi

# --- desagote de la cola ----------------------------------------------------
# Los avisos que no salieron por falta de internet se mandan apenas vuelve,
# aunque en esta corrida no haya nada nuevo que contar.
"$AVISAR" --cola || true

# --- latido hacia afuera -----------------------------------------------------
# Lo unico que puede avisar de que cabserver murio, porque no lo manda cabserver
# cuando pasa: lo delata que DEJE de llegar. Sin esto, un servidor apagado se ve
# exactamente igual que un servidor sin problemas.
[ -n "$HEARTBEAT_URL" ] && curl -s -m 10 -o /dev/null "$HEARTBEAT_URL"

exit 0
