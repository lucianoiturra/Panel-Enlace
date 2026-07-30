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
  onPunto: (id: string) => void;
  onFicha: (id: string) => void;
  onAlternar: (id: string) => void;
};

const COLOR_ENLACE = { patch: "#294f7c", uplink: "#a65330", roseta: "#237a52", borde: "#68717e" } as const;

const curva = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const medio = (a.y + b.y) / 2;
  return `M ${a.x} ${a.y} C ${a.x} ${medio}, ${b.x} ${medio}, ${b.x} ${b.y}`;
};

export default function DiagramaNodos({
  layout,
  ruta,
  alcance,
  seleccionado,
  origen,
  corte,
  onPunto,
  onFicha,
  onAlternar,
}: PropsNodos) {
  const anclas = useMemo(() => anclasDeLayout(layout), [layout]);

  const nivel = (id: string) => ruta.has(id) ? "ruta" : alcance.has(id) ? "alcance" : "";
  const nivelArista = (arista: Arista) => ruta.has(arista.a) && ruta.has(arista.b) ? "ruta" : alcance.has(arista.a) && alcance.has(arista.b) ? "alcance" : "";
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
        return <path key={arista.clave} className={`net-d-link ${nivelArista(arista)}`} d={curva(a, b)} stroke={COLOR_ENLACE[arista.tipo] ?? "#68717e"} strokeWidth={arista.tipo === "uplink" ? 5 : 3} />;
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
            aria-label={`Puerto ${puerto.n}, ${puerto.estado}. Enter para seleccionar; doble clic para abrir la ficha.`}
            onKeyDown={evento => alTecladoPuerto(evento, puerto.id)}
            onClick={evento => { evento.stopPropagation(); onPunto(puerto.id); }}
            onDoubleClick={evento => { evento.stopPropagation(); onFicha(puerto.id); }}
          />
          <text x={puerto.x + puerto.w / 2} y={puerto.y + puerto.h / 2 + 5}>{puerto.n}</text>
        </g>)}
      </g>)}
    </>
  );
}
