"use client";

import { useCallback, useEffect, useState } from "react";
import { useRefrescoPeriodico } from "./use-refresco";
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

// El colector escribe cada 5 minutos, asi que preguntar cada 3 alcanza. El
// punto vive en la nav de las cuatro paginas: es lo unico que puede avisar de
// una falla sin que nadie entre a /salud, y un punto que solo se pinta al
// cargar la pagina no avisa de nada.
// Si falla, el punto no se pinta: la nav no se rompe nunca por culpa de /salud.
const CADA_MS = 180_000;

export default function PuntoSalud() {
  const [peor, setPeor] = useState<EstadoSalud | null>(null);

  const consultar = useCallback((señal?: AbortSignal) => {
    fetch("/api/salud", { cache: "no-store", signal: señal })
      .then((r) => (r.ok ? r.json() as Promise<Salud> : null))
      .then((datos) => { if (datos) setPeor(datos.peor); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const control = new AbortController();
    consultar(control.signal);
    return () => control.abort();
  }, [consultar]);

  useRefrescoPeriodico(() => consultar(), CADA_MS);

  if (!peor || peor === "ok") return null;
  return <span className="nav-punto" style={{ background: COLOR[peor] }} title={TITULO[peor]} aria-label={TITULO[peor]} role="status" />;
}
