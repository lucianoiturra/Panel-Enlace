export const normalizar = (valor: string) => valor
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[°ºª,.;:_\-/()]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

export const calza = (nombre: string, consulta: string) => {
  const palabras = normalizar(consulta).split(" ").filter(Boolean);
  if (!palabras.length) return false;
  const objetivo = new Set(normalizar(nombre).split(" ").filter(Boolean));
  return palabras.every(palabra => objetivo.has(palabra));
};

export const aliasCubiculo = (consulta: string) => {
  const limpio = normalizar(consulta).replace(/\s+/g, "");
  const coincidencia = /^(?:cubiculo|cub|c)?(\d{1,3})$/.exec(limpio);
  if (!coincidencia) return null;
  return Number(coincidencia[1]);
};
