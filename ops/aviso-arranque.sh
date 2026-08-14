#!/bin/sh
# Postmortem de arranque: cuenta COMO volvio cabserver, no que se fue.
#
# cabserver no puede avisar que cabserver esta apagado. El aviso en vivo de un
# corte lo da healthchecks.io desde afuera, cuando el latido deja de llegar.
# Esto es la otra mitad: al volver, decir cuanto duro y si fue un corte o un
# reinicio pedido. Sin esta distincion, un reinicio tuyo del viernes y un
# apagon del sabado se leen exactamente igual.
#
#   aviso-arranque.sh --apagado    (ExecStop)  deja la marca de apagado limpio
#   aviso-arranque.sh --arranque   (ExecStart) compara y avisa
set -u

DIR_ESTADO="${ALERTA_DIR_ESTADO:-/var/lib/alerta-cabserver}"
MARCA="$DIR_ESTADO/apagado-limpio"
# El emisor reescribe este archivo cada 5 minutos, asi que su fecha es la
# ultima vez que se supo del servidor. No hace falta inventar otro latido.
TESTIGO="$DIR_ESTADO/estado.tsv"
AVISAR="${ALERTA_AVISAR:-/usr/local/sbin/avisar-telegram.sh}"

mkdir -p "$DIR_ESTADO"

case "${1:-}" in
  --apagado)
    # Se ejecuta tambien con un "systemctl stop" suelto. La marca se consume en
    # el arranque siguiente, asi que en el peor caso confunde un unico boot.
    date +%s > "$MARCA"
    exit 0
    ;;
  --arranque) ;;
  *) echo "uso: $0 --arranque | --apagado" >&2; exit 2 ;;
esac

[ -x "$AVISAR" ] || { echo "aviso-arranque: falta $AVISAR" >&2; exit 1; }

AHORA=$(date +%s)
if [ -f "$TESTIGO" ]; then
  ULTIMO=$(stat -c %Y "$TESTIGO")
  ABAJO=$(( AHORA - ULTIMO ))
  DESDE=$(date -d "@$ULTIMO" '+%d-%m a las %H:%M')
else
  # Primera vez: sin referencia no hay nada que comparar, y declarar un corte
  # que no ocurrio entrena a desconfiar del aviso.
  "$AVISAR" 'cabserver arranco' low 'Primer arranque con avisos instalados: todavia no hay con que comparar.'
  exit 0
fi

if [ "$ABAJO" -lt 3600 ]; then
  CUANTO="$(( (ABAJO + 30) / 60 )) min"
else
  CUANTO="$(( ABAJO / 3600 )) h $(( (ABAJO % 3600) / 60 )) min"
fi

if [ -f "$MARCA" ]; then
  rm -f "$MARCA"
  # Un reinicio pedido no es noticia: llega sin sonido, solo para que quede
  # constancia de que el servidor volvio solo.
  "$AVISAR" 'cabserver volvio de un reinicio' low "Apagado ordenado. Estuvo abajo $CUANTO."
else
  "$AVISAR" 'CORTE: cabserver arranco de golpe' default "No hubo apagado ordenado: fue un corte de luz o un apagon brusco.
Se le perdio el rastro el $DESDE; estuvo abajo $CUANTO."
fi
exit 0
