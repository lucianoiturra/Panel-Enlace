import { useEffect, useRef } from "react";

type Props = {
  nombre: string;
  enlaces: number;
  guardando: boolean;
  onCerrar: () => void;
  onEliminar: () => void;
};

export default function EliminarEspacio({ nombre, enlaces, guardando, onCerrar, onEliminar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const actual = dialogo.current;
    actual?.showModal();
    return () => actual?.close();
  }, []);

  const enviar = (evento: React.FormEvent) => {
    evento.preventDefault();
    if (!guardando) onEliminar();
  };

  return (
    <dialog ref={dialogo} className="modal net-clear-modal" onCancel={evento => { evento.preventDefault(); if (!guardando) onCerrar(); }}>
      <form onSubmit={enviar}>
        <div className="modal-head">
          <div>
            <span>ZONA DE PRECAUCIÓN</span>
            <h2>Eliminar «{nombre}»</h2>
            <p>Esta acción no se puede deshacer.</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" disabled={guardando}>×</button>
        </div>
        <div className="net-clear-body">
          <div className="net-clear-scope">
            <strong>Sí se elimina</strong>
            <p>El espacio, su ubicación, su tipo y su nota{enlaces ? `, más ${enlaces === 1 ? "la conexión registrada" : `las ${enlaces} conexiones registradas`}` : ""}.</p>
          </div>
          <div className="net-clear-scope preserved">
            <strong>Se conserva</strong>
            <p>Los puertos y equipos{enlaces ? ", que vuelven a quedar libres si no sirven a otro enlace" : ""}. La bitácora mantiene el registro del borrado.</p>
          </div>
          <small>Si el espacio venía del levantamiento inicial, no volverá a aparecer aunque se regeneren los datos base.</small>
        </div>
        <div className="net-resource-foot">
          <button type="button" className="secondary" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="submit" className="danger-button" disabled={guardando} autoFocus>
            {guardando ? "Eliminando…" : "Eliminar espacio"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
