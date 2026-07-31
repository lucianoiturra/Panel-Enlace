const LINEA_CANVAS = /^relación dibujada en el canvas hacia:/i;

// El segmento y los puertos identificados pueden venir en la misma línea:
// "Rack 2 — **Segmento IP:** por confirmar (…) **Puertos identificados:** …".
// Por eso se recorta el fragmento del segmento en vez de descartar la línea
// entera: descartarla se llevaría el único dato real que dejó el levantamiento.
const FRAGMENTO_SEGMENTO = /(?:rack\s*\d+\s*[—-]\s*)?\*\*segmento ip:\*\*([^*]*)/i;

export const pareceSegmento = (valor: string) => {
  const partes = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(valor.trim());
  if (!partes) return false;
  return partes.slice(1, 5).every(octeto => Number(octeto) <= 255) && Number(partes[5]) <= 32;
};

export const pareceIp = (valor: string) => {
  const partes = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(valor.trim());
  if (!partes) return false;
  return partes.slice(1, 5).every(octeto => Number(octeto) <= 255);
};

export const limpiarNotaRack = (nota: string): { notas: string; segmento: string } => {
  let segmento = "";
  const lineas = (nota ?? "").split("\n").map(linea => {
    const encontrado = FRAGMENTO_SEGMENTO.exec(linea);
    if (!encontrado) return linea;
    const candidato = (encontrado[1] ?? "").trim();
    if (!segmento && pareceSegmento(candidato)) segmento = candidato;
    return linea.replace(FRAGMENTO_SEGMENTO, " ");
  });

  const notas = lineas
    .filter(linea => !LINEA_CANVAS.test(linea.trim()))
    .map(linea => linea.replace(/\*\*/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  return { notas, segmento };
};
