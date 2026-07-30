import { useMemo, useState } from "react";
import Link from "next/link";
import { cadenaComoTexto, type Cadena } from "../../lib/red/trazado";
import { estadosEspacio, estadosPuerto, etiquetaEndpoint, etiquetaPuerto, etiquetasEstadoEspacio, etiquetasEstadoPuerto, numeroCubiculo, prefijoDe, type EstadoRed } from "../../lib/red/modelo";

type Props = {
  estado: EstadoRed;
  endpointId: string;
  cadena: Cadena;
  guardando: boolean;
  onCerrar: () => void;
  onGuardarCampos: (cambios: { estado?: string; nota?: string }) => Promise<void>;
  onCrearEnlace: (puertoId: string, nota: string) => Promise<void>;
  onBorrarEnlace: (id: number) => Promise<void>;
};

export default function Ficha({ estado, endpointId, cadena, guardando, onCerrar, onGuardarCampos, onCrearEnlace, onBorrarEnlace }: Props) {
  const tipo = prefijoDe(endpointId);
  const espacio = estado.espacios.find(candidato => candidato.id === endpointId);
  const puerto = estado.puertos.find(candidato => candidato.id === endpointId);
  const cubiculo = tipo === "cub" ? estado.cubiculos.find(candidato => candidato.id === numeroCubiculo(endpointId)) : undefined;
  const [nota, setNota] = useState(espacio?.nota ?? puerto?.nota ?? "");
  const [notaRoseta, setNotaRoseta] = useState("");
  const [puertoElegido, setPuertoElegido] = useState("");
  const [copiado, setCopiado] = useState(false);

  const enlaces = estado.enlaces.filter(enlace => enlace.a === endpointId || enlace.b === endpointId);
  const historial = estado.bitacora.filter(entrada => entrada.objetivo === endpointId);
  const librePara = useMemo(() => estado.puertos
    .filter(candidato => candidato.n > 0 && candidato.estado !== "dañado")
    .map(candidato => ({ id: candidato.id, etiqueta: `${etiquetaPuerto(estado, candidato.id)} · ${etiquetasEstadoPuerto[candidato.estado]}` })), [estado]);

  const copiar = async () => {
    await navigator.clipboard.writeText(cadenaComoTexto(cadena));
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 2000);
  };

  const asignar = async () => {
    if (!puertoElegido) return;
    await onCrearEnlace(puertoElegido, notaRoseta.trim());
    setPuertoElegido("");
    setNotaRoseta("");
  };

  const titulo = etiquetaEndpoint(estado, endpointId);
  const subtitulo = espacio ? (espacio.categoria === "sala" ? "Sala de clases" : "Oficina u otro espacio")
    : puerto ? `${estado.equipos.find(equipo => equipo.id === puerto.equipo)?.etiqueta ?? puerto.equipo} · rack ${estado.equipos.find(equipo => equipo.id === puerto.equipo)?.rack ?? ""}`
    : cubiculo ? `Sala de Enlace · ${cubiculo.inventoryCode || "sin código de inventario"}` : "";

  return (
    <aside className="drawer open" role="dialog" aria-modal="true" aria-labelledby="ficha-red-titulo">
      <div className="drawer-head">
        <div><span>{espacio ? "FICHA DE ESPACIO" : puerto ? "FICHA DE PUERTO" : "FICHA DE CUBÍCULO"}</span><h2 id="ficha-red-titulo">{titulo}</h2><small className="net-sub">{subtitulo}</small></div>
        <button onClick={onCerrar} aria-label="Cerrar">×</button>
      </div>

      <div className="drawer-body">
        <div className="net-chain">
          <span className="net-label">CADENA HASTA EL BORDE</span>
          {cadena.saltos.length ? <ol>{cadena.saltos.map(salto => <li key={salto.id}><b>{salto.etiqueta}</b></li>)}</ol> : null}
          {!cadena.completa && <p className="net-chain-warn">{cadena.motivo}</p>}
          <button className="secondary" type="button" onClick={() => void copiar()}>{copiado ? "Copiado" : "Copiar cadena"}</button>
        </div>

        {espacio && <label>Estado<select value={espacio.estado} disabled={guardando} onChange={event => void onGuardarCampos({ estado: event.target.value })}>{estadosEspacio.map(valor => <option key={valor} value={valor}>{etiquetasEstadoEspacio[valor]}</option>)}</select></label>}
        {puerto && <label>Estado<select value={puerto.estado} disabled={guardando} onChange={event => void onGuardarCampos({ estado: event.target.value })}>{estadosPuerto.map(valor => <option key={valor} value={valor}>{etiquetasEstadoPuerto[valor]}</option>)}</select></label>}

        {(espacio || puerto) && <label>Nota<textarea value={nota} maxLength={500} rows={3} onChange={event => setNota(event.target.value)} onBlur={() => void onGuardarCampos({ nota })} placeholder="Roseta, canalización, hallazgos en terreno…" /><small className="character-count">{nota.length}/500</small></label>}

        {cubiculo && <div className="net-kv"><div><span>IP</span><b>{cubiculo.ip || "sin registrar"}</b></div><div><span>MAC</span><b>{cubiculo.mac || "sin registrar"}</b></div><div><span>ESTADO</span><b>{cubiculo.status}</b></div></div>}
        {cubiculo && <Link className="secondary net-link" href="/">Ver ficha completa en la pestaña Sala</Link>}

        <div className="net-links">
          <span className="net-label">ENLACES</span>
          {enlaces.length ? enlaces.map(enlace => {
            const otro = enlace.a === endpointId ? enlace.b : enlace.a;
            return <div className="net-link-row" key={enlace.id}><span><b>{etiquetaEndpoint(estado, otro)}</b>{enlace.nota && <small>{enlace.nota}</small>}</span><button type="button" disabled={guardando} onClick={() => void onBorrarEnlace(enlace.id)} aria-label={`Quitar enlace con ${etiquetaEndpoint(estado, otro)}`}>Quitar</button></div>;
          }) : <p className="empty-state">Todavía sin enlaces.</p>}

          {tipo !== "pto" && <div className="net-assign">
            <label>Asignar a un puerto<select value={puertoElegido} disabled={guardando} onChange={event => setPuertoElegido(event.target.value)}><option value="">Elige un puerto…</option>{librePara.map(opcion => <option key={opcion.id} value={opcion.id}>{opcion.etiqueta}</option>)}</select></label>
            <label>Nota de la roseta<input value={notaRoseta} maxLength={200} onChange={event => setNotaRoseta(event.target.value)} placeholder="Ej: roseta junto a la pizarra" /></label>
            <button className="primary" type="button" disabled={guardando || !puertoElegido} onClick={() => void asignar()}>{guardando ? "Guardando…" : "Asignar"}</button>
          </div>}
        </div>

        <div className="net-log">
          <span className="net-label">BITÁCORA</span>
          {historial.length ? <ul>{historial.map(entrada => <li key={entrada.id}><b>{new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(entrada.fecha))}</b> {entrada.tipo} {entrada.antes && `· ${entrada.antes} →`} {entrada.despues || entrada.nota}</li>)}</ul> : <p className="empty-state">Sin movimientos registrados.</p>}
        </div>
      </div>
    </aside>
  );
}
