import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DiagramaLeyenda from "./diagrama-leyenda";
import DiagramaNodos from "./diagrama-nodos";
import { anclasDeLayout, construirLayout } from "../../lib/red/layout";
import { agruparCadenaPorEquipo, cadenaComoTexto, saltosDesdeIsp, trazarCircuito } from "../../lib/red/trazado";
import { etiquetaEndpoint, validarEnlace, type EstadoRed } from "../../lib/red/modelo";
import { claveDePar, nodoDeExtremo, puntasDelEnlace, type Arista } from "../../lib/red/aristas";

const MARGEN = 90;

type Props = {
  estado: EstadoRed;
  seleccionado: string;
  centrarEn: string;
  onAbrir: (id: string) => void;
  onSeleccionar: (id: string) => void;
  onConectar: (a: string, b: string) => void;
  onDesconectar: (enlaceId: number) => void;
  onReenlazar: (enlaceId: number, fijo: string, destino: string) => void;
  onReordenar: (ids: string[]) => void;
  onRestablecerOrden: () => void;
  hayOrden: boolean;
  guardando: boolean;
  onAviso: (mensaje: string) => void;
  onCopiar: (texto: string) => void;
};
type Vista = { x: number; y: number; escala: number };
// La punta que el usuario arrastra: `fijo` se queda donde está y `suelto` es la
// que va a cambiar de destino cuando la suelte.
type Reenlace = { enlaceId: number; fijo: string; suelto: string };

export default function Diagrama({ estado, seleccionado, centrarEn, onAbrir, onSeleccionar, onConectar, onDesconectar, onReenlazar, onReordenar, onRestablecerOrden, hayOrden, guardando, onAviso, onCopiar }: Props) {
  const pantalla = useRef<HTMLDivElement>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const [vista, setVista] = useState<Vista>({ x: 0, y: 0, escala: 0.6 });
  const [modo, setModo] = useState<"consultar" | "conectar" | "ordenar">("consultar");
  const [origen, setOrigen] = useState("");
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [reenlace, setReenlace] = useState<Reenlace | null>(null);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const arrastre = useRef<{ x: number; y: number; vista: Vista } | null>(null);
  const ultimoMovido = useRef("");

  const cadena = useMemo(() => trazarCircuito(estado, seleccionado), [estado, seleccionado]);
  const ruta = useMemo(() => new Set(cadena.caminos.flat()), [cadena]);
  const gruposCadena = useMemo(() => agruparCadenaPorEquipo(estado, cadena), [cadena, estado]);
  const ordenPuertosRuta = useMemo(() => {
    const orden = new Map<string, number>();
    for (const salto of saltosDesdeIsp(cadena)) {
      if (salto.id.startsWith("pto:") && !orden.has(salto.id)) orden.set(salto.id, orden.size + 1);
    }
    return orden;
  }, [cadena]);
  const equiposDeRuta = useMemo(() => {
    const ids = new Set<string>();
    for (const id of cadena.caminos.flat()) {
      if (id.startsWith("eq:")) { ids.add(id); continue; }
      const puerto = estado.puertos.find(candidato => candidato.id === id);
      const equipo = estado.equipos.find(candidato => candidato.id === puerto?.equipo);
      if (equipo?.puertos) ids.add(`eq:${equipo.id}`);
    }
    return ids;
  }, [cadena.caminos, estado.equipos, estado.puertos]);
  const abiertasEfectivas = useMemo(() => {
    if (!seleccionado || modo !== "consultar") return abiertas;
    return new Set([...abiertas, ...equiposDeRuta]);
  }, [abiertas, equiposDeRuta, modo, seleccionado]);
  const layout = useMemo(() => construirLayout(estado, abiertasEfectivas), [estado, abiertasEfectivas]);
  const anclas = useMemo(() => anclasDeLayout(layout), [layout]);
  const paresRuta = useMemo(() => {
    const pares = new Set<string>();
    for (const camino of cadena.caminos) {
      for (let indice = 1; indice < camino.length; indice += 1) {
        const a = camino[indice - 1];
        const b = camino[indice];
        pares.add(claveDePar(a, b));
        const colapsadoA = nodoDeExtremo(estado, a);
        const colapsadoB = nodoDeExtremo(estado, b);
        if (colapsadoA !== colapsadoB) pares.add(claveDePar(colapsadoA, colapsadoB));
      }
    }
    return pares;
  }, [cadena.caminos, estado]);
  const corte = useMemo(() => cadena.completa || !cadena.camino.length ? "" : [...cadena.camino].reverse().find(id => anclas.has(id)) ?? "", [cadena, anclas]);

  const enlacesOrigen = useMemo(
    () => origen ? estado.enlaces.filter(enlace => enlace.a === origen || enlace.b === origen) : [],
    [estado.enlaces, origen],
  );
  const estadoOrigen = useMemo(
    () => estado.puertos.find(puerto => puerto.id === origen)?.estado ?? "",
    [estado.puertos, origen],
  );

  const alternar = useCallback((id: string) => {
    setAbiertas(actual => {
      const siguiente = new Set(actual);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }, []);

  const mover = useCallback((id: string, delta: number) => {
    const grupo = layout.grupos.find(lista => lista.includes(id));
    if (!grupo) return;
    const indice = grupo.indexOf(id);
    const destino = indice + delta;
    if (destino < 0 || destino >= grupo.length) return;
    const ids = [...grupo];
    ids[indice] = grupo[destino];
    ids[destino] = grupo[indice];
    ultimoMovido.current = `${id}:${delta}`;
    onReordenar(ids);
  }, [layout, onReordenar]);

  // Reordenar mueve el nodo de lugar en el DOM y el navegador suelta el foco:
  // sin esto, encadenar dos movimientos con el teclado obliga a tabular de
  // nuevo hasta el botón.
  useEffect(() => {
    const clave = ultimoMovido.current;
    if (!clave) return;
    ultimoMovido.current = "";
    contenedor.current?.querySelector<SVGGraphicsElement>(`[data-flecha="${clave}"]`)?.focus();
  }, [layout]);

  const alPunto = (id: string) => {
    if (modo !== "conectar") { onSeleccionar(id); return; }
    if (!origen) { setOrigen(id); return; }
    if (origen === id) { setOrigen(""); setCursor(null); return; }
    const validacion = validarEnlace(estado, origen, id);
    if (!validacion.ok) { onAviso(validacion.error); return; }
    onConectar(origen, id);
    setOrigen("");
    setCursor(null);
  };

  const ajustar = useCallback(() => {
    const caja = contenedor.current?.getBoundingClientRect();
    if (!caja || !layout.ancho) return;
    const escala = Math.min(Math.max(caja.width / (layout.ancho + MARGEN * 2), 0.55), 1.15);
    const alto = layout.alto * escala;
    setVista({
      escala,
      x: (caja.width - layout.ancho * escala) / 2,
      y: alto < caja.height ? (caja.height - alto) / 2 : MARGEN * escala,
    });
  }, [layout]);

  useEffect(() => { ajustar(); }, [ajustar]);

  useEffect(() => {
    const alCambiarPantalla = () => {
      setPantallaCompleta(document.fullscreenElement === pantalla.current);
      window.requestAnimationFrame(ajustar);
    };
    document.addEventListener("fullscreenchange", alCambiarPantalla);
    return () => document.removeEventListener("fullscreenchange", alCambiarPantalla);
  }, [ajustar]);

  const alternarPantallaCompleta = async () => {
    try {
      if (document.fullscreenElement === pantalla.current) await document.exitFullscreen();
      else await pantalla.current?.requestFullscreen();
    } catch {
      onAviso("El navegador no permitió abrir el diagrama en pantalla completa.");
    }
  };

  const centrarNodo = useCallback((id: string) => {
    const ancla = anclas.get(id);
    const caja = contenedor.current?.getBoundingClientRect();
    if (!ancla || !caja || !id) return;
    setVista(actual => {
      const escala = Math.max(actual.escala, 0.8);
      return { escala, x: caja.width / 2 - ancla.x * escala, y: caja.height / 2 - ancla.y * escala };
    });
  }, [anclas]);

  useEffect(() => { centrarNodo(centrarEn); }, [centrarEn, centrarNodo]);

  useEffect(() => {
    if (!origen && !reenlace) return;
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return;
      evento.preventDefault();
      setOrigen("");
      setReenlace(null);
      setCursor(null);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [origen, reenlace]);

  const alRodar = (evento: React.WheelEvent) => {
    evento.preventDefault();
    const caja = contenedor.current?.getBoundingClientRect();
    if (!caja) return;
    const factor = evento.deltaY < 0 ? 1.12 : 1 / 1.12;
    setVista(actual => {
      const escala = Math.min(Math.max(actual.escala * factor, 0.1), 4);
      const puntero = { x: evento.clientX - caja.left, y: evento.clientY - caja.top };
      return { escala, x: puntero.x - ((puntero.x - actual.x) / actual.escala) * escala, y: puntero.y - ((puntero.y - actual.y) / actual.escala) * escala };
    });
  };

  const enLienzo = (clientX: number, clientY: number) => {
    const caja = contenedor.current?.getBoundingClientRect();
    if (!caja) return null;
    return { x: (clientX - caja.left - vista.x) / vista.escala, y: (clientY - caja.top - vista.y) / vista.escala };
  };

  // El destino se resuelve por el elemento que hay bajo el puntero al soltar:
  // el pointerup llega al lienzo, no al rect, así que no sirve un onPointerUp
  // por nodo. La línea en curso lleva pointer-events:none para no taparlo.
  const extremoBajoElPuntero = (clientX: number, clientY: number) => {
    const debajo = document.elementFromPoint(clientX, clientY)?.closest("[data-endpoint],[data-equipo]");
    return {
      endpoint: debajo?.getAttribute("data-endpoint") ?? "",
      equipo: debajo?.getAttribute("data-equipo") ?? "",
    };
  };

  const tomarPunta = (arista: Arista, fijo: string, evento: React.PointerEvent) => {
    if (modo !== "conectar" || !arista.enlaceId) return;
    const enlace = estado.enlaces.find(candidato => candidato.id === arista.enlaceId);
    if (!enlace) return;
    const puntas = puntasDelEnlace(estado, enlace, fijo);
    setOrigen("");
    setReenlace({ enlaceId: arista.enlaceId, ...puntas });
    setCursor(enLienzo(evento.clientX, evento.clientY));
  };

  const soltarPunta = (clientX: number, clientY: number) => {
    if (!reenlace) return;
    const { endpoint, equipo } = extremoBajoElPuntero(clientX, clientY);
    setReenlace(null);
    setCursor(null);
    if (equipo && !endpoint) { onAviso("Abre la tarjeta del equipo y suelta la punta sobre un puerto."); return; }
    if (!endpoint || endpoint === reenlace.suelto) return;
    if (endpoint === reenlace.fijo) { onAviso("Un enlace no puede empezar y terminar en el mismo punto."); return; }
    onReenlazar(reenlace.enlaceId, reenlace.fijo, endpoint);
  };

  const cancelarPunta = () => { setReenlace(null); setCursor(null); };

  // Sin setPointerCapture a propósito: capturar el puntero en el lienzo hace que el navegador
  // redirija el pointerup —y con él click y dblclick— al div que captura, así que el onClick de
  // los rect del SVG no se dispara nunca. El arrastre funciona igual por burbujeo.
  const alBajar = (evento: React.PointerEvent) => {
    if (evento.button !== 0 || reenlace) return;
    arrastre.current = { x: evento.clientX, y: evento.clientY, vista };
  };
  const alMover = (evento: React.PointerEvent) => {
    if (origen || reenlace) setCursor(enLienzo(evento.clientX, evento.clientY));
    if (!arrastre.current || reenlace) return;
    const inicio = arrastre.current;
    if (Math.abs(evento.clientX - inicio.x) + Math.abs(evento.clientY - inicio.y) < 3) return;
    setVista({ escala: inicio.vista.escala, x: inicio.vista.x + (evento.clientX - inicio.x), y: inicio.vista.y + (evento.clientY - inicio.y) });
  };
  const alSoltar = (evento: React.PointerEvent) => {
    arrastre.current = null;
    soltarPunta(evento.clientX, evento.clientY);
  };
  const alSalir = () => { arrastre.current = null; cancelarPunta(); };

  const anclaPendiente = reenlace
    ? anclas.get(reenlace.fijo)
    : origen ? anclas.get(origen) ?? { x: layout.ancho / 2, y: layout.alto + 60 } : undefined;

  const porGrupo = useMemo(() => {
    const mapa = new Map<string, typeof layout.bandeja>();
    for (const ficha of layout.bandeja) {
      const grupo = mapa.get(ficha.grupo);
      if (grupo) grupo.push(ficha);
      else mapa.set(ficha.grupo, [ficha]);
    }
    return [...mapa.entries()];
  }, [layout]);

  return (
    <div className="net-diagram" ref={pantalla}>
      <div className="net-diagram-bar">
        <div className="net-seg" role="group" aria-label="Modo del diagrama">
          <button className={modo === "consultar" ? "on" : ""} aria-pressed={modo === "consultar"} onClick={() => { setModo("consultar"); setOrigen(""); setCursor(null); }}>CONSULTAR</button>
          <button className={modo === "conectar" ? "on" : ""} aria-pressed={modo === "conectar"} onClick={() => setModo("conectar")}>CONECTAR</button>
          <button className={modo === "ordenar" ? "on" : ""} aria-pressed={modo === "ordenar"} onClick={() => { setModo("ordenar"); setOrigen(""); setCursor(null); }}>ORDENAR</button>
        </div>
        <div className="net-seg" role="group" aria-label="Zoom">
          <button onClick={() => setVista(actual => ({ ...actual, escala: Math.min(actual.escala * 1.25, 4) }))} aria-label="Acercar">+</button>
          <button onClick={() => setVista(actual => ({ ...actual, escala: Math.max(actual.escala / 1.25, 0.1) }))} aria-label="Alejar">−</button>
          <button onClick={ajustar}>AJUSTAR A LA VISTA</button>
          <button onClick={() => setAbiertas(new Set())} disabled={!abiertas.size}>CERRAR TODO</button>
          <button onClick={() => void alternarPantallaCompleta()} aria-pressed={pantallaCompleta}>{pantallaCompleta ? "SALIR DE PANTALLA COMPLETA" : "PANTALLA COMPLETA"}</button>
          {modo === "ordenar" && <button onClick={onRestablecerOrden} disabled={!hayOrden}>RESTABLECER ORDEN</button>}
        </div>
        <p className="net-diagram-hint">{reenlace
          ? `Moviendo la punta ${etiquetaEndpoint(estado, reenlace.suelto)} · suéltala sobre el nuevo destino, esc para cancelar`
          : origen
            ? `Conectando desde ${etiquetaEndpoint(estado, origen)} · clic en el destino, esc para cancelar`
            : modo === "conectar"
              ? "Clic en cualquier puerto o destino para administrarlo. Los equipos con varios puertos se abren con un clic."
              : modo === "ordenar"
                ? "Usa las flechas para mover racks, equipos y destinos. El orden se guarda solo y vale para todos."
                : "Clic en un puerto o destino aísla su circuito completo. Los puertos de la ruta se abren automáticamente."}</p>
      </div>

      {modo === "conectar" && <section className={`net-connect-panel ${origen ? "has-origin" : ""}`} aria-label="Administrar conexiones" aria-live="polite">
        <div className="net-connect-step">
          <span aria-hidden="true">{origen ? "2" : "1"}</span>
          <div>
            <strong>{origen ? etiquetaEndpoint(estado, origen) : "Selecciona el primer punto"}</strong>
            <small>{origen
              ? `Ahora elige el destino en el diagrama${estadoOrigen ? ` · puerto ${estadoOrigen}` : ""}.`
              : "Puede estar libre, ocupado o sin verificar."}</small>
          </div>
          {origen && <button type="button" className="secondary" onClick={() => { setOrigen(""); setCursor(null); }}>Cancelar</button>}
        </div>
        {origen && <div className="net-connect-current">
          <span className="net-connect-title">CONEXIONES ACTUALES · {enlacesOrigen.length}</span>
          {enlacesOrigen.length
            ? <div className="net-connect-links">{enlacesOrigen.map(enlace => {
                const otro = enlace.a === origen ? enlace.b : enlace.a;
                return <div key={enlace.id}>
                  <span><strong>{etiquetaEndpoint(estado, otro)}</strong><small>{enlace.tipo}</small></span>
                  <button type="button" onClick={() => onDesconectar(enlace.id)} disabled={guardando || enlace.id < 1}>{enlace.id < 1 ? "Guardando…" : "Desconectar"}</button>
                </div>;
              })}</div>
            : <p>Este punto todavía no tiene conexiones documentadas.</p>}
        </div>}
      </section>}

      {seleccionado && <div className="net-diagram-cadena">
        <span className="net-label">{cadena.caminos.length > 1 ? `CIRCUITO · ${cadena.caminos.length} RAMALES` : cadena.completa ? "DEL ISP AL DESTINO" : "TRAMO DOCUMENTADO"}</span>
        <div className="net-diagram-saltos" aria-label="Orden del circuito">
          {gruposCadena.map((grupo, indice) => <div className="net-diagram-step" key={`${grupo.clave}:${indice}`}>
            {indice > 0 && <i aria-hidden="true">→</i>}
            <button type="button" onClick={() => { onSeleccionar(grupo.ids[0]); centrarNodo(grupo.ids[0]); }}>
              <b>{grupo.etiqueta}</b>
              {grupo.detalle && <small>{grupo.detalle}</small>}
            </button>
          </div>)}
        </div>
        {!cadena.completa && <p className="net-diagram-motivo">{cadena.motivo}</p>}
        <button className="secondary" type="button" onClick={() => onCopiar(cadenaComoTexto(cadena))}>Copiar</button>
        <button className="net-diagram-clear" type="button" onClick={() => onSeleccionar("")}>Limpiar selección</button>
      </div>}

      <div className={`net-diagram-canvas ${modo === "conectar" ? "conectando" : ""} ${reenlace ? "reenlazando" : ""}`} ref={contenedor} onWheel={alRodar} onPointerDown={alBajar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerLeave={alSalir}>
        <svg role="img" aria-label="Diagrama de la red del colegio">
          <g className={`net-d-lienzo ${seleccionado ? "sel-activa" : ""}`} transform={`translate(${vista.x} ${vista.y}) scale(${vista.escala})`}>
            {anclaPendiente && cursor && <line className="net-d-enlace-pendiente" x1={anclaPendiente.x} y1={anclaPendiente.y} x2={cursor.x} y2={cursor.y} />}
            <DiagramaNodos layout={layout} ruta={ruta} ordenPuertosRuta={ordenPuertosRuta} paresRuta={paresRuta} seleccionado={seleccionado} origen={origen} corte={corte} editable={modo === "conectar"} reenlazando={Boolean(reenlace)} ordenando={modo === "ordenar"} onMover={mover} onPunto={alPunto} onFicha={onAbrir} onAlternar={alternar} onTomarPunta={tomarPunta} />
          </g>
        </svg>
      </div>
      <DiagramaLeyenda />

      {layout.bandeja.length > 0 && <div className="net-diagram-bandeja">
        <span className="net-label">SIN PUERTO ASIGNADO · {layout.bandeja.length}</span>
        {porGrupo.map(([grupo, fichas]) => <details key={grupo}>
          <summary>{grupo} · {fichas.length}</summary>
          <div className="net-chips">{fichas.map(ficha => <button key={ficha.id} type="button" className={origen === ficha.id ? "on" : ""} onClick={() => alPunto(ficha.id)} onDoubleClick={() => onAbrir(ficha.id)} title="Clic para seleccionar · doble clic para abrir la ficha">{ficha.etiqueta}</button>)}</div>
        </details>)}
      </div>}
    </div>
  );
}
