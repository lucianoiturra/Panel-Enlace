import { useEffect, useMemo, useRef, useState } from "react";
import { aliasCubiculo, calza, normalizar } from "../../lib/red/busqueda";
import { etiquetaPuerto, etiquetasEstadoPuerto, puertosDeEndpoint, type EstadoRed } from "../../lib/red/modelo";

export type FilaSesion = { enlaceId: number; texto: string };

type Props = {
  estado: EstadoRed;
  sesion: FilaSesion[];
  puertoInicial: string;
  onCerrar: () => void;
  onAsignar: (endpointId: string, puertoId: string) => void;
  onMarcarLibre: (puertoId: string) => void;
  onDeshacer: (enlaceId: number) => void;
};

type Candidato = { id: string; nombre: string; grupo: string; puerto: string };

export default function Captura({ estado, sesion, puertoInicial, onCerrar, onAsignar, onMarcarLibre, onDeshacer }: Props) {
  const [sentido, setSentido] = useState<"puerto" | "endpoint">("puerto");
  const equipos = useMemo(() => estado.equipos.filter(equipo => equipo.puertos > 0), [estado.equipos]);
  const [equipoId, setEquipoId] = useState(() => puertoInicial ? estado.puertos.find(puerto => puerto.id === puertoInicial)?.equipo ?? "" : "");
  const [indicePuerto, setIndicePuerto] = useState(() => {
    if (!puertoInicial) return 0;
    const puerto = estado.puertos.find(candidato => candidato.id === puertoInicial);
    if (!puerto) return 0;
    const hermanos = estado.puertos.filter(candidato => candidato.equipo === puerto.equipo).sort((a, b) => a.n - b.n);
    return Math.max(hermanos.findIndex(candidato => candidato.id === puertoInicial), 0);
  });
  const [indiceEndpoint, setIndiceEndpoint] = useState(0);
  const [texto, setTexto] = useState("");
  const [resaltado, setResaltado] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  const equipoActivo = equipoId || equipos[0]?.id || "";
  const puertosDelEquipo = useMemo(() => estado.puertos.filter(puerto => puerto.equipo === equipoActivo).sort((a, b) => a.n - b.n), [estado.puertos, equipoActivo]);
  const puertoActual = puertosDelEquipo[indicePuerto];

  const candidatos = useMemo<Candidato[]>(() => [
    ...estado.espacios.map(espacio => ({ id: espacio.id, nombre: espacio.nombre, grupo: espacio.categoria === "sala" ? "SALA" : "OFICINA", puerto: puertosDeEndpoint(estado, espacio.id).map(puerto => etiquetaPuerto(estado, puerto.id)).join(" · ") })),
    ...estado.cubiculos.map(cubiculo => ({ id: `cub:${cubiculo.id}`, nombre: `Cubículo ${cubiculo.id}`, grupo: "CUBÍCULO", puerto: puertosDeEndpoint(estado, `cub:${cubiculo.id}`).map(puerto => etiquetaPuerto(estado, puerto.id)).join(" · ") })),
  ], [estado]);

  const pendientes = useMemo(() => candidatos.filter(candidato => !candidato.puerto), [candidatos]);
  const endpointActual = pendientes[indiceEndpoint];

  const coincidencias = useMemo(() => {
    const consulta = texto.trim();
    if (!consulta) return [] as Candidato[];
    const numero = aliasCubiculo(consulta);
    const porAlias = numero === null ? [] : candidatos.filter(candidato => candidato.id === `cub:${numero}`);
    const porNombre = candidatos.filter(candidato => calza(candidato.nombre, consulta) && !porAlias.includes(candidato));
    return [...porAlias, ...porNombre].slice(0, 6);
  }, [candidatos, texto]);

  const coincidenciasPuerto = useMemo(() => {
    const buscado = normalizar(texto).replace(/\s+/g, "");
    if (!buscado) return [] as { id: string; etiqueta: string; estado: string }[];
    return estado.puertos
      .filter(puerto => puerto.n > 0 && normalizar(etiquetaPuerto(estado, puerto.id)).replace(/\s+/g, "").includes(buscado))
      .slice(0, 6)
      .map(puerto => ({ id: puerto.id, etiqueta: etiquetaPuerto(estado, puerto.id), estado: etiquetasEstadoPuerto[puerto.estado] }));
  }, [estado, texto]);

  const opciones = sentido === "puerto" ? coincidencias.map(item => ({ id: item.id, principal: item.nombre, secundario: item.grupo, aviso: item.puerto ? `ya en ${item.puerto}` : "" })) : coincidenciasPuerto.map(item => ({ id: item.id, principal: item.etiqueta, secundario: item.estado, aviso: "" }));

  useEffect(() => { campo.current?.focus(); }, [sentido, indicePuerto, indiceEndpoint]);

  const avanzar = () => {
    setTexto("");
    setResaltado(0);
    if (sentido === "puerto") setIndicePuerto(indice => Math.min(indice + 1, Math.max(puertosDelEquipo.length - 1, 0)));
    else setIndiceEndpoint(indice => Math.min(indice + 1, Math.max(pendientes.length - 1, 0)));
  };

  const confirmarOpcion = (indice: number) => {
    const elegida = opciones[indice];
    if (!elegida) return;
    if (sentido === "puerto") { if (!puertoActual) return; onAsignar(elegida.id, puertoActual.id); }
    else { if (!endpointActual) return; onAsignar(endpointActual.id, elegida.id); }
    avanzar();
  };
  const confirmar = () => confirmarOpcion(resaltado);

  const alTeclear = (evento: React.KeyboardEvent<HTMLInputElement>) => {
    if (evento.key === "Enter") { evento.preventDefault(); confirmar(); }
    if (evento.key === "Tab") { evento.preventDefault(); avanzar(); }
    if (evento.key === "ArrowDown") { evento.preventDefault(); setResaltado(indice => Math.min(indice + 1, Math.max(opciones.length - 1, 0))); }
    if (evento.key === "ArrowUp") { evento.preventDefault(); setResaltado(indice => Math.max(indice - 1, 0)); }
    if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "z") { evento.preventDefault(); if (sesion[0]) onDeshacer(sesion[0].enlaceId); }
    if (evento.key === "Escape") { evento.preventDefault(); onCerrar(); }
  };

  const asignadosDelEquipo = puertosDelEquipo.filter(puerto => puerto.estado === "ocupado").length;

  return (
    <div className="net-capture-wrap" role="dialog" aria-modal="true" aria-labelledby="captura-titulo">
      <div className="net-capture">
        <div className="modal-head">
          <div>
            <span>CAPTURA RÁPIDA</span>
            <h2 id="captura-titulo">{sentido === "puerto" ? "Recorrer el panel puerto por puerto" : "Recorrer los pendientes espacio por espacio"}</h2>
            <p>{sentido === "puerto" ? "Prueba el puerto, escribe dónde llega y pasa al siguiente." : "La cola de pendientes manda: escribe el puerto que le corresponde."}</p>
            <div className="net-seg" role="group" aria-label="Sentido de captura">
              <button className={sentido === "puerto" ? "on" : ""} aria-pressed={sentido === "puerto"} onClick={() => { setSentido("puerto"); setTexto(""); setResaltado(0); }}>DESDE EL PUERTO</button>
              <button className={sentido === "endpoint" ? "on" : ""} aria-pressed={sentido === "endpoint"} onClick={() => { setSentido("endpoint"); setTexto(""); setResaltado(0); }}>DESDE EL ESPACIO</button>
            </div>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar captura">×</button>
        </div>

        <div className="net-capture-body">
          {sentido === "puerto" && <label className="net-capture-equipo">Equipo<select value={equipoActivo} onChange={event => { setEquipoId(event.target.value); setIndicePuerto(0); }}>{equipos.map(equipo => <option key={equipo.id} value={equipo.id}>{equipo.id.replace("-", "/")} · {equipo.etiqueta}</option>)}</select></label>}

          {sentido === "puerto" && <div className="net-strip net-capture-strip">
            {puertosDelEquipo.map((puerto, indice) => <button key={puerto.id} className={`net-pt ${puerto.estado} ${indice === indicePuerto ? "selected" : ""}`} onClick={() => { setIndicePuerto(indice); setTexto(""); }} aria-label={`Ir al puerto ${puerto.n}`}>{puerto.n}</button>)}
          </div>}

          <div className="net-capture-target">
            <div>
              <div className="net-capture-big">{sentido === "puerto" ? (puertoActual ? etiquetaPuerto(estado, puertoActual.id) : "Sin puertos") : (endpointActual ? endpointActual.nombre : "No queda nada pendiente")}</div>
              <div className="net-capture-where">{sentido === "puerto"
                ? `${estado.equipos.find(equipo => equipo.id === equipoActivo)?.etiqueta ?? ""} · ${puertoActual ? etiquetasEstadoPuerto[puertoActual.estado] : ""}`
                : (endpointActual ? `${endpointActual.grupo} · sin puerto asignado` : `Los ${candidatos.length} puntos tienen puerto`)}</div>
            </div>
            <div className="net-capture-prog"><b>{sesion.length}</b> asignados en esta sesión<span>{sentido === "puerto" ? `${asignadosDelEquipo} de ${puertosDelEquipo.length} ocupados en este equipo` : `${pendientes.length} pendientes`}</span></div>
          </div>

          <div className="net-capture-field">
            <label htmlFor="captura-campo">{sentido === "puerto" ? "¿Qué llega a este puerto?" : "¿A qué puerto llega su roseta?"}</label>
            <input id="captura-campo" ref={campo} value={texto} autoComplete="off" onChange={event => { setTexto(event.target.value); setResaltado(0); }} onKeyDown={alTeclear} placeholder={sentido === "puerto" ? "Ej: 3 basico b · cub 12" : "Ej: r2/pp1/p15"} />
            {texto.trim() && !opciones.length && <p className="net-capture-vacio" role="status">Sin coincidencias para «{texto.trim()}». Revisa el nombre o marca el puerto sin uso.</p>}
            {opciones.length > 0 && <ul className="net-capture-ac" role="listbox">
              {opciones.map((opcion, indice) => <li key={opcion.id} role="option" aria-selected={indice === resaltado} className={indice === resaltado ? "hl" : ""} onMouseDown={event => { event.preventDefault(); setResaltado(indice); confirmarOpcion(indice); }}>
                <span>{opcion.principal}</span><small>{opcion.secundario}</small>{opcion.aviso && <em>{opcion.aviso}</em>}
              </li>)}
            </ul>}
          </div>

          {sesion.length > 0 && <div className="net-capture-done">
            <span className="net-label">EN ESTA SESIÓN</span>
            <ul>{sesion.map(fila => <li key={fila.enlaceId}><span>{fila.texto}</span><button type="button" onClick={() => onDeshacer(fila.enlaceId)}>deshacer</button></li>)}</ul>
          </div>}
        </div>

        <div className="net-capture-foot">
          <div className="net-hints"><span><kbd>↵</kbd> asignar y siguiente</span><span><kbd>tab</kbd> saltar</span><span><kbd>ctrl</kbd>+<kbd>z</kbd> deshacer</span><span><kbd>esc</kbd> salir</span></div>
          <div className="net-capture-actions">
            {sentido === "puerto" && <button className="secondary" type="button" disabled={!puertoActual} onClick={() => { if (puertoActual) onMarcarLibre(puertoActual.id); avanzar(); }}>Marcar sin uso</button>}
            <button className="primary" type="button" disabled={!opciones.length} onClick={confirmar}>Asignar</button>
          </div>
        </div>
      </div>
      <button className="backdrop" onClick={onCerrar} aria-label="Cerrar captura" />
    </div>
  );
}
