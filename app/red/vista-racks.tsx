import { useMemo } from "react";
import { cadenaComoTexto, trazarCircuito } from "../../lib/red/trazado";
import { SIGLAS, equiposDeRack, etiquetasTipoEquipo, idPuerto } from "../../lib/red/inventario";
import { etiquetaEndpoint, etiquetaPuerto, etiquetasEstadoPuerto, prefijoDe, tiposEquipo, type EstadoRed } from "../../lib/red/modelo";

type Props = {
  estado: EstadoRed;
  rackActivo: string;
  onRack: (id: string) => void;
  formato: "tiras" | "lista";
  onFormato: (formato: "tiras" | "lista") => void;
  seleccionado: string;
  onAbrir: (id: string) => void;
  onEditarRack: (id: string) => void;
  onEditarEquipo: (id: string) => void;
  onNuevoRack: () => void;
  onNuevoEquipo: (rack: string) => void;
  onReordenar: (ids: string[]) => void;
};

export default function VistaRacks({ estado, rackActivo, onRack, formato, onFormato, seleccionado, onAbrir, onEditarRack, onEditarEquipo, onNuevoRack, onNuevoEquipo, onReordenar }: Props) {
  const rack = estado.racks.find(candidato => candidato.id === rackActivo);
  const equipos = useMemo(() => equiposDeRack(estado, rackActivo), [estado, rackActivo]);
  const puertosDelRack = useMemo(
    () => estado.puertos.filter(puerto => equipos.some(equipo => equipo.id === puerto.equipo)),
    [estado.puertos, equipos],
  );

  const destinos = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const enlace of estado.enlaces) {
      const pares: [string, string][] = [[enlace.a, enlace.b], [enlace.b, enlace.a]];
      for (const [uno, otro] of pares) {
        if (prefijoDe(uno) !== "pto" || prefijoDe(otro) === "pto") continue;
        mapa.set(uno, etiquetaEndpoint(estado, otro));
      }
    }
    return mapa;
  }, [estado]);

  const cadenas = useMemo(() => {
    if (formato !== "lista") return new Map<string, string>();
    return new Map(puertosDelRack.map(puerto => [puerto.id, cadenaComoTexto(trazarCircuito(estado, puerto.id))]));
  }, [estado, formato, puertosDelRack]);

  const totales = useMemo(() => {
    const numerados = puertosDelRack.filter(puerto => puerto.n > 0);
    return { puertos: numerados.length, ocupados: numerados.filter(puerto => puerto.estado === "ocupado").length };
  }, [puertosDelRack]);

  // Mueve un equipo una posición y manda el rack entero: la ruta de orden
  // reescribe el grupo como 0..n-1, así que enviar solo el par intercambiado
  // dejaría al resto sin índice.
  const mover = (id: string, delta: number) => {
    const ids = equipos.map(equipo => equipo.id);
    const desde = ids.indexOf(id);
    const hasta = desde + delta;
    if (desde < 0 || hasta < 0 || hasta >= ids.length) return;
    const movido = [...ids];
    [movido[desde], movido[hasta]] = [movido[hasta], movido[desde]];
    onReordenar(movido);
  };

  return (
    <div className="net-racks">
      <div className="net-racks-bar">
        <div className="net-seg" role="group" aria-label="Rack">
          {estado.racks.map(candidato => <button key={candidato.id} className={rackActivo === candidato.id ? "on" : ""} aria-pressed={rackActivo === candidato.id} onClick={() => onRack(candidato.id)}>{candidato.id}</button>)}
          <button onClick={onNuevoRack} aria-label="Agregar un rack">+ RACK</button>
        </div>
        <div className="net-seg" role="group" aria-label="Formato">
          <button className={formato === "tiras" ? "on" : ""} aria-pressed={formato === "tiras"} onClick={() => onFormato("tiras")}>TIRAS</button>
          <button className={formato === "lista" ? "on" : ""} aria-pressed={formato === "lista"} onClick={() => onFormato("lista")}>LISTA</button>
        </div>
      </div>

      {rack && <div className="net-rack-head">
        <div>
          <span className="net-rack-cod">RACK {rack.id}</span>
          <h3>{rack.nombre}</h3>
          {rack.ubicacion && <p className="net-rack-donde">{rack.ubicacion}</p>}
          <div className="net-rack-chips">
            <span className={rack.segmento ? "net-chip" : "net-chip vacio"}>{rack.segmento ? `SEGMENTO ${rack.segmento}` : "SEGMENTO IP · sin registrar"}</span>
            <span className="net-chip">{equipos.length} {equipos.length === 1 ? "equipo" : "equipos"}</span>
            <span className="net-chip">{totales.puertos} puertos · {totales.ocupados} ocupados</span>
          </div>
          {rack.notas && <p className="net-rack-nota">{rack.notas}</p>}
        </div>
        <button className="secondary" type="button" onClick={() => onEditarRack(rack.id)}>Editar rack</button>
      </div>}

      {formato === "tiras" ? <>
        {equipos.map((equipo, indice) => {
          const puertos = puertosDelRack.filter(puerto => puerto.equipo === equipo.id).sort((a, b) => a.n - b.n);
          const ocupados = puertos.filter(puerto => puerto.estado === "ocupado").length;
          const ficha = [equipo.marca, equipo.modelo].filter(Boolean).join(" ");
          return (
            <section className="net-eq-fila" key={equipo.id} aria-label={`${etiquetasTipoEquipo[equipo.tipo]} ${equipo.etiqueta}`}>
              <div className="net-eq-id">
                <div className="net-eq-id-top">
                  <span className={`net-tag ${equipo.tipo}`}>{SIGLAS[equipo.tipo]}</span>
                  <div className="net-eq-mover">
                    <button type="button" onClick={() => mover(equipo.id, -1)} disabled={indice === 0} aria-label={`Subir ${equipo.etiqueta}`}>↑</button>
                    <button type="button" onClick={() => mover(equipo.id, 1)} disabled={indice === equipos.length - 1} aria-label={`Bajar ${equipo.etiqueta}`}>↓</button>
                  </div>
                </div>
                <button className="net-eq-abrir" type="button" onClick={() => onEditarEquipo(equipo.id)}>
                  <b>{equipo.id.replace("-", "/")}</b>
                  <small>{equipo.etiqueta}</small>
                  {ficha ? <small>{ficha}</small> : <small className="falta">sin marca ni modelo</small>}
                  {equipo.ipGestion ? <small>gestión {equipo.ipGestion}</small> : equipo.tipo === "patchpanel" ? null : <small className="falta">sin IP de gestión</small>}
                  {equipo.puertos > 0 && <span className="net-eq-ocup">{ocupados} / {puertos.length} ocupados</span>}
                </button>
              </div>
              <div className="net-eq-puertos">
                {equipo.puertos > 0
                  ? <div className="net-strip">
                      {puertos.map(puerto => <button key={puerto.id} className={`net-pt ${puerto.estado} ${seleccionado === puerto.id ? "selected" : ""}`} onClick={() => onAbrir(puerto.id)} title={`${etiquetaPuerto(estado, puerto.id)} · ${etiquetasEstadoPuerto[puerto.estado]}${destinos.get(puerto.id) ? ` · ${destinos.get(puerto.id)}` : ""}`} aria-label={`Puerto ${puerto.n}, ${etiquetasEstadoPuerto[puerto.estado]}${destinos.get(puerto.id) ? `, ${destinos.get(puerto.id)}` : ""}`}>{puerto.n}</button>)}
                    </div>
                  : <button className="net-endpoint" type="button" onClick={() => onAbrir(idPuerto(equipo.id, 0))}>punto único · sin puertos numerados</button>}
              </div>
            </section>
          );
        })}
        {rack && <div className="net-eq-alta">
          <button className="secondary" type="button" onClick={() => onNuevoEquipo(rack.id)}>+ Agregar equipo a este rack</button>
        </div>}
        <ul className="net-leyenda-tipos">
          {tiposEquipo.map(tipo => <li key={tipo}><span className={`net-tag ${tipo}`}>{SIGLAS[tipo]}</span> {etiquetasTipoEquipo[tipo].toLowerCase()}</li>)}
        </ul>
      </> : (
        <div className="net-table-wrap">
          <table className="net-table">
            <thead><tr><th>PUERTO</th><th>TIPO</th><th>MARCA</th><th>MODELO</th><th>ESTADO</th><th>DESTINO</th><th>CADENA HASTA EL BORDE</th></tr></thead>
            <tbody>
              {equipos.map(equipo => [
                <tr className="net-group" key={equipo.id}><td colSpan={7}>{equipo.id.replace("-", "/")} · {equipo.etiqueta} · {etiquetasTipoEquipo[equipo.tipo]} · {equipo.puertos} puertos</td></tr>,
                ...puertosDelRack.filter(puerto => puerto.equipo === equipo.id).sort((a, b) => a.n - b.n).map(puerto => (
                  <tr key={puerto.id} className={seleccionado === puerto.id ? "selected" : ""} onClick={() => onAbrir(puerto.id)} tabIndex={0} onKeyDown={evento => { if (evento.key === "Enter") onAbrir(puerto.id); }}>
                    <td>{etiquetaPuerto(estado, puerto.id)}</td>
                    <td>{etiquetasTipoEquipo[equipo.tipo]}</td>
                    <td>{equipo.marca || <span className="net-none">—</span>}</td>
                    <td>{equipo.modelo || <span className="net-none">—</span>}</td>
                    <td>{etiquetasEstadoPuerto[puerto.estado]}</td>
                    <td>{destinos.get(puerto.id) ?? <span className="net-none">sin asignar</span>}</td>
                    <td className="net-mono">{cadenas.get(puerto.id)}</td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
