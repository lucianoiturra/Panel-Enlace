import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cadenaComoTexto, saltosDesdeIsp, type Cadena } from "../../lib/red/trazado";
import { CATEGORIA_POR_DEFECTO, estadosEspacio, estadosPuerto, etiquetaCategoria, etiquetaEndpoint, etiquetaPuerto, etiquetasEstadoEspacio, etiquetasEstadoPuerto, numeroCubiculo, planEliminarEspacio, prefijoDe, type CategoriaEspacio } from "../../lib/red/modelo";
import type { RedEfectiva } from "../../lib/red/estado-efectivo";
import type { CandidatoTestigo } from "./page";
import { pareceIp } from "../../lib/red/inventario";
import type { RecursoNuevo } from "./nuevo-recurso";
import { useDialogFocus } from "../use-dialog-focus";

type Props = {
  estado: RedEfectiva;
  endpointId: string;
  cadena: Cadena;
  guardando: boolean;
  candidatosTestigo: CandidatoTestigo[];
  onGuardarTestigo: (id: string, testigoMac: string) => Promise<void>;
  onCerrar: () => void;
  onGuardarCampos: (cambios: { estado?: string; nota?: string }) => Promise<void>;
  onGuardarRecurso: (cambios: RecursoNuevo & { id: string }) => Promise<void>;
  onCrearEnlace: (puertoId: string, nota: string) => Promise<void>;
  onBorrarEnlace: (id: number) => Promise<void>;
  onEliminarEspacio: (id: string) => void;
};

export default function Ficha({ estado, endpointId, cadena, guardando, candidatosTestigo, onGuardarTestigo, onCerrar, onGuardarCampos, onGuardarRecurso, onCrearEnlace, onBorrarEnlace, onEliminarEspacio }: Props) {
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
  const [categoriaRecurso, setCategoriaRecurso] = useState<CategoriaEspacio>(espacio?.categoria ?? CATEGORIA_POR_DEFECTO);
  const [modeloRecurso, setModeloRecurso] = useState(ap?.modelo ?? "");
  const [marcaRecurso, setMarcaRecurso] = useState(ap?.marca ?? "");
  const [ipRecurso, setIpRecurso] = useState(ap?.ipGestion ?? "");
  const [notaEnlace, setNotaEnlace] = useState("");
  const [destinoElegido, setDestinoElegido] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [errorCopia, setErrorCopia] = useState("");
  const copyTimerRef = useRef<number | null>(null);

  const enlaces = estado.enlaces.filter(enlace => enlace.a === endpointId || enlace.b === endpointId);
  const historial = estado.bitacora.filter(entrada => entrada.objetivo === endpointId);
  const plan = useMemo(() => planEliminarEspacio(estado, endpointId), [estado, endpointId]);
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
        marca: marcaRecurso,
        modelo: modeloRecurso,
        ipGestion: ipRecurso,
      });
    }
  };

  const recursoModificado = espacio
    ? nombreRecurso.trim() !== espacio.nombre || ubicacionRecurso.trim() !== espacio.ubicacion || categoriaRecurso !== espacio.categoria
    : ap
      ? nombreRecurso.trim() !== ap.etiqueta || ubicacionRecurso.trim() !== ap.nota || modeloRecurso.trim() !== ap.modelo
        || marcaRecurso.trim() !== ap.marca || ipRecurso.trim() !== ap.ipGestion
      : false;

  const titulo = etiquetaEndpoint(estado, endpointId);
  const sinTramo = !cadena.completa && cadena.saltos.length <= 1;
  const subtitulo = espacio ? [etiquetaCategoria(estado, espacio.categoria), espacio.ubicacion].filter(Boolean).join(" · ")
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
          <span className="net-label">{cadena.completa ? "DEL ISP AL DESTINO" : sinTramo ? "SIN CONEXIONES REGISTRADAS" : "TRAMO DOCUMENTADO"}</span>
          {!sinTramo && cadena.saltos.length ? <ol>{saltosDesdeIsp(cadena).map(salto => <li key={salto.id}><b>{salto.etiqueta}</b></li>)}</ol> : null}
          {!cadena.completa && <p className="net-chain-warn">{cadena.motivo}</p>}
          {!sinTramo && <button className="secondary" type="button" onClick={() => void copiar()}>{copiado ? "Copiado" : "Copiar cadena"}</button>}
          {errorCopia && <p className="net-chain-warn" role="alert">{errorCopia}</p>}
        </div>

        {(espacio || ap) && <section className="net-resource-edit" aria-label={espacio ? "Datos del espacio" : "Datos del punto de acceso"}>
          <span className="net-label">{espacio ? "DATOS DEL ESPACIO" : "DATOS DEL PUNTO DE ACCESO"}</span>
          <label>Nombre<input value={nombreRecurso} maxLength={120} disabled={guardando} onChange={evento => setNombreRecurso(evento.target.value)} /></label>
          <label>Ubicación<input value={ubicacionRecurso} maxLength={160} disabled={guardando} onChange={evento => setUbicacionRecurso(evento.target.value)} placeholder="Ej: segundo piso, ala norte" /></label>
          {espacio
            ? <label>Tipo<select value={categoriaRecurso} disabled={guardando} onChange={evento => setCategoriaRecurso(evento.target.value)}>{estado.categorias.map(valor => <option key={valor.id} value={valor.id}>{valor.nombre}</option>)}</select></label>
            : <>
                <div className="two-cols">
                  <label>Marca<input value={marcaRecurso} maxLength={80} disabled={guardando} onChange={evento => setMarcaRecurso(evento.target.value)} placeholder="Ej: TP-Link" /></label>
                  <label>Modelo<input value={modeloRecurso} maxLength={120} disabled={guardando} onChange={evento => setModeloRecurso(evento.target.value)} placeholder="Ej: EAP225" /></label>
                </div>
                <label>IP de gestión
                  <input value={ipRecurso} maxLength={64} disabled={guardando} onChange={evento => setIpRecurso(evento.target.value)} placeholder="Ej: 192.168.30.9" />
                  {ipRecurso.trim() && !pareceIp(ipRecurso) && <small className="net-pista">No parece una IP en formato 192.168.30.2. Se guarda igual.</small>}
                </label>
              </>}
          <button className="secondary" type="button" disabled={guardando || !recursoModificado || !nombreRecurso.trim()} onClick={() => void guardarDatosRecurso()}>{guardando ? "Guardando…" : "Guardar datos"}</button>
        </section>}

        {espacio && <section className="net-testigo" aria-label="Estado del espacio">
          <label>Estado
            <select value={espacio.estado} disabled={guardando || espacio.origen === "auto"} onChange={event => void onGuardarCampos({ estado: event.target.value })}>
              {estadosEspacio.map(valor => <option key={valor} value={valor}>{etiquetasEstadoEspacio[valor]}</option>)}
            </select>
          </label>
          {espacio.origen === "auto"
            ? <p className="net-pista">Lo decide el testigo <b>{espacio.testigoMac}</b>, ahora {espacio.testigoPresente ? "presente" : "ausente"} en la red. Para escribirlo a mano, quítale el testigo.</p>
            : espacio.testigoMac
              ? <p className="net-pista">Tiene testigo asignado, pero los datos de red no están frescos: manda el estado manual.</p>
              : <p className="net-pista">Sin testigo: este estado lo escribes tú y no se actualiza solo.</p>}
          <label>Dispositivo testigo
            <select value={espacio.testigoMac} disabled={guardando} onChange={event => void onGuardarTestigo(espacio.id, event.target.value)}>
              <option value="">— sin testigo (estado manual) —</option>
              {espacio.testigoMac && !candidatosTestigo.some(candidato => candidato.mac === espacio.testigoMac) && <option value={espacio.testigoMac}>{espacio.testigoMac} (no visto)</option>}
              {candidatosTestigo.map(candidato => <option key={candidato.mac} value={candidato.mac}>{`${candidato.ip} · ${candidato.vendor || "?"}${candidato.present ? "" : " (ausente)"}`}</option>)}
            </select>
          </label>
          {espacio.testigoMac && <button className="secondary" type="button" disabled={guardando} onClick={() => void onGuardarTestigo(espacio.id, "")}>Quitar testigo y volver a manual</button>}
        </section>}
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

        {espacio && <div className="net-danger">
          <span className="net-label">ZONA DE PRECAUCIÓN</span>
          {plan.ok
            ? <p>Se elimina el espacio y {plan.enlaces.length ? plan.enlaces.length === 1 ? "su conexión" : `sus ${plan.enlaces.length} conexiones` : "sus datos"}. No se puede deshacer.</p>
            : <p>{plan.error}</p>}
          <button type="button" className="danger-button" disabled={guardando || !plan.ok} onClick={() => onEliminarEspacio(espacio.id)}>Eliminar espacio</button>
        </div>}
      </div>
    </aside>
  );
}
