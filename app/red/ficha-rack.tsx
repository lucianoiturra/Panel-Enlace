import { useMemo, useState } from "react";
import { useDialogFocus } from "../use-dialog-focus";
import { SIGLAS, equiposDeRack, etiquetasTipoEquipo, pareceSegmento, planEliminarRack } from "../../lib/red/inventario";
import type { EstadoRed } from "../../lib/red/modelo";

export type DatosRack = { id?: string; nombre: string; ubicacion: string; segmento: string; notas: string };

type Props = {
  estado: EstadoRed;
  rackId: string;
  guardando: boolean;
  onCerrar: () => void;
  onGuardar: (datos: DatosRack) => void;
  onAbrirEquipo: (id: string) => void;
  onEliminar: (id: string) => void;
};

export default function FichaRack({ estado, rackId, guardando, onCerrar, onGuardar, onAbrirEquipo, onEliminar }: Props) {
  const dialogRef = useDialogFocus<HTMLElement>(onCerrar);
  const rack = estado.racks.find(candidato => candidato.id === rackId);
  const [nombre, setNombre] = useState(rack?.nombre ?? "");
  const [ubicacion, setUbicacion] = useState(rack?.ubicacion ?? "");
  const [segmento, setSegmento] = useState(rack?.segmento ?? "");
  const [notas, setNotas] = useState(rack?.notas ?? "");

  const equipos = useMemo(() => rack ? equiposDeRack(estado, rack.id) : [], [estado, rack]);
  const plan = useMemo(() => planEliminarRack(estado, rackId), [estado, rackId]);
  const historial = estado.bitacora.filter(entrada => entrada.objetivo === rackId);

  if (!rack) return null;

  const modificado = nombre.trim() !== rack.nombre || ubicacion.trim() !== rack.ubicacion
    || segmento.trim() !== rack.segmento || notas.trim() !== rack.notas;

  return (
    <aside ref={dialogRef} className="drawer open" role="dialog" aria-modal="true" aria-labelledby="ficha-rack-titulo">
      <div className="drawer-head">
        <div><span>FICHA DE RACK</span><h2 id="ficha-rack-titulo">{rack.nombre}</h2><small className="net-sub">{rack.ubicacion || "sin ubicación registrada"}</small></div>
        <button onClick={onCerrar} aria-label="Cerrar">×</button>
      </div>

      <div className="drawer-body">
        <label>Nombre<input value={nombre} maxLength={120} disabled={guardando} onChange={evento => setNombre(evento.target.value)} /></label>
        <label>Ubicación<input value={ubicacion} maxLength={160} disabled={guardando} onChange={evento => setUbicacion(evento.target.value)} placeholder="Ej: Sala de Profesores" /></label>
        <label>Segmento IP
          <input value={segmento} maxLength={64} disabled={guardando} onChange={evento => setSegmento(evento.target.value)} placeholder="Ej: 192.168.30.0/24" />
          {segmento.trim() && !pareceSegmento(segmento) && <small className="net-pista">No parece un segmento en formato 192.168.30.0/24. Se guarda igual.</small>}
        </label>
        <label>Nota<textarea value={notas} maxLength={500} rows={3} disabled={guardando} onChange={evento => setNotas(evento.target.value)} placeholder="Llave, canalización, hallazgos en terreno…" /><small className="character-count">{notas.length}/500</small></label>
        <button className="secondary" type="button" disabled={guardando || !modificado || !nombre.trim()} onClick={() => onGuardar({ id: rack.id, nombre, ubicacion, segmento, notas })}>{guardando ? "Guardando…" : "Guardar datos"}</button>

        <div className="net-links">
          <span className="net-label">EQUIPOS DE ESTE RACK</span>
          {equipos.length ? equipos.map(equipo => (
            <div className="net-link-row" key={equipo.id}>
              <span><b><span className={`net-tag ${equipo.tipo}`}>{SIGLAS[equipo.tipo]}</span> {equipo.id.replace("-", "/")}</b><small>{equipo.etiqueta} · {etiquetasTipoEquipo[equipo.tipo]}</small></span>
              <button type="button" onClick={() => onAbrirEquipo(equipo.id)}>Abrir</button>
            </div>
          )) : <p className="empty-state">Todavía sin equipos.</p>}
        </div>

        <div className="net-log">
          <span className="net-label">BITÁCORA</span>
          {historial.length ? <ul>{historial.map(entrada => <li key={entrada.id}><b>{new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(entrada.fecha))}</b> {entrada.tipo} {entrada.antes && `· ${entrada.antes} →`} {entrada.despues || entrada.nota}</li>)}</ul> : <p className="empty-state">Sin movimientos registrados.</p>}
        </div>

        <div className="net-danger">
          <span className="net-label">ZONA DE PRECAUCIÓN</span>
          {plan.ok
            ? <p>Se elimina el rack junto con {plan.equipos.length} {plan.equipos.length === 1 ? "equipo" : "equipos"}, {plan.puertos.length} {plan.puertos.length === 1 ? "puerto" : "puertos"} y {plan.enlaces.length} {plan.enlaces.length === 1 ? "conexión" : "conexiones"}. No se puede deshacer.</p>
            : <p>{plan.error}</p>}
          <button type="button" className="danger-button" disabled={guardando || !plan.ok} onClick={() => onEliminar(rack.id)}>Eliminar rack</button>
        </div>
      </div>
    </aside>
  );
}
