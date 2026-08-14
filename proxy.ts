import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { decidirAcceso } from "./lib/auth-basic";

// Se avisa una vez por proceso: repetirlo en cada petición enterraría el resto
// del log justo cuando hay algo que leer.
let avisado = false;

export function proxy(request: NextRequest) {
  const decision = decidirAcceso(request.headers.get("authorization"), process.env.APP_USERNAME, process.env.APP_PASSWORD);
  if (decision === "adelante") return NextResponse.next();

  // Antes, faltando las credenciales fuera de Vercel, esto devolvía
  // NextResponse.next(): el panel y todas sus API quedaban sin autenticación,
  // sin aviso y sin log. Y fuera de Vercel es el camino normal, no el raro. Un
  // guardia que falla abierto no es un guardia: sin credenciales no pasa nadie,
  // corra donde corra.
  if (decision === "sin-configurar") {
    if (!avisado) {
      avisado = true;
      console.error("proxy: faltan APP_USERNAME o APP_PASSWORD, así que se rechaza todo el tráfico con 503.");
    }
    return new NextResponse("Falta configurar el acceso privado de la aplicación.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return new NextResponse("Autenticación requerida.", {
    status: 401,
    headers: {
      "Cache-Control": "no-store",
      "WWW-Authenticate": 'Basic realm="Panel Enlace", charset="UTF-8"',
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg|og.png).*)"],
};
