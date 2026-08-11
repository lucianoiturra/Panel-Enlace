// Fechas en lenguaje humano para los encabezados de MONITOREO y SALUD.
export function haceCuanto(iso: string | null): string {
  if (!iso) return "sin datos";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "hace instantes";
  if (min === 1) return "hace 1 minuto";
  if (min < 60) return `hace ${min} minutos`;
  const h = Math.round(min / 60);
  return h === 1 ? "hace 1 hora" : `hace ${h} horas`;
}
