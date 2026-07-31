import type { EstadoRed } from "../lib/red/modelo.ts";

export const fixture = (): EstadoRed => ({
  racks: [
    { id: "R2", nombre: "Rack 2 | Sala Enlace", ubicacion: "Sala Enlace", segmento: "192.168.20.0/24", x: -1440, y: 1240, w: 2640, h: 1560, notas: "" },
    { id: "R3", nombre: "Rack 3 | Sala de Profesores", ubicacion: "Sala de Profesores", segmento: "", x: 2360, y: 920, w: 2880, h: 1480, notas: "" },
  ],
  equipos: [
    { id: "R2-PP1", rack: "R2", tipo: "patchpanel", etiqueta: "Patch Panel 3Z", marca: "", modelo: "24 puertos UTP Cat6", ipGestion: "", puertos: 24, color: "", x: -1034, y: 1400, nota: "" },
    { id: "R2-SW1", rack: "R2", tipo: "switch", etiqueta: "Switch 1 | Gigabit 24p Smart", marca: "TP-Link", modelo: "TL-SG1024S", ipGestion: "192.168.20.2", puertos: 24, color: "3", x: -580, y: 1600, nota: "" },
    { id: "R3-SW1", rack: "R3", tipo: "switch", etiqueta: "Switch 1 | Cisco", marca: "Cisco", modelo: "", ipGestion: "", puertos: 28, color: "#c44a4a", x: 2894, y: 1300, nota: "" },
    { id: "MIKROTIK", rack: "R2", tipo: "router", etiqueta: "MikroTik", marca: "", modelo: "", ipGestion: "", puertos: 0, color: "4", x: -522, y: 21, nota: "" },
    { id: "ISP", rack: "R2", tipo: "isp", etiqueta: "Proveedores de Servicios de Internet", marca: "", modelo: "", ipGestion: "", puertos: 0, color: "4", x: -115, y: -280, nota: "" },
  ],
  puertos: [
    { id: "pto:R2-PP1-p14", equipo: "R2-PP1", n: 14, estado: "ocupado", nota: "" },
    { id: "pto:R2-PP1-p15", equipo: "R2-PP1", n: 15, estado: "libre", nota: "" },
    { id: "pto:R2-PP1-p16", equipo: "R2-PP1", n: 16, estado: "desconocido", nota: "sin etiquetar en el levantamiento" },
    { id: "pto:R2-SW1-p11", equipo: "R2-SW1", n: 11, estado: "ocupado", nota: "" },
    { id: "pto:R2-SW1-p24", equipo: "R2-SW1", n: 24, estado: "ocupado", nota: "" },
    { id: "pto:R3-SW1-p02", equipo: "R3-SW1", n: 2, estado: "ocupado", nota: "" },
    { id: "pto:R3-SW1-p28", equipo: "R3-SW1", n: 28, estado: "ocupado", nota: "" },
    { id: "pto:MIKROTIK-p0", equipo: "MIKROTIK", n: 0, estado: "ocupado", nota: "" },
    { id: "pto:ISP-p0", equipo: "ISP", n: 0, estado: "ocupado", nota: "" },
  ],
  espacios: [
    { id: "esp:3-basico-b", nombre: "3° Básico B", ubicacion: "", categoria: "sala", estado: "sin-verificar", x: -3560, y: 432, nota: "" },
    { id: "esp:4-basico-a", nombre: "4° Básico A", ubicacion: "", categoria: "sala", estado: "sin-verificar", x: -3560, y: 300, nota: "" },
    { id: "esp:secretaria", nombre: "Secretaría", ubicacion: "", categoria: "oficina", estado: "sin-verificar", x: -3560, y: -600, nota: "" },
  ],
  enlaces: [
    { id: 1, a: "esp:3-basico-b", b: "pto:R2-PP1-p14", tipo: "roseta", nota: "" },
    { id: 2, a: "pto:R2-PP1-p14", b: "pto:R2-SW1-p11", tipo: "patch", nota: "" },
    { id: 3, a: "pto:R2-SW1-p24", b: "pto:R3-SW1-p02", tipo: "uplink", nota: "" },
    { id: 4, a: "pto:MIKROTIK-p0", b: "pto:R3-SW1-p28", tipo: "borde", nota: "" },
    { id: 5, a: "pto:ISP-p0", b: "pto:MIKROTIK-p0", tipo: "borde", nota: "" },
  ],
  bitacora: [],
  cubiculos: [
    { id: 12, status: "operational", ip: "192.168.20.112", mac: "1C-83-41-1C-7D-A7", inventoryCode: "AF-2026-012" },
    { id: 13, status: "pending", ip: "", mac: "", inventoryCode: "" },
  ],
  categorias: [
    { id: "sala", nombre: "Sala", orden: 0, fija: true },
    { id: "oficina", nombre: "Oficina", orden: 1, fija: true },
    { id: "otro", nombre: "Otro espacio", orden: 2, fija: true },
  ],
  orden: {},
});
