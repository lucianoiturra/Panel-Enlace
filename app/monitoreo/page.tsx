import { redirect } from "next/navigation";

// La pestaña se disolvió el 2026-08-12: los cubículos viven en SALA, el estado
// por ubicación y el testigo en RED, y los equipos sin documentar en SALUD.
// La ruta sobrevive sólo para no romper un enlace guardado o un marcador.
export default function Monitoreo() {
  redirect("/");
}
