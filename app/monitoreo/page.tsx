"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import NavSecciones from "../nav-secciones";
import { haceCuanto } from "../../lib/formato-tiempo";
import { useAhora, useRefrescoPeriodico } from "../use-refresco";
import type { EstadoReconciliacion, Reconciliacion } from "../../lib/red/reconciliacion";
import type { EspacioVivo, EstadoVivoUbicacion } from "../../lib/red/estado-ubicacion";

// El sidecar vuelca la red cada 3 minutos; preguntar cada 90 s alcanza para no
// mirar nunca un volcado que ya tuvo reemplazo.
const CADA_MS = 90_000;

type DatosRecon = Reconciliacion & { refrescado: string | null; ahoraServidor: string };
type Candidato = { mac: string; ip: string; name: string; vendor: string; present: boolean };
type DatosUbic = {
  ubicaciones: EspacioVivo[];
  resumen: Record<EstadoVivoUbicacion, number>;
  candidatos: Candidato[];
};

// Las variables CSS custom no encajan en CSSProperties sin un cast explícito.
const dot = (color: string): CSSProperties => ({ ["--dot"]: color } as CSSProperties);

const META_RECON: Record<EstadoReconciliacion, { etiqueta: string; color: string }> = {
  "en-linea": { etiqueta: "En línea", color: "#1f9d55" },
  "ip-distinta": { etiqueta: "IP distinta", color: "#d08700" },
  "sin-verse": { etiqueta: "Sin verse", color: "#c0392b" },
  "sin-mac": { etiqueta: "Sin MAC", color: "#8a8f98" },
  "sin-computador": { etiqueta: "Sin PC", color: "#6b7280" },
};

const META_UBIC: Record<EstadoVivoUbicacion, { etiqueta: string; color: string }> = {
  operativo: { etiqueta: "Operativo", color: "#1f9d55" },
  "sin-internet": { etiqueta: "Sin internet", color: "#c0392b" },
  "sin-testigo": { etiqueta: "Sin testigo", color: "#8a8f98" },
};

const RESUMEN_RECON: { clave: keyof Reconciliacion["resumen"]; etiqueta: string; color: string }[] = [
  { clave: "enLinea", etiqueta: "En línea", color: "#1f9d55" },
  { clave: "ipDistinta", etiqueta: "IP distinta", color: "#d08700" },
  { clave: "sinVerse", etiqueta: "Sin verse", color: "#c0392b" },
  { clave: "sinMac", etiqueta: "Sin MAC", color: "#8a8f98" },
  { clave: "sinComputador", etiqueta: "Sin PC", color: "#6b7280" },
  { clave: "sinDocumentar", etiqueta: "Sin documentar", color: "#7c3aed" },
];

function etiquetaCandidato(candidato: Candidato): string {
  const nombre = candidato.name && candidato.name !== "(unknown)" && candidato.name !== "(name not found)" ? ` · ${candidato.name}` : "";
  const estado = candidato.present ? "" : " (ausente)";
  return `${candidato.ip} · ${candidato.vendor || "?"}${nombre}${estado}`;
}

export default function Monitoreo() {
  const [recon, setRecon] = useState<DatosRecon | null>(null);
  const [ubic, setUbic] = useState<DatosUbic | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soloDiferencias, setSoloDiferencias] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [ahora, anclarReloj] = useAhora();

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [rRecon, rUbic] = await Promise.all([
        fetch("/api/monitoreo", { cache: "no-store" }),
        fetch("/api/monitoreo/ubicaciones", { cache: "no-store" }),
      ]);
      if (!rRecon.ok || !rUbic.ok) throw new Error("No se pudo cargar el monitoreo.");
      const datosRecon = await rRecon.json() as DatosRecon;
      anclarReloj(datosRecon.ahoraServidor);
      setRecon(datosRecon);
      setUbic(await rUbic.json() as DatosUbic);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : "No se pudo cargar el monitoreo.");
    } finally {
      setCargando(false);
    }
  }, [anclarReloj]);

  useEffect(() => { void cargar(); }, [cargar]);
  // Mientras se está asignando un testigo no se recarga: la respuesta llegaría
  // encima del select que el usuario tiene abierto.
  useRefrescoPeriodico(() => void cargar(), CADA_MS, guardando === null);

  const asignarTestigo = useCallback(async (id: string, testigoMac: string) => {
    setGuardando(id);
    try {
      const respuesta = await fetch("/api/monitoreo/ubicaciones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, testigoMac }),
      });
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => ({})) as { error?: string };
        throw new Error(cuerpo.error || "No se pudo guardar el testigo.");
      }
      const rUbic = await fetch("/api/monitoreo/ubicaciones", { cache: "no-store" });
      if (rUbic.ok) setUbic(await rUbic.json() as DatosUbic);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : "No se pudo guardar el testigo.");
    } finally {
      setGuardando(null);
    }
  }, []);

  const filasRecon = useMemo(() => {
    if (!recon) return [];
    if (!soloDiferencias) return recon.cubiculos;
    return recon.cubiculos.filter((fila) => fila.estado === "ip-distinta" || fila.estado === "sin-verse");
  }, [recon, soloDiferencias]);

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">SE</span>
          <div><strong>Monitoreo</strong><span>Red viva vs documentación</span></div>
          <NavSecciones activa="monitoreo" />
        </div>
        <div className="header-actions">
          <button className="icon-button" onClick={() => void cargar()} aria-label="Actualizar" disabled={cargando}>{cargando ? "…" : "↻"}</button>
          <div className="date-chip"><span>DATOS DE RED</span><b>{recon ? haceCuanto(recon.refrescado, ahora) : "—"}</b></div>
        </div>
      </header>

      <section className="shell">
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void cargar()} disabled={cargando}>{cargando ? "Reintentando…" : "Reintentar"}</button>
          </div>
        )}

        {/* Estado por ubicación (objetivo principal) */}
        <div className="workspace-head">
          <div>
            <h1>Estado por ubicación</h1>
            <p className="subtitle">Cada espacio se marca operativo o sin internet según si su dispositivo testigo (el AP de la sala, o un equipo fijo) está presente en la red ahora.</p>
          </div>
        </div>
        <div className="mon-summary">
          {(Object.keys(META_UBIC) as EstadoVivoUbicacion[]).map((clave) => (
            <div className="chip" key={clave} style={dot(META_UBIC[clave].color)}>
              <b>{ubic ? ubic.resumen[clave] : "—"}</b>
              <span>{META_UBIC[clave].etiqueta}</span>
            </div>
          ))}
        </div>
        <div className="mon-scroll">
          <table className="mon-table">
            <thead>
              <tr><th>Espacio</th><th>Tipo</th><th>Estado vivo</th><th>Dispositivo testigo</th><th>Estado manual</th></tr>
            </thead>
            <tbody>
              {!ubic && !error && <tr><td colSpan={5} className="mon-empty">Cargando…</td></tr>}
              {ubic && ubic.ubicaciones.length === 0 && <tr><td colSpan={5} className="mon-empty">No hay espacios documentados.</td></tr>}
              {ubic?.ubicaciones.map((espacio) => (
                <tr key={espacio.id}>
                  <td><b>{espacio.nombre}</b></td>
                  <td className="mon-muted">{espacio.categoria}</td>
                  <td><span className="mon-badge" style={dot(META_UBIC[espacio.estadoVivo].color)}>{META_UBIC[espacio.estadoVivo].etiqueta}</span></td>
                  <td>
                    <select
                      className="mon-select"
                      value={espacio.testigoMac}
                      disabled={guardando === espacio.id}
                      onChange={(e) => void asignarTestigo(espacio.id, e.target.value)}
                    >
                      <option value="">— sin testigo —</option>
                      {espacio.testigoMac && !ubic.candidatos.some((c) => c.mac === espacio.testigoMac) && (
                        <option value={espacio.testigoMac}>{espacio.testigoMac} (no visto)</option>
                      )}
                      {ubic.candidatos.map((candidato) => (
                        <option key={candidato.mac} value={candidato.mac}>{etiquetaCandidato(candidato)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="mon-muted">{espacio.estadoManual}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Reconciliación de cubículos */}
        <div className="workspace-head" style={{ marginTop: 34 }}>
          <div>
            <h1 style={{ fontSize: 24 }}>Cubículos vs red viva</h1>
            <p className="subtitle">Cruce por MAC entre los 40 cubículos documentados y lo que NetAlertX ve vivo. Solo lectura.</p>
          </div>
          <label className="mon-toggle">
            <input type="checkbox" checked={soloDiferencias} onChange={(e) => setSoloDiferencias(e.target.checked)} />
            Solo diferencias
          </label>
        </div>
        <div className="mon-summary">
          {RESUMEN_RECON.map((item) => (
            <div className="chip" key={item.clave} style={dot(item.color)}>
              <b>{recon ? recon.resumen[item.clave] : "—"}</b>
              <span>{item.etiqueta}</span>
            </div>
          ))}
        </div>
        <div className="mon-scroll">
          <table className="mon-table">
            <thead>
              <tr><th>Cub.</th><th>Estado</th><th>Equipo (vivo)</th><th>IP doc.</th><th>IP real</th><th>MAC</th><th>Última conexión</th></tr>
            </thead>
            <tbody>
              {!recon && !error && <tr><td colSpan={7} className="mon-empty">Cargando…</td></tr>}
              {recon && filasRecon.length === 0 && <tr><td colSpan={7} className="mon-empty">Sin filas que mostrar.</td></tr>}
              {filasRecon.map((fila) => (
                <tr key={fila.cubiculo.id}>
                  <td><b>{String(fila.cubiculo.id).padStart(2, "0")}</b></td>
                  <td><span className="mon-badge" style={dot(META_RECON[fila.estado].color)}>{META_RECON[fila.estado].etiqueta}</span></td>
                  <td>{fila.vivo?.nombre && fila.vivo.nombre !== "(unknown)" && fila.vivo.nombre !== "(name not found)" ? fila.vivo.nombre : <span className="mon-muted">—</span>}</td>
                  <td className="mon-mono">{fila.ipDocumentada || <span className="mon-muted">—</span>}</td>
                  <td className="mon-mono">{fila.estado === "ip-distinta" ? <b style={{ color: "#b06d00" }}>{fila.ipReal}</b> : (fila.ipReal || <span className="mon-muted">—</span>)}</td>
                  <td className="mon-mono">{fila.cubiculo.mac || <span className="mon-muted">—</span>}</td>
                  <td className="mon-muted">{fila.vivo?.ultimaConexion || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Sin documentar */}
        <div className="workspace-head" style={{ marginTop: 32 }}>
          <div>
            <h1 style={{ fontSize: 22 }}>Sin documentar</h1>
            <p className="subtitle">Equipos vivos en la red cuya MAC no está en ningún cubículo. Candidatos a documentar (o intrusos).</p>
          </div>
        </div>
        <div className="mon-scroll">
          <table className="mon-table">
            <thead>
              <tr><th>IP</th><th>MAC</th><th>Nombre</th><th>Fabricante</th><th>Presente</th></tr>
            </thead>
            <tbody>
              {!recon && !error && <tr><td colSpan={5} className="mon-empty">Cargando…</td></tr>}
              {recon && recon.sinDocumentar.length === 0 && <tr><td colSpan={5} className="mon-empty">Todo lo vivo está documentado.</td></tr>}
              {recon?.sinDocumentar.map((dispositivo) => (
                <tr key={dispositivo.mac}>
                  <td className="mon-mono">{dispositivo.ip || "—"}</td>
                  <td className="mon-mono">{dispositivo.mac}</td>
                  <td>{dispositivo.nombre && dispositivo.nombre !== "(unknown)" && dispositivo.nombre !== "(name not found)" ? dispositivo.nombre : <span className="mon-muted">—</span>}</td>
                  <td>{dispositivo.fabricante || <span className="mon-muted">—</span>}</td>
                  <td><span className="mon-badge" style={dot(dispositivo.presente ? "#1f9d55" : "#8a8f98")}>{dispositivo.presente ? "Sí" : "No"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
