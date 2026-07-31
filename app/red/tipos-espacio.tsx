import { useEffect, useRef, useState } from "react";
import { validarNombreCategoria, type Categoria } from "../../lib/red/modelo";

type Props = {
  categorias: Categoria[];
  conteos: Record<string, number>;
  guardando: boolean;
  onCerrar: () => void;
  onCrear: (nombre: string) => void;
  onRenombrar: (id: string, nombre: string) => void;
  onEliminar: (id: string, reasignar: string) => void;
};

const plural = (cantidad: number) => cantidad === 1 ? "1 espacio" : `${cantidad} espacios`;

export default function TiposEspacio({ categorias, conteos, guardando, onCerrar, onCrear, onRenombrar, onEliminar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [editando, setEditando] = useState("");
  const [borrando, setBorrando] = useState("");
  const [nombreEdicion, setNombreEdicion] = useState("");
  const [destino, setDestino] = useState("");
  const [nuevo, setNuevo] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const actual = dialogo.current;
    actual?.showModal();
    return () => actual?.close();
  }, []);

  const abrirEdicion = (categoria: Categoria) => {
    setBorrando("");
    setError("");
    setEditando(categoria.id);
    setNombreEdicion(categoria.nombre);
  };

  const abrirBorrado = (categoria: Categoria) => {
    setEditando("");
    setError("");
    setBorrando(categoria.id);
    setDestino(categorias.find(otra => otra.id !== categoria.id)?.id ?? "");
  };

  const confirmarEdicion = () => {
    const validacion = validarNombreCategoria(categorias, nombreEdicion, editando);
    if (!validacion.ok) return setError(validacion.error);
    setEditando("");
    setError("");
    onRenombrar(editando, validacion.nombre);
  };

  const confirmarBorrado = () => {
    if (conteos[borrando] && !destino) return setError("Elige a qué tipo mover los espacios.");
    const id = borrando;
    setBorrando("");
    setError("");
    onEliminar(id, destino);
  };

  const agregar = (evento: React.FormEvent) => {
    evento.preventDefault();
    const validacion = validarNombreCategoria(categorias, nuevo);
    if (!validacion.ok) return setError(validacion.error);
    setNuevo("");
    setError("");
    onCrear(validacion.nombre);
  };

  return (
    <dialog ref={dialogo} className="modal net-tipos-modal" onCancel={evento => { evento.preventDefault(); if (!guardando) onCerrar(); }}>
      <div className="modal-head">
        <div>
          <span>TIPOS DE ESPACIO</span>
          <h2>Administrar tipos</h2>
          <p>Los tipos ordenan y agrupan la vista de Espacios. Los tres base se pueden renombrar, pero no eliminar.</p>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" disabled={guardando}>×</button>
      </div>

      <ul className="net-tipos-lista">
        {categorias.map(categoria => {
          const usados = conteos[categoria.id] ?? 0;
          const otros = categorias.filter(otra => otra.id !== categoria.id);
          return (
            <li key={categoria.id}>
              {editando === categoria.id ? (
                <div className="net-tipo-edicion">
                  <input
                    autoFocus
                    value={nombreEdicion}
                    maxLength={60}
                    aria-label={`Nuevo nombre para ${categoria.nombre}`}
                    onChange={evento => { setNombreEdicion(evento.target.value); setError(""); }}
                    onKeyDown={evento => { if (evento.key === "Enter") { evento.preventDefault(); confirmarEdicion(); } }}
                  />
                  <button type="button" className="secondary" onClick={() => setEditando("")} disabled={guardando}>Cancelar</button>
                  <button type="button" className="primary" onClick={confirmarEdicion} disabled={guardando}>Guardar</button>
                </div>
              ) : borrando === categoria.id ? (
                <div className="net-tipo-borrado">
                  <p>{usados ? `«${categoria.nombre}» lo usan ${plural(usados)}. ¿A qué tipo los movemos?` : `¿Eliminar «${categoria.nombre}»?`}</p>
                  {usados > 0 && (
                    <label>
                      <span className="sr-only">Mover los espacios a</span>
                      <select value={destino} onChange={evento => { setDestino(evento.target.value); setError(""); }} disabled={guardando}>
                        {otros.map(otra => <option key={otra.id} value={otra.id}>{otra.nombre}</option>)}
                      </select>
                    </label>
                  )}
                  <div className="net-tipo-acciones">
                    <button type="button" className="secondary" onClick={() => setBorrando("")} disabled={guardando}>Cancelar</button>
                    <button type="button" className="danger-button" onClick={confirmarBorrado} disabled={guardando}>Eliminar tipo</button>
                  </div>
                </div>
              ) : (
                <div className="net-tipo-fila">
                  <span><b>{categoria.nombre}</b><small>{plural(usados)}</small></span>
                  <div className="net-tipo-acciones">
                    <button type="button" onClick={() => abrirEdicion(categoria)} disabled={guardando} aria-label={`Renombrar ${categoria.nombre}`}>Renombrar</button>
                    {!categoria.fija && (
                      <button type="button" className="danger-link net-tipo-borrar" onClick={() => abrirBorrado(categoria)} disabled={guardando || categorias.length < 2} aria-label={`Eliminar ${categoria.nombre}`}>Eliminar</button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <form className="net-tipo-nuevo" onSubmit={agregar}>
        <label>
          <span className="sr-only">Nombre del tipo nuevo</span>
          <input value={nuevo} maxLength={60} placeholder="Ej: Laboratorio de ciencias" onChange={evento => { setNuevo(evento.target.value); setError(""); }} />
        </label>
        <button type="submit" className="primary" disabled={guardando || !nuevo.trim()}>{guardando ? "Guardando…" : "Agregar tipo"}</button>
      </form>
      {error && <p className="net-tipo-error" role="alert">{error}</p>}
    </dialog>
  );
}
