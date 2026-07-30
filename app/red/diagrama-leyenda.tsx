const PUERTOS = [
  { clase: "ocupado", texto: "ocupado" },
  { clase: "libre", texto: "libre" },
  { clase: "desconocido", texto: "sin verificar" },
  { clase: "dañado", texto: "dañado" },
];

const ENLACES = [
  { color: "#182334", texto: "borde" },
  { color: "#a65330", texto: "uplink" },
  { color: "#294f7c", texto: "patch" },
  { color: "#237a52", texto: "roseta" },
];

export default function DiagramaLeyenda() {
  return (
    <div className="net-d-leyenda">
      {PUERTOS.map(item => <span key={item.clase}><i className={`pt ${item.clase}`} aria-hidden="true" />{item.texto}</span>)}
      <b aria-hidden="true" />
      {ENLACES.map(item => <span key={item.texto}><i className="ln" style={{ borderTopColor: item.color }} aria-hidden="true" />{item.texto}</span>)}
      <b aria-hidden="true" />
      <span className="aviso">┈ sin ruta al ISP</span>
      <span className="falla">╳ corte de la cadena</span>
    </div>
  );
}
