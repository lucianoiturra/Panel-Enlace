#!/bin/sh
# Prueba de wol-cabserver.sh contra la base real, SIN mandar ningun paquete
# (WOL_SIMULACRO) y limpiando detras de si, igual que herramientas/verificar-red.mjs.
#
#   sh ops/prueba-wol.sh
#
# Lo que se prueba: que la MAC se traduzca al formato que quiere wakeonlan, que
# no se le mande a un equipo ya encendido, que un programa dispare a su hora y
# NO vuelva a disparar en el mismo minuto, y que la verificacion lea mon_devices.
set -u

DIR=$(mktemp -d) || exit 1
trap 'rm -rf "$DIR"' EXIT
GUION=$(cd "$(dirname "$0")" && pwd)/wol-cabserver.sh
FALLOS=0
# Fuera del rango de los cubiculos reales (1..40), para no confundir datos.
MARCA=9

psql_() { docker exec -i panel-db psql -U panel -d panel -q -tA -F'	' "$@"; }

comprobar() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"
  else printf 'FALLA %s\n  esperado: %s\n  obtenido: %s\n' "$1" "$2" "$3"; FALLOS=$((FALLOS + 1)); fi
}

limpiar() {
  psql_ -c "DELETE FROM wol_eventos WHERE mac LIKE 'ZZ%' OR programa IN (SELECT id FROM wol_programas WHERE nombre LIKE '__prueba%')" >/dev/null
  psql_ -c "DELETE FROM wol_programas WHERE nombre LIKE '__prueba%'" >/dev/null
  psql_ -c "DELETE FROM cubicles WHERE id IN (91,92)" >/dev/null
  psql_ -c "DELETE FROM mon_devices WHERE mac LIKE 'zz%'" >/dev/null
}
trap 'limpiar; rm -rf "$DIR"' EXIT
limpiar

# Dos cubiculos de mentira: uno apagado y uno que mon_devices ve presente.
psql_ -c "INSERT INTO cubicles (id, mac, ip, status, updated_at) VALUES
  (91,'ZZ-01-02-03-04-A1','192.168.1.191','operational','x'),
  (92,'ZZ-01-02-03-04-B2','192.168.1.192','operational','x')" >/dev/null
psql_ -c "INSERT INTO mon_devices (mac, ip, present) VALUES ('zz:01:02:03:04:b2','192.168.1.192',true)
          ON CONFLICT (mac) DO UPDATE SET present = true" >/dev/null

correr() { # args...
  : > "$DIR/paquetes"
  WOL_SIMULACRO="$DIR/paquetes" sh "$GUION" "$@" > "$DIR/salida" 2>&1
}
paquetes() { awk 'NF {n++} END {print n+0}' "$DIR/paquetes"; }

# --- 1. envio manual ---------------------------------------------------------
correr --ahora 91 92
comprobar "3 rondas x 1 equipo dormido = 3 paquetes (al encendido no se le manda)" "3" "$(paquetes)"
comprobar "  la MAC va en minusculas y con dos puntos" "3" "$(awk '/^zz:01:02:03:04:a1$/ {n++} END {print n+0}' "$DIR/paquetes")"
comprobar "  el que ya estaba encendido no recibio nada" "0" "$(awk '/b2/ {n++} END {print n+0}' "$DIR/paquetes")"
comprobar "  se anoto 'enviado' para el dormido" "1" \
  "$(psql_ -c "SELECT count(*) FROM wol_eventos WHERE cubiculo=91 AND resultado='enviado'")"
comprobar "  y 'ya-encendido' para el otro" "1" \
  "$(psql_ -c "SELECT count(*) FROM wol_eventos WHERE cubiculo=92 AND resultado='ya-encendido'")"

# --- 2. objetivo invalido no llega a la base --------------------------------
correr --ahora "91; DROP TABLE wol_eventos"
comprobar "un objetivo con SQL adentro no tumba la tabla" "1" \
  "$(psql_ -c "SELECT count(*) FROM information_schema.tables WHERE table_name='wol_eventos'")"

# --- 3. un programa dispara a su hora, una sola vez -------------------------
psql_ -c "DELETE FROM wol_eventos WHERE cubiculo IN (91,92)" >/dev/null
HOY=$(date +%u); AHORA=$(date +%H:%M)
psql_ -c "INSERT INTO wol_programas (nombre, dias, hora, objetivo, activo, creado_at)
          VALUES ('__prueba manana','$HOY','$AHORA','91',true,'x')" >/dev/null
correr
comprobar "el programa dispara en su dia y su hora" "3" "$(paquetes)"
correr
comprobar "y NO vuelve a disparar dentro del mismo minuto" "0" "$(paquetes)"

# --- 4. un programa de otro dia no dispara ----------------------------------
psql_ -c "DELETE FROM wol_eventos WHERE cubiculo=91" >/dev/null
OTRO=$(( (HOY % 7) + 1 ))
psql_ -c "UPDATE wol_programas SET dias='$OTRO' WHERE nombre='__prueba manana'" >/dev/null
correr
comprobar "un programa de otro dia de la semana no dispara" "0" "$(paquetes)"

# --- 5. verificacion --------------------------------------------------------
psql_ -c "INSERT INTO wol_eventos (cubiculo, mac, resultado, enviado_at)
          VALUES (92,'ZZ-01-02-03-04-B2','enviado', now() - interval '20 minutes'),
                 (91,'ZZ-01-02-03-04-A1','enviado', now() - interval '20 minutes')" >/dev/null
correr --verificar
comprobar "el que mon_devices ve presente queda como que desperto" "t" \
  "$(psql_ -c "SELECT desperto FROM wol_eventos WHERE cubiculo=92 AND resultado='enviado' ORDER BY id DESC LIMIT 1")"
comprobar "el que no aparece queda como que NO desperto" "f" \
  "$(psql_ -c "SELECT desperto FROM wol_eventos WHERE cubiculo=91 AND resultado='enviado' ORDER BY id DESC LIMIT 1")"

echo
if [ "$FALLOS" -eq 0 ]; then echo "todas las comprobaciones pasaron"; else echo "$FALLOS comprobaciones fallaron"; fi
exit "$FALLOS"
