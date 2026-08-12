"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import NavSecciones from "../nav-secciones";
import { haceCuanto } from "../../lib/formato-tiempo";
import { useAhora, useRefrescoPeriodico } from "../use-refresco";
import { UMBRALES, type EstadoSalud, type Salud } from "../../lib/salud/evaluar";

type SaludRespuesta = Salud & { ahoraServidor: string };

// El colector escribe cada 5 minutos: preguntar cada 2 alcanza para que la
// página nunca muestre una medición que ya tuvo reemplazo.
const CADA_MS = 120_000;

// Las variables CSS custom no encajan en CSSProperties sin un cast explícito.
const dot = (color: string): CSSProperties => ({ ["--dot"]: color } as CSSProperties);

// El color nunca va solo: siempre lleva su palabra al lado, para que se lea
// sin distinguir colores.
const META: Record<EstadoSalud, { etiqueta: string; color: string }> = {
  ok: { etiqueta: "Bien", color: "#1f9d55" },
  atencion: { etiqueta: "Atención", color: "#d08700" },
  falla: { etiqueta: "Falla", color: "#c0392b" },
  "sin-datos": { etiqueta: "Sin datos", color: "#8a8f98" },
};

export default function SaludPagina() {
  const [salud, setSalud] = useState<Salud | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [ahora, anclarReloj] = useAhora();

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const respuesta = await fetch("/api/salud", { cache: "no-store" });
      if (!respuesta.ok) throw new Error("No se pudo cargar la salud del sistema.");
      const datos = await respuesta.json() as SaludRespuesta;
      anclarReloj(datos.ahoraServidor);
      setSalud(datos);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : "No se pudo cargar la salud del sistema.");
    } finally {
      setCargando(false);
    }
  }, [anclarReloj]);

  useEffect(() => { void cargar(); }, [cargar]);
  useRefrescoPeriodico(() => void cargar(), CADA_MS);

  // La medición envejece entre una consulta y la siguiente, y el subtítulo no
  // puede seguir prometiendo una foto reciente cuando el colector lleva horas
  // callado: las filas ya dicen "sin noticias del servidor" y el encabezado las
  // contradecía.
  const edadMin = salud?.medidoAt ? (ahora - new Date(salud.medidoAt).getTime()) / 60_000 : null;
  const colectorVivo = edadMin !== null && edadMin <= UMBRALES.colectorMuertoMin;

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">SE</span>
          <div><strong>Salud</strong><span>Estado del servidor y sus servicios</span></div>
          <NavSecciones activa="salud" />
        </div>
        <div className="header-actions">
          <button className="icon-button" onClick={() => void cargar()} aria-label="Actualizar" disabled={cargando}>{cargando ? "…" : "↻"}</button>
          <div className="date-chip"><span>MEDIDO</span><b>{salud ? haceCuanto(salud.medidoAt, ahora) : "—"}</b></div>
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
            <h1>Estado del sistema</h1>
            <p className="subtitle">{
              salud === null
                ? "Esta página muestra, no avisa: si algo está en rojo, sigue estándolo hasta que alguien lo arregle."
                : colectorVivo
                  ? "Foto de los últimos 5 minutos, y se actualiza sola mientras la tengas abierta. Esta página muestra, no avisa: si algo está en rojo, sigue estándolo hasta que alguien lo arregle."
                  : `El colector del servidor no escribe ${haceCuanto(salud.medidoAt, ahora)}. Lo de abajo es lo último que alcanzó a medir, no el estado de ahora.`
            }</p>
          </div>
        </div>

        {!salud && !error && <p className="mon-empty">Cargando…</p>}

        <div className="salud-bloques">
          {salud?.bloques.map((bloque) => (
            <section className="salud-bloque" key={bloque.id}>
              <h2>
                {bloque.titulo}
                <span className="mon-badge" style={dot(META[bloque.estado].color)}>{META[bloque.estado].etiqueta}</span>
              </h2>
              <div className="mon-scroll">
                <table className="mon-table">
                  <tbody>
                    {bloque.filas.map((fila) => (
                      <tr key={fila.clave}>
                        <td><b>{fila.etiqueta}</b></td>
                        <td><span className="mon-badge" style={dot(META[fila.estado].color)}>{META[fila.estado].etiqueta}</span></td>
                        <td className="mon-muted">{fila.detalle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
