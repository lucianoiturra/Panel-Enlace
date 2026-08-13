// Convierte los hechos crudos que escribe salud-cabserver.sh en estados
// legibles. Es pura: sin Date.now() adentro, sin red, sin base de datos. Los
// umbrales viven aca arriba para que se discutan leyendo una tabla, no
// arqueologia en un script de shell.

export type EstadoSalud = "ok" | "atencion" | "falla" | "sin-datos";

export type HechoSalud = { clave: string; valor: string; numero: number | null; medidoAt: string };
export type FilaSalud = { clave: string; etiqueta: string; estado: EstadoSalud; detalle: string };
export type BloqueSalud = { id: string; titulo: string; estado: EstadoSalud; filas: FilaSalud[] };
export type Salud = { peor: EstadoSalud; medidoAt: string | null; bloques: BloqueSalud[] };

export const UMBRALES = {
  monitoreoAtencionMin: 6,
  monitoreoFallaMin: 15,
  colectorMuertoMin: 15,
  ramAtencionMb: 500,
  ramFallaMb: 200,
  discoAtencionPct: 85,
  discoFallaPct: 95,
  respaldoAtencionH: 26,
  respaldoFallaH: 50,
} as const;

export const CONTENEDORES_ESPERADOS = [
  "vaultwarden", "netalertx", "adguard",
  "panel-enlace", "panel-db", "panel-backup", "panel-mon-export",
  "ntfy", "lab-scripts",
] as const;

// sin-datos empata con atencion: que muera el mensajero importa, pero no es lo
// mismo que perder un respaldo. En empate gana "atencion" por el orden de esta
// lista, para que el resultado sea determinista.
const RANGO: Record<EstadoSalud, number> = { ok: 0, "sin-datos": 1, atencion: 1, falla: 2 };
const ORDEN: EstadoSalud[] = ["falla", "atencion", "sin-datos", "ok"];

function peorDe(estados: EstadoSalud[]): EstadoSalud {
  if (!estados.length) return "sin-datos";
  const alto = Math.max(...estados.map((e) => RANGO[e]));
  return ORDEN.find((e) => RANGO[e] === alto) ?? "ok";
}

// Etiqueta de un bloque: el peor estado que REALMENTE tienen sus filas. Se
// distingue de peorDe, que mide severidad para el punto de la nav: ahi un
// bloque entero en sin-datos pesa como atencion, pero decir "Atencion" en el
// encabezado de siete filas que dicen "Sin datos" seria nombrar un estado que
// nadie tiene.
function estadoPresente(estados: EstadoSalud[]): EstadoSalud {
  if (!estados.length) return "sin-datos";
  const alto = Math.max(...estados.map((e) => RANGO[e]));
  return ORDEN.find((e) => RANGO[e] === alto && estados.includes(e)) ?? "ok";
}

function hace(segundos: number): string {
  if (segundos < 60) return "hace instantes";
  const min = Math.round(segundos / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return h === 1 ? "hace 1 hora" : `hace ${h} horas`;
  return `hace ${Math.round(h / 24)} días`;
}

function porEdad(segundos: number, atencionH: number, fallaH: number): EstadoSalud {
  if (segundos > fallaH * 3600) return "falla";
  if (segundos > atencionH * 3600) return "atencion";
  return "ok";
}

export function evaluarSalud(
  hechos: HechoSalud[],
  refrescadoMonitoreo: string | null,
  espaciosConTestigo: number,
  ahora: number,
): Salud {
  const porClave = new Map(hechos.map((h) => [h.clave, h]));
  const marcas = hechos
    .map((h) => new Date(h.medidoAt).getTime())
    .filter((t) => !Number.isNaN(t));
  const medidoMs = marcas.length ? Math.max(...marcas) : null;
  const medidoAt = medidoMs === null ? null : new Date(medidoMs).toISOString();

  // Guardia del colector: tres ciclos perdidos y dejamos de creerle a la foto.
  // Sin esto, /salud pintaria verde porque nadie dijo lo contrario.
  const colectorVivo =
    medidoMs !== null && ahora - medidoMs <= UMBRALES.colectorMuertoMin * 60_000;

  const edadColectorMin = medidoMs === null ? null : Math.round((ahora - medidoMs) / 60_000);
  const sinColector = (clave: string, etiqueta: string): FilaSalud => ({
    clave,
    etiqueta,
    estado: "sin-datos",
    detalle: edadColectorMin === null
      ? "el colector nunca ha escrito"
      : `sin noticias del servidor ${hace(edadColectorMin * 60)}`,
  });

  // Fila que depende del colector: si murio, no se evalua.
  const delHost = (
    clave: string,
    etiqueta: string,
    evaluar: (hecho: HechoSalud) => { estado: EstadoSalud; detalle: string },
  ): FilaSalud => {
    const hecho = porClave.get(clave);
    if (!colectorVivo || !hecho) return sinColector(clave, etiqueta);
    const { estado, detalle } = evaluar(hecho);
    return { clave, etiqueta, estado, detalle };
  };

  // --- monitoreo: NO viene del colector, sale de mon_devices ----------------
  const frescura: FilaSalud = (() => {
    const clave = "monitoreo.frescura";
    const etiqueta = "Datos de red";
    if (!refrescadoMonitoreo) {
      return { clave, etiqueta, estado: "sin-datos", detalle: "mon_devices está vacía" };
    }
    const marca = new Date(refrescadoMonitoreo).getTime();
    if (Number.isNaN(marca)) {
      return { clave, etiqueta, estado: "sin-datos", detalle: "fecha ilegible" };
    }
    const min = (ahora - marca) / 60_000;
    const estado: EstadoSalud =
      min > UMBRALES.monitoreoFallaMin ? "falla" : min > UMBRALES.monitoreoAtencionMin ? "atencion" : "ok";
    const cola = estado === "falla" ? " — RED volvió al estado manual" : "";
    return { clave, etiqueta, estado, detalle: `${hace(min * 60)}${cola}` };
  })();

  const monitoreo: FilaSalud[] = [
    frescura,
    {
      clave: "monitoreo.testigos",
      etiqueta: "Espacios con testigo",
      estado: "ok",
      detalle: `${espaciosConTestigo} espacios muestran estado automático; el resto sigue manual`,
    },
  ];

  // --- servidor -------------------------------------------------------------
  const contenedores: FilaSalud[] = CONTENEDORES_ESPERADOS.map((nombre) =>
    delHost(`docker.${nombre}`, nombre, (hecho) => {
      const valor = hecho.valor || "ausente";
      if (valor === "running" || valor === "running/healthy") return { estado: "ok", detalle: valor };
      if (valor === "running/starting") return { estado: "atencion", detalle: "arrancando (healthcheck en curso)" };
      return { estado: "falla", detalle: valor === "ausente" ? "no existe el contenedor" : valor };
    }),
  );

  const servidor: FilaSalud[] = [
    ...contenedores,
    delHost("host.ram_disponible_mb", "RAM disponible", (hecho) => {
      if (hecho.numero === null) return { estado: "sin-datos", detalle: "sin lectura de memoria" };
      const mb = hecho.numero;
      const estado: EstadoSalud =
        mb < UMBRALES.ramFallaMb ? "falla" : mb < UMBRALES.ramAtencionMb ? "atencion" : "ok";
      return { estado, detalle: `${(mb / 1024).toFixed(1)} GB libres` };
    }),
    delHost("host.disco_uso_pct", "Disco del sistema", (hecho) => {
      if (hecho.numero === null) return { estado: "sin-datos", detalle: "sin lectura del disco" };
      const pct = hecho.numero;
      const estado: EstadoSalud =
        pct > UMBRALES.discoFallaPct ? "falla" : pct > UMBRALES.discoAtencionPct ? "atencion" : "ok";
      const libre = porClave.get("host.disco_libre_gb")?.numero;
      const sufijo = libre !== null && libre !== undefined ? ` · ${libre} GB libres` : "";
      return { estado, detalle: `${pct} % usado${sufijo}` };
    }),
  ];

  // --- respaldos ------------------------------------------------------------
  const respaldos: FilaSalud[] = [
    delHost("backup.pgdump_edad_seg", "Copia de la base (diaria)", (hecho) => {
      if (hecho.numero === null) {
        return { estado: "falla", detalle: "sin copias todavía" };
      }
      const bytes = porClave.get("backup.pgdump_bytes")?.numero ?? 0;
      if (bytes === 0) return { estado: "falla", detalle: "la última copia está vacía" };
      const estado = porEdad(hecho.numero, UMBRALES.respaldoAtencionH, UMBRALES.respaldoFallaH);
      const tamano = bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
      return { estado, detalle: `${hace(hecho.numero)} · ${tamano}` };
    }),
    delHost("backup.usb_montado", "Disco externo", (hecho) => (
      hecho.valor === "true"
        ? { estado: "ok", detalle: "montado en /mnt/respaldo" }
        : { estado: "falla", detalle: "desconectado — el respaldo nocturno no va a correr" }
    )),
    delHost("backup.usb_edad_seg", "Copia en el disco externo", (hecho) => {
      if (hecho.numero === null) {
        // Disco recien conectado: no es una falla, es que todavia no toca.
        return { estado: "atencion", detalle: hecho.valor || "sin copias todavía" };
      }
      const estado = porEdad(hecho.numero, UMBRALES.respaldoAtencionH, UMBRALES.respaldoFallaH);
      const copias = porClave.get("backup.usb_copias")?.numero ?? 0;
      return { estado, detalle: `${hace(hecho.numero)} · ${copias} copias` };
    }),
    delHost("backup.servicio_fallido", "Tarea de respaldo", (hecho) => {
      if (hecho.valor === "failed") return { estado: "falla", detalle: "la última ejecución falló" };
      // `is-active` de una unidad inexistente tambien dice "inactive": un timer
      // borrado y uno detenido se ven igual, y ambos significan que no hay respaldo.
      const timer = porClave.get("backup.timer_estado")?.valor ?? "";
      if (timer !== "active") {
        return { estado: "falla", detalle: timer ? `el timer está ${timer}` : "el timer no existe" };
      }
      return { estado: "ok", detalle: "programada a diario" };
    }),
  ];

  // --- servicios ------------------------------------------------------------
  const sonda = (clave: string, etiqueta: string, okTexto: string, fallaTexto: string): FilaSalud =>
    delHost(clave, etiqueta, (hecho) => (
      hecho.valor === "ok"
        ? { estado: "ok", detalle: okTexto }
        : { estado: "falla", detalle: fallaTexto }
    ));

  const servicios: FilaSalud[] = [
    sonda("servicio.adguard_dns", "AdGuard (DNS)", "resuelve consultas", "no resuelve — los PCs se quedan sin navegar"),
    sonda("servicio.netalertx", "NetAlertX", "responde", "no responde"),
    sonda("servicio.vaultwarden", "Vaultwarden", "responde", "no responde"),
    sonda("servicio.ntfy", "ntfy (avisos)", "acepta publicaciones", "no publica — los avisos no salen"),
    sonda("servicio.tailscale", "Tailscale", "conectado al tailnet", "desconectado — no hay acceso remoto"),
  ];

  const bloques: BloqueSalud[] = [
    { id: "monitoreo", titulo: "Monitoreo", estado: estadoPresente(monitoreo.map((f) => f.estado)), filas: monitoreo },
    { id: "servidor", titulo: "Servidor", estado: estadoPresente(servidor.map((f) => f.estado)), filas: servidor },
    { id: "respaldos", titulo: "Respaldos", estado: estadoPresente(respaldos.map((f) => f.estado)), filas: respaldos },
    { id: "servicios", titulo: "Servicios", estado: estadoPresente(servicios.map((f) => f.estado)), filas: servicios },
  ];

  return { peor: peorDe(bloques.map((b) => b.estado)), medidoAt, bloques };
}
