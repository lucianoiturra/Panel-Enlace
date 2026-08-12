#!/bin/sh
# Encendido programado de los PC de la Sala de Enlace (Wake-on-LAN).
#
# Vive en el host y no en un contenedor por lo mismo que el colector de salud:
# mandar un broadcast crudo desde un contenedor exige `network_mode: host` o
# NET_RAW, y esa linea ya se decidio no cruzar. cabserver esta en el mismo
# dominio de broadcast que los PC (enp2s0, 192.168.1.0/24 plano), asi que el
# paquete magico llega sin ayuda de nadie.
#
# Modos:
#   wol-cabserver.sh                 lo que toque ahora + verificar lo enviado (timer, cada minuto)
#   wol-cabserver.sh --ahora todos   manda a todos los cubiculos con MAC
#   wol-cabserver.sh --ahora 3 7 12  manda a esos cubiculos
#   wol-cabserver.sh --estado        que paso en los ultimos encendidos
set -u

CONF_AVISOS=/etc/alerta-cabserver.conf
IFACE="${WOL_IFACE:-enp2s0}"
BROADCAST="${WOL_BROADCAST:-192.168.1.255}"
# Tres paquetes espaciados: cuestan nada y suben mucho la tasa de exito cuando
# el switch todavia no tiene la MAC en su tabla.
REPETICIONES=3
ESPERA_ENTRE=2
# A los 8 minutos ya paso un barrido de NetAlertX (5 min) y un ciclo del sidecar
# (3 min), asi que mon_devices ya sabe si el equipo desperto.
MINUTOS_VERIFICAR=8

# PGTZ no es cosmetico: el contenedor de Postgres corre en Etc/UTC, asi que sin
# esto los horarios saldrian cuatro horas corridos. "El 27 no desperto a las
# 07:45" leido como 11:45 no le sirve a nadie. Solo afecta la presentacion; las
# comparaciones de TIMESTAMPTZ son absolutas y no dependen de la zona.
ZONA="${WOL_ZONA:-America/Santiago}"
psql_() { docker exec -i -e "PGTZ=$ZONA" panel-db psql -U panel -d panel -q -tA -F'	' -v ON_ERROR_STOP=1 "$@"; }

# --- envio -------------------------------------------------------------------
# Las MAC se guardan con guiones (1C-83-41-1C-7D-A7) y wakeonlan las quiere con
# dos puntos.
despertar() { # mac
  # A-Z y no A-F: los hex reales solo llegan hasta la F, pero acotar el rango a
  # lo que "deberia" venir hace que cualquier otra cosa salga a medio convertir
  # en vez de fallar de frente. Bajar todo el alfabeto cuesta lo mismo.
  destino=$(printf '%s' "$1" | tr 'A-Z-' 'a-z:')
  # Con WOL_SIMULACRO el paquete no sale: se anota a donde habria ido. Es lo que
  # permite probar el disparo de programas sin encender media sala de verdad.
  if [ -n "${WOL_SIMULACRO:-}" ]; then
    printf '%s\n' "$destino" >> "$WOL_SIMULACRO"
    return 0
  fi
  wakeonlan -i "$BROADCAST" "$destino" >/dev/null 2>&1
}

# Manda a una lista de cubiculos y anota un evento por cada uno. Un equipo que
# ya esta encendido no recibe paquete: asi "desperto" significa algo cuando se
# verifique, en vez de premiar a los que nunca se apagaron.
enviar() { # programa (id o NULL)  objetivo ('todos' o '3,7,12')
  programa="$1"
  # El objetivo se interpola en SQL y este script corre como root: se deja pasar
  # solo lo que puede ser, digitos y comas. Cualquier otra cosa no es un
  # cubiculo y no tiene por que llegar a la base.
  objetivo=$(printf '%s' "$2" | tr -cd '0-9,')
  [ "$2" = "todos" ] && objetivo=todos
  [ -n "$objetivo" ] || { echo "wol: objetivo invalido" >&2; return 1; }
  filas=$(psql_ <<SQL
SELECT c.id, c.mac,
       COALESCE((SELECT d.present FROM mon_devices d
                 WHERE lower(replace(d.mac,':','')) = lower(replace(c.mac,'-','')) LIMIT 1), false)
FROM cubicles c
WHERE c.status <> 'no_computer' AND c.mac <> ''
  AND ('$objetivo' = 'todos' OR c.id = ANY (string_to_array('$objetivo', ',')::int[]))
ORDER BY c.id
SQL
)
  [ -n "$filas" ] || { echo "wol: no hay cubiculos con MAC para '$objetivo'" >&2; return 1; }

  dormidos=$(printf '%s\n' "$filas" | awk -F'\t' 'NF && $3!="t" {print $1"\t"$2}')
  encendidos=$(printf '%s\n' "$filas" | awk -F'\t' 'NF && $3=="t" {print $1"\t"$2}')

  # Las repeticiones van por RONDAS sobre la lista completa, no tres veces por
  # equipo: asi los 38 quedan servidos en unos seis segundos en vez de dos
  # minutos y medio, y el timer que corre cada minuto no se pisa a si mismo.
  ronda=0
  while [ "$ronda" -lt "$REPETICIONES" ]; do
    printf '%s\n' "$dormidos" | while IFS="$(printf '\t')" read -r id mac; do
      [ -n "${mac:-}" ] && despertar "$mac"
    done
    ronda=$((ronda + 1))
    [ "$ronda" -lt "$REPETICIONES" ] && sleep "$ESPERA_ENTRE"
  done

  # Los eventos se anotan en un solo INSERT por grupo: 38 llamadas a psql serian
  # 38 `docker exec`, y eso si toma tiempo de verdad.
  if [ -n "$dormidos" ]; then
    valores=$(printf '%s\n' "$dormidos" | awk -F'\t' -v p="$programa" \
      'NF {printf "%s(%s,%s,%s,%s)", sep, p, $1, "'"'"'" $2 "'"'"'", "'"'"'enviado'"'"'"; sep=","}')
    psql_ -c "INSERT INTO wol_eventos (programa, cubiculo, mac, resultado) VALUES $valores" >/dev/null
  fi
  if [ -n "$encendidos" ]; then
    valores=$(printf '%s\n' "$encendidos" | awk -F'\t' -v p="$programa" \
      'NF {printf "%s(%s,%s,%s,%s,now(),true)", sep, p, $1, "'"'"'" $2 "'"'"'", "'"'"'ya-encendido'"'"'"; sep=","}')
    psql_ -c "INSERT INTO wol_eventos (programa, cubiculo, mac, resultado, verificado_at, desperto) VALUES $valores" >/dev/null
  fi

  printf 'wol: %s paquetes enviados, %s ya estaban encendidos\n' \
    "$(printf '%s\n' "$dormidos" | awk 'NF {n++} END {print n+0}')" \
    "$(printf '%s\n' "$encendidos" | awk 'NF {n++} END {print n+0}')"
}

# --- verificacion ------------------------------------------------------------
# Sin esto el encendido programado es un boton a ciegas: lo util no es "mande 38
# paquetes", es "el 27 no desperto, y tampoco el viernes".
verificar() {
  psql_ -c "
    UPDATE wol_eventos e
    SET verificado_at = now(),
        desperto = COALESCE((SELECT d.present FROM mon_devices d
                             WHERE lower(replace(d.mac,':','')) = lower(replace(e.mac,'-','')) LIMIT 1), false)
    WHERE e.verificado_at IS NULL
      AND e.resultado = 'enviado'
      AND e.enviado_at < now() - interval '$MINUTOS_VERIFICAR minutes'" >/dev/null

  # ¿Quedo alguno sin despertar en el ultimo cuarto de hora? Se avisa una vez.
  dormidos=$(psql_ -c "
    SELECT string_agg(cubiculo::text, ', ' ORDER BY cubiculo)
    FROM wol_eventos
    WHERE desperto = false AND resultado = 'enviado'
      AND verificado_at > now() - interval '15 minutes'")
  # En simulacro no se avisa: una prueba no tiene por que sonarle a nadie.
  if [ -n "$dormidos" ] && [ -z "${WOL_SIMULACRO:-}" ] && [ -r "$CONF_AVISOS" ]; then
    . "$CONF_AVISOS"
    curl -s -m 10 -u "$NTFY_USER:$NTFY_PASS" \
      -H "Title: cabserver: PC que no despertaron" -H "Priority: default" -H "Tags: electric_plug" \
      --data-binary "No respondieron al encendido programado: $dormidos" \
      "$NTFY_URL/$NTFY_TOPIC" >/dev/null 2>&1
  fi
}

# --- programas ---------------------------------------------------------------
# Se comparan dia y hora contra el reloj del servidor. La guarda de 90 s evita
# que un timer que corre cada minuto dispare dos veces el mismo programa.
programados() {
  dow=$(date +%u)      # 1=lunes .. 7=domingo
  hhmm=$(date +%H:%M)
  pendientes=$(psql_ <<SQL
SELECT p.id, p.objetivo, p.nombre
FROM wol_programas p
WHERE p.activo
  AND p.hora = '$hhmm'
  AND position('$dow' in p.dias) > 0
  AND NOT EXISTS (SELECT 1 FROM wol_eventos e
                  WHERE e.programa = p.id AND e.enviado_at > now() - interval '90 seconds')
SQL
)
  [ -n "$pendientes" ] || return 0
  printf '%s\n' "$pendientes" | while IFS="$(printf '\t')" read -r id objetivo nombre; do
    [ -n "${id:-}" ] || continue
    echo "wol: disparando programa $id ($nombre) -> $objetivo"
    enviar "$id" "$objetivo"
  done
}

# Pedidos de "encender ahora" hechos desde la pantalla. Se marcan atendidos
# ANTES de mandar: si algo revienta a mitad de camino, el peor caso es un
# encendido perdido y no un bucle que despierta la sala cada minuto para siempre.
pedidos() {
  cola=$(psql_ -c "UPDATE wol_pedidos SET atendido_at = now()
                   WHERE atendido_at IS NULL AND pedido_at > now() - interval '10 minutes'
                   RETURNING id, objetivo")
  # Un pedido mas viejo que eso ya no interesa: se descarta sin encender nada.
  psql_ -c "UPDATE wol_pedidos SET atendido_at = now()
            WHERE atendido_at IS NULL AND pedido_at <= now() - interval '10 minutes'" >/dev/null
  [ -n "$cola" ] || return 0
  printf '%s\n' "$cola" | while IFS="$(printf '\t')" read -r id objetivo; do
    [ -n "${objetivo:-}" ] || continue
    echo "wol: atendiendo pedido $id -> $objetivo"
    enviar 'NULL' "$objetivo"
  done
}

# --- entrada -----------------------------------------------------------------
case "${1:-}" in
  --ahora)
    shift
    [ $# -gt 0 ] || { echo "uso: wol-cabserver.sh --ahora todos | <id> [<id>...]" >&2; exit 1; }
    if [ "$1" = "todos" ]; then objetivo=todos; else objetivo=$(echo "$*" | tr ' ' ','); fi
    # NULL de SQL, no "\N": ese es el NULL del formato texto de COPY y aca
    # estamos en un INSERT normal.
    enviar 'NULL' "$objetivo"
    echo "wol: verificacion en $MINUTOS_VERIFICAR minutos (la hace el timer)"
    ;;
  --estado)
    echo "ultimos 20 eventos (hora local, $ZONA):"
    psql_ -c "SELECT to_char(enviado_at,'DD/MM HH24:MI'), cubiculo, resultado,
                     CASE WHEN verificado_at IS NULL THEN 'sin verificar'
                          WHEN desperto THEN 'desperto' ELSE 'NO desperto' END
              FROM wol_eventos ORDER BY id DESC LIMIT 20"
    ;;
  --verificar) verificar ;;
  "")          pedidos; programados; verificar ;;
  *)           echo "modo desconocido: $1" >&2; exit 1 ;;
esac
