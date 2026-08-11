#!/bin/sh
# Colector de salud de cabserver -> tabla mon_salud del Panel-Enlace.
# Escribe HECHOS CRUDOS (bytes, segundos, booleanos). El juicio -- que es "ok"
# o "falla" -- vive en lib/salud/evaluar.ts, no aqui.
set -u

ESPERADOS="vaultwarden netalertx adguard panel-enlace panel-db panel-backup panel-mon-export"
DIR_PG=/srv/apps/backups/panel-enlace
DIR_USB=/mnt/respaldo
AHORA=$(date +%s)
TMP=$(mktemp)
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
if dig +short +time=2 +tries=1 @127.0.0.1 example.com >/dev/null 2>&1; then
  emit servicio.adguard_dns ok
else
  emit servicio.adguard_dns falla
fi

sonda_http() {
  if curl -sS -m 3 -o /dev/null "$2" >/dev/null 2>&1; then emit "$1" ok; else emit "$1" falla; fi
}
sonda_http servicio.netalertx http://127.0.0.1:20211/
sonda_http servicio.vaultwarden http://127.0.0.1:8081/alive

if tailscale status --json 2>/dev/null | grep -q '"BackendState": *"Running"'; then
  emit servicio.tailscale ok
else
  emit servicio.tailscale falla
fi

# --- escritura --------------------------------------------------------------
# Todo en una transaccion: o queda la foto completa, o queda la anterior
# envejeciendo a la vista. Nunca media foto.
{
  echo "CREATE TABLE IF NOT EXISTS mon_salud (clave TEXT PRIMARY KEY, valor TEXT NOT NULL DEFAULT '', numero DOUBLE PRECISION, medido_at TIMESTAMPTZ NOT NULL DEFAULT now());"
  echo "BEGIN;"
  echo "TRUNCATE mon_salud;"
  echo "COPY mon_salud (clave, valor, numero) FROM STDIN;"
  cat "$TMP"
  echo "\\."
  echo "COMMIT;"
} | docker exec -i panel-db psql -U panel -d panel -q -v ON_ERROR_STOP=1
