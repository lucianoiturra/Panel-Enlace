import { useEffect, useRef, useState } from "react";
import { MAXIMO_PUERTOS, etiquetasTipoEquipo, pareceSegmento } from "../../lib/red/inventario";
import { tiposEquipo, type TipoEquipo } from "../../lib/red/modelo";
import type { DatosRack } from "./ficha-rack";
import type { DatosEquipo } from "./ficha-equipo";

type Props = {
  modo: "rack" | "equipo";
  rack: string;
  nombreRack: string;
  guardando: boolean;
  onCerrar: () => void;
  onCrearRack: (datos: DatosRack) => void;
  onCrearEquipo: (datos: DatosEquipo) => void;
};

// Los puertos por defecto según el tipo: un patch panel o un switch de rack casi
// siempre son de 24, y un router, firewall o AP no tienen puertos numerados en
// este levantamiento, solo su punto de conexión.
const puertosSugeridos: Record<TipoEquipo, number> = {
  switch: 24, patchpanel: 24, router: 0, firewall: 0, ap: 0, isp: 0,
};

export default function NuevoInventario({ modo, rack, nombreRack, guardando, onCerrar, onCrearRack, onCrearEquipo }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [nombre, setNombre] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [segmento, setSegmento] = useState("");
  const [tipo, setTipo] = useState<TipoEquipo>("switch");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [puertos, setPuertos] = useState("24");

  useEffect(() => {
    const actual = dialogo.current;
    actual?.showModal();
    return () => actual?.close();
  }, []);

  const cambiarTipo = (valor: TipoEquipo) => {
    setTipo(valor);
    setPuertos(String(puertosSugeridos[valor]));
  };

  const total = Number(puertos);
  const totalValido = Number.isInteger(total) && total >= 0 && total <= MAXIMO_PUERTOS;

  const enviar = (evento: React.FormEvent) => {
    evento.preventDefault();
    if (!nombre.trim()) return;
    if (modo === "rack") {
      onCrearRack({ nombre: nombre.trim(), ubicacion: ubicacion.trim(), segmento: segmento.trim(), notas: "" });
      return;
    }
    if (!totalValido) return;
    onCrearEquipo({ rack, tipo, etiqueta: nombre.trim(), marca: marca.trim(), modelo: modelo.trim(), ipGestion: "", puertos: total, nota: "" });
  };

  return (
    <dialog ref={dialogo} className="modal net-resource-modal" onCancel={evento => { evento.preventDefault(); onCerrar(); }}>
      <form onSubmit={enviar}>
        <div className="modal-head">
          <div>
            <span>NUEVO ELEMENTO</span>
            <h2>{modo === "rack" ? "Agregar un rack" : "Agregar un equipo"}</h2>
            <p>{modo === "rack"
              ? "Se crea vacío. Después le agregas sus switches y patch panels desde la vista de racks."
              : `Se agrega al final de ${nombreRack || rack} con sus puertos libres, listos para asignar.`}</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        <div className="net-resource-body">
          {modo === "equipo" && <label>Tipo<select value={tipo} onChange={evento => cambiarTipo(evento.target.value as TipoEquipo)}>{tiposEquipo.map(valor => <option key={valor} value={valor}>{etiquetasTipoEquipo[valor]}</option>)}</select></label>}
          <label>Nombre<input autoFocus value={nombre} maxLength={120} onChange={evento => setNombre(evento.target.value)} placeholder={modo === "rack" ? "Ej: Rack 4" : "Ej: Switch 3"} /></label>
          {modo === "rack" ? <>
            <label>Ubicación<input value={ubicacion} maxLength={160} onChange={evento => setUbicacion(evento.target.value)} placeholder="Ej: Sala de Profesores" /></label>
            <label>Segmento IP <span className="optional">(opcional)</span>
              <input value={segmento} maxLength={64} onChange={evento => setSegmento(evento.target.value)} placeholder="Ej: 192.168.30.0/24" />
              {segmento.trim() && !pareceSegmento(segmento) && <small className="net-pista">No parece un segmento en formato 192.168.30.0/24. Se guarda igual.</small>}
            </label>
          </> : <>
            <div className="two-cols">
              <label>Marca <span className="optional">(opcional)</span><input value={marca} maxLength={80} onChange={evento => setMarca(evento.target.value)} placeholder="Ej: Cisco" /></label>
              <label>Modelo <span className="optional">(opcional)</span><input value={modelo} maxLength={120} onChange={evento => setModelo(evento.target.value)} placeholder="Ej: SG250-28" /></label>
            </div>
            <label>Cantidad de puertos
              <input type="number" min={0} max={MAXIMO_PUERTOS} value={puertos} onChange={evento => setPuertos(evento.target.value)} />
              <small className="net-pista">Cero deja el equipo con un punto de conexión único, sin puertos numerados.</small>
            </label>
          </>}
        </div>
        <div className="net-resource-foot">
          <button type="button" className="secondary" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="primary" disabled={guardando || !nombre.trim() || (modo === "equipo" && !totalValido)}>{guardando ? "Guardando…" : "Agregar"}</button>
        </div>
      </form>
    </dialog>
  );
}
