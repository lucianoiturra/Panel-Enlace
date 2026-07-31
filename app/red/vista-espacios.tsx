import { agruparPorTipo, ordenarEspacios, type CriterioOrden } from "../../lib/red/agrupar";
import { etiquetasEstadoEspacio, ID_SALA_COMPUTACION, type Categoria, type Cubiculo, type Espacio, type Puerto } from "../../lib/red/modelo";

type Props = {
  espacios: Espacio[];
  categorias: Categoria[];
  orden: CriterioOrden;
  agrupar: boolean;
  puertosDe: (id: string) => Puerto[];
  etiquetaDePuerto: (id: string) => string;
  cubiculos: Cubiculo[];
  seleccionado: string;
  onAbrir: (id: string) => void;
};

export default function VistaEspacios({ espacios, categorias, orden, agrupar, puertosDe, etiquetaDePuerto, cubiculos, seleccionado, onAbrir }: Props) {
  if (!espacios.length) return <p className="empty-state">Ningún espacio coincide con el filtro.</p>;

  const ordenados = ordenarEspacios(espacios, orden, categorias);
  const etiquetaTipo = (id: string) => categorias.find(categoria => categoria.id === id)?.nombre ?? "";

  const tarjeta = (espacio: Espacio) => {
    const puertos = puertosDe(espacio.id);
    const esSalaComputacion = espacio.id === ID_SALA_COMPUTACION;
    const tipo = etiquetaTipo(espacio.categoria);
    return (
      <button key={espacio.id} className={`net-card ${espacio.estado} ${seleccionado === espacio.id ? "selected" : ""}`} onClick={() => onAbrir(espacio.id)} aria-label={`${espacio.nombre}${tipo ? `, ${tipo}` : ""}, ${etiquetasEstadoEspacio[espacio.estado]}`}>
        <span className="net-card-name">{espacio.nombre}</span>
        {!agrupar && tipo && <span className="net-card-type">{tipo}</span>}
        {espacio.ubicacion && <span className="net-card-location">{espacio.ubicacion}</span>}
        {puertos.length ? <span className="net-card-port">{puertos.map(puerto => etiquetaDePuerto(puerto.id)).join(" · ")}</span> : <span className="net-card-port none">Sin puerto</span>}
        {esSalaComputacion && <span className="net-card-extra">{cubiculos.length} cubículos</span>}
      </button>
    );
  };

  if (!agrupar) return <div className="net-grid">{ordenados.map(tarjeta)}</div>;

  return (
    <div className="net-grupos">
      {agruparPorTipo(ordenados, categorias).map(grupo => (
        <section key={grupo.id || "sin-tipo"} aria-label={grupo.nombre}>
          <h3 className="net-grupo-titulo">{grupo.nombre} <span>{grupo.espacios.length}</span></h3>
          <div className="net-grid">{grupo.espacios.map(tarjeta)}</div>
        </section>
      ))}
    </div>
  );
}
