import type { Metadata } from "next";
import { Manrope, Space_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const mono = Space_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "700"] });

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("host") ?? "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "Sala de Enlace · Control de equipamiento",
    description: "Panel de inventario, estado y mantenimiento de los 40 cubículos de la sala de computación.",
    openGraph: { title: "Sala de Enlace", description: "Control de equipamiento · 40 cubículos", images: [image] },
    twitter: { card: "summary_large_image", title: "Sala de Enlace", description: "Control de equipamiento · 40 cubículos", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body className={`${manrope.variable} ${mono.variable}`}>{children}</body></html>;
}
