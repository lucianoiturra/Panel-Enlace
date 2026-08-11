import Link from "next/link";
import PuntoSalud from "./punto-salud";

export default function NavSecciones({ activa }: { activa: "sala" | "red" | "monitoreo" | "salud" }) {
  return (
    <nav className="net-tabs" aria-label="Secciones del panel">
      <Link href="/" className={activa === "sala" ? "active" : ""} aria-current={activa === "sala" ? "page" : undefined}>SALA</Link>
      <Link href="/red" className={activa === "red" ? "active" : ""} aria-current={activa === "red" ? "page" : undefined}>RED</Link>
      <Link href="/monitoreo" className={activa === "monitoreo" ? "active" : ""} aria-current={activa === "monitoreo" ? "page" : undefined}>MONITOREO</Link>
      <Link href="/salud" className={activa === "salud" ? "active" : ""} aria-current={activa === "salud" ? "page" : undefined}>SALUD<PuntoSalud /></Link>
    </nav>
  );
}
