import { etiquetasEstadoEspacio, ID_SALA_COMPUTACION, type Cubiculo, type Espacio, type Puerto } from "../../lib/red/modelo";

type Props = {
  espacios: Espacio[];
  puertosDe: (id: string) => Puerto[];
  etiquetaDePuerto: (id: string) => string;
  cubiculos: Cubiculo[];
  seleccionado: string;
  onAbrir: (id: string) => void;
};

export default function VistaEspacios({ espacios, puertosDe, etiquetaDePuerto, cubiculos, seleccionado, onAbrir }: Props) {
  if (!espacios.length) return <p className="empty-state">Ningún espacio coincide con el filtro.</p>;
  return (
    <div className="net-grid">
      {espacios.map(espacio => {
        const puertos = puertosDe(espacio.id);
        const esSalaComputacion = espacio.id === ID_SALA_COMPUTACION;
        return (
          <button key={espacio.id} className={`net-card ${espacio.estado} ${seleccionado === espacio.id ? "selected" : ""}`} onClick={() => onAbrir(espacio.id)} aria-label={`${espacio.nombre}, ${etiquetasEstadoEspacio[espacio.estado]}`}>
            <span className="net-card-name">{espacio.nombre}</span>
            {puertos.length ? <span className="net-card-port">{puertos.map(puerto => etiquetaDePuerto(puerto.id)).join(" · ")}</span> : <span className="net-card-port none">Sin puerto</span>}
            {esSalaComputacion && <span className="net-card-extra">{cubiculos.length} cubículos</span>}
          </button>
        );
      })}
    </div>
  );
}
