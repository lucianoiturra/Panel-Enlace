"use client";

import { useEffect, useState } from "react";
import type { EstadoSalud, Salud } from "../lib/salud/evaluar";

const COLOR: Record<EstadoSalud, string> = {
  ok: "#1f9d55",
  atencion: "#d08700",
  falla: "#c0392b",
  "sin-datos": "#8a8f98",
};

const TITULO: Record<EstadoSalud, string> = {
  ok: "Todo en orden",
  atencion: "Algo requiere atención",
  falla: "Hay una falla",
  "sin-datos": "Sin noticias del servidor",
};

// Una sola consulta al montar, sin polling: el colector escribe cada 5 minutos
// y no vale la pena una peticion cada 30 segundos en las cuatro paginas.
// Si falla, el punto no se pinta: la nav no se rompe nunca por culpa de /salud.
export default function PuntoSalud() {
  const [peor, setPeor] = useState<EstadoSalud | null>(null);

  useEffect(() => {
    let vigente = true;
    fetch("/api/salud", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() as Promise<Salud> : null))
      .then((datos) => { if (vigente && datos) setPeor(datos.peor); })
      .catch(() => {});
    return () => { vigente = false; };
  }, []);

  if (!peor || peor === "ok") return null;
  return <span className="nav-punto" style={{ background: COLOR[peor] }} title={TITULO[peor]} aria-label={TITULO[peor]} role="status" />;
}
