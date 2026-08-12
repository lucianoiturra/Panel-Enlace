#!/bin/sh
# Actualiza el colector de salud para que ademas guarde HISTORIA. Con sudo:
#
#   sudo /srv/apps/panel-enlace/ops/instalar-historia-salud.sh
#
# El colector desplegado vive en /usr/local/sbin (root, chmod 700) y no viaja
# con el repo: cambiar la copia versionada NO cambia la que corre. Esto es lo
# que las sincroniza, e imprime los sha256 para que se vea que quedaron iguales.
set -eu

[ "$(id -u)" = 0 ] || { echo "Corre esto con sudo."; exit 1; }
ORIGEN=$(cd "$(dirname "$0")" && pwd)
VIVO=/usr/local/sbin/salud-cabserver.sh

echo "==> respaldo del colector actual"
[ -f "$VIVO" ] && cp -a "$VIVO" "$VIVO.bak-$(date +%Y%m%d-%H%M%S)" && echo "    guardado"

echo "==> instalando la version con historia"
install -m 700 "$ORIGEN/salud-cabserver.sh" "$VIVO"

echo "==> comparando repo vs desplegado"
printf '    repo:       %s\n' "$(sha256sum "$ORIGEN/salud-cabserver.sh" | cut -c1-16)"
printf '    desplegado: %s\n' "$(sha256sum "$VIVO" | cut -c1-16)"

echo "==> una medicion ahora, para probar"
"$VIVO"
docker exec panel-db psql -U panel -d panel -tAc \
  "SELECT count(*) || ' cambios en la historia' FROM mon_salud_historia" | sed 's/^/    /'

cat <<'FIN'

------------------------------------------------------------------
LISTO. La historia guarda CAMBIOS, no mediciones: una semana sin
incidentes no ocupa ninguna fila. La primera corrida escribe una
fila por clave (nunca hubo pasado), y de ahi en adelante solo lo
que cambie.

Preguntas que ahora tienen respuesta:

  -- cuantas veces se cayo cada cosa esta semana
  docker exec panel-db psql -U panel -d panel -c "
    SELECT clave, count(*) FILTER (WHERE valor NOT IN ('running','running/healthy','ok','true','active','inactive')) AS caidas
    FROM mon_salud_historia WHERE desde > now() - interval '7 days'
    GROUP BY clave HAVING count(*) > 1 ORDER BY caidas DESC"

  -- la linea de tiempo de un servicio
  docker exec panel-db psql -U panel -d panel -c "
    SELECT desde, valor FROM mon_salud_historia
    WHERE clave = 'servicio.adguard_dns' ORDER BY desde DESC LIMIT 20"
------------------------------------------------------------------
FIN
