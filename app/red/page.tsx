"use client";

import { useEffect, useMemo, useState } from "react";
import NavSecciones from "../nav-secciones";
import VistaEspacios from "./vista-espacios";
import VistaRacks from "./vista-racks";
import VistaCobertura from "./vista-cobertura";
import Diagrama from "./diagrama";
import Ficha from "./ficha";
import Captura, { type FilaSesion } from "./captura";
import { cadenaComoTexto, trazarCadena } from "../../lib/red/trazado";
import { estadosEspacio, etiquetaEndpoint, etiquetaPuerto, etiquetasEstadoEspacio, puertosDeEndpoint, type Enlace, type EstadoEspacio, type EstadoRed } from "../../lib/red/modelo";

const estadoVacio: EstadoRed = { racks: [], equipos: [], puertos: [], espacios: [], enlaces: [], bitacora: [], cubiculos: [] };

const cortosEstado: Record<EstadoEspacio, string> = { operativo: "OK", "solo-wifi": "≈", "sin-internet": "×", "sin-verificar": "?" };

const leerError = async (response: Response, respaldo: string) => {
  try {
    const datos = await response.json() as { error?: string };
    return datos.error || respaldo;
  } catch {
    return respaldo;
  }
};

export default function PaginaRed() {
  const [estado, setEstado] = useState<EstadoRed>(estadoVacio);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [filtro, setFiltro] = useState<EstadoEspacio | "todos">("todos");
  const [consulta, setConsulta] = useState("");
  const [seleccionado, setSeleccionado] = useState("");
  const [fichaAbierta, setFichaAbierta] = useState("");
  const [ultimaSync, setUltimaSync] = useState<Date | null>(null);
  const [aviso, setAviso] = useState("");
  const [tipoAviso, setTipoAviso] = useState<"success" | "error">("success");
  const [guardando, setGuardando] = useState(false);
  const [vista, setVista] = useState<"espacios" | "racks" | "cobertura" | "diagrama">("espacios");
  const [rackActivo, setRackActivo] = useState("");
  const [formatoRacks, setFormatoRacks] = useState<"tiras" | "lista">("tiras");
  const [capturaAbierta, setCapturaAbierta] = useState(false);
  const [sesion, setSesion] = useState<FilaSesion[]>([]);
  const rackVisible = rackActivo || estado.racks[0]?.id || "";

  const mostrarAviso = (mensaje: string, tipo: "success" | "error" = "success") => { setAviso(mensaje); setTipoAviso(tipo); };

  const cargar = async () => {
    setCargando(true);
    setErrorCarga("");
    try {
      const response = await fetch("/api/red");
      if (!response.ok) throw new Error(await leerError(response, "No fue posible cargar la red."));
      setEstado(await response.json() as EstadoRed);
      setUltimaSync(new Date());
    } catch (error) {
      setErrorCarga(`${error instanceof Error ? error.message : "No se pudo conectar con el almacenamiento."} Revisa la conexión e inténtalo nuevamente.`);
      mostrarAviso("No se pudieron cargar los datos de la red.", "error");
    } finally {
      setCargando(false);
    }
  };

  const cadenaFicha = useMemo(() => trazarCadena(estado, fichaAbierta), [estado, fichaAbierta]);
  const abrirFicha = (id: string) => { setSeleccionado(id); setFichaAbierta(id); };

  const pedir = async (url: string, opciones: RequestInit, respaldo: string) => {
    const response = await fetch(url, opciones);
    if (!response.ok) throw new Error(await leerError(response, respaldo));
    return response;
  };

  const conGuardado = async (accion: () => Promise<void>, exito: string) => {
    if (guardando) return;
    setGuardando(true);
    try {
      await accion();
      await cargar();
      mostrarAviso(exito);
    } catch (error) {
      mostrarAviso(error instanceof Error ? error.message : "No fue posible guardar el cambio.", "error");
    } finally {
      setGuardando(false);
    }
  };

  const guardarCampos = (cambios: { estado?: string; nota?: string }) => conGuardado(async () => {
    const tipo = fichaAbierta.startsWith("esp:") ? "espacio" : "puerto";
    await pedir("/api/red", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, id: fichaAbierta, ...cambios }) }, "No fue posible guardar los cambios.");
  }, "Cambio guardado.");

  const crearEnlace = (puertoId: string, nota: string) => conGuardado(async () => {
    await pedir("/api/red/enlaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: fichaAbierta, b: puertoId, nota }) }, "No fue posible crear el enlace.");
  }, "Puerto asignado.");

  const borrarEnlace = (id: number) => conGuardado(async () => {
    await pedir(`/api/red/enlaces?id=${id}`, { method: "DELETE" }, "No fue posible quitar el enlace.");
  }, "Enlace quitado.");

  // Primero se crea el enlace nuevo y solo después se borra el viejo: al revés,
  // si el destino ya estuviera ocupado o el POST fallara, el cable original se
  // habría perdido sin nada que lo reemplace.
  const reenlazar = (enlaceId: number, fijo: string, destino: string) => conGuardado(async () => {
    await pedir("/api/red/enlaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: fijo, b: destino }) }, "No fue posible mover el enlace.");
    await pedir(`/api/red/enlaces?id=${enlaceId}`, { method: "DELETE" }, "El enlace nuevo quedó creado, pero no se pudo quitar el anterior.");
  }, "Enlace reconectado.");

  const asignarRapido = (a: string, b: string) => {
    const provisional = -Date.now();
    const texto = `${etiquetaEndpoint(estado, a)} → ${etiquetaEndpoint(estado, b)}`;
    setEstado(actual => ({
      ...actual,
      enlaces: [...actual.enlaces, { id: provisional, a, b, tipo: "roseta", nota: "" }],
      puertos: actual.puertos.map(puerto => (puerto.id === a || puerto.id === b) && puerto.estado === "libre" ? { ...puerto, estado: "ocupado" } : puerto),
    }));
    void (async () => {
      try {
        const response = await pedir("/api/red/enlaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a, b }) }, "No fue posible asignar el puerto.");
        const { enlace } = await response.json() as { enlace: Enlace };
        setEstado(actual => ({ ...actual, enlaces: actual.enlaces.map(candidato => candidato.id === provisional ? enlace : candidato) }));
        setSesion(actual => [{ enlaceId: enlace.id, texto }, ...actual]);
      } catch (error) {
        setEstado(actual => ({ ...actual, enlaces: actual.enlaces.filter(candidato => candidato.id !== provisional) }));
        mostrarAviso(`${error instanceof Error ? error.message : "No fue posible asignar el puerto."} (${texto})`, "error");
        void cargar();
      }
    })();
  };

  const marcarLibre = (puertoId: string) => {
    void (async () => {
      try {
        await pedir("/api/red", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: "puerto", id: puertoId, estado: "libre" }) }, "No fue posible marcar el puerto.");
        setEstado(actual => ({ ...actual, puertos: actual.puertos.map(puerto => puerto.id === puertoId ? { ...puerto, estado: "libre" } : puerto) }));
      } catch (error) {
        mostrarAviso(error instanceof Error ? error.message : "No fue posible marcar el puerto.", "error");
        void cargar();
      }
    })();
  };

  const deshacerAsignacion = (enlaceId: number) => {
    void (async () => {
      try {
        await pedir(`/api/red/enlaces?id=${enlaceId}`, { method: "DELETE" }, "No fue posible deshacer la asignación.");
        setSesion(actual => actual.filter(fila => fila.enlaceId !== enlaceId));
        await cargar();
      } catch (error) {
        mostrarAviso(error instanceof Error ? error.message : "No fue posible deshacer la asignación.", "error");
      }
    })();
  };

  useEffect(() => {
    const temporizador = window.setTimeout(() => void cargar(), 0);
    return () => window.clearTimeout(temporizador);
    // Carga inicial; los refrescos manuales llaman a cargar directamente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      const inicial = new URLSearchParams(window.location.search).get("endpoint") ?? "";
      if (/^(pto|esp|cub):/.test(inicial)) { setSeleccionado(inicial); setFichaAbierta(inicial); }
    }, 0);
    return () => window.clearTimeout(temporizador);
  }, []);

  useEffect(() => {
    if (!fichaAbierta) return;
    const alTeclear = (evento: KeyboardEvent) => { if (evento.key === "Escape") { evento.preventDefault(); setFichaAbierta(""); } };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [fichaAbierta]);

  useEffect(() => {
    if (!fichaAbierta) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = anterior; };
  }, [fichaAbierta]);

  const conteos = useMemo(() => Object.fromEntries(estadosEspacio.map(valor => [valor, estado.espacios.filter(espacio => espacio.estado === valor).length])) as Record<EstadoEspacio, number>, [estado.espacios]);

  const puertosDe = (id: string) => puertosDeEndpoint(estado, id);
  const etiquetaDePuerto = (id: string) => etiquetaPuerto(estado, id);

  const pendientes = useMemo(() => {
    const endpoints = [...estado.espacios.map(espacio => espacio.id), ...estado.cubiculos.map(cubiculo => `cub:${cubiculo.id}`)];
    return {
      sinPuerto: endpoints.filter(id => !puertosDeEndpoint(estado, id).length).length,
      sinEtiqueta: estado.puertos.filter(puerto => puerto.nota === "sin etiquetar en el levantamiento").length,
      desconocidos: estado.puertos.filter(puerto => puerto.nota === "destino desconocido según canvas").length,
    };
  }, [estado]);

  const espaciosVisibles = useMemo(() => {
    const texto = consulta.trim().toLowerCase();
    return estado.espacios.filter(espacio => {
      if (filtro !== "todos" && espacio.estado !== filtro) return false;
      if (!texto) return true;
      const puertos = puertosDeEndpoint(estado, espacio.id).map(puerto => etiquetaPuerto(estado, puerto.id)).join(" ");
      return `${espacio.nombre} ${espacio.categoria} ${puertos}`.toLowerCase().includes(texto);
    });
  }, [estado, filtro, consulta]);

  const coincidenciaBuscador = useMemo(() => {
    const texto = consulta.trim().toLowerCase();
    if (texto.length < 2) return "";
    const normalizar = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const buscado = normalizar(texto);
    const espacio = estado.espacios.find(candidato => normalizar(candidato.nombre).includes(buscado));
    if (espacio) return espacio.id;
    const cubiculo = estado.cubiculos.find(candidato => `cubiculo ${candidato.id}`.includes(buscado) || `cub ${candidato.id}` === buscado);
    if (cubiculo) return `cub:${cubiculo.id}`;
    const puerto = estado.puertos.find(candidato => normalizar(etiquetaPuerto(estado, candidato.id)).replace(/[\s/]/g, "").includes(buscado.replace(/[\s/]/g, "")));
    return puerto?.id ?? "";
  }, [consulta, estado]);

  const cadenaBuscador = useMemo(() => trazarCadena(estado, coincidenciaBuscador), [estado, coincidenciaBuscador]);

  const copiarCadenaBuscador = async () => {
    await navigator.clipboard.writeText(cadenaComoTexto(cadenaBuscador));
    mostrarAviso("Cadena copiada.");
  };

  const copiarTexto = (texto: string) => void (async () => {
    try {
      await navigator.clipboard.writeText(texto);
      mostrarAviso("Cadena copiada.");
    } catch {
      mostrarAviso("No fue posible copiar la cadena.", "error");
    }
  })();

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">SE</span><div><strong>Sala de Enlace</strong><span>Red del colegio</span></div><NavSecciones activa="red" /></div>
        <div className="header-actions"><button className="icon-button" onClick={() => void cargar()} aria-label={cargando ? "Actualizando datos" : "Actualizar datos"} disabled={cargando}>{cargando ? "…" : "↻"}</button><div className="date-chip"><span>ÚLTIMA SINCRONIZACIÓN</span><b>{ultimaSync ? new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(ultimaSync) : "Sin sincronizar"}</b></div></div>
      </header>

      <section className="shell">
        {errorCarga && <div className="error-banner" role="alert"><span>{errorCarga}</span><button type="button" onClick={() => void cargar()} disabled={cargando}>{cargando ? "Reintentando…" : "Reintentar"}</button></div>}
        <div className="workspace-head"><div><h1>Red del colegio</h1><p className="subtitle">{estado.racks.length} racks · {estado.puertos.filter(puerto => puerto.n > 0).length} puertos · {estado.espacios.length} espacios · {estado.cubiculos.length} cubículos.</p></div><button className="secondary toolbar-action" onClick={() => setCapturaAbierta(true)}>Captura rápida</button></div>

        <section className="status-rail" aria-label="Filtros y pendientes de la red">
          <div className="status-filters">
            {estadosEspacio.map(valor => <button key={valor} className={`status-filter ${valor === "operativo" ? "operational" : valor === "sin-internet" ? "offline" : valor === "solo-wifi" ? "attention" : "pending"} ${filtro === valor ? "active" : ""}`} aria-pressed={filtro === valor} onClick={() => setFiltro(filtro === valor ? "todos" : valor)}><i aria-hidden="true">{cortosEstado[valor]}</i><strong>{conteos[valor]}</strong><span>{etiquetasEstadoEspacio[valor]}</span></button>)}
          </div>
          <p className="pending-line"><span><strong>{pendientes.sinPuerto}</strong> sin puerto</span><span><strong>{pendientes.sinEtiqueta}</strong> puertos sin etiqueta</span><span><strong>{pendientes.desconocidos}</strong> destinos desconocidos</span></p>
        </section>

        <section className="room-surface">
          <div className="room-toolbar">
            <h2>{vista === "espacios" ? "Espacios del colegio" : vista === "racks" ? "Racks y puertos" : vista === "cobertura" ? "Cobertura del levantamiento" : "Diagrama de la red"}</h2>
            <div className="net-toolbar-right">
              <div className="net-seg" role="group" aria-label="Vista">
                <button className={vista === "espacios" ? "on" : ""} aria-pressed={vista === "espacios"} onClick={() => setVista("espacios")}>ESPACIOS</button>
                <button className={vista === "racks" ? "on" : ""} aria-pressed={vista === "racks"} onClick={() => setVista("racks")}>RACKS</button>
                <button className={vista === "cobertura" ? "on" : ""} aria-pressed={vista === "cobertura"} onClick={() => setVista("cobertura")}>COBERTURA</button>
                <button className={vista === "diagrama" ? "on" : ""} aria-pressed={vista === "diagrama"} onClick={() => setVista("diagrama")}>DIAGRAMA</button>
              </div>
              <label className="search"><span aria-hidden="true">⌕</span><span className="sr-only">Buscar espacio, cubículo o puerto</span><input value={consulta} aria-label="Buscar espacio, cubículo o puerto" onChange={event => setConsulta(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && coincidenciaBuscador) setSeleccionado(coincidenciaBuscador); }} placeholder="Buscar espacio, cubículo o puerto" /></label>
            </div>
          </div>
          {coincidenciaBuscador && <div className="net-quick"><span className="net-quick-chain">{cadenaComoTexto(cadenaBuscador)}</span><div className="net-quick-actions"><button className="secondary" type="button" onClick={() => void copiarCadenaBuscador()}>Copiar</button><button className="secondary" type="button" onClick={() => abrirFicha(coincidenciaBuscador)}>Abrir ficha</button></div></div>}
          <div className={cargando ? "net-body is-loading" : "net-body"}>
            {vista === "espacios"
              ? <VistaEspacios espacios={espaciosVisibles} puertosDe={puertosDe} etiquetaDePuerto={etiquetaDePuerto} cubiculos={estado.cubiculos} seleccionado={seleccionado} onAbrir={abrirFicha} />
              : vista === "racks"
                ? <VistaRacks estado={estado} rackActivo={rackVisible} onRack={setRackActivo} formato={formatoRacks} onFormato={setFormatoRacks} seleccionado={seleccionado} onAbrir={abrirFicha} />
                : vista === "cobertura"
                  ? <VistaCobertura estado={estado} onAbrir={abrirFicha} />
                  : <Diagrama estado={estado} seleccionado={seleccionado} centrarEn={vista === "diagrama" ? coincidenciaBuscador : ""} onAbrir={abrirFicha} onSeleccionar={setSeleccionado} onConectar={asignarRapido} onReenlazar={reenlazar} onAviso={mensaje => mostrarAviso(mensaje, "error")} onCopiar={copiarTexto} />}
          </div>
        </section>
      </section>

      {fichaAbierta && <Ficha key={fichaAbierta} estado={estado} endpointId={fichaAbierta} cadena={cadenaFicha} guardando={guardando} onCerrar={() => setFichaAbierta("")} onGuardarCampos={guardarCampos} onCrearEnlace={crearEnlace} onBorrarEnlace={borrarEnlace} />}
      {fichaAbierta && <button className="backdrop" onClick={() => setFichaAbierta("")} aria-label="Cerrar ficha" />}
      {capturaAbierta && <Captura estado={estado} sesion={sesion} puertoInicial={seleccionado.startsWith("pto:") ? seleccionado : ""} onCerrar={() => setCapturaAbierta(false)} onAsignar={asignarRapido} onMarcarLibre={marcarLibre} onDeshacer={deshacerAsignacion} />}
      {aviso && <div className={`toast ${tipoAviso}`} role={tipoAviso === "error" ? "alert" : "status"} aria-live="polite">{aviso}</div>}
    </main>
  );
}
