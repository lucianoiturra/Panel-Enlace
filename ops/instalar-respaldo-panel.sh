#!/bin/sh
# Pasa el volcado de la base de Panel-Enlace del contenedor panel-backup a un
# timer de systemd. Se corre UNA vez, con sudo:
#
#   sudo /srv/apps/panel-enlace/ops/instalar-respaldo-panel.sh
#
# Deja el script en /usr/local/sbin, el timer a las 02:45, actualiza el colector
# de salud, retira el contenedor panel-backup y corre un volcado de prueba para
# no quedarse esperando a manana para descubrir que algo no anda.
set -eu

[ "$(id -u)" = 0 ] || { echo "Corre esto con sudo."; exit 1; }
ORIGEN=$(cd "$(dirname "$0")" && pwd)
COMPOSE=/srv/apps/compose/panel-enlace

# El colector que CORRE es el de /usr/local/sbin, no el del repo. Si este paso
# se salta, SALUD pide backup.pg_timer_estado a un script que no lo emite y las
# dos filas nuevas quedan en "sin datos" para siempre.
echo "==> 0/5  colector de salud (deja de emitir docker.panel-backup)"
install -m 700 "$ORIGEN/salud-cabserver.sh" /usr/local/sbin/salud-cabserver.sh
echo "    actualizado"

echo "==> 1/5  script y timer"
install -m 700 "$ORIGEN/respaldo-panel.sh" /usr/local/sbin/respaldo-panel.sh
install -m 644 "$ORIGEN/respaldo-panel.service" /etc/systemd/system/
install -m 644 "$ORIGEN/respaldo-panel.timer"   /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now respaldo-panel.timer >/dev/null
echo "    timer activo"

echo "==> 2/5  volcado de prueba ahora"
# Se corre por systemd y no a mano para probar tambien la unidad: un ExecStart
# mal escrito no se nota ejecutando el script directo.
systemctl start respaldo-panel.service
systemctl is-failed respaldo-panel.service >/dev/null && {
  echo "    FALLO. Revisa: journalctl -u respaldo-panel.service -n 30"
  exit 1
}
ls -1t /srv/apps/backups/panel-enlace/panel-*.sql.gz 2>/dev/null | head -1 | sed 's/^/    /'

echo "==> 3/5  retirar el contenedor panel-backup"
if [ -d "$COMPOSE" ]; then
  # `docker compose down` se llevaria toda la pila. Se retira solo este.
  docker rm -f panel-backup >/dev/null 2>&1 || true
  echo "    panel-backup retirado (ya salio del docker-compose.yml)"
else
  echo "    no existe $COMPOSE, se omite"
fi

echo "==> 4/5  refrescar la salud"
/usr/local/sbin/salud-cabserver.sh || echo "    (el colector se quejo; revisa aparte)"

echo "==> 5/5  proxima ejecucion"
systemctl list-timers respaldo-panel.timer --no-pager | sed 's/^/    /'

cat <<'FIN'

------------------------------------------------------------------
LISTO. Comprobaciones sueltas:

  systemctl list-timers 'respaldo-*' --no-pager
  journalctl -u respaldo-panel.service -n 20 --no-pager
  ls -lt /srv/apps/backups/panel-enlace | head

La pestana SALUD debe mostrar "Tarea del volcado de la base: programada a
diario" y ya NO debe pedir el contenedor panel-backup.
------------------------------------------------------------------
FIN
