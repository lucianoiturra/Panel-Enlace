// Fechas en lenguaje humano para los encabezados de MONITOREO y SALUD.
//
// `ahora` se recibe en vez de leerse adentro para que la función sea pura y
// para que quien la llame pueda pasarle un reloj corregido con la hora del
// servidor: el navegador que muestra la página no siempre tiene la hora bien, y
// las filas ya vienen juzgadas con el reloj de cabserver.
export function haceCuanto(iso: string | null, ahora: number = Date.now()): string {
  if (!iso) return "sin datos";
  const marca = new Date(iso).getTime();
  if (Number.isNaN(marca)) return "sin datos";
  const min = Math.max(0, Math.round((ahora - marca) / 60000));
  if (min < 1) return "hace instantes";
  if (min === 1) return "hace 1 minuto";
  if (min < 60) return `hace ${min} minutos`;
  const h = Math.round(min / 60);
  if (h < 48) return h === 1 ? "hace 1 hora" : `hace ${h} horas`;
  return `hace ${Math.round(h / 24)} días`;
}
