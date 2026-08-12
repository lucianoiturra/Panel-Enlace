#!/bin/sh
# Instala el encendido programado (Wake-on-LAN). Se corre UNA vez, con sudo:
#
#   sudo /srv/apps/panel-enlace/ops/instalar-wol.sh
#
# Instala wakeonlan, crea las tablas, deja el script y el timer.
#
# OJO: esto deja lista la MITAD del servidor. La otra mitad esta en los PC, y
# sin ella no despierta ninguno: BIOS con Wake on LAN y sin ErP/Deep Sleep,
# driver de red con "Wake on Magic Packet", y sobre todo el Inicio rapido de
# Windows APAGADO (`powercfg /h off`). Ver docs/encendido-programado.md.
set -eu

[ "$(id -u)" = 0 ] || { echo "Corre esto con sudo."; exit 1; }
ORIGEN=$(cd "$(dirname "$0")" && pwd)

echo "==> 1/4  wakeonlan"
if command -v wakeonlan >/dev/null 2>&1; then
  echo "    ya estaba instalado"
else
  apt-get install -y wakeonlan >/dev/null
  echo "    instalado"
fi

echo "==> 2/4  tablas en Postgres"
docker exec -i panel-db psql -U panel -d panel -q -v ON_ERROR_STOP=1 < "$ORIGEN/wol-tablas.sql"
echo "    wol_programas y wol_eventos listas"

echo "==> 3/4  script y timer"
install -m 700 "$ORIGEN/wol-cabserver.sh" /usr/local/sbin/wol-cabserver.sh
install -m 644 "$ORIGEN/wol-cabserver.service" /etc/systemd/system/
install -m 644 "$ORIGEN/wol-cabserver.timer"   /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now wol-cabserver.timer >/dev/null
echo "    timer activo (revisa cada minuto si toca encender)"

echo "==> 4/4  cubiculos con MAC documentada"
docker exec panel-db psql -U panel -d panel -tAc \
  "SELECT count(*) || ' de ' || (SELECT count(*) FROM cubicles WHERE status <> 'no_computer')
   FROM cubicles WHERE status <> 'no_computer' AND mac <> ''" | sed 's/^/    /'

cat <<'FIN'

------------------------------------------------------------------
LISTO del lado del servidor. Ahora el piloto, con DOS PC:

1. En esos dos equipos, prepara el hardware (ver
   docs/encendido-programado.md para el detalle):
     - BIOS: Wake on LAN activado, ErP / Deep Sleep DESACTIVADO
     - Red: "Wake on Magic Packet" habilitado en el driver
     - Windows: powercfg /h off        <- la causa n.1 de que no funcione

2. Apagalos del todo y prueba desde cabserver:
     sudo /usr/local/sbin/wol-cabserver.sh --ahora 3 7

3. A los 8 minutos, mira si despertaron:
     sudo /usr/local/sbin/wol-cabserver.sh --estado

Si esos dos despiertan, el resto es repetir el paso 1 en los otros 36.
Si NO despiertan, revisa el Inicio rapido antes que ninguna otra cosa.
------------------------------------------------------------------
FIN
