#!/bin/sh
# Prueba de alerta-cabserver.sh contra respuestas guardadas de /api/salud.
#
# No toca el estado real, no manda nada al telefono y no necesita root: usa las
# variables ALERTA_* y ALERTA_SIMULACRO que el script expone justamente para
# esto. Corre:  sh ops/prueba-alertas.sh
#
# Lo que se prueba es lo unico que importa de este script: que avise por
# CAMBIOS, que no repita, y que la muerte del colector sea un mensaje y no
# quince.
set -u

DIR=$(mktemp -d) || exit 1
trap 'rm -rf "$DIR"' EXIT
GUION=$(cd "$(dirname "$0")" && pwd)/alerta-cabserver.sh
FALLOS=0

cat > "$DIR/conf" <<'CONFIG'
NTFY_URL=http://127.0.0.1:9
NTFY_TOPIC=prueba
NTFY_USER=x
NTFY_PASS=x
HEARTBEAT_URL=
CONFIG

# Arma un /api/salud con las filas que se le pasen: "clave|estado|etiqueta|detalle"
salud() {
  printf '{"peor":"falla","medidoAt":"2026-08-11T12:00:00.000Z","bloques":[{"id":"b","titulo":"B","estado":"falla","filas":['
  sep=""
  for fila in "$@"; do
    printf '%s{"clave":"%s","etiqueta":"%s","estado":"%s","detalle":"%s"}' \
      "$sep" "$(echo "$fila" | cut -d'|' -f1)" "$(echo "$fila" | cut -d'|' -f3)" \
      "$(echo "$fila" | cut -d'|' -f2)" "$(echo "$fila" | cut -d'|' -f4)"
    sep=","
  done
  printf ']}]}'
}

correr() { # archivo-json  -> deja los avisos en $DIR/avisos
  : > "$DIR/avisos"
  ALERTA_CONF="$DIR/conf" \
  ALERTA_ENV_PANEL="$DIR/env-inexistente" \
  ALERTA_DIR_ESTADO="$DIR/estado" \
  ALERTA_SIMULACRO="$DIR/avisos" \
  PANEL_URL="file://$1" \
  sh "$GUION" ${2:-}
}

comprobar() { # descripcion  esperado  obtenido
  if [ "$2" = "$3" ]; then
    printf 'ok   %s\n' "$1"
  else
    printf 'FALLA %s\n  esperado: %s\n  obtenido: %s\n' "$1" "$2" "$3"
    FALLOS=$((FALLOS + 1))
  fi
}

# awk y no `grep -c`: sobre un archivo vacio grep imprime 0 y ADEMAS sale con
# codigo 1, asi que un `|| echo 0` de respaldo terminaba imprimiendo "0\n0".
avisos() { awk '/^\[/ {n++} END {print n+0}' "$DIR/avisos"; }
cuenta() { awk -v p="$1" '$0 ~ p {n++} END {print n+0}' "$DIR/avisos"; }

# --- 1. primera corrida: lo que ya esta roto se avisa -----------------------
salud "docker.adguard|falla|adguard|exited" "host.ram_disponible_mb|ok|RAM|1,9 GB libres" > "$DIR/s1.json"
correr "$DIR/s1.json"
comprobar "primera corrida avisa lo que encuentra roto" "1" "$(avisos)"
comprobar "  y nombra la fila" "1" "$(cuenta 'adguard: exited')"

# --- 2. el mismo rojo no vuelve a sonar -------------------------------------
correr "$DIR/s1.json"
comprobar "un rojo que sigue rojo no repite el aviso" "0" "$(avisos)"

# --- 3. recuperacion ---------------------------------------------------------
salud "docker.adguard|ok|adguard|running" "host.ram_disponible_mb|ok|RAM|1,9 GB libres" > "$DIR/s2.json"
correr "$DIR/s2.json"
comprobar "volver de falla a ok avisa la recuperacion" "1" "$(avisos)"
comprobar "  con el titulo de recuperado" "1" "$(cuenta 'recuperado')"

# --- 4. atencion no despierta a nadie ---------------------------------------
salud "docker.adguard|atencion|adguard|arrancando" "host.ram_disponible_mb|ok|RAM|1,9 GB" > "$DIR/s3.json"
correr "$DIR/s3.json"
comprobar "'atencion' no manda aviso (queda para el parte diario)" "0" "$(avisos)"

# --- 5. muerte del colector: UN mensaje, no quince --------------------------
# Los argumentos se arman con `set --` y no concatenando en una variable: los
# detalles llevan espacios, y sin comillas se partirian en una fila por palabra.
set --
for n in 1 2 3 4 5 6 7 8; do
  set -- "$@" "docker.c$n|sin-datos|contenedor $n|sin noticias del servidor hace 40 min"
done
salud "$@" > "$DIR/s4.json"
correr "$DIR/s4.json"
comprobar "ocho filas ciegas producen un solo aviso" "1" "$(avisos)"
comprobar "  y habla del colector, no de los contenedores" "1" "$(cuenta 'Colector del servidor')"

# --- 6. el parte diario llega aunque este todo bien -------------------------
salud "docker.adguard|ok|adguard|running" > "$DIR/s5.json"
correr "$DIR/s5.json"
correr "$DIR/s5.json" --resumen
comprobar "el parte diario llega con todo en verde" "1" "$(avisos)"
comprobar "  y lo dice" "1" "$(cuenta 'en verde')"

# --- 7. panel caido ----------------------------------------------------------
printf 'esto no es json' > "$DIR/s6.json"
correr "$DIR/s6.json"
comprobar "si /api/salud no contesta, eso mismo es el aviso" "1" "$(avisos)"
comprobar "  nombrando al panel" "1" "$(cuenta 'Panel-Enlace')"

echo
if [ "$FALLOS" -eq 0 ]; then
  echo "todas las comprobaciones pasaron"
else
  echo "$FALLOS comprobaciones fallaron"
fi
exit "$FALLOS"
