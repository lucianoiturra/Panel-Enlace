"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Vuelve a llamar a `accion` cada `cadaMs`, pero sólo mientras la pestaña está
 * visible, y una vez más al volver a ella.
 *
 * Un panel dejado abierto en una pantalla —que es para lo que sirve un panel—
 * tiene que envejecer solo. Uno en una pestaña de fondo no tiene por qué gastar
 * consultas: nadie lo está leyendo, y al volver se refresca igual antes de que
 * el ojo alcance a leer el dato viejo.
 *
 * `activo` permite apagarlo sin romper el orden de los hooks: la ficha de un
 * cubículo con cambios sin guardar no quiere que le muevan el piso.
 */
export function useRefrescoPeriodico(accion: () => void, cadaMs: number, activo = true) {
  // El manejador vive en un ref y el efecto no lo lleva como dependencia: con
  // el closure directo el intervalo se reinscribiría en cada render, y el reloj
  // volvería a empezar antes de llegar a cumplirse.
  const guardada = useRef(accion);
  useEffect(() => { guardada.current = accion; });

  useEffect(() => {
    if (!activo) return;
    let intervalo = 0;
    const detener = () => { if (intervalo) window.clearInterval(intervalo); intervalo = 0; };
    const arrancar = () => { detener(); intervalo = window.setInterval(() => guardada.current(), cadaMs); };
    const alCambiarVisibilidad = () => {
      if (document.hidden) { detener(); return; }
      guardada.current();
      arrancar();
    };
    if (!document.hidden) arrancar();
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    return () => { detener(); document.removeEventListener("visibilitychange", alCambiarVisibilidad); };
  }, [cadaMs, activo]);
}

/**
 * Reloj que avanza, para las etiquetas relativas del tipo "hace 3 minutos".
 *
 * Sin esto, `haceCuanto` se calcula una vez durante el render y la etiqueta se
 * congela: la pestaña envejece sin decirlo, que es peor que no mostrar nada.
 *
 * `anclar` corrige el desfase con la hora del servidor. Las filas de SALUD ya
 * vienen juzgadas con el reloj del servidor; si el encabezado usara el del
 * navegador, un PC con la hora corrida haría que se contradigan.
 */
export function useAhora(pasoMs = 30_000) {
  const desfase = useRef(0);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now() + desfase.current), pasoMs);
    return () => window.clearInterval(id);
  }, [pasoMs]);

  const anclar = useCallback((isoServidor: string | null | undefined) => {
    if (!isoServidor) return;
    const marca = new Date(isoServidor).getTime();
    if (Number.isNaN(marca)) return;
    desfase.current = marca - Date.now();
    setAhora(marca);
  }, []);

  return [ahora, anclar] as const;
}
