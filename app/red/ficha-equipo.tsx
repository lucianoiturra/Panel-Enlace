import { useMemo, useState } from "react";
import { useDialogFocus } from "../use-dialog-focus";
import { MAXIMO_PUERTOS, SIGLAS, etiquetasTipoEquipo, pareceIp, planEliminarEquipo } from "../../lib/red/inventario";
import { tiposEquipo, type EstadoRed, type TipoEquipo } from "../../lib/red/modelo";

export type DatosEquipo = {
  id?: string; rack: string; tipo: TipoEquipo; etiqueta: string;
  marca: string; modelo: string; ipGestion: string; puertos: number; nota: string;
};

type Props = {
  estado: EstadoRed;
  equipoId: string;
  guardando: boolean;
  error: string;
  onCerrar: () => void;
  onGuardar: (datos: DatosEquipo) => void;
  onAbrirPuerto: (id: string) => void;
  onEliminar: (id: string) => void;
};

export default function FichaEquipo({ estado, equipoId, guardando, error, onCerrar, onGuardar, onAbrirPuerto, onEliminar }: Props) {
  const dialogRef = useDialogFocus<HTMLElement>(onCerrar);
  const equipo = estado.equipos.find(candidato => candidato.id === equipoId);
  const [tipo, setTipo] = useState<TipoEquipo>(equipo?.tipo ?? "switch");
  const [etiqueta, setEtiqueta] = useState(equipo?.etiqueta ?? "");
  const [marca, setMarca] = useState(equipo?.marca ?? "");
  const [modelo, setModelo] = useState(equipo?.modelo ?? "");
  const [ipGestion, setIpGestion] = useState(equipo?.ipGestion ?? "");
  const [puertos, setPuertos] = useState(String(equipo?.puertos ?? 0));
  const [nota, setNota] = useState(equipo?.nota ?? "");

  const plan = useMemo(() => planEliminarEquipo(estado, equipoId), [estado, equipoId]);
  const historial = estado.bitacora.filter(entrada => entrada.objetivo.startsWith(`pto:${equipoId}-`) || entrada.objetivo === equipoId);

  if (!equipo) return null;

  const total = Number(puertos);
  const totalValido = Number.isInteger(total) && total >= 0 && total <= MAXIMO_PUERTOS;
  const modificado = tipo !== equipo.tipo || etiqueta.trim() !== equipo.etiqueta || marca.trim() !== equipo.marca
    || modelo.trim() !== equipo.modelo || ipGestion.trim() !== equipo.ipGestion || nota.trim() !== equipo.nota
    || (totalValido && total !== equipo.puertos);

  return (
    <aside ref={dialogRef} className="drawer open" role="dialog" aria-modal="true" aria-labelledby="ficha-equipo-titulo">
      <div className="drawer-head">
        <div>
          <span>FICHA DE EQUIPO</span>
          <h2 id="ficha-equipo-titulo">{equipo.id.replace("-", "/")}</h2>
          <small className="net-sub"><span className={`net-tag ${equipo.tipo}`}>{SIGLAS[equipo.tipo]}</span> {equipo.etiqueta}</small>
        </div>
        <button onClick={onCerrar} aria-label="Cerrar">×</button>
      </div>

      <div className="drawer-body">
        <label>Tipo<select value={tipo} disabled={guardando} onChange={evento => setTipo(evento.target.value as TipoEquipo)}>{tiposEquipo.map(valor => <option key={valor} value={valor}>{etiquetasTipoEquipo[valor]}</option>)}</select></label>
        <label>Nombre<input value={etiqueta} maxLength={120} disabled={guardando} onChange={evento => setEtiqueta(evento.target.value)} /></label>
        <div className="two-cols">
          <label>Marca<input value={marca} maxLength={80} disabled={guardando} onChange={evento => setMarca(evento.target.value)} placeholder="Ej: Cisco" /></label>
          <label>Modelo<input value={modelo} maxLength={120} disabled={guardando} onChange={evento => setModelo(evento.target.value)} placeholder="Ej: SG250-28" /></label>
        </div>
        <label>IP de gestión
          <input value={ipGestion} maxLength={64} disabled={guardando} onChange={evento => setIpGestion(evento.target.value)} placeholder="Ej: 192.168.30.2" />
          {ipGestion.trim() && !pareceIp(ipGestion) && <small className="net-pista">No parece una IP en formato 192.168.30.2. Se guarda igual.</small>}
        </label>
        <label>Cantidad de puertos
          <input type="number" min={0} max={MAXIMO_PUERTOS} value={puertos} disabled={guardando} onChange={evento => setPuertos(evento.target.value)} />
          <small className="net-pista">Cero deja el equipo con un punto de conexión único, sin puertos numerados. Bajar la cantidad solo procede si los puertos que se van no tienen conexiones.</small>
        </label>
        <label>Nota<textarea value={nota} maxLength={500} rows={3} disabled={guardando} onChange={evento => setNota(evento.target.value)} /><small className="character-count">{nota.length}/500</small></label>

        <div className="net-kv">
          <div><span>RACK</span><b>{equipo.rack || "sin rack"}</b></div>
          <div><span>CÓDIGO</span><b>{equipo.id}</b></div>
        </div>
        <p className="net-pista">El rack no se puede cambiar acá: el código del equipo está dentro del identificador de cada uno de sus puertos y de cada conexión. Un equipo que cambia de rack se elimina y se vuelve a crear.</p>

        {error && <p className="net-chain-warn" role="alert">{error}</p>}
        <button className="secondary" type="button" disabled={guardando || !modificado || !etiqueta.trim() || !totalValido} onClick={() => onGuardar({ id: equipo.id, rack: equipo.rack, tipo, etiqueta, marca, modelo, ipGestion, puertos: total, nota })}>{guardando ? "Guardando…" : "Guardar datos"}</button>

        <div className="net-links">
          <span className="net-label">PUERTOS</span>
          <div className="net-strip">
            {estado.puertos.filter(puerto => puerto.equipo === equipo.id).sort((a, b) => a.n - b.n).map(puerto => (
              <button key={puerto.id} className={`net-pt ${puerto.estado}`} onClick={() => onAbrirPuerto(puerto.id)} aria-label={`Abrir puerto ${puerto.n}`}>{puerto.n}</button>
            ))}
          </div>
        </div>

        <div className="net-log">
          <span className="net-label">BITÁCORA</span>
          {historial.length ? <ul>{historial.slice(0, 20).map(entrada => <li key={entrada.id}><b>{new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(entrada.fecha))}</b> {entrada.tipo} {entrada.antes && `· ${entrada.antes} →`} {entrada.despues || entrada.nota}</li>)}</ul> : <p className="empty-state">Sin movimientos registrados.</p>}
        </div>

        <div className="net-danger">
          <span className="net-label">ZONA DE PRECAUCIÓN</span>
          {plan.ok
            ? <p>Se elimina el equipo junto con {plan.puertos.length} {plan.puertos.length === 1 ? "puerto" : "puertos"} y {plan.enlaces.length} {plan.enlaces.length === 1 ? "conexión" : "conexiones"}. No se puede deshacer.</p>
            : <p>{plan.error}</p>}
          <button type="button" className="danger-button" disabled={guardando || !plan.ok} onClick={() => onEliminar(equipo.id)}>Eliminar equipo</button>
        </div>
      </div>
    </aside>
  );
}
