import { useEffect, useRef, useState } from "react";
import { categoriasEspacio, type CategoriaEspacio } from "../../lib/red/modelo";

export type RecursoNuevo = {
  tipo: "espacio" | "ap";
  nombre: string;
  ubicacion: string;
  categoria?: CategoriaEspacio;
  modelo?: string;
};

type Props = {
  guardando: boolean;
  onCerrar: () => void;
  onCrear: (recurso: RecursoNuevo) => void;
};

const etiquetasCategoria: Record<CategoriaEspacio, string> = {
  sala: "Sala",
  oficina: "Oficina",
  otro: "Otro espacio",
};

export default function NuevoRecurso({ guardando, onCerrar, onCrear }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [tipo, setTipo] = useState<RecursoNuevo["tipo"]>("espacio");
  const [nombre, setNombre] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [categoria, setCategoria] = useState<CategoriaEspacio>("sala");
  const [modelo, setModelo] = useState("");

  useEffect(() => {
    const actual = dialogo.current;
    actual?.showModal();
    return () => actual?.close();
  }, []);

  const enviar = (evento: React.FormEvent) => {
    evento.preventDefault();
    if (!nombre.trim()) return;
    onCrear({ tipo, nombre: nombre.trim(), ubicacion: ubicacion.trim(), categoria, modelo: modelo.trim() });
  };

  return (
    <dialog ref={dialogo} className="modal net-resource-modal" onCancel={evento => { evento.preventDefault(); onCerrar(); }}>
      <form onSubmit={enviar}>
        <div className="modal-head">
          <div>
            <span>NUEVO ELEMENTO</span>
            <h2>{tipo === "espacio" ? "Agregar una sala" : "Agregar un punto de acceso"}</h2>
            <p>Se crea sin conexión. Después puedes enlazarlo desde su ficha, desde Racks o desde el diagrama.</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        <div className="net-resource-body">
          <div className="net-seg" role="group" aria-label="Tipo de elemento">
            <button type="button" className={tipo === "espacio" ? "on" : ""} aria-pressed={tipo === "espacio"} onClick={() => setTipo("espacio")}>SALA O ESPACIO</button>
            <button type="button" className={tipo === "ap" ? "on" : ""} aria-pressed={tipo === "ap"} onClick={() => setTipo("ap")}>PUNTO DE ACCESO</button>
          </div>
          <label>Nombre<input autoFocus value={nombre} maxLength={120} onChange={evento => setNombre(evento.target.value)} placeholder={tipo === "espacio" ? "Ej: Biblioteca" : "Ej: AP Biblioteca"} /></label>
          <label>Ubicación<input value={ubicacion} maxLength={160} onChange={evento => setUbicacion(evento.target.value)} placeholder="Ej: segundo piso, junto a la escalera" /></label>
          {tipo === "espacio"
            ? <label>Tipo<select value={categoria} onChange={evento => setCategoria(evento.target.value as CategoriaEspacio)}>{categoriasEspacio.map(valor => <option key={valor} value={valor}>{etiquetasCategoria[valor]}</option>)}</select></label>
            : <label>Modelo <span className="optional">(opcional)</span><input value={modelo} maxLength={120} onChange={evento => setModelo(evento.target.value)} placeholder="Ej: TP-Link EAP225" /></label>}
        </div>
        <div className="net-resource-foot">
          <button type="button" className="secondary" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="primary" disabled={guardando || !nombre.trim()}>{guardando ? "Guardando…" : "Agregar"}</button>
        </div>
      </form>
    </dialog>
  );
}
