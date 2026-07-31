import { useMemo } from "react";
import { estadosPuerto, etiquetaCategoria, etiquetaEndpoint, etiquetaPuerto, etiquetasEstadoPuerto, puertosDeEndpoint, type EstadoRed } from "../../lib/red/modelo";

type Props = { estado: EstadoRed; onAbrir: (id: string) => void };

export default function VistaCobertura({ estado, onAbrir }: Props) {
  const resumen = useMemo(() => {
    const endpoints = [
      ...estado.espacios.map(espacio => ({ id: espacio.id, nombre: espacio.nombre, grupo: etiquetaCategoria(estado, espacio.categoria) })),
      ...estado.cubiculos.map(cubiculo => ({ id: `cub:${cubiculo.id}`, nombre: `Cubículo ${cubiculo.id}`, grupo: "Cubículos" })),
    ];
    const sinPuerto = endpoints.filter(endpoint => !puertosDeEndpoint(estado, endpoint.id).length);
    return {
      total: endpoints.length,
      asignados: endpoints.length - sinPuerto.length,
      sinPuerto,
      sinEtiqueta: estado.puertos.filter(puerto => puerto.nota === "sin etiquetar en el levantamiento"),
      desconocidos: estado.puertos.filter(puerto => puerto.nota === "destino desconocido según canvas"),
      revisar: estado.bitacora.filter(entrada => entrada.tipo === "revisar"),
    };
  }, [estado]);

  const porRack = useMemo(() => estado.racks.map(rack => {
    const puertos = estado.puertos.filter(puerto => puerto.n > 0 && estado.equipos.some(equipo => equipo.id === puerto.equipo && equipo.rack === rack.id));
    return { rack, total: puertos.length, porEstado: estadosPuerto.map(valor => ({ valor, cuantos: puertos.filter(puerto => puerto.estado === valor).length })) };
  }), [estado]);

  const porcentaje = resumen.total ? Math.round((resumen.asignados / resumen.total) * 100) : 0;
  const cambios = estado.bitacora.filter(entrada => entrada.tipo !== "revisar").slice(0, 50);

  return (
    <div className="net-cov">
      <section className="net-cov-top">
        <div>
          <span className="net-label">AVANCE DEL LEVANTAMIENTO</span>
          <p className="net-cov-big"><b>{resumen.asignados}</b> de {resumen.total} puntos con puerto asignado</p>
          <div className="net-bar" role="img" aria-label={`${porcentaje} por ciento asignado`}><i style={{ width: `${porcentaje}%` }} /></div>
        </div>
        <ul className="net-cov-nums">
          <li><b>{resumen.sinPuerto.length}</b><span>sin puerto</span></li>
          <li><b>{resumen.sinEtiqueta.length}</b><span>puertos sin etiqueta</span></li>
          <li><b>{resumen.desconocidos.length}</b><span>destinos desconocidos</span></li>
          <li><b>{resumen.revisar.length}</b><span>casos por revisar</span></li>
        </ul>
      </section>

      <section className="net-cov-racks">
        <span className="net-label">PUERTOS POR RACK</span>
        <table className="net-table">
          <thead><tr><th>RACK</th><th>TOTAL</th>{estadosPuerto.map(valor => <th key={valor}>{etiquetasEstadoPuerto[valor].toUpperCase()}</th>)}</tr></thead>
          <tbody>{porRack.map(fila => <tr key={fila.rack.id}><td>{fila.rack.id} · {fila.rack.ubicacion || fila.rack.nombre}</td><td>{fila.total}</td>{fila.porEstado.map(dato => <td key={dato.valor}>{dato.cuantos}</td>)}</tr>)}</tbody>
        </table>
      </section>

      <section className="net-cov-pend">
        <span className="net-label">PENDIENTES</span>
        <details open><summary>{resumen.sinPuerto.length} puntos sin puerto asignado</summary>
          <div className="net-chips">{resumen.sinPuerto.map(endpoint => <button key={endpoint.id} onClick={() => onAbrir(endpoint.id)}>{endpoint.nombre}<small>{endpoint.grupo}</small></button>)}</div>
        </details>
        <details><summary>{resumen.sinEtiqueta.length} puertos sin etiquetar en el levantamiento</summary>
          <div className="net-chips">{resumen.sinEtiqueta.map(puerto => <button key={puerto.id} onClick={() => onAbrir(puerto.id)}>{etiquetaPuerto(estado, puerto.id)}</button>)}</div>
        </details>
        <details><summary>{resumen.desconocidos.length} puertos con destino desconocido</summary>
          <div className="net-chips">{resumen.desconocidos.map(puerto => <button key={puerto.id} onClick={() => onAbrir(puerto.id)}>{etiquetaPuerto(estado, puerto.id)}</button>)}</div>
        </details>
        <details><summary>{resumen.revisar.length} casos marcados para revisar en la importación</summary>
          <ul className="net-cov-list">{resumen.revisar.map(entrada => <li key={entrada.id}><b>{entrada.objetivo.startsWith("esp:") || entrada.objetivo.startsWith("pto:") ? etiquetaEndpoint(estado, entrada.objetivo) : entrada.objetivo}</b> {entrada.nota}</li>)}</ul>
        </details>
      </section>

      <section className="net-cov-log">
        <span className="net-label">ÚLTIMOS CAMBIOS</span>
        {cambios.length ? <ul className="net-cov-list">{cambios.map(entrada => <li key={entrada.id}><b>{new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(entrada.fecha))}</b> {entrada.tipo} · {entrada.objetivo.startsWith("esp:") || entrada.objetivo.startsWith("pto:") ? etiquetaEndpoint(estado, entrada.objetivo) : entrada.objetivo} {entrada.antes && `· ${entrada.antes} →`} {entrada.despues}</li>)}</ul> : <p className="empty-state">Todavía no hay cambios registrados.</p>}
      </section>
    </div>
  );
}
