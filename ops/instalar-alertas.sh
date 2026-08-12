#!/bin/sh
# Instala los avisos de cabserver. Se corre UNA vez, con sudo:
#
#   sudo /srv/apps/panel-enlace/ops/instalar-alertas.sh [URL_DEL_LATIDO]
#
# El argumento es opcional: la URL de ping de healthchecks.io (o equivalente)
# que delata que cabserver murio. Sin ella todo lo demas funciona igual, pero
# queda el punto ciego: cabserver no puede avisar que cabserver esta apagado.
# Se puede agregar despues editando /etc/alerta-cabserver.conf.
#
# La contrasena de ntfy se genera aca y se imprime UNA sola vez, en tu terminal.
# No pasa por el chat ni queda en ningun repo.
set -eu

[ "$(id -u)" = 0 ] || { echo "Corre esto con sudo."; exit 1; }

ORIGEN=$(cd "$(dirname "$0")" && pwd)
LATIDO="${1:-}"
TOPICO=cabserver
USUARIO=alertas
CONF=/etc/alerta-cabserver.conf

echo "==> 1/5  ntfy responde?"
docker exec ntfy ntfy --version >/dev/null 2>&1 || {
  echo "El contenedor ntfy no esta corriendo. Levantalo primero:"
  echo "  cd /srv/apps/compose/ntfy && docker compose up -d"
  exit 1
}

echo "==> 2/5  usuario y permisos en ntfy"
CLAVE=$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | cut -c1-20)
if docker exec ntfy ntfy user list 2>/dev/null | grep -q "^user $USUARIO"; then
  docker exec -e "NTFY_PASSWORD=$CLAVE" ntfy ntfy user change-pass "$USUARIO" >/dev/null
  echo "    usuario '$USUARIO' ya existia: se le cambio la contrasena"
else
  docker exec -e "NTFY_PASSWORD=$CLAVE" ntfy ntfy user add --role=user "$USUARIO" >/dev/null
  echo "    usuario '$USUARIO' creado"
fi
docker exec ntfy ntfy access "$USUARIO" "$TOPICO" rw >/dev/null

echo "==> 3/5  configuracion en $CONF"
umask 077
cat > "$CONF" <<CONFIG
# Config de los avisos de cabserver. chmod 600: lleva la contrasena de ntfy.
# Las credenciales del panel NO se copian aca; se leen de
# /srv/apps/compose/panel-enlace/.env, que es donde ya viven.
NTFY_URL=http://127.0.0.1:8084
NTFY_TOPIC=$TOPICO
NTFY_USER=$USUARIO
NTFY_PASS=$CLAVE
# Ping externo que delata que cabserver murio. Vacio = sin latido.
HEARTBEAT_URL=$LATIDO
CONFIG
chmod 600 "$CONF"

echo "==> 4/5  script y unidades de systemd"
install -m 700 "$ORIGEN/alerta-cabserver.sh" /usr/local/sbin/alerta-cabserver.sh
install -m 644 "$ORIGEN/alerta-cabserver.service" /etc/systemd/system/
install -m 644 "$ORIGEN/alerta-cabserver.timer"   /etc/systemd/system/
install -m 644 "$ORIGEN/alerta-resumen.service"   /etc/systemd/system/
install -m 644 "$ORIGEN/alerta-resumen.timer"     /etc/systemd/system/
install -d -m 700 /var/lib/alerta-cabserver
systemctl daemon-reload
systemctl enable --now alerta-cabserver.timer alerta-resumen.timer >/dev/null

echo "==> 5/5  prueba"
# La primera corrida no tiene pasado contra el cual comparar, asi que avisa
# TODO lo que encuentre roto ahora mismo. Es lo que se quiere: si instalas los
# avisos y algo ya estaba mal, hay que enterarse hoy, no en la proxima caida.
/usr/local/sbin/alerta-cabserver.sh
curl -s -m 10 -u "$USUARIO:$CLAVE" \
  -H "Title: cabserver: avisos instalados" -H "Tags: white_check_mark" \
  -d "Si lees esto en el telefono, el canal quedo andando." \
  "http://127.0.0.1:8084/$TOPICO" >/dev/null && echo "    aviso de prueba enviado"

cat <<FIN

------------------------------------------------------------------
LISTO. Configura la app de ntfy en tu telefono (con Tailscale activo):

  Servidor : http://100.95.88.119:8084
  Topico   : $TOPICO
  Usuario  : $USUARIO
  Clave    : $CLAVE

Esta clave no se vuelve a mostrar. Guardala en Vaultwarden ahora.
------------------------------------------------------------------

Comprobar despues:
  systemctl list-timers 'alerta-*' --no-pager
  journalctl -u alerta-cabserver.service -n 20 --no-pager
FIN
