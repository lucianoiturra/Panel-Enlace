import Link from "next/link";

export default function NavSecciones({ activa }: { activa: "sala" | "red" }) {
  return (
    <nav className="net-tabs" aria-label="Secciones del panel">
      <Link href="/" className={activa === "sala" ? "active" : ""} aria-current={activa === "sala" ? "page" : undefined}>SALA</Link>
      <Link href="/red" className={activa === "red" ? "active" : ""} aria-current={activa === "red" ? "page" : undefined}>RED</Link>
    </nav>
  );
}
