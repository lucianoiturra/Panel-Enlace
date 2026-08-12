import type { EstadoPuerto, EstadoRed } from "./modelo.ts";

export const TIPOGRAFIA = 15;
// Ancho medio de un carácter como fracción del tamaño de fuente. Antes servía para
// recortar la etiqueta al nodo; ahora dimensiona el nodo según su etiqueta.
export const ANCHO_CARACTER = 0.55;
export const ANCHO_MINIMO = 120;
export const RELLENO = 16;
export const ALTO_TARJETA = 44;

export type ResumenPuertos = { total: number; ocupados: number; libres: number; dañados: number; sinVerificar: number };
export type ClaseNodo = "equipo" | "aparato" | "espacio" | "cubiculo";
export type PuertoNodo = { id: string; n: number; estado: EstadoPuerto; x: number; y: number; w: number; h: number };
export type Nodo = {
  id: string; clase: ClaseNodo; codigo: string; etiqueta: string;
  zona: string; fila: number;
  x: number; y: number; w: number; h: number;
  abierta: boolean; idsPuerto: string[]; puertos: PuertoNodo[];
  resumen: ResumenPuertos | null; estado: EstadoPuerto | null; sinRuta: boolean;
};
export type FichaBandeja = { id: string; etiqueta: string; grupo: string };

export const anchoDeTexto = (texto: string) =>
  Math.max(ANCHO_MINIMO, Math.round(texto.length * TIPOGRAFIA * ANCHO_CARACTER) + RELLENO);

// El orden guardado manda; lo que no tiene va al final, en su orden automático.
// El desplazamiento de mil es lo que garantiza esa segunda mitad: las filas
// guardadas se escriben siempre como 0..n-1 y ningún grupo llega a mil.
export const ordenarPor = (orden: Record<string, number>, automatico: string[]): string[] =>
  [...automatico].sort((a, b) =>
    (orden[a] ?? 1000 + automatico.indexOf(a)) - (orden[b] ?? 1000 + automatico.indexOf(b)));

export const codigoDeEquipo = (equipoId: string) => equipoId.replace("-", "/");

export const resumenDePuertos = (estado: EstadoRed, equipoId: string): ResumenPuertos => {
  const puertos = estado.puertos.filter(puerto => puerto.equipo === equipoId);
  const cuantos = (valor: EstadoPuerto) => puertos.filter(puerto => puerto.estado === valor).length;
  return {
    total: puertos.length,
    ocupados: cuantos("ocupado"),
    libres: cuantos("libre"),
    dañados: cuantos("dañado"),
    sinVerificar: cuantos("desconocido"),
  };
};
