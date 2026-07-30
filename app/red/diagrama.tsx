import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EstadoRed } from "../../lib/red/modelo";

const ANCHO_PUERTO = 80;
const ALTO_EQUIPO = 90;
const ANCHO_ESPACIO = 250;
const ALTO_ESPACIO = 60;
const MARGEN = 400;

type Props = { estado: EstadoRed; seleccionado: string; centrarEn: string; onAbrir: (id: string) => void };
type Vista = { x: number; y: number; escala: number };

export default function Diagrama({ estado, seleccionado, centrarEn, onAbrir }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [vista, setVista] = useState<Vista>({ x: 0, y: 0, escala: 0.1 });
  const arrastre = useRef<{ x: number; y: number; vista: Vista } | null>(null);

  const anchoEquipo = (puertos: number) => Math.max(puertos, 1) * ANCHO_PUERTO;

  const anclas = useMemo(() => {
    const mapa = new Map<string, { x: number; y: number }>();
    for (const equipo of estado.equipos) {
      const puertos = estado.puertos.filter(puerto => puerto.equipo === equipo.id).sort((a, b) => a.n - b.n);
      const ancho = anchoEquipo(equipo.puertos || 1);
      puertos.forEach((puerto, indice) => {
        const paso = ancho / Math.max(puertos.length, 1);
        mapa.set(puerto.id, { x: equipo.x + paso * (indice + 0.5), y: equipo.y + ALTO_EQUIPO / 2 });
      });
    }
    for (const espacio of estado.espacios) mapa.set(espacio.id, { x: espacio.x + ANCHO_ESPACIO / 2, y: espacio.y + ALTO_ESPACIO / 2 });
    return mapa;
  }, [estado]);

  const limites = useMemo(() => {
    const puntos = [
      ...estado.racks.map(rack => ({ x1: rack.x, y1: rack.y, x2: rack.x + rack.w, y2: rack.y + rack.h })),
      ...estado.espacios.map(espacio => ({ x1: espacio.x, y1: espacio.y, x2: espacio.x + ANCHO_ESPACIO, y2: espacio.y + ALTO_ESPACIO })),
      ...estado.equipos.map(equipo => ({ x1: equipo.x, y1: equipo.y, x2: equipo.x + anchoEquipo(equipo.puertos || 1), y2: equipo.y + ALTO_EQUIPO })),
    ];
    if (!puntos.length) return { x1: 0, y1: 0, x2: 1000, y2: 1000 };
    return {
      x1: Math.min(...puntos.map(punto => punto.x1)) - MARGEN,
      y1: Math.min(...puntos.map(punto => punto.y1)) - MARGEN,
      x2: Math.max(...puntos.map(punto => punto.x2)) + MARGEN,
      y2: Math.max(...puntos.map(punto => punto.y2)) + MARGEN,
    };
  }, [estado]);

  const ajustar = useCallback(() => {
    const caja = contenedor.current?.getBoundingClientRect();
    if (!caja) return;
    const escala = Math.min(caja.width / (limites.x2 - limites.x1), caja.height / (limites.y2 - limites.y1));
    setVista({ escala, x: -limites.x1 * escala, y: -limites.y1 * escala });
  }, [limites]);

  useEffect(() => { ajustar(); }, [ajustar]);

  useEffect(() => {
    const ancla = anclas.get(centrarEn);
    const caja = contenedor.current?.getBoundingClientRect();
    if (!ancla || !caja || !centrarEn) return;
    setVista(actual => {
      const escala = Math.max(actual.escala, 0.35);
      return { escala, x: caja.width / 2 - ancla.x * escala, y: caja.height / 2 - ancla.y * escala };
    });
  }, [centrarEn, anclas]);

  const alRodar = (evento: React.WheelEvent) => {
    evento.preventDefault();
    const caja = contenedor.current?.getBoundingClientRect();
    if (!caja) return;
    const factor = evento.deltaY < 0 ? 1.12 : 1 / 1.12;
    setVista(actual => {
      const escala = Math.min(Math.max(actual.escala * factor, 0.03), 3);
      const puntero = { x: evento.clientX - caja.left, y: evento.clientY - caja.top };
      return { escala, x: puntero.x - ((puntero.x - actual.x) / actual.escala) * escala, y: puntero.y - ((puntero.y - actual.y) / actual.escala) * escala };
    });
  };

  const alBajar = (evento: React.PointerEvent) => {
    if (evento.button !== 0) return;
    arrastre.current = { x: evento.clientX, y: evento.clientY, vista };
    (evento.currentTarget as Element).setPointerCapture?.(evento.pointerId);
  };
  const alMover = (evento: React.PointerEvent) => {
    if (!arrastre.current) return;
    const inicio = arrastre.current;
    setVista({ escala: inicio.vista.escala, x: inicio.vista.x + (evento.clientX - inicio.x), y: inicio.vista.y + (evento.clientY - inicio.y) });
  };
  const alSoltar = () => { arrastre.current = null; };

  const curva = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const medio = (a.y + b.y) / 2;
    return `M ${a.x} ${a.y} C ${a.x} ${medio}, ${b.x} ${medio}, ${b.x} ${b.y}`;
  };

  const colorEnlace = { patch: "#294f7c", uplink: "#a65330", roseta: "#237a52", borde: "#68717e" } as const;

  return (
    <div className="net-diagram">
      <div className="net-diagram-bar">
        <div className="net-seg" role="group" aria-label="Zoom">
          <button onClick={() => setVista(actual => ({ ...actual, escala: Math.min(actual.escala * 1.25, 3) }))} aria-label="Acercar">+</button>
          <button onClick={() => setVista(actual => ({ ...actual, escala: Math.max(actual.escala / 1.25, 0.03) }))} aria-label="Alejar">−</button>
          <button onClick={ajustar}>AJUSTAR A LA VISTA</button>
        </div>
        <p className="net-diagram-hint">Solo lectura: arrastra para mover, rueda para hacer zoom, clic en un nodo para abrir su ficha.</p>
      </div>

      <div className="net-diagram-canvas" ref={contenedor} onWheel={alRodar} onPointerDown={alBajar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerLeave={alSoltar}>
        <svg role="img" aria-label="Diagrama de la red del colegio">
          <g transform={`translate(${vista.x} ${vista.y}) scale(${vista.escala})`}>
            {estado.racks.map(rack => <g key={rack.id}>
              <rect className="net-d-rack" x={rack.x} y={rack.y} width={rack.w} height={rack.h} rx={24} />
              <text className="net-d-racklabel" x={rack.x + 30} y={rack.y + 90}>{rack.nombre}</text>
            </g>)}

            {estado.enlaces.map(enlace => {
              const a = anclas.get(enlace.a);
              const b = anclas.get(enlace.b);
              if (!a || !b) return null;
              return <path key={enlace.id} className="net-d-link" d={curva(a, b)} stroke={colorEnlace[enlace.tipo] ?? "#68717e"} strokeWidth={enlace.tipo === "uplink" ? 9 : 5} />;
            })}

            {estado.equipos.map(equipo => {
              const puertos = estado.puertos.filter(puerto => puerto.equipo === equipo.id).sort((a, b) => a.n - b.n);
              const ancho = anchoEquipo(equipo.puertos || 1);
              const paso = ancho / Math.max(puertos.length, 1);
              return <g key={equipo.id}>
                <rect className={`net-d-eq ${equipo.tipo}`} x={equipo.x} y={equipo.y} width={ancho} height={ALTO_EQUIPO} rx={10} />
                <text className="net-d-eqlabel" x={equipo.x} y={equipo.y - 16}>{equipo.id.replace("-", "/")} · {equipo.etiqueta}</text>
                {equipo.puertos > 0 && puertos.map((puerto, indice) => <rect key={puerto.id} className={`net-d-pt ${puerto.estado} ${seleccionado === puerto.id ? "sel" : ""}`} x={equipo.x + paso * indice + 6} y={equipo.y + 12} width={paso - 12} height={ALTO_EQUIPO - 24} rx={5} onClick={() => onAbrir(puerto.id)} />)}
              </g>;
            })}

            {estado.espacios.map(espacio => <g key={espacio.id} onClick={() => onAbrir(espacio.id)}>
              <rect className={`net-d-esp ${espacio.estado} ${seleccionado === espacio.id ? "sel" : ""}`} x={espacio.x} y={espacio.y} width={ANCHO_ESPACIO} height={ALTO_ESPACIO} rx={8} />
              <text className="net-d-esplabel" x={espacio.x + 14} y={espacio.y + 38}>{espacio.nombre}</text>
            </g>)}
          </g>
        </svg>
      </div>
    </div>
  );
}
