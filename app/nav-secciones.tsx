import Link from "next/link";

export default function NavSecciones({ activa }: { activa: "sala" | "red" | "monitoreo" | "salud" }) {
  return (
    <nav className="net-tabs" aria-label="Secciones del panel">
      <Link href="/" className={activa === "sala" ? "active" : ""} aria-current={activa === "sala" ? "page" : undefined}>SALA</Link>
      <Link href="/red" className={activa === "red" ? "active" : ""} aria-current={activa === "red" ? "page" : undefined}>RED</Link>
      <Link href="/monitoreo" className={activa === "monitoreo" ? "active" : ""} aria-current={activa === "monitoreo" ? "page" : undefined}>MONITOREO</Link>
    </nav>
  );
}
