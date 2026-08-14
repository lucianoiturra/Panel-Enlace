#!/bin/sh
# Manda un aviso a Telegram.  Uso:  avisar-telegram.sh TITULO PRIORIDAD CUERPO
#   PRIORIDAD: urgent | default | low   (low llega sin sonido)
#
# Uso alterno:  avisar-telegram.sh --cola
#   Solo desagota lo que quedo pendiente, sin mandar nada nuevo. Lo llama el
#   emisor en CADA corrida: si el vaciado dependiera de que haya un aviso que
#   dar, los mensajes retenidos durante un corte podrian quedarse ahi para
#   siempre justamente cuando todo volvio a la normalidad.
#
# Vive en un archivo aparte porque lo usan el emisor de alertas y el del
# encendido programado. Dos copias de la cola de reintento terminarian
# discrepando justo el dia que se corta internet, que es cuando la cola sirve.
set -u

CONF=${ALERTA_CONF:-/etc/alerta-cabserver.conf}
COLA=${ALERTA_COLA:-/var/lib/alerta-cabserver/pendientes}
# Mas alla de esto el corte fue tan largo que el detalle viejo ya no ayuda, y
# vaciar 300 mensajes de golpe es su propia forma de no avisar nada.
MAX_COLA=50

[ -r "$CONF" ] || { echo "avisar-telegram: falta $CONF" >&2; exit 1; }
. "$CONF"
# El simulacro escribe a un archivo en vez de salir a la red: es lo que permite
# probar las transiciones sin mandarle quince mensajes de mentira al telefono.
# Va ANTES de exigir credenciales: probar la logica de avisos no tiene por que
# depender de que haya un bot configurado.
if [ -n "${ALERTA_SIMULACRO:-}" ]; then
  # En simulacro no hay cola que desagotar, y --cola viene sin $2 ni $3.
  [ "${1:-}" = '--cola' ] && exit 0
  printf '[%s] %s\n%s\n' "$2" "$1" "$3" >> "$ALERTA_SIMULACRO"
  exit 0
fi

: "${TELEGRAM_TOKEN:?}" "${TELEGRAM_CHAT_ID:?}"
API="https://api.telegram.org/bot$TELEGRAM_TOKEN/sendMessage"

mkdir -p "$COLA"

# Entrega un archivo ya formado. Devuelve 0 solo si Telegram lo acepto de
# verdad: un curl que "funciono" contra un token invalido devuelve 401 y el
# mensaje no le llego a nadie.
entregar() { # archivo silencioso
  codigo=$(curl -s -m 20 -o /dev/null -w '%{http_code}'     --data-urlencode "chat_id=$TELEGRAM_CHAT_ID"     --data-urlencode "text@$1"     -d "disable_notification=$2"     -d 'disable_web_page_preview=true'     "$API" 2>/dev/null)
  [ "$codigo" = '200' ]
}

if [ "${1:-}" = '--cola' ]; then
  for viejo in $(ls -1 "$COLA" 2>/dev/null | sort); do
    entregar "$COLA/$viejo" false || exit 0
    rm -f "$COLA/$viejo"
  done
  exit 0
fi

silencio=false
[ "$2" = 'low' ] && silencio=true

# Primero la cola: los atrasados van ANTES que el mensaje de ahora, para que
# lleguen en el orden en que pasaron las cosas. Si uno falla se corta el
# desagote y se conserva el resto -- reordenarlos seria peor que demorarlos.
for viejo in $(ls -1 "$COLA" 2>/dev/null | sort); do
  entregar "$COLA/$viejo" false || break
  rm -f "$COLA/$viejo"
done

MSG=$(mktemp) || exit 1
trap 'rm -f "$MSG"' EXIT
printf '%s\n\n%s\n' "$1" "$3" > "$MSG"

entregar "$MSG" "$silencio" && exit 0

# No salio. A la cola, con la hora de AHORA escrita adentro: entregado manana,
# un "AdGuard se cayo" sin fecha es una noticia falsa.
n=$(ls -1 "$COLA" 2>/dev/null | wc -l)
if [ "$n" -ge "$MAX_COLA" ]; then
  echo "avisar-telegram: cola llena ($n), se descarta: $1" >&2
  exit 1
fi
printf '%s\n\n%s\n\n(demorado — ocurrio el %s)\n'   "$1" "$3" "$(date '+%d-%m a las %H:%M')" > "$COLA/$(date +%Y%m%d-%H%M%S)-$$"
echo "avisar-telegram: sin salida, encolado: $1" >&2
exit 1
