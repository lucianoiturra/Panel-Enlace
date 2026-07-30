import { useMemo } from "react";
import { cadenaComoTexto, trazarCircuito } from "../../lib/red/trazado";
import { etiquetaEndpoint, etiquetaPuerto, etiquetasEstadoPuerto, prefijoDe, type EstadoRed } from "../../lib/red/modelo";

type Props = {
  estado: EstadoRed;
  rackActivo: string;
  onRack: (id: string) => void;
  formato: "tiras" | "lista";
  onFormato: (formato: "tiras" | "lista") => void;
  seleccionado: string;
  onAbrir: (id: string) => void;
};

export default function VistaRacks({ estado, rackActivo, onRack, formato, onFormato, seleccionado, onAbrir }: Props) {
  const equipos = useMemo(() => estado.equipos.filter(equipo => equipo.rack === rackActivo && equipo.puertos > 0).sort((a, b) => a.y - b.y), [estado.equipos, rackActivo]);
  const puertosDelRack = useMemo(() => estado.puertos.filter(puerto => equipos.some(equipo => equipo.id === puerto.equipo)), [estado.puertos, equipos]);

  const destinos = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const enlace of estado.enlaces) {
      const pares: [string, string][] = [[enlace.a, enlace.b], [enlace.b, enlace.a]];
      for (const [uno, otro] of pares) {
        if (prefijoDe(uno) !== "pto" || prefijoDe(otro) === "pto") continue;
        mapa.set(uno, etiquetaEndpoint(estado, otro));
      }
    }
    return mapa;
  }, [estado]);

  const cadenas = useMemo(() => {
    if (formato !== "lista") return new Map<string, string>();
    return new Map(puertosDelRack.map(puerto => [puerto.id, cadenaComoTexto(trazarCircuito(estado, puerto.id))]));
  }, [estado, formato, puertosDelRack]);

  return (
    <div className="net-racks">
      <div className="net-racks-bar">
        <div className="net-seg" role="group" aria-label="Rack">
          {estado.racks.map(rack => <button key={rack.id} className={rackActivo === rack.id ? "on" : ""} aria-pressed={rackActivo === rack.id} onClick={() => onRack(rack.id)}>{rack.id}</button>)}
        </div>
        <div className="net-seg" role="group" aria-label="Formato">
          <button className={formato === "tiras" ? "on" : ""} aria-pressed={formato === "tiras"} onClick={() => onFormato("tiras")}>TIRAS</button>
          <button className={formato === "lista" ? "on" : ""} aria-pressed={formato === "lista"} onClick={() => onFormato("lista")}>LISTA</button>
        </div>
      </div>

      <p className="net-rack-name">{estado.racks.find(rack => rack.id === rackActivo)?.nombre}{estado.racks.find(rack => rack.id === rackActivo)?.notas ? <small>{estado.racks.find(rack => rack.id === rackActivo)?.notas}</small> : null}</p>

      {formato === "tiras" ? equipos.map(equipo => {
        const puertos = puertosDelRack.filter(puerto => puerto.equipo === equipo.id).sort((a, b) => a.n - b.n);
        const ocupados = puertos.filter(puerto => puerto.estado === "ocupado").length;
        return (
          <section className="net-eq" key={equipo.id} aria-label={equipo.etiqueta}>
            <div className="net-eq-head"><b>{equipo.id.replace("-", "/")} · {equipo.etiqueta}</b><small>{ocupados} de {puertos.length} ocupados{equipo.modelo ? ` · ${equipo.modelo}` : ""}</small></div>
            <div className="net-strip">
              {puertos.map(puerto => <button key={puerto.id} className={`net-pt ${puerto.estado} ${seleccionado === puerto.id ? "selected" : ""}`} onClick={() => onAbrir(puerto.id)} title={`${etiquetaPuerto(estado, puerto.id)} · ${etiquetasEstadoPuerto[puerto.estado]}${destinos.get(puerto.id) ? ` · ${destinos.get(puerto.id)}` : ""}`} aria-label={`Puerto ${puerto.n}, ${etiquetasEstadoPuerto[puerto.estado]}${destinos.get(puerto.id) ? `, ${destinos.get(puerto.id)}` : ""}`}>{puerto.n}</button>)}
            </div>
          </section>
        );
      }) : (
        <div className="net-table-wrap">
          <table className="net-table">
            <thead><tr><th>PUERTO</th><th>ESTADO</th><th>DESTINO</th><th>CADENA HASTA EL BORDE</th></tr></thead>
            <tbody>
              {equipos.map(equipo => [
                <tr className="net-group" key={equipo.id}><td colSpan={4}>{equipo.id.replace("-", "/")} · {equipo.etiqueta} · {equipo.puertos} puertos</td></tr>,
                ...puertosDelRack.filter(puerto => puerto.equipo === equipo.id).sort((a, b) => a.n - b.n).map(puerto => (
                  <tr key={puerto.id} className={seleccionado === puerto.id ? "selected" : ""} onClick={() => onAbrir(puerto.id)} tabIndex={0} onKeyDown={evento => { if (evento.key === "Enter") onAbrir(puerto.id); }}>
                    <td>{etiquetaPuerto(estado, puerto.id)}</td>
                    <td>{etiquetasEstadoPuerto[puerto.estado]}</td>
                    <td>{destinos.get(puerto.id) ?? <span className="net-none">sin asignar</span>}</td>
                    <td className="net-mono">{cadenas.get(puerto.id)}</td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
