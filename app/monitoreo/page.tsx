"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import NavSecciones from "../nav-secciones";
import type { EstadoReconciliacion, Reconciliacion } from "../../lib/red/reconciliacion";

type Datos = Reconciliacion & { refrescado: string | null };

// Las variables CSS custom no encajan en CSSProperties sin un cast explícito.
const dot = (color: string): CSSProperties => ({ ["--dot"]: color } as CSSProperties);

const META: Record<EstadoReconciliacion, { etiqueta: string; color: string }> = {
  "en-linea": { etiqueta: "En línea", color: "#1f9d55" },
  "ip-distinta": { etiqueta: "IP distinta", color: "#d08700" },
  "sin-verse": { etiqueta: "Sin verse", color: "#c0392b" },
  "sin-mac": { etiqueta: "Sin MAC", color: "#8a8f98" },
  "sin-computador": { etiqueta: "Sin PC", color: "#6b7280" },
};

const RESUMEN: { clave: keyof Reconciliacion["resumen"]; etiqueta: string; color?: string }[] = [
  { clave: "enLinea", etiqueta: "En línea", color: "#1f9d55" },
  { clave: "ipDistinta", etiqueta: "IP distinta", color: "#d08700" },
  { clave: "sinVerse", etiqueta: "Sin verse", color: "#c0392b" },
  { clave: "sinMac", etiqueta: "Sin MAC", color: "#8a8f98" },
  { clave: "sinComputador", etiqueta: "Sin PC", color: "#6b7280" },
  { clave: "sinDocumentar", etiqueta: "Sin documentar", color: "#7c3aed" },
];

function Badge({ estado }: { estado: EstadoReconciliacion }) {
  const meta = META[estado];
  return <span className="mon-badge" style={dot(meta.color)}>{meta.etiqueta}</span>;
}

function haceCuanto(iso: string | null): string {
  if (!iso) return "sin datos";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "hace instantes";
  if (min === 1) return "hace 1 minuto";
  if (min < 60) return `hace ${min} minutos`;
  const h = Math.round(min / 60);
  return h === 1 ? "hace 1 hora" : `hace ${h} horas`;
}

export default function Monitoreo() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soloDiferencias, setSoloDiferencias] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/monitoreo", { cache: "no-store" });
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => ({})) as { error?: string };
        throw new Error(cuerpo.error || "No se pudo cargar el monitoreo.");
      }
      setDatos(await respuesta.json() as Datos);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : "No se pudo cargar el monitoreo.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const filas = useMemo(() => {
    if (!datos) return [];
    if (!soloDiferencias) return datos.cubiculos;
    return datos.cubiculos.filter((fila) => fila.estado === "ip-distinta" || fila.estado === "sin-verse");
  }, [datos, soloDiferencias]);

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
          <div className="date-chip"><span>DATOS DE RED</span><b>{datos ? haceCuanto(datos.refrescado) : "—"}</b></div>
        </div>
      </header>

      <section className="shell">
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void cargar()} disabled={cargando}>{cargando ? "Reintentando…" : "Reintentar"}</button>
          </div>
        )}

        <div className="workspace-head">
          <div>
            <h1>Monitoreo de la red</h1>
            <p className="subtitle">Cruce por MAC entre los cubículos documentados y lo que NetAlertX ve vivo en la red. Solo lectura.</p>
          </div>
          <label className="mon-toggle">
            <input type="checkbox" checked={soloDiferencias} onChange={(e) => setSoloDiferencias(e.target.checked)} />
            Solo diferencias
          </label>
        </div>

        <div className="mon-summary">
          {RESUMEN.map((item) => (
            <div className="chip" key={item.clave} style={dot(item.color ?? "#888")}>
              <b>{datos ? datos.resumen[item.clave] : "—"}</b>
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
              {!datos && !error && <tr><td colSpan={7} className="mon-empty">Cargando…</td></tr>}
              {datos && filas.length === 0 && <tr><td colSpan={7} className="mon-empty">Sin filas que mostrar.</td></tr>}
              {filas.map((fila) => (
                <tr key={fila.cubiculo.id}>
                  <td><b>{String(fila.cubiculo.id).padStart(2, "0")}</b></td>
                  <td><Badge estado={fila.estado} /></td>
                  <td>{fila.vivo?.nombre && fila.vivo.nombre !== "(unknown)" ? fila.vivo.nombre : <span className="mon-muted">—</span>}</td>
                  <td className="mon-mono">{fila.ipDocumentada || <span className="mon-muted">—</span>}</td>
                  <td className="mon-mono">{fila.estado === "ip-distinta" ? <b style={{ color: "#b06d00" }}>{fila.ipReal}</b> : (fila.ipReal || <span className="mon-muted">—</span>)}</td>
                  <td className="mon-mono">{fila.cubiculo.mac || <span className="mon-muted">—</span>}</td>
                  <td className="mon-muted">{fila.vivo?.ultimaConexion || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
              {!datos && !error && <tr><td colSpan={5} className="mon-empty">Cargando…</td></tr>}
              {datos && datos.sinDocumentar.length === 0 && <tr><td colSpan={5} className="mon-empty">Todo lo vivo está documentado.</td></tr>}
              {datos?.sinDocumentar.map((dispositivo) => (
                <tr key={dispositivo.mac}>
                  <td className="mon-mono">{dispositivo.ip || "—"}</td>
                  <td className="mon-mono">{dispositivo.mac}</td>
                  <td>{dispositivo.nombre && dispositivo.nombre !== "(unknown)" ? dispositivo.nombre : <span className="mon-muted">—</span>}</td>
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
