import { useMemo } from "react";
import { anclasDeFlujo, grosorDeCinta, recortarAlAncho, type CintaFlujo, type Flujo, type NodoFlujo } from "../../lib/red/flujo";
import { type PuertoNodo, type ResumenPuertos } from "../../lib/red/layout";
import { claveDePar } from "../../lib/red/aristas";

export type PropsNodos = {
  layout: Flujo;
  ruta: Set<string>;
  ordenPuertosRuta: Map<string, number>;
  paresRuta: Set<string>;
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
  onTomarPunta: (arista: CintaFlujo, fijo: string, evento: React.PointerEvent) => void;
};

const COLOR_ENLACE = { patch: "#294f7c", uplink: "#a65330", roseta: "#237a52", borde: "#182334" } as const;
const ANCHO_FLECHA = 20;
const ALTO_FLECHA = 18;
const ALTO_FLECHA_V = 14;

type Punto = { x: number; y: number };

// Todas las cintas van de una columna a la siguiente o más allá, así que la
// curva es horizontal. La única excepción es la intra-capa —los uplinks—, que
// sale por un riel a la izquierda de su columna en vez de cruzar las tarjetas.
const trazo = (cinta: CintaFlujo, a: Punto, b: Punto, xColumna: number) => {
  if (cinta.intraCapa) {
    const riel = xColumna - RIEL;
    return `M ${a.x} ${a.y} L ${riel} ${a.y} L ${riel} ${b.y} L ${b.x} ${b.y}`;
  }
  const dx = (b.x - a.x) * 0.45;
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
};
const RIEL = 26;
const ALTO_CABECERA = 26;

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
  ordenPuertosRuta,
  paresRuta,
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
  const anclas = useMemo(() => anclasDeFlujo(layout), [layout]);
  const nodosPorId = useMemo(() => new Map(layout.nodos.map(nodo => [nodo.id, nodo])), [layout]);
  const posicion = useMemo(() => {
    const mapa = new Map<string, { grupo: string[]; indice: number }>();
    for (const grupo of layout.grupos) grupo.forEach((id, indice) => mapa.set(id, { grupo, indice }));
    return mapa;
  }, [layout]);

  const pertenece = (conjunto: Set<string>, id: string) =>
    conjunto.has(id) || nodosPorId.get(id)?.idsPuerto.some(puerto => conjunto.has(puerto)) === true;
  const nivel = (id: string) => pertenece(ruta, id) ? "ruta" : "";
  const nivelArista = (arista: CintaFlujo) => paresRuta.has(claveDePar(arista.a, arista.b)) ? "ruta" : "";
  const clasesNodo = (nodo: NodoFlujo) => ["net-d-nodo", nodo.clase, nivel(nodo.id), nodo.estado === "dañado" ? "danado" : "", nodo.sinRuta ? "sin-ruta" : "", seleccionado === nodo.id ? "sel" : "", origen === nodo.id ? "origen" : ""].filter(Boolean).join(" ");
  const clasesPuerto = (puerto: PuertoNodo) => ["net-d-pt", puerto.estado, nivel(puerto.id),
    seleccionado === puerto.id ? "sel" : "", origen === puerto.id ? "origen" : ""].filter(Boolean).join(" ");

  const alTeclado = (evento: React.KeyboardEvent<SVGRectElement>, nodo: NodoFlujo) => {
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

  const etiquetaAccesible = (nodo: NodoFlujo) => nodo.clase === "equipo"
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
      {layout.columnas.map(columna => (
        <g key={columna.capa} className="net-d-columna">
          <text x={columna.x} y={14}>{columna.titulo.toUpperCase()}</text>
        </g>
      ))}

      {layout.bloques.map(bloque => (
        <g key={bloque.id} className={`net-d-bloque ${bloque.colapsable ? "grupo" : ""} ${bloque.abierto ? "abierto" : ""}`}>
          {bloque.colapsable
            ? <>
                <rect
                  x={bloque.x} y={bloque.y} width={bloque.w} height={ALTO_CABECERA}
                  rx={4} role="button" tabIndex={0}
                  aria-expanded={bloque.abierto}
                  aria-label={`${bloque.titulo}, ${bloque.cuenta} destinos. Enter para ${bloque.abierto ? "cerrar" : "abrir"}.`}
                  onKeyDown={evento => { if (evento.key === "Enter" || evento.key === " ") { evento.preventDefault(); onAlternar(bloque.id); } }}
                  onClick={() => onAlternar(bloque.id)}
                />
                <text className="net-d-bloque-titulo" x={bloque.x + 10} y={bloque.y + 17}>{recortarAlAncho(bloque.titulo, bloque.w - 60)}</text>
                <text className="net-d-bloque-cuenta" x={bloque.x + bloque.w - 10} y={bloque.y + 17}>{bloque.cuenta} {bloque.abierto ? "▾" : "▸"}</text>
              </>
            : bloque.titulo && <text className="net-d-bloque-rotulo" x={bloque.x} y={bloque.y + 12}>{bloque.titulo.toUpperCase()}</text>}
        </g>
      ))}

      {layout.cintas.map(cinta => {
        const a = anclas.get(cinta.a);
        const b = anclas.get(cinta.b);
        if (!a || !b) return null;
        const nivelDeArista = nivelArista(cinta);
        const medio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const conManijas = editable && cinta.enlaceId > 0 && !reenlazando;
        // El riel de una cinta intra-capa sale del borde izquierdo de la columna
        // donde vive: por eso hace falta la x de la columna y no basta el ancla.
        const xColumna = layout.nodos.find(nodo => nodo.id === cinta.a)?.x ?? a.x;
        const d = trazo(cinta, a, b, xColumna);
        return <g key={cinta.clave} className={`net-d-link ${nivelDeArista} ${conManijas ? "editable" : ""}`}>
          {conManijas && <path className="net-d-zarpa" d={d} />}
          {nivelDeArista === "ruta" && <path className="net-d-ruta-halo" d={d} />}
          <path d={d} stroke={COLOR_ENLACE[cinta.tipo] ?? "#68717e"} strokeWidth={grosorDeCinta(cinta.cuenta)} fill="none" />
          {cinta.cuenta > 1 && <text className="net-d-cuenta" x={medio.x} y={medio.y}>×{cinta.cuenta}</text>}
          {conManijas && ([[cinta.a, cinta.b, a, b], [cinta.b, cinta.a, b, a]] as [string, string, Punto, Punto][]).map(([suelto, fijo, desde, hacia]) => {
            const punto = manija(desde, hacia);
            return <circle
              key={suelto}
              className="net-d-manija"
              cx={punto.x}
              cy={punto.y}
              r={9}
              onPointerDown={evento => { evento.stopPropagation(); onTomarPunta(cinta, fijo, evento); }}
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
        {nodo.estado === "dañado" && <g className="net-d-danado" transform={`translate(${nodo.w - 13} 13)`}>
          <circle r={9} />
          <text y={4}>×</text>
        </g>}
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
          {ordenPuertosRuta.has(puerto.id) && <g className="net-d-paso" transform={`translate(${puerto.x + 2} ${puerto.y + 1})`}>
            <circle r={8} />
            <text y={3.5}>{ordenPuertosRuta.get(puerto.id)}</text>
          </g>}
        </g>)}
      </g>)}

      {ordenando && <g className="net-d-orden">
        {layout.nodos.map(nodo => flechasDe(nodo.id, nodo.etiqueta, nodo.x + nodo.w + 4, nodo.y, true))}
      </g>}
    </>
  );
}
