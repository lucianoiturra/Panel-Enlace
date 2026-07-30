import { useMemo } from "react";
import { anclasDeLayout, type Arista, type Layout, type Nodo } from "../../lib/red/layout";

export type PropsNodos = {
  layout: Layout;
  escala: number;
  ruta: Set<string>;
  alcance: Set<string>;
  seleccionado: string;
  origen: string;
  corte: string;
  onPunto: (id: string) => void;
  onFicha: (id: string) => void;
};

const COLOR_ENLACE = { patch: "#294f7c", uplink: "#a65330", roseta: "#237a52", borde: "#68717e" } as const;

const curva = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const medio = (a.y + b.y) / 2;
  return `M ${a.x} ${a.y} C ${a.x} ${medio}, ${b.x} ${medio}, ${b.x} ${b.y}`;
};

export default function DiagramaNodos({ layout, escala, ruta, alcance, seleccionado, origen, corte, onPunto, onFicha }: PropsNodos) {
  const anclas = useMemo(() => anclasDeLayout(layout), [layout]);
  const tipografia = 13 / escala;

  const interactivo = (nodo: Nodo) => nodo.clase !== "equipo";
  const nivel = (id: string) => ruta.has(id) ? "ruta" : alcance.has(id) ? "alcance" : "";
  const nivelArista = (arista: Arista) => ruta.has(arista.a) && ruta.has(arista.b) ? "ruta" : alcance.has(arista.a) && alcance.has(arista.b) ? "alcance" : "";
  const clasesNodo = (nodo: Nodo) => ["net-d-nodo", nodo.clase, nivel(nodo.id), nodo.isla ? "isla" : "", seleccionado === nodo.id ? "sel" : "", origen === nodo.id ? "origen" : ""].filter(Boolean).join(" ");
  const alTeclado = (evento: React.KeyboardEvent<SVGRectElement>, id: string, abrir = false) => {
    if (evento.key !== "Enter" && evento.key !== " ") return;
    evento.preventDefault();
    if (abrir) onFicha(id);
    else onPunto(id);
  };
  const cortada = corte ? anclas.get(corte) : undefined;

  return (
    <>
      {layout.aristas.map(arista => {
        const a = anclas.get(arista.a);
        const b = anclas.get(arista.b);
        if (!a || !b) return null;
        return <path key={arista.id} className={`net-d-link ${nivelArista(arista)}`} d={curva(a, b)} stroke={COLOR_ENLACE[arista.tipo] ?? "#68717e"} strokeWidth={arista.tipo === "uplink" ? 5 : 3} />;
      })}

      {cortada && <g className="net-d-corte" transform={`translate(${cortada.x} ${cortada.y})`}>
        <circle r={13 / escala} />
        <text y={5 / escala} style={{ fontSize: `${tipografia}px` }}>×</text>
      </g>}

      {layout.nodos.map(nodo => <g key={nodo.id} className={clasesNodo(nodo)} transform={`translate(${nodo.x} ${nodo.y})`}>
        {/* La caja de un equipo con puertos es un contenedor, no un destino: su id `eq:` no es un
            endpoint trazable y cada puerto llega a un lugar distinto. Se selecciona el puerto. */}
        <rect width={nodo.w} height={nodo.h} rx={6} role={interactivo(nodo) ? "button" : undefined} tabIndex={interactivo(nodo) ? 0 : undefined} aria-label={interactivo(nodo) ? `${nodo.etiqueta}. Enter para seleccionar; doble clic para abrir la ficha.` : undefined} onKeyDown={interactivo(nodo) ? evento => alTeclado(evento, nodo.id) : undefined} onClick={interactivo(nodo) ? () => onPunto(nodo.id) : undefined} onDoubleClick={interactivo(nodo) ? () => onFicha(nodo.id) : undefined} />
        <text className="net-d-nombre" x={0} y={-8 / escala} style={{ fontSize: `${tipografia}px` }}>{nodo.etiqueta}</text>
        {nodo.puertos.map(puerto => <g key={puerto.id} className={`net-d-pt ${puerto.estado} ${nivel(puerto.id)} ${seleccionado === puerto.id ? "sel" : ""} ${origen === puerto.id ? "origen" : ""}`}>
          <rect x={puerto.x} y={puerto.y} width={puerto.w} height={puerto.h} rx={3} role="button" tabIndex={0} aria-label={`Puerto ${puerto.n}, ${puerto.estado}. Enter para seleccionar; doble clic para abrir la ficha.`} onKeyDown={evento => alTeclado(evento, puerto.id)} onClick={event => { event.stopPropagation(); onPunto(puerto.id); }} onDoubleClick={event => { event.stopPropagation(); onFicha(puerto.id); }} />
          <text x={puerto.x + puerto.w / 2} y={puerto.y + puerto.h / 2 + 4 / escala} style={{ fontSize: `${Math.min(tipografia, puerto.w * 0.6)}px` }}>{puerto.n}</text>
        </g>)}
      </g>)}
    </>
  );
}
