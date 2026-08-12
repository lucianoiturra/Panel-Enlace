import { datosFrescos } from "./estado-efectivo.ts";
import type { EstadoReconciliacion, FilaCubiculo } from "./reconciliacion.ts";

// Espejo de estado-efectivo.ts para el otro lado del panel: allá los espacios,
// acá los cubículos. La regla es la misma y por la misma razón: lo vivo se
// muestra al lado de lo documentado y nunca en su lugar.
export type VivoCubiculo = {
  estado: EstadoReconciliacion;
  ipReal: string;
  ultimaConexion: string;
  nombreVivo: string;
};

export type ResumenVivo = Record<EstadoReconciliacion, number>;

const SIN_NOMBRE = new Set(["(unknown)", "(name not found)"]);

export function vivoDeCubiculos(
  filas: FilaCubiculo[],
  refrescado: string | null,
  ahora: number = Date.now(),
): { porCubiculo: Map<number, VivoCubiculo>; resumen: ResumenVivo | null; frescos: boolean } {
  const frescos = datosFrescos(refrescado, ahora);
  // Sin datos frescos no se devuelve nada, en vez de devolver todo "sin verse":
  // la ausencia de un volcado no es evidencia de que los equipos estén apagados.
  if (!frescos) return { porCubiculo: new Map(), resumen: null, frescos: false };

  const resumen: ResumenVivo = {
    "en-linea": 0, "ip-distinta": 0, "sin-verse": 0, "sin-mac": 0, "sin-computador": 0,
  };
  const porCubiculo = new Map<number, VivoCubiculo>();
  for (const fila of filas) {
    resumen[fila.estado] += 1;
    const nombre = fila.vivo?.nombre ?? "";
    porCubiculo.set(fila.cubiculo.id, {
      estado: fila.estado,
      ipReal: fila.ipReal,
      ultimaConexion: fila.vivo?.ultimaConexion ?? "",
      nombreVivo: SIN_NOMBRE.has(nombre) ? "" : nombre,
    });
  }
  return { porCubiculo, resumen, frescos: true };
}
