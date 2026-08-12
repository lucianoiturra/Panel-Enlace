// Reglas del encendido programado. Funciones puras: sin base de datos y sin
// reloj propio, para poder probarlas sin encender nada.

export type ProgramaEntrada = {
  nombre?: unknown;
  dias?: unknown;
  hora?: unknown;
  objetivo?: unknown;
  activo?: unknown;
};

export type Programa = {
  nombre: string;
  dias: string;
  hora: string;
  objetivo: string;
  activo: boolean;
};

export type EventoWol = {
  cubiculo: number;
  resultado: string;
  desperto: boolean | null;
  enviadoAt: string;
};

// Lunes primero, como se lee un horario de colegio. El índice + 1 es el día ISO.
export const DIAS = [
  { digito: "1", corto: "L", largo: "lunes" },
  { digito: "2", corto: "M", largo: "martes" },
  { digito: "3", corto: "X", largo: "miércoles" },
  { digito: "4", corto: "J", largo: "jueves" },
  { digito: "5", corto: "V", largo: "viernes" },
  { digito: "6", corto: "S", largo: "sábado" },
  { digito: "7", corto: "D", largo: "domingo" },
] as const;

const HORA_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Los días se guardan como dígitos pegados y ordenados sin repetir: '12345'.
// Que la forma guardada sea única evita que '15' y '51' sean el mismo horario
// escrito de dos maneras.
export function normalizarDias(valor: string): string {
  const vistos = new Set(valor.replace(/[^1-7]/g, "").split(""));
  return DIAS.filter(dia => vistos.has(dia.digito)).map(dia => dia.digito).join("");
}

// 'todos' o cubículos separados por coma, ordenados y sin repetir.
export function normalizarObjetivo(valor: string): string {
  const limpio = valor.trim().toLowerCase();
  if (limpio === "todos" || limpio === "") return "todos";
  const ids = [...new Set(
    limpio.split(",")
      .map(parte => Number(parte.trim()))
      .filter(id => Number.isInteger(id) && id >= 1 && id <= 40),
  )].sort((a, b) => a - b);
  return ids.join(",");
}

export function validarPrograma(entrada: ProgramaEntrada): { ok: true; valor: Programa } | { ok: false; error: string } {
  const nombre = typeof entrada.nombre === "string" ? entrada.nombre.trim().slice(0, 80) : "";
  if (!nombre) return { ok: false, error: "Ponle un nombre al horario." };

  const dias = normalizarDias(typeof entrada.dias === "string" ? entrada.dias : "");
  if (!dias) return { ok: false, error: "Elige al menos un día de la semana." };

  const hora = typeof entrada.hora === "string" ? entrada.hora.trim() : "";
  if (!HORA_RE.test(hora)) return { ok: false, error: "La hora debe ir como HH:MM, por ejemplo 07:45." };

  const objetivo = normalizarObjetivo(typeof entrada.objetivo === "string" ? entrada.objetivo : "todos");
  if (!objetivo) return { ok: false, error: "Elige 'todos' o al menos un cubículo entre 1 y 40." };

  return { ok: true, valor: { nombre, dias, hora, objetivo, activo: entrada.activo !== false } };
}

// "L a V" en vez de "L, M, X, J, V": un rango corrido se lee de un vistazo y es
// como se nombra en el colegio.
export function etiquetaDias(dias: string): string {
  const digitos = normalizarDias(dias);
  if (!digitos) return "nunca";
  if (digitos === "1234567") return "todos los días";
  if (digitos === "12345") return "L a V";
  if (digitos === "67") return "fin de semana";
  const cortos = DIAS.filter(dia => digitos.includes(dia.digito)).map(dia => dia.corto);
  const corrido = digitos.length > 2
    && DIAS.findIndex(d => d.digito === digitos[digitos.length - 1]) - DIAS.findIndex(d => d.digito === digitos[0]) === digitos.length - 1;
  return corrido ? `${cortos[0]} a ${cortos[cortos.length - 1]}` : cortos.join(", ");
}

export function etiquetaObjetivo(objetivo: string): string {
  if (objetivo === "todos") return "toda la sala";
  const ids = objetivo.split(",").filter(Boolean);
  if (ids.length === 1) return `cubículo ${ids[0]}`;
  return `${ids.length} cubículos`;
}

// Cuánto tarda un encendido en poder juzgarse: el PC arranca, NetAlertX lo ve
// en su próximo barrido y el sidecar lo copia en su próximo ciclo. Mientras
// tanto la pantalla no puede decir nada todavía, y sobre todo no puede volver a
// ofrecer el botón como si no hubiera pasado nada.
export const MINUTOS_EN_CURSO = 12;

/**
 * ¿Se puede pedir un encendido ahora?
 *
 * No basta con mirar la cola: un pedido se marca atendido apenas salen los
 * paquetes, así que entre ese instante y la verificación el botón volvía a
 * decir "Encender ahora" sin que nada visible hubiera cambiado. Apretarlo de
 * nuevo era lo natural, y mandaba una segunda ráfaga idéntica.
 */
export function estadoBoton(
  resumen: { hubo: boolean; cuando: string; sinVerificar: number },
  pedidoPendiente: unknown,
  ahora: number,
): { puede: boolean; etiqueta: string } {
  if (pedidoPendiente) return { puede: false, etiqueta: "En cola…" };
  if (resumen.hubo && resumen.sinVerificar > 0) {
    const minutos = (ahora - new Date(resumen.cuando).getTime()) / 60_000;
    if (minutos >= 0 && minutos < MINUTOS_EN_CURSO) return { puede: false, etiqueta: "Verificando…" };
  }
  return { puede: true, etiqueta: "Encender ahora" };
}

// Resumen del último encendido: lo que se quiere leer en la mañana no es
// "se mandaron 38 paquetes", es quién no contestó.
export function resumirUltimoEncendido(eventos: EventoWol[]): {
  hubo: boolean;
  cuando: string;
  enviados: number;
  yaEncendidos: number;
  despertaron: number;
  dormidos: number[];
  sinVerificar: number;
} {
  if (!eventos.length) {
    return { hubo: false, cuando: "", enviados: 0, yaEncendidos: 0, despertaron: 0, dormidos: [], sinVerificar: 0 };
  }
  // Un encendido es una ráfaga: los eventos dentro de los cinco minutos del más
  // reciente. Así un envío manual de las 08:00 no se mezcla con el programado
  // de las 07:45.
  const masReciente = eventos.reduce((mayor, e) => (e.enviadoAt > mayor ? e.enviadoAt : mayor), eventos[0].enviadoAt);
  const corte = new Date(masReciente).getTime() - 5 * 60_000;

  // Un cubículo aparece UNA vez, con su noticia más reciente. Sin esto, dos
  // pulsaciones seguidas del botón caían en la misma ventana y cada equipo se
  // contaba dos veces: pasó de verdad el 2026-08-12 y la pantalla informó
  // "68 enviados" sobre 34 equipos, con la lista de dormidos repetida en pares.
  const ultimoPorCubiculo = new Map<number, EventoWol>();
  for (const evento of eventos) {
    if (new Date(evento.enviadoAt).getTime() < corte) continue;
    const previo = ultimoPorCubiculo.get(evento.cubiculo);
    if (!previo || evento.enviadoAt > previo.enviadoAt) ultimoPorCubiculo.set(evento.cubiculo, evento);
  }
  const rafaga = [...ultimoPorCubiculo.values()];

  const enviados = rafaga.filter(e => e.resultado === "enviado");
  return {
    hubo: true,
    cuando: masReciente,
    enviados: enviados.length,
    yaEncendidos: rafaga.filter(e => e.resultado === "ya-encendido").length,
    despertaron: enviados.filter(e => e.desperto === true).length,
    dormidos: enviados.filter(e => e.desperto === false).map(e => e.cubiculo).sort((a, b) => a - b),
    sinVerificar: enviados.filter(e => e.desperto === null).length,
  };
}
