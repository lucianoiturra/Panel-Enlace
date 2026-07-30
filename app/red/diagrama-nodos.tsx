import { useMemo } from "react";
import {
  anclasDeLayout,
  type Layout,
  type Nodo,
  type PuertoNodo,
  type ResumenPuertos,
} from "../../lib/red/layout";
import type { Arista } from "../../lib/red/aristas";

export type PropsNodos = {
  layout: Layout;
  ruta: Set<string>;
  alcance: Set<string>;
  seleccionado: string;
  origen: string;
  corte: string;
  editable: boolean;
  reenlazando: boolean;
  ordenando: boolean;
  onMover: (id: string, delta: number) => void;
  onPunto: (id: string) => void;
  onFicha: (id: string) => void;
  onAlternar: (id: string) => void;
  onTomarPunta: (arista: Arista, fijo: string, evento: React.PointerEvent) => void;
};

const COLOR_ENLACE = { patch: "#294f7c", uplink: "#a65330", roseta: "#237a52", borde: "#182334" } as const;
const grosorDe = (cuenta: number) => Math.min(7, 2 + Math.log2(Math.max(cuenta, 1)));
const ANCHO_FLECHA = 20;
const ALTO_FLECHA = 18;
const ALTO_FLECHA_V = 14;

type Punto = { x: number; y: number };

const curva = (a: Punto, b: Punto) => {
  const medio = (a.y + b.y) / 2;
  return `M ${a.x} ${a.y} C ${a.x} ${medio}, ${b.x} ${medio}, ${b.x} ${b.y}`;
};

// Un uplink entre racks une dos switches a la misma altura: una curva vertical
// bajaría hasta la fila de paneles y volvería a subir, cruzando las tarjetas.
const trazo = (arista: Arista, a: Punto, b: Punto) => {
  if (arista.tipo !== "uplink" || Math.abs(a.y - b.y) > 8) return curva(a, b);
  const medio = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} C ${medio} ${a.y}, ${medio} ${b.y}, ${b.x} ${b.y}`;
};

// La manija no se dibuja sobre el ancla sino un poco adentro de la línea: en el
// centro de una tarjeta cerrada se apilarían todas las de sus enlaces.
const manija = (desde: Punto, hacia: Punto): Punto => {
  const dx = hacia.x - desde.x;
  const dy = hacia.y - desde.y;
  const largo = Math.hypot(dx, dy) || 1;
  const avance = Math.min(26, largo * 0.35);
  return { x: desde.x + (dx / largo) * avance, y: desde.y + (dy / largo) * avance };
};

export default function DiagramaNodos({
  layout,
  ruta,
  alcance,
  seleccionado,
  origen,
  corte,
  editable,
  reenlazando,
  ordenando,
  onMover,
  onPunto,
  onFicha,
  onAlternar,
  onTomarPunta,
}: PropsNodos) {
  const anclas = useMemo(() => anclasDeLayout(layout), [layout]);
  const nodosPorId = useMemo(() => new Map(layout.nodos.map(nodo => [nodo.id, nodo])), [layout]);
  const posicion = useMemo(() => {
    const mapa = new Map<string, { grupo: string[]; indice: number }>();
    for (const grupo of layout.grupos) grupo.forEach((id, indice) => mapa.set(id, { grupo, indice }));
    return mapa;
  }, [layout]);

  const pertenece = (conjunto: Set<string>, id: string) =>
    conjunto.has(id) || nodosPorId.get(id)?.idsPuerto.some(puerto => conjunto.has(puerto)) === true;
  const nivel = (id: string) => pertenece(ruta, id) ? "ruta" : pertenece(alcance, id) ? "alcance" : "";
  const nivelArista = (arista: Arista) => pertenece(ruta, arista.a) && pertenece(ruta, arista.b)
    ? "ruta"
    : pertenece(alcance, arista.a) && pertenece(alcance, arista.b) ? "alcance" : "";
  const clasesNodo = (nodo: Nodo) => ["net-d-nodo", nodo.clase, nivel(nodo.id), nodo.sinRuta ? "sin-ruta" : "", seleccionado === nodo.id ? "sel" : "", origen === nodo.id ? "origen" : ""].filter(Boolean).join(" ");
  const clasesPuerto = (puerto: PuertoNodo) => ["net-d-pt", puerto.estado, nivel(puerto.id),
    seleccionado === puerto.id ? "sel" : "", origen === puerto.id ? "origen" : ""].filter(Boolean).join(" ");

  const alTeclado = (evento: React.KeyboardEvent<SVGRectElement>, nodo: Nodo) => {
    if (evento.key !== "Enter" && evento.key !== " ") return;
    evento.preventDefault();
    if (nodo.clase === "equipo") onAlternar(nodo.id);
    else onPunto(nodo.id);
  };

  const alTecladoPuerto = (evento: React.KeyboardEvent<SVGRectElement>, id: string) => {
    if (evento.key !== "Enter" && evento.key !== " ") return;
    evento.preventDefault();
    onPunto(id);
  };

  const textoResumen = (resumen: ResumenPuertos) => {
    if (resumen.sinVerificar === resumen.total) return `${resumen.total} sin verificar`;
    const partes = [`${resumen.ocupados}/${resumen.total}`];
    if (resumen.dañados) partes.push(`${resumen.dañados} dañados`);
    if (resumen.sinVerificar) partes.push(`${resumen.sinVerificar} sin verificar`);
    return partes.join(" · ");
  };

  const etiquetaAccesible = (nodo: Nodo) => nodo.clase === "equipo"
    ? `${nodo.etiqueta}. Enter para ${nodo.abierta ? "cerrar" : "abrir"} sus puertos; doble clic para abrir la ficha.`
    : `${nodo.etiqueta}. Enter para seleccionar; doble clic para abrir la ficha.`;

  // Devuelve null para lo que no pertenece a ningún grupo —la zona de borde— y
  // omite la flecha del extremo: una flecha que no hace nada es ruido sobre un
  // diagrama que ya está denso.
  const flechasDe = (id: string, nombre: string, x: number, y: number, vertical: boolean) => {
    const lugar = posicion.get(id);
    if (!lugar) return null;
    const alto = vertical ? ALTO_FLECHA_V : ALTO_FLECHA;
    const pasos = [
      { delta: -1, simbolo: vertical ? "▲" : "◀", hacia: vertical ? "arriba" : "la izquierda" },
      { delta: 1, simbolo: vertical ? "▼" : "▶", hacia: vertical ? "abajo" : "la derecha" },
    ];
    return <g key={id}>
      {pasos.map(({ delta, simbolo, hacia }, indice) => {
        const destino = lugar.indice + delta;
        if (destino < 0 || destino >= lugar.grupo.length) return null;
        const cx = x + (vertical ? 0 : indice * (ANCHO_FLECHA + 4));
        const cy = y + (vertical ? indice * (alto + 2) : 0);
        return <g key={delta} className="net-d-flecha">
          <rect
            x={cx}
            y={cy}
            width={ANCHO_FLECHA}
            height={alto}
            rx={3}
            role="button"
            tabIndex={0}
            data-flecha={`${id}:${delta}`}
            aria-label={`Mover ${nombre} hacia ${hacia}`}
            onKeyDown={evento => {
              if (evento.key !== "Enter" && evento.key !== " ") return;
              evento.preventDefault();
              onMover(id, delta);
            }}
            onClick={evento => { evento.stopPropagation(); onMover(id, delta); }}
          />
          <text x={cx + ANCHO_FLECHA / 2} y={cy + alto / 2 + 4}>{simbolo}</text>
        </g>;
      })}
    </g>;
  };

  const cortada = corte ? anclas.get(corte) : undefined;

  return (
    <>
      {layout.zonas.map(zona => (
        <g key={zona.id} className="net-d-zona">
          <rect x={zona.x} y={zona.y} width={zona.w} height={zona.h} rx={10} />
          <text x={zona.x + 12} y={zona.y + 16}>{zona.nombre}</text>
        </g>
      ))}

      {layout.aristas.map(arista => {
        const a = anclas.get(arista.a);
        const b = anclas.get(arista.b);
        if (!a || !b) return null;
        const medio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        // Una arista agregada resume varios enlaces: no hay uno solo que mover,
        // así que se dibuja sin manijas hasta que el usuario abra las tarjetas.
        const conManijas = editable && arista.enlaceId > 0 && !reenlazando;
        return <g key={arista.clave} className={`net-d-link ${nivelArista(arista)} ${conManijas ? "editable" : ""}`}>
          {/* Banda ancha invisible: una línea de 2px es casi imposible de apuntar,
              y es la que enciende las manijas al pasar por encima. */}
          {conManijas && <path className="net-d-zarpa" d={trazo(arista, a, b)} />}
          <path d={trazo(arista, a, b)} stroke={COLOR_ENLACE[arista.tipo] ?? "#68717e"} strokeWidth={grosorDe(arista.cuenta)} fill="none" />
          {arista.cuenta > 1 && <text className="net-d-cuenta" x={medio.x} y={medio.y}>×{arista.cuenta}</text>}
          {conManijas && ([[arista.a, arista.b, a, b], [arista.b, arista.a, b, a]] as [string, string, Punto, Punto][]).map(([suelto, fijo, desde, hacia]) => {
            const punto = manija(desde, hacia);
            return <circle
              key={suelto}
              className="net-d-manija"
              cx={punto.x}
              cy={punto.y}
              r={9}
              onPointerDown={evento => { evento.stopPropagation(); onTomarPunta(arista, fijo, evento); }}
            ><title>Arrastra esta punta para reconectar el enlace</title></circle>;
          })}
        </g>;
      })}

      {cortada && <g className="net-d-corte" transform={`translate(${cortada.x} ${cortada.y})`}>
        <circle r={13} />
        <text y={5}>×</text>
      </g>}

      {layout.nodos.map(nodo => <g key={nodo.id} className={clasesNodo(nodo)} transform={`translate(${nodo.x} ${nodo.y})`}>
        <title>{nodo.etiqueta}</title>
        <rect
          width={nodo.w}
          height={nodo.h}
          rx={6}
          role="button"
          tabIndex={0}
          aria-label={etiquetaAccesible(nodo)}
          {...(nodo.clase === "equipo" ? { "data-equipo": nodo.id } : { "data-endpoint": nodo.id })}
          onKeyDown={evento => alTeclado(evento, nodo)}
          onClick={() => (nodo.clase === "equipo" ? onAlternar(nodo.id) : onPunto(nodo.id))}
          onDoubleClick={() => onFicha(nodo.id)}
        />
        <text className="net-d-codigo" x={10} y={19}>{nodo.codigo}</text>
        {nodo.resumen && <text className="net-d-resumen" x={10} y={34}>{textoResumen(nodo.resumen)}</text>}
        {nodo.puertos.map(puerto => <g key={puerto.id} className={clasesPuerto(puerto)}>
          <rect
            x={puerto.x}
            y={puerto.y}
            width={puerto.w}
            height={puerto.h}
            rx={3}
            role="button"
            tabIndex={0}
            data-endpoint={puerto.id}
            aria-label={`Puerto ${puerto.n}, ${puerto.estado}. Enter para seleccionar; doble clic para abrir la ficha.`}
            onKeyDown={evento => alTecladoPuerto(evento, puerto.id)}
            onClick={evento => { evento.stopPropagation(); onPunto(puerto.id); }}
            onDoubleClick={evento => { evento.stopPropagation(); onFicha(puerto.id); }}
          />
          <text x={puerto.x + puerto.w / 2} y={puerto.y + puerto.h / 2 + 5}>{puerto.n}</text>
        </g>)}
      </g>)}

      {ordenando && <g className="net-d-orden">
        {layout.zonas.map(zona => flechasDe(zona.id, zona.nombre, zona.x + zona.w - 52, zona.y + 4, false))}
        {layout.nodos.map(nodo => nodo.fila === 2
          ? flechasDe(nodo.id, nodo.etiqueta, nodo.x + nodo.w + 4, nodo.y, true)
          : flechasDe(nodo.id, nodo.etiqueta, nodo.x, nodo.y + nodo.h + 6, false))}
      </g>}
    </>
  );
}
