import { useEffect, useRef, useState } from "react";

type Props = {
  cantidad: number;
  guardando: boolean;
  onCerrar: () => void;
  onLimpiar: () => void;
};

const CONFIRMACION = "LIMPIAR";

export default function LimpiarConexiones({ cantidad, guardando, onCerrar, onLimpiar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [confirmacion, setConfirmacion] = useState("");
  const confirmado = confirmacion.trim().toUpperCase() === CONFIRMACION;

  useEffect(() => {
    const actual = dialogo.current;
    actual?.showModal();
    return () => actual?.close();
  }, []);

  const enviar = (evento: React.FormEvent) => {
    evento.preventDefault();
    if (confirmado && cantidad > 0) onLimpiar();
  };

  return (
    <dialog ref={dialogo} className="modal net-clear-modal" onCancel={evento => { evento.preventDefault(); if (!guardando) onCerrar(); }}>
      <form onSubmit={enviar}>
        <div className="modal-head">
          <div>
            <span>ZONA DE PRECAUCIÓN</span>
            <h2>Empezar las conexiones desde cero</h2>
            <p>Se eliminarán {cantidad} conexiones registradas. Esta acción no se puede deshacer.</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" disabled={guardando}>×</button>
        </div>
        <div className="net-clear-body">
          <div className="net-clear-scope">
            <strong>Sí se elimina</strong>
            <p>Todo cable, enlace de borde, uplink, patch y conexión a salas o AP.</p>
          </div>
          <div className="net-clear-scope preserved">
            <strong>Se conserva</strong>
            <p>Racks, equipos, puertos, salas, AP, nombres, ubicaciones, notas e historial.</p>
          </div>
          <label>
            Escribe <b>{CONFIRMACION}</b> para confirmar
            <input
              autoFocus
              autoComplete="off"
              value={confirmacion}
              onChange={evento => setConfirmacion(evento.target.value)}
              placeholder={CONFIRMACION}
              aria-describedby="net-clear-help"
            />
          </label>
          <small id="net-clear-help">Los puertos ocupados quedarán marcados como libres; los dañados y sin verificar mantendrán su estado.</small>
        </div>
        <div className="net-resource-foot">
          <button type="button" className="secondary" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="submit" className="danger-button" disabled={guardando || !confirmado || cantidad < 1}>
            {guardando ? "Limpiando…" : `Eliminar ${cantidad} conexiones`}
          </button>
        </div>
      </form>
    </dialog>
  );
}
