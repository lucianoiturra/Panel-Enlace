import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cadenaComoTexto, saltosDesdeIsp, type Cadena } from "../../lib/red/trazado";
import { categoriasEspacio, estadosEspacio, estadosPuerto, etiquetaEndpoint, etiquetaPuerto, etiquetasEstadoEspacio, etiquetasEstadoPuerto, numeroCubiculo, prefijoDe, type CategoriaEspacio, type EstadoRed } from "../../lib/red/modelo";
import type { RecursoNuevo } from "./nuevo-recurso";
import { useDialogFocus } from "../use-dialog-focus";

type Props = {
  estado: EstadoRed;
  endpointId: string;
  cadena: Cadena;
  guardando: boolean;
  onCerrar: () => void;
  onGuardarCampos: (cambios: { estado?: string; nota?: string }) => Promise<void>;
  onGuardarRecurso: (cambios: RecursoNuevo & { id: string }) => Promise<void>;
  onCrearEnlace: (puertoId: string, nota: string) => Promise<void>;
  onBorrarEnlace: (id: number) => Promise<void>;
};

export default function Ficha({ estado, endpointId, cadena, guardando, onCerrar, onGuardarCampos, onGuardarRecurso, onCrearEnlace, onBorrarEnlace }: Props) {
  const dialogRef = useDialogFocus<HTMLElement>(onCerrar);
  const tipo = prefijoDe(endpointId);
  const espacio = estado.espacios.find(candidato => candidato.id === endpointId);
  const puerto = estado.puertos.find(candidato => candidato.id === endpointId);
  const equipo = estado.equipos.find(candidato => candidato.id === puerto?.equipo);
  const ap = equipo?.tipo === "ap" ? equipo : undefined;
  const cubiculo = tipo === "cub" ? estado.cubiculos.find(candidato => candidato.id === numeroCubiculo(endpointId)) : undefined;
  const [nota, setNota] = useState(espacio?.nota ?? puerto?.nota ?? "");
  const [nombreRecurso, setNombreRecurso] = useState(espacio?.nombre ?? ap?.etiqueta ?? "");
  const [ubicacionRecurso, setUbicacionRecurso] = useState(espacio?.ubicacion ?? ap?.nota ?? "");
  const [categoriaRecurso, setCategoriaRecurso] = useState<CategoriaEspacio>(espacio?.categoria ?? "sala");
  const [modeloRecurso, setModeloRecurso] = useState(ap?.modelo ?? "");
  const [notaEnlace, setNotaEnlace] = useState("");
  const [destinoElegido, setDestinoElegido] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [errorCopia, setErrorCopia] = useState("");
  const copyTimerRef = useRef<number | null>(null);

  const enlaces = estado.enlaces.filter(enlace => enlace.a === endpointId || enlace.b === endpointId);
  const historial = estado.bitacora.filter(entrada => entrada.objetivo === endpointId);
  const candidatos = useMemo(() => {
    const yaConectados = new Set(enlaces.map(enlace => enlace.a === endpointId ? enlace.b : enlace.a));
    const puertos = estado.puertos
      .filter(candidato => candidato.id !== endpointId && candidato.estado !== "dañado" && !yaConectados.has(candidato.id))
      .map(candidato => ({
        id: candidato.id,
        etiqueta: `${etiquetaPuerto(estado, candidato.id)} · ${etiquetasEstadoPuerto[candidato.estado]}`,
        grupo: "Puertos y equipos",
      }));
    if (tipo !== "pto") return puertos;
    const destinos = [
      ...estado.espacios.map(candidato => ({ id: candidato.id, etiqueta: candidato.nombre, grupo: "Espacios" })),
      ...estado.cubiculos.map(candidato => ({ id: `cub:${candidato.id}`, etiqueta: `Cubículo ${candidato.id}`, grupo: "Cubículos" })),
    ].filter(candidato => candidato.id !== endpointId && !yaConectados.has(candidato.id));
    return [...destinos, ...puertos];
  }, [enlaces, endpointId, estado, tipo]);

  const candidatosPorGrupo = useMemo(() => {
    const grupos = new Map<string, typeof candidatos>();
    for (const candidato of candidatos) grupos.set(candidato.grupo, [...(grupos.get(candidato.grupo) ?? []), candidato]);
    return [...grupos.entries()];
  }, [candidatos]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(cadenaComoTexto(cadena));
      setErrorCopia("");
      setCopiado(true);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
      setErrorCopia("No fue posible copiar la cadena.");
    }
  };

  useEffect(() => () => {
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
  }, []);

  const asignar = async () => {
    if (!destinoElegido) return;
    await onCrearEnlace(destinoElegido, notaEnlace.trim());
    setDestinoElegido("");
    setNotaEnlace("");
  };

  const guardarDatosRecurso = async () => {
    if (espacio) {
      await onGuardarRecurso({
        tipo: "espacio",
        id: espacio.id,
        nombre: nombreRecurso,
        ubicacion: ubicacionRecurso,
        categoria: categoriaRecurso,
      });
    } else if (ap) {
      await onGuardarRecurso({
        tipo: "ap",
        id: ap.id,
        nombre: nombreRecurso,
        ubicacion: ubicacionRecurso,
        modelo: modeloRecurso,
      });
    }
  };

  const recursoModificado = espacio
    ? nombreRecurso.trim() !== espacio.nombre || ubicacionRecurso.trim() !== espacio.ubicacion || categoriaRecurso !== espacio.categoria
    : ap
      ? nombreRecurso.trim() !== ap.etiqueta || ubicacionRecurso.trim() !== ap.nota || modeloRecurso.trim() !== ap.modelo
      : false;

  const titulo = etiquetaEndpoint(estado, endpointId);
  const subtitulo = espacio ? `${espacio.categoria === "sala" ? "Sala de clases" : "Oficina u otro espacio"}${espacio.ubicacion ? ` · ${espacio.ubicacion}` : ""}`
    : puerto ? `${equipo?.etiqueta ?? puerto.equipo}${equipo?.rack ? ` · rack ${equipo.rack}` : ""}`
    : cubiculo ? `Sala de Enlace · ${cubiculo.inventoryCode || "sin código de inventario"}` : "";

  return (
    <aside ref={dialogRef} className="drawer open" role="dialog" aria-modal="true" aria-labelledby="ficha-red-titulo">
      <div className="drawer-head">
        <div><span>{espacio ? "FICHA DE ESPACIO" : puerto ? "FICHA DE PUERTO" : "FICHA DE CUBÍCULO"}</span><h2 id="ficha-red-titulo">{titulo}</h2><small className="net-sub">{subtitulo}</small></div>
        <button onClick={onCerrar} aria-label="Cerrar">×</button>
      </div>

      <div className="drawer-body">
        <div className="net-chain">
          <span className="net-label">{cadena.completa ? "DEL ISP AL DESTINO" : "TRAMO DOCUMENTADO"}</span>
          {cadena.saltos.length ? <ol>{saltosDesdeIsp(cadena).map(salto => <li key={salto.id}><b>{salto.etiqueta}</b></li>)}</ol> : null}
          {!cadena.completa && <p className="net-chain-warn">{cadena.motivo}</p>}
          <button className="secondary" type="button" onClick={() => void copiar()}>{copiado ? "Copiado" : "Copiar cadena"}</button>
          {errorCopia && <p className="net-chain-warn" role="alert">{errorCopia}</p>}
        </div>

        {(espacio || ap) && <section className="net-resource-edit" aria-label={espacio ? "Datos del espacio" : "Datos del punto de acceso"}>
          <span className="net-label">{espacio ? "DATOS DEL ESPACIO" : "DATOS DEL PUNTO DE ACCESO"}</span>
          <label>Nombre<input value={nombreRecurso} maxLength={120} disabled={guardando} onChange={evento => setNombreRecurso(evento.target.value)} /></label>
          <label>Ubicación<input value={ubicacionRecurso} maxLength={160} disabled={guardando} onChange={evento => setUbicacionRecurso(evento.target.value)} placeholder="Ej: segundo piso, ala norte" /></label>
          {espacio
            ? <label>Tipo<select value={categoriaRecurso} disabled={guardando} onChange={evento => setCategoriaRecurso(evento.target.value as CategoriaEspacio)}>{categoriasEspacio.map(valor => <option key={valor} value={valor}>{valor === "sala" ? "Sala" : valor === "oficina" ? "Oficina" : "Otro espacio"}</option>)}</select></label>
            : <label>Modelo<input value={modeloRecurso} maxLength={120} disabled={guardando} onChange={evento => setModeloRecurso(evento.target.value)} placeholder="Ej: TP-Link EAP225" /></label>}
          <button className="secondary" type="button" disabled={guardando || !recursoModificado || !nombreRecurso.trim()} onClick={() => void guardarDatosRecurso()}>{guardando ? "Guardando…" : "Guardar datos"}</button>
        </section>}

        {espacio && <label>Estado<select value={espacio.estado} disabled={guardando} onChange={event => void onGuardarCampos({ estado: event.target.value })}>{estadosEspacio.map(valor => <option key={valor} value={valor}>{etiquetasEstadoEspacio[valor]}</option>)}</select></label>}
        {puerto && <label>Estado<select value={puerto.estado} disabled={guardando} onChange={event => void onGuardarCampos({ estado: event.target.value })}>{estadosPuerto.map(valor => <option key={valor} value={valor}>{etiquetasEstadoPuerto[valor]}</option>)}</select></label>}

        {(espacio || puerto) && <label>Nota<textarea value={nota} maxLength={500} rows={3} disabled={guardando} onChange={event => setNota(event.target.value)} onBlur={() => { const original = espacio?.nota ?? puerto?.nota ?? ""; if (!guardando && nota !== original) void onGuardarCampos({ nota }); }} placeholder="Roseta, canalización, hallazgos en terreno…" /><small className="character-count">{nota.length}/500</small></label>}

        {cubiculo && <div className="net-kv"><div><span>IP</span><b>{cubiculo.ip || "sin registrar"}</b></div><div><span>MAC</span><b>{cubiculo.mac || "sin registrar"}</b></div><div><span>ESTADO</span><b>{cubiculo.status}</b></div></div>}
        {cubiculo && <Link className="secondary net-link" href="/">Ver ficha completa en la pestaña Sala</Link>}

        <div className="net-links">
          <span className="net-label">CONEXIONES</span>
          {enlaces.length ? enlaces.map(enlace => {
            const otro = enlace.a === endpointId ? enlace.b : enlace.a;
            return <div className="net-link-row" key={enlace.id}><span><b>{etiquetaEndpoint(estado, otro)}</b>{enlace.nota && <small>{enlace.nota}</small>}</span><button type="button" disabled={guardando} onClick={() => void onBorrarEnlace(enlace.id)} aria-label={`Quitar enlace con ${etiquetaEndpoint(estado, otro)}`}>Quitar</button></div>;
          }) : <p className="empty-state">Todavía sin enlaces.</p>}

          <details className="net-assign-details">
            <summary>Agregar conexión</summary>
            <div className="net-assign">
              <label>Conectar con
                <select value={destinoElegido} disabled={guardando} onChange={event => setDestinoElegido(event.target.value)}>
                  <option value="">Elige el otro extremo…</option>
                  {candidatosPorGrupo.map(([grupo, opciones]) => <optgroup key={grupo} label={grupo}>
                    {opciones.map(opcion => <option key={opcion.id} value={opcion.id}>{opcion.etiqueta}</option>)}
                  </optgroup>)}
                </select>
              </label>
              <label>Nota de la conexión<input value={notaEnlace} maxLength={200} onChange={event => setNotaEnlace(event.target.value)} placeholder="Ej: roseta junto a la pizarra" /></label>
              <button className="primary" type="button" disabled={guardando || !destinoElegido} onClick={() => void asignar()}>{guardando ? "Guardando…" : "Crear conexión"}</button>
            </div>
          </details>
        </div>

        <div className="net-log">
          <span className="net-label">BITÁCORA</span>
          {historial.length ? <ul>{historial.map(entrada => <li key={entrada.id}><b>{new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(entrada.fecha))}</b> {entrada.tipo} {entrada.antes && `· ${entrada.antes} →`} {entrada.despues || entrada.nota}</li>)}</ul> : <p className="empty-state">Sin movimientos registrados.</p>}
        </div>
      </div>
    </aside>
  );
}
