#!/bin/sh
# Colector de salud de cabserver -> tabla mon_salud del Panel-Enlace.
# Escribe HECHOS CRUDOS (bytes, segundos, booleanos). El juicio -- que es "ok"
# o "falla" -- vive en lib/salud/evaluar.ts, no aqui.
set -u

ESPERADOS="vaultwarden netalertx adguard panel-enlace panel-db panel-backup panel-mon-export lab-scripts"
DIR_PG=/srv/apps/backups/panel-enlace
DIR_USB=/mnt/respaldo
# Cuantas filas debe traer una foto completa. Si agregas o quitas un emit,
# actualiza este numero: es lo que impide commitear una foto a medias con
# fecha fresca, que se leeria como "el colector murio" siendo mentira.
FILAS_ESPERADAS=23
AHORA=$(date +%s)
TMP=$(mktemp) || exit 1
trap 'rm -f "$TMP"' EXIT

# clave, valor, numero. \N es NULL en el formato texto de COPY.
emit() { printf '%s\t%s\t%s\n' "$1" "${2:-}" "${3:-\\N}" >> "$TMP"; }

# --- contenedores -----------------------------------------------------------
# Formato: "running", "running/healthy", "restarting", "exited", "ausente".
for nombre in $ESPERADOS; do
  estado=$(docker inspect -f '{{.State.Status}}{{if .State.Health}}/{{.State.Health.Status}}{{end}}' "$nombre" 2>/dev/null)
  emit "docker.$nombre" "${estado:-ausente}"
done

# --- recursos del host ------------------------------------------------------
ram_kb=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)
emit host.ram_disponible_mb "" "$((ram_kb / 1024))"
emit host.disco_uso_pct "" "$(df --output=pcent / | tail -1 | tr -dc '0-9')"
emit host.disco_libre_gb "" "$(df --output=avail -BG / | tail -1 | tr -dc '0-9')"

# --- respaldo local (pg_dump del sidecar panel-backup) ----------------------
ultimo_pg=$(ls -1t "$DIR_PG"/panel-*.sql.gz 2>/dev/null | head -1)
if [ -n "$ultimo_pg" ]; then
  emit backup.pgdump_edad_seg "$(basename "$ultimo_pg")" "$((AHORA - $(stat -c %Y "$ultimo_pg")))"
  emit backup.pgdump_bytes "" "$(stat -c %s "$ultimo_pg")"
else
  emit backup.pgdump_edad_seg "sin copias"
  emit backup.pgdump_bytes "" 0
fi

# --- respaldo al disco externo ---------------------------------------------
# Se mira la entrada mas nueva de cualquier tipo, sin asumir como nombra sus
# copias el script de respaldo: si cambia de layout, esto sigue sirviendo.
if findmnt -no TARGET "$DIR_USB" >/dev/null 2>&1; then
  emit backup.usb_montado true
  reciente=$(find "$DIR_USB" -maxdepth 1 -mindepth 1 \
    ! -name 'System Volume Information' ! -name '$RECYCLE.BIN' \
    -printf '%T@\n' 2>/dev/null | sort -rn | head -1 | cut -d. -f1)
  emit backup.usb_copias "" "$(find "$DIR_USB" -maxdepth 1 -mindepth 1 \
    ! -name 'System Volume Information' ! -name '$RECYCLE.BIN' 2>/dev/null | wc -l)"
  if [ -n "$reciente" ]; then
    emit backup.usb_edad_seg "" "$((AHORA - reciente))"
  else
    emit backup.usb_edad_seg "sin copias"
  fi
else
  emit backup.usb_montado false
  emit backup.usb_copias "" 0
  emit backup.usb_edad_seg "sin montaje"
fi

emit backup.timer_estado "$(systemctl is-active respaldo-cabserver.timer 2>/dev/null || true)"
emit backup.servicio_fallido "$(systemctl is-failed respaldo-cabserver.service 2>/dev/null || true)"

# --- servicios vecinos ------------------------------------------------------
# AdGuard se prueba RESOLVIENDO, no respondiendo la web: su panel escucha en la
# IP del tailnet, y una web viva con el DNS muerto deja a la escuela sin navegar.
if [ -n "$(dig +short +time=2 +tries=1 @127.0.0.1 example.com 2>/dev/null)" ]; then
  emit servicio.adguard_dns ok
else
  emit servicio.adguard_dns falla
fi

sonda_http() {
  if curl -sSf -m 3 -o /dev/null "$2" >/dev/null 2>&1; then emit "$1" ok; else emit "$1" falla; fi
}
sonda_http servicio.netalertx http://127.0.0.1:20211/
sonda_http servicio.vaultwarden http://127.0.0.1:8081/alive
# Internet, medido SIN DNS y por dos caminos distintos. Se separa de
# servicio.adguard_dns porque desde un navegador las dos fallas se ven
# igual y se arreglan de forma muy distinta: una es llamar al ISP.
#
# Dos mecanismos y dos proveedores: TCP a Cloudflare (que si contesta en el
# 80, con un 301) e ICMP a Google. Uno solo daria falsos positivos cada vez
# que el FortiGate filtre ese protocolo o ese destino en particular.
if curl -s -m 5 -o /dev/null http://1.1.1.1 2>/dev/null \n   || ping -c1 -W3 8.8.8.8 >/dev/null 2>&1; then
  emit servicio.internet ok
else
  emit servicio.internet falla
fi

if tailscale status --json 2>/dev/null | grep -q '"BackendState": *"Running"'; then
  emit servicio.tailscale ok
else
  emit servicio.tailscale falla
fi

# --- escritura --------------------------------------------------------------
# Todo en una transaccion: o queda la foto completa, o queda la anterior
# envejeciendo a la vista. Nunca media foto.
if [ "$(wc -l < "$TMP")" -ne "$FILAS_ESPERADAS" ]; then
  echo "salud-cabserver: foto incompleta ($(wc -l < "$TMP") de $FILAS_ESPERADAS filas), no se escribe" >&2
  exit 1
fi
{
  echo "CREATE TABLE IF NOT EXISTS mon_salud (clave TEXT PRIMARY KEY, valor TEXT NOT NULL DEFAULT '', numero DOUBLE PRECISION, medido_at TIMESTAMPTZ NOT NULL DEFAULT now());"
  echo "CREATE TABLE IF NOT EXISTS mon_salud_historia (id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, clave TEXT NOT NULL, valor TEXT NOT NULL DEFAULT '', desde TIMESTAMPTZ NOT NULL DEFAULT now());"
  echo "CREATE INDEX IF NOT EXISTS mon_salud_historia_idx ON mon_salud_historia (clave, desde DESC);"
  echo "BEGIN;"
  echo "TRUNCATE mon_salud;"
  echo "COPY mon_salud (clave, valor, numero) FROM STDIN;"
  cat "$TMP"
  echo "\\."
  # Historia por CAMBIOS, no por medicion. Guardar las 21 filas cada 5 minutos
  # serian 6.000 filas diarias repitiendo "todo sigue igual"; asi una semana
  # tranquila no ocupa ninguna, y "cuantas veces se cayo adguard" es un COUNT.
  #
  # Solo las claves categoricas: RAM y disco cambian en cada lectura y su
  # historia serian 6.000 filas igual, sin decir nada que la foto no diga.
  cat <<'SQL'
INSERT INTO mon_salud_historia (clave, valor, desde)
SELECT s.clave, s.valor, now()
FROM mon_salud s
LEFT JOIN LATERAL (
  SELECT h.valor FROM mon_salud_historia h
  WHERE h.clave = s.clave ORDER BY h.desde DESC LIMIT 1
) ultimo ON true
WHERE (s.clave LIKE 'docker.%' OR s.clave LIKE 'servicio.%'
       OR s.clave IN ('backup.usb_montado', 'backup.timer_estado', 'backup.servicio_fallido'))
  AND ultimo.valor IS DISTINCT FROM s.valor;
DELETE FROM mon_salud_historia WHERE desde < now() - interval '1 year';
SQL
  echo "COMMIT;"
} | docker exec -i panel-db psql -U panel -d panel -q -v ON_ERROR_STOP=1
