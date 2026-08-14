#!/bin/sh
# Instala los avisos de cabserver por Telegram. Se corre con sudo:
#
#   sudo /srv/apps/panel-enlace/ops/instalar-alertas.sh TOKEN CHAT_ID [URL_LATIDO]
#
# TOKEN     el que da @BotFather al crear el bot.
# CHAT_ID   el de tu conversacion con el bot (sale de getUpdates tras escribirle).
# URL_LATIDO  opcional. Si se omite se conserva la que ya estuviera configurada.
#
# El token es una credencial: queda solo en /etc/alerta-cabserver.conf, con
# permisos 600 y fuera de git. Quien lo tenga puede escribir como el bot.
set -eu

[ "$(id -u)" = 0 ] || { echo 'Corre esto con sudo.'; exit 1; }
[ $# -ge 2 ] || { echo "uso: $0 TOKEN CHAT_ID [URL_LATIDO]"; exit 2; }

ORIGEN=$(cd "$(dirname "$0")" && pwd)
TOKEN=$1
CHAT_ID=$2
CONF=/etc/alerta-cabserver.conf
# El latido ya configurado no se pierde por no volver a escribirlo.
ANTERIOR=$(sed -n 's/^HEARTBEAT_URL=//p' "$CONF" 2>/dev/null | head -1)
LATIDO="${3:-$ANTERIOR}"

echo '==> 1/5  el bot contesta?'
RESP=$(curl -s -m 15 "https://api.telegram.org/bot$TOKEN/getMe")
echo "$RESP" | grep -q '"ok":true' || {
  echo "    Telegram rechazo el token. Respuesta: $RESP"
  echo '    No se toco nada.'
  exit 1
}
echo "    bot: $(echo "$RESP" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)"

echo '==> 2/5  el chat existe?'
# Se prueba ANTES de escribir la configuracion: un chat_id equivocado deja los
# avisos cayendo en la cola para siempre, sin que nadie note nada.
ENVIO=$(curl -s -m 15 --data-urlencode "chat_id=$CHAT_ID" --data-urlencode 'text=Avisos de cabserver instalados. Si lees esto, el canal quedo andando.' "https://api.telegram.org/bot$TOKEN/sendMessage")
echo "$ENVIO" | grep -q '"ok":true' || {
  echo "    Telegram no acepto el chat_id. Respuesta: $ENVIO"
  echo '    Escribile primero un mensaje al bot y vuelve a intentar.'
  exit 1
}
echo '    mensaje de prueba enviado'

echo "==> 3/5  configuracion en $CONF"
umask 077
cat > "$CONF" <<CONFIG
# Config de los avisos de cabserver. chmod 600: lleva el token del bot.
# Las credenciales del panel NO se copian aca; se leen de
# /srv/apps/compose/panel-enlace/.env, que es donde ya viven.
TELEGRAM_TOKEN=$TOKEN
TELEGRAM_CHAT_ID=$CHAT_ID
# Ping externo que delata que cabserver murio. Vacio = sin latido, y entonces
# un corte de luz se ve igual que un servidor sin problemas.
HEARTBEAT_URL=$LATIDO
CONFIG
chmod 600 "$CONF"

echo '==> 4/5  scripts y unidades'
install -m 700 "$ORIGEN/avisar-telegram.sh"  /usr/local/sbin/avisar-telegram.sh
install -m 700 "$ORIGEN/alerta-cabserver.sh" /usr/local/sbin/alerta-cabserver.sh
install -m 700 "$ORIGEN/aviso-arranque.sh"   /usr/local/sbin/aviso-arranque.sh
install -m 700 "$ORIGEN/salud-cabserver.sh"  /usr/local/sbin/salud-cabserver.sh
# El de encendido tambien usa el transporte compartido, asi que se refresca aca.
[ -f /usr/local/sbin/wol-cabserver.sh ] && install -m 700 "$ORIGEN/wol-cabserver.sh" /usr/local/sbin/wol-cabserver.sh
install -m 644 "$ORIGEN/alerta-cabserver.service" /etc/systemd/system/
install -m 644 "$ORIGEN/alerta-cabserver.timer"   /etc/systemd/system/
install -m 644 "$ORIGEN/alerta-resumen.service"   /etc/systemd/system/
install -m 644 "$ORIGEN/alerta-resumen.timer"     /etc/systemd/system/
install -m 644 "$ORIGEN/aviso-arranque.service"   /etc/systemd/system/
install -d -m 700 /var/lib/alerta-cabserver
systemctl daemon-reload
systemctl enable --now alerta-cabserver.timer alerta-resumen.timer >/dev/null
# enable sin --now: lo que importa es que corra en el PROXIMO arranque, y
# arrancarla ahora mandaria un aviso de arranque que no ocurrio.
systemctl enable aviso-arranque.service >/dev/null
systemctl start aviso-arranque.service >/dev/null 2>&1 || true

echo '==> 5/5  una corrida de verdad'
# La primera corrida no tiene pasado contra el cual comparar, asi que avisa
# TODO lo que encuentre roto ahora. Es lo que se quiere: si algo ya estaba mal,
# hay que enterarse hoy y no en la proxima caida.
/usr/local/sbin/salud-cabserver.sh || echo '    (el colector fallo, revisar aparte)'
/usr/local/sbin/alerta-cabserver.sh

cat <<FIN

------------------------------------------------------------------
LISTO. Los avisos salen por Telegram al chat $CHAT_ID.

Que llega y cuando:
  - falla / recuperado    al momento, con cuanto duro
  - encendido programado  a los 8 min, con cuantos despertaron
  - corte de luz          al volver la corriente, con la duracion
  - parte del dia         07:30, todos los dias, sin sonido

Falta un paso que no puedo hacer yo: en healthchecks.io, agregar Telegram
como integracion del check. Eso es lo unico que avisa EN VIVO de un corte
de luz o de internet, porque no depende de que cabserver este vivo.
------------------------------------------------------------------

Comprobar despues:
  systemctl list-timers 'alerta-*' --no-pager
  journalctl -u alerta-cabserver.service -n 20 --no-pager
  ls /var/lib/alerta-cabserver/pendientes/   # vacio = no hay avisos atrapados
FIN
