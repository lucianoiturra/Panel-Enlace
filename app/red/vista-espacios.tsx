"use client";

import { useState } from "react";
import { agruparPorTipo, ordenarEspacios, type CriterioOrden } from "../../lib/red/agrupar";
import { etiquetasEstadoEspacio, ID_SALA_COMPUTACION, type Categoria, type Cubiculo, type Puerto } from "../../lib/red/modelo";
import type { EspacioEfectivo } from "../../lib/red/estado-efectivo";

export type FormatoEspacios = "lista" | "cuadricula";

type Props = {
  espacios: EspacioEfectivo[];
  categorias: Categoria[];
  orden: CriterioOrden;
  agrupar: boolean;
  formato: FormatoEspacios;
  puertosDe: (id: string) => Puerto[];
  etiquetaDePuerto: (id: string) => string;
  cubiculos: Cubiculo[];
  seleccionado: string;
  onAbrir: (id: string) => void;
  onLimpiar: () => void;
};

const pluralizar = (cantidad: number, singular: string, plural = `${singular}s`) => `${cantidad} ${cantidad === 1 ? singular : plural}`;

export default function VistaEspacios({ espacios, categorias, orden, agrupar, formato, puertosDe, etiquetaDePuerto, cubiculos, seleccionado, onAbrir, onLimpiar }: Props) {
  const [gruposCerrados, setGruposCerrados] = useState<Set<string>>(new Set());

  if (!espacios.length) return (
    <div className="net-spaces-empty">
      <span aria-hidden="true">⌕</span>
      <div>
        <strong>No encontramos espacios</strong>
        <p>Prueba con otro nombre, puerto o combinación de filtros.</p>
      </div>
      <button type="button" className="secondary" onClick={onLimpiar}>Quitar filtros</button>
    </div>
  );

  const ordenados = ordenarEspacios(espacios, orden, categorias);
  const etiquetaTipo = (id: string) => categorias.find(categoria => categoria.id === id)?.nombre ?? "Sin tipo";

  const datosDe = (espacio: EspacioEfectivo) => {
    const puertos = puertosDe(espacio.id);
    return {
      puertos,
      tipo: etiquetaTipo(espacio.categoria),
      conexion: puertos.map(puerto => etiquetaDePuerto(puerto.id)).join(" · "),
      esSalaComputacion: espacio.id === ID_SALA_COMPUTACION,
    };
  };

  // La etiqueta de origen sin explicación se leería como ruido: el title dice
  // cuál testigo lo decide y en qué estado está.
  const estado = (espacio: EspacioEfectivo) => (
    <span className="net-space-state">
      <span className={`net-space-status ${espacio.estado}`}>
        <i aria-hidden="true" />
        {etiquetasEstadoEspacio[espacio.estado]}
      </span>
      <small
        className={`net-space-origin ${espacio.origen}`}
        title={espacio.origen === "auto"
          ? `Automático: el testigo ${espacio.testigoMac} está ${espacio.testigoPresente ? "presente" : "ausente"} en la red.`
          : "Manual: lo escribiste en la ficha. Asígnale un testigo para que se actualice solo."}
      >{espacio.origen === "auto" ? "auto" : "manual"}</small>
    </span>
  );

  // El texto va en su propio span y no suelto dentro del contenedor flex:
  // text-overflow no tiene efecto sobre un contenedor flex, así que el
  // ellipsis que esta fila declaraba nunca llegó a recortar nada.
  const conexion = (espacio: EspacioEfectivo) => {
    const datos = datosDe(espacio);
    return datos.puertos.length
      ? <span className="net-space-connection documented"><i aria-hidden="true">↳</i><span className="net-space-connection-texto">{datos.conexion}</span></span>
      : <span className="net-space-connection undocumented"><i aria-hidden="true">!</i><span className="net-space-connection-texto">Sin documentar</span></span>;
  };

  const fila = (espacio: EspacioEfectivo) => {
    const datos = datosDe(espacio);
    return (
      <button
        type="button"
        key={espacio.id}
        className={`net-space-row ${seleccionado === espacio.id ? "selected" : ""}`}
        onClick={() => onAbrir(espacio.id)}
        aria-label={`Abrir ${espacio.nombre}, ${datos.tipo}, ${etiquetasEstadoEspacio[espacio.estado]}, ${datos.puertos.length ? datos.conexion : "sin conexión documentada"}`}
      >
        <span className="net-space-primary">
          <strong>{espacio.nombre}</strong>
          {datos.esSalaComputacion && <small>{pluralizar(cubiculos.length, "cubículo")}</small>}
        </span>
        <span className="net-space-type">{datos.tipo}</span>
        <span className={`net-space-location ${espacio.ubicacion ? "" : "empty"}`}>{espacio.ubicacion || "—"}</span>
        {estado(espacio)}
        {conexion(espacio)}
        <span className="net-space-open" aria-hidden="true">›</span>
      </button>
    );
  };

  const tarjeta = (espacio: EspacioEfectivo) => {
    const datos = datosDe(espacio);
    return (
      <button
        type="button"
        key={espacio.id}
        className={`net-space-card ${seleccionado === espacio.id ? "selected" : ""}`}
        onClick={() => onAbrir(espacio.id)}
        aria-label={`Abrir ${espacio.nombre}, ${datos.tipo}, ${etiquetasEstadoEspacio[espacio.estado]}, ${datos.puertos.length ? datos.conexion : "sin conexión documentada"}`}
      >
        <span className="net-space-card-head">
          <strong>{espacio.nombre}</strong>
          <span aria-hidden="true">›</span>
        </span>
        <span className="net-space-card-meta">
          {!agrupar && <span>{datos.tipo}</span>}
          {espacio.ubicacion && <span>{espacio.ubicacion}</span>}
          {datos.esSalaComputacion && <span>{pluralizar(cubiculos.length, "cubículo")}</span>}
        </span>
        <span className="net-space-card-foot">
          {estado(espacio)}
          {conexion(espacio)}
        </span>
      </button>
    );
  };

  const contenido = (items: EspacioEfectivo[], mostrarCabecera = false) => formato === "lista" ? (
    <div className="net-space-list">
      {mostrarCabecera && <div className="net-space-list-head" aria-hidden="true">
        <span>Espacio</span><span>Tipo</span><span>Ubicación</span><span>Estado</span><span>Conexión</span><span />
      </div>}
      {items.map(fila)}
    </div>
  ) : <div className="net-space-grid">{items.map(tarjeta)}</div>;

  if (!agrupar) return contenido(ordenados, formato === "lista");

  return (
    <div className="net-space-groups">
      {formato === "lista" && <div className="net-space-list-head global" aria-hidden="true">
        <span>Espacio</span><span>Tipo</span><span>Ubicación</span><span>Estado</span><span>Conexión</span><span />
      </div>}
      {agruparPorTipo(ordenados, categorias).map(grupo => {
        const problemas = grupo.espacios.filter(espacio => espacio.estado !== "operativo").length;
        const sinDocumentar = grupo.espacios.filter(espacio => !puertosDe(espacio.id).length).length;
        const cerrado = gruposCerrados.has(grupo.id);
        return (
          <section className={`net-space-group ${cerrado ? "collapsed" : ""}`} key={grupo.id || "sin-tipo"} aria-labelledby={`grupo-${grupo.id || "sin-tipo"}`}>
            <button
              type="button"
              className="net-space-group-head"
              aria-expanded={!cerrado}
              aria-controls={`contenido-${grupo.id || "sin-tipo"}`}
              onClick={() => setGruposCerrados(actual => {
                const siguiente = new Set(actual);
                if (siguiente.has(grupo.id)) siguiente.delete(grupo.id);
                else siguiente.add(grupo.id);
                return siguiente;
              })}
            >
              <span className="net-space-group-title" id={`grupo-${grupo.id || "sin-tipo"}`}>
                <strong>{grupo.nombre}</strong>
                <small>{grupo.espacios.length}</small>
              </span>
              <span className="net-space-group-summary">
                {problemas ? <span>{pluralizar(problemas, "problema")}</span> : <span className="ok">Sin problemas</span>}
                <span>{pluralizar(sinDocumentar, "conexión", "conexiones")} sin documentar</span>
              </span>
              <span className="net-space-group-toggle" aria-hidden="true">⌃</span>
            </button>
            <div id={`contenido-${grupo.id || "sin-tipo"}`} hidden={cerrado}>{contenido(grupo.espacios)}</div>
          </section>
        );
      })}
    </div>
  );
}
