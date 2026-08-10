// Cruce entre lo documentado (cubicles) y la red viva (mon_devices, poblada
// desde NetAlertX). Función pura para poder probarla sin base de datos.

export type CubiculoDoc = {
  id: number;
  ip: string;
  mac: string;
  status: string;
  marca: string;
};

export type DispositivoVivo = {
  mac: string;
  ip: string;
  nombre: string;
  fabricante: string;
  ultimaConexion: string;
  presente: boolean;
};

export type EstadoReconciliacion =
  | "en-linea"
  | "ip-distinta"
  | "sin-verse"
  | "sin-mac"
  | "sin-computador";

export type FilaCubiculo = {
  cubiculo: CubiculoDoc;
  estado: EstadoReconciliacion;
  vivo: DispositivoVivo | null;
  ipDocumentada: string;
  ipReal: string;
};

export type Reconciliacion = {
  cubiculos: FilaCubiculo[];
  sinDocumentar: DispositivoVivo[];
  resumen: {
    total: number;
    enLinea: number;
    ipDistinta: number;
    sinVerse: number;
    sinMac: number;
    sinComputador: number;
    sinDocumentar: number;
  };
};

// Las MAC documentadas se guardan en MAYÚSCULAS y las de NetAlertX en
// minúsculas con dos puntos; se comparan sin separadores ni caso.
export function normalizarMac(mac: string): string {
  return mac.toLowerCase().replace(/[^0-9a-f]/g, "");
}

export function reconciliar(
  cubiculos: CubiculoDoc[],
  vivos: DispositivoVivo[],
): Reconciliacion {
  const vivosPorMac = new Map<string, DispositivoVivo>();
  for (const dispositivo of vivos) {
    const clave = normalizarMac(dispositivo.mac);
    if (clave) vivosPorMac.set(clave, dispositivo);
  }

  const macsDocumentadas = new Set<string>();
  const filas: FilaCubiculo[] = [];

  for (const cubiculo of cubiculos) {
    const macNorm = normalizarMac(cubiculo.mac);
    if (macNorm) macsDocumentadas.add(macNorm);

    let estado: EstadoReconciliacion;
    let vivo: DispositivoVivo | null = null;

    if (cubiculo.status === "no_computer") {
      estado = "sin-computador";
    } else if (!macNorm) {
      estado = "sin-mac";
    } else {
      vivo = vivosPorMac.get(macNorm) ?? null;
      if (vivo && vivo.presente) {
        const ipDoc = cubiculo.ip.trim();
        estado = ipDoc && ipDoc !== vivo.ip.trim() ? "ip-distinta" : "en-linea";
      } else {
        estado = "sin-verse";
      }
    }

    filas.push({
      cubiculo,
      estado,
      vivo,
      ipDocumentada: cubiculo.ip.trim(),
      ipReal: vivo?.ip.trim() ?? "",
    });
  }

  const sinDocumentar = vivos
    .filter((dispositivo) => {
      const clave = normalizarMac(dispositivo.mac);
      return Boolean(clave) && !macsDocumentadas.has(clave);
    })
    .sort((a, b) => Number(b.presente) - Number(a.presente));

  const resumen = {
    total: filas.length,
    enLinea: filas.filter((fila) => fila.estado === "en-linea").length,
    ipDistinta: filas.filter((fila) => fila.estado === "ip-distinta").length,
    sinVerse: filas.filter((fila) => fila.estado === "sin-verse").length,
    sinMac: filas.filter((fila) => fila.estado === "sin-mac").length,
    sinComputador: filas.filter((fila) => fila.estado === "sin-computador").length,
    sinDocumentar: sinDocumentar.length,
  };

  return { cubiculos: filas, sinDocumentar, resumen };
}
