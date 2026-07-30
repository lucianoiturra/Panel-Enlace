export const MAXIMO_IDS = 200;
const LARGO_ID = 120;

// Devuelve la lista saneada, o null si el cuerpo no sirve. No se comprueba que
// los ids existan: la tabla es un diccionario de presentación y una fila
// huérfana —un equipo que se borró— no rompe el dibujo, porque el layout solo
// consulta los ids que él mismo arma.
export const idsValidos = (valor: unknown): string[] | null => {
  if (!Array.isArray(valor) || !valor.length || valor.length > MAXIMO_IDS) return null;
  const ids = valor.map(id => (typeof id === "string" ? id.trim() : ""));
  if (ids.some(id => !id || id.length > LARGO_ID)) return null;
  if (new Set(ids).size !== ids.length) return null;
  return ids;
};
