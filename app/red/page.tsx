"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import NavSecciones from "../nav-secciones";
import VistaEspacios, { type FormatoEspacios } from "./vista-espacios";
import VistaRacks from "./vista-racks";
import VistaCobertura from "./vista-cobertura";
import Diagrama from "./diagrama";
import Ficha from "./ficha";
import Captura, { type FilaSesion } from "./captura";
import NuevoRecurso, { type RecursoNuevo } from "./nuevo-recurso";
import LimpiarConexiones from "./limpiar-conexiones";
import TiposEspacio from "./tipos-espacio";
import EliminarEspacio from "./eliminar-espacio";
import { cadenaComoTexto, trazarCircuito } from "../../lib/red/trazado";
import { aliasCubiculo, normalizar } from "../../lib/red/busqueda";
import { criteriosOrden, etiquetasCriterioOrden, type CriterioOrden } from "../../lib/red/agrupar";
import { estadosEspacio, etiquetaEndpoint, etiquetaPuerto, etiquetasEstadoEspacio, planEliminarEspacio, puertosDeEndpoint, type Enlace, type EstadoEspacio, type EstadoRed } from "../../lib/red/modelo";

const estadoVacio: EstadoRed = { racks: [], equipos: [], puertos: [], espacios: [], enlaces: [], bitacora: [], cubiculos: [], categorias: [], orden: {} };

type FiltroConexion = "todos" | "con-puerto" | "sin-puerto";

const coincideBusqueda = (valor: string, consulta: string) => {
  const objetivo = normalizar(valor);
  const terminos = normalizar(consulta).split(" ").filter(Boolean);
  return terminos.length > 0 && terminos.every(termino => objetivo.includes(termino));
};

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
  const [filtroConexion, setFiltroConexion] = useState<FiltroConexion>("todos");
  const [filtroCategoria, setFiltroCategoria] = useState("todos");
  const [consulta, setConsulta] = useState("");
  const buscadorRef = useRef<HTMLInputElement>(null);
  const [seleccionado, setSeleccionado] = useState("");
  const [fichaAbierta, setFichaAbierta] = useState("");
  const [ultimaSync, setUltimaSync] = useState<Date | null>(null);
  const [aviso, setAviso] = useState("");
  const [avisoId, setAvisoId] = useState(0);
  const [tipoAviso, setTipoAviso] = useState<"success" | "error">("success");
  const [guardando, setGuardando] = useState(false);
  const [vista, setVista] = useState<"espacios" | "racks" | "cobertura" | "diagrama">("espacios");
  const [rackActivo, setRackActivo] = useState("");
  const [formatoRacks, setFormatoRacks] = useState<"tiras" | "lista">("tiras");
  const [capturaAbierta, setCapturaAbierta] = useState(false);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [limpiezaAbierta, setLimpiezaAbierta] = useState(false);
  const [tiposAbierto, setTiposAbierto] = useState(false);
  const [porEliminar, setPorEliminar] = useState("");
  const [ordenEspacios, setOrdenEspacios] = useState<CriterioOrden>("nombre");
  const [agrupar, setAgrupar] = useState(true);
  const [formatoEspacios, setFormatoEspacios] = useState<FormatoEspacios>("lista");
  const [filtrosMovilAbiertos, setFiltrosMovilAbiertos] = useState(false);
  const [sesion, setSesion] = useState<FilaSesion[]>([]);
  const rackVisible = rackActivo || estado.racks[0]?.id || "";

  const mostrarAviso = (mensaje: string, tipo: "success" | "error" = "success") => {
    setAviso(mensaje);
    setTipoAviso(tipo);
    setAvisoId(actual => actual + 1);
  };

  useEffect(() => {
    if (!aviso) return;
    const temporizador = window.setTimeout(() => setAviso(""), 4500);
    return () => window.clearTimeout(temporizador);
  }, [aviso, avisoId]);

  const cargar = async () => {
    setCargando(true);
    setErrorCarga("");
    try {
      const response = await fetch("/api/red");
      if (!response.ok) throw new Error(await leerError(response, "No fue posible cargar la red."));
      setEstado(await response.json() as EstadoRed);
      setUltimaSync(new Date());
      return true;
    } catch (error) {
      setErrorCarga(`${error instanceof Error ? error.message : "No se pudo conectar con el almacenamiento."} Revisa la conexión e inténtalo nuevamente.`);
      mostrarAviso("No se pudieron cargar los datos de la red.", "error");
      return false;
    } finally {
      setCargando(false);
    }
  };

  const cadenaFicha = useMemo(() => trazarCircuito(estado, fichaAbierta), [estado, fichaAbierta]);
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
      const recargado = await cargar();
      if (recargado) mostrarAviso(exito);
      else mostrarAviso(`${exito} No fue posible refrescar la vista; vuelve a cargarla.`, "error");
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

  const guardarRecurso = (cambios: RecursoNuevo & { id: string }) => conGuardado(async () => {
    await pedir("/api/red/recursos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    }, "No fue posible guardar los datos.");
  }, "Datos actualizados.");

  const crearRecurso = (recurso: RecursoNuevo) => {
    if (guardando) return;
    void (async () => {
      setGuardando(true);
      try {
        const response = await pedir("/api/red/recursos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(recurso),
        }, "No fue posible agregar el elemento.");
        const { id } = await response.json() as { id: string };
        const recargado = await cargar();
        if (!recargado) return;
        setNuevoAbierto(false);
        abrirFicha(id);
        mostrarAviso(recurso.tipo === "ap" ? "Punto de acceso agregado." : "Espacio agregado.");
      } catch (error) {
        mostrarAviso(error instanceof Error ? error.message : "No fue posible agregar el elemento.", "error");
      } finally {
        setGuardando(false);
      }
    })();
  };

  // Cierra la ficha antes de recargar: el espacio deja de existir y la ficha
  // abierta quedaría apuntando a un id que ya no está en el estado.
  const eliminarEspacio = (id: string) => conGuardado(async () => {
    await pedir(`/api/red/recursos?tipo=espacio&id=${encodeURIComponent(id)}`, { method: "DELETE" }, "No fue posible eliminar el espacio.");
    setFichaAbierta("");
    setSeleccionado("");
    setPorEliminar("");
  }, "Espacio eliminado.");

  const crearCategoria = (nombre: string) => conGuardado(async () => {
    await pedir("/api/red/categorias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre }) }, "No fue posible agregar el tipo.");
  }, "Tipo agregado.");

  const renombrarCategoria = (id: string, nombre: string) => conGuardado(async () => {
    await pedir("/api/red/categorias", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, nombre }) }, "No fue posible renombrar el tipo.");
  }, "Tipo renombrado.");

  const eliminarCategoria = (id: string, reasignar: string) => conGuardado(async () => {
    await pedir(`/api/red/categorias?id=${encodeURIComponent(id)}&reasignar=${encodeURIComponent(reasignar)}`, { method: "DELETE" }, "No fue posible eliminar el tipo.");
  }, "Tipo eliminado.");

  const crearEnlace = (destinoId: string, nota: string) => conGuardado(async () => {
    await pedir("/api/red/enlaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: fichaAbierta, b: destinoId, nota }) }, "No fue posible crear la conexión.");
  }, "Conexión creada.");

  const borrarEnlace = (id: number) => conGuardado(async () => {
    await pedir(`/api/red/enlaces?id=${id}`, { method: "DELETE" }, "No fue posible quitar el enlace.");
  }, "Enlace quitado.");

  const limpiarConexiones = () => {
    if (guardando || !estado.enlaces.length) return;
    void conGuardado(async () => {
      await pedir("/api/red/enlaces?todos=1", {
        method: "DELETE",
        headers: { "X-Confirmar-Limpieza": "LIMPIAR" },
      }, "No fue posible limpiar las conexiones.");
      setSeleccionado("");
      setFichaAbierta("");
      setSesion([]);
      setLimpiezaAbierta(false);
    }, "Todas las conexiones fueron eliminadas. Puedes comenzar desde cero.");
  };

  // Primero se crea el enlace nuevo y solo después se borra el viejo: al revés,
  // si el destino ya estuviera ocupado o el POST fallara, el cable original se
  // habría perdido sin nada que lo reemplace.
  const reenlazar = (enlaceId: number, fijo: string, destino: string) => conGuardado(async () => {
    await pedir("/api/red/enlaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: fijo, b: destino }) }, "No fue posible mover el enlace.");
    await pedir(`/api/red/enlaces?id=${enlaceId}`, { method: "DELETE" }, "El enlace nuevo quedó creado, pero no se pudo quitar el anterior.");
  }, "Enlace reconectado.");

  // El movimiento se ve al instante y se guarda en segundo plano: acomodar un
  // rack son diez o quince clics seguidos, y esperar la recarga completa del
  // estado en cada uno haría el modo inusable.
  const reordenar = (ids: string[]) => {
    const previo = estado.orden;
    setEstado(actual => ({ ...actual, orden: { ...actual.orden, ...Object.fromEntries(ids.map((id, indice) => [id, indice])) } }));
    void (async () => {
      try {
        await pedir("/api/red/orden", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }, "No fue posible guardar el orden.");
      } catch (error) {
        setEstado(actual => ({ ...actual, orden: previo }));
        mostrarAviso(error instanceof Error ? error.message : "No fue posible guardar el orden.", "error");
      }
    })();
  };

  const restablecerOrden = () => {
    if (!window.confirm("¿Volver al orden automático? Se pierde el orden que definiste a mano, tanto en el diagrama como en los racks.")) return;
    void conGuardado(async () => {
      await pedir("/api/red/orden", { method: "DELETE" }, "No fue posible restablecer el orden.");
    }, "Orden restablecido.");
  };

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
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = anterior; };
  }, [fichaAbierta]);

  useEffect(() => {
    const enfocarBuscador = (evento: KeyboardEvent) => {
      const objetivo = evento.target as HTMLElement | null;
      const escribiendo = objetivo?.matches("input, textarea, select, [contenteditable='true']");
      if (evento.key !== "/" || escribiendo || evento.metaKey || evento.ctrlKey || evento.altKey) return;
      evento.preventDefault();
      buscadorRef.current?.focus();
    };
    window.addEventListener("keydown", enfocarBuscador);
    return () => window.removeEventListener("keydown", enfocarBuscador);
  }, []);

  const conteos = useMemo(() => Object.fromEntries(estadosEspacio.map(valor => [valor, estado.espacios.filter(espacio => espacio.estado === valor).length])) as Record<EstadoEspacio, number>, [estado.espacios]);

  const conteosCategorias = useMemo(() => {
    const total: Record<string, number> = {};
    for (const espacio of estado.espacios) total[espacio.categoria] = (total[espacio.categoria] ?? 0) + 1;
    return total;
  }, [estado.espacios]);

  const conteosConexion = useMemo(() => {
    const conPuerto = estado.espacios.filter(espacio => puertosDeEndpoint(estado, espacio.id).length).length;
    return { conPuerto, sinPuerto: estado.espacios.length - conPuerto };
  }, [estado]);

  const espacioPorEliminar = estado.espacios.find(espacio => espacio.id === porEliminar);
  const planEliminar = porEliminar ? planEliminarEspacio(estado, porEliminar) : null;

  const puertosDe = (id: string) => puertosDeEndpoint(estado, id);
  const etiquetaDePuerto = (id: string) => etiquetaPuerto(estado, id);

  const espaciosVisibles = useMemo(() => {
    const texto = normalizar(consulta);
    return estado.espacios.filter(espacio => {
      if (filtro !== "todos" && espacio.estado !== filtro) return false;
      if (filtroCategoria !== "todos" && espacio.categoria !== filtroCategoria) return false;
      const puertosDelEspacio = puertosDeEndpoint(estado, espacio.id);
      if (filtroConexion === "con-puerto" && !puertosDelEspacio.length) return false;
      if (filtroConexion === "sin-puerto" && puertosDelEspacio.length) return false;
      if (!texto) return true;
      const puertos = puertosDelEspacio.map(puerto => etiquetaPuerto(estado, puerto.id)).join(" ");
      const tipo = estado.categorias.find(categoria => categoria.id === espacio.categoria)?.nombre ?? "";
      const contenido = `${espacio.nombre} ${espacio.ubicacion} ${espacio.categoria} ${tipo} ${etiquetasEstadoEspacio[espacio.estado]} ${puertos}`;
      return coincideBusqueda(contenido, texto);
    });
  }, [estado, filtro, filtroCategoria, filtroConexion, consulta]);

  const coincidenciaBuscador = useMemo(() => {
    const texto = normalizar(consulta);
    if (texto.length < 2) return "";
    const espacio = estado.espacios.find(candidato => coincideBusqueda(`${candidato.nombre} ${candidato.ubicacion}`, texto));
    if (espacio) return espacio.id;
    const numeroCubiculo = aliasCubiculo(texto);
    const cubiculo = numeroCubiculo === null ? undefined : estado.cubiculos.find(candidato => candidato.id === numeroCubiculo);
    if (cubiculo) return `cub:${cubiculo.id}`;
    const puerto = estado.puertos.find(candidato => coincideBusqueda(etiquetaPuerto(estado, candidato.id), texto));
    return puerto?.id ?? "";
  }, [consulta, estado]);

  const cadenaBuscador = useMemo(() => trazarCircuito(estado, coincidenciaBuscador), [estado, coincidenciaBuscador]);

  const copiarCadenaBuscador = async () => {
    try {
      await navigator.clipboard.writeText(cadenaComoTexto(cadenaBuscador));
      mostrarAviso("Cadena copiada.");
    } catch {
      mostrarAviso("No fue posible copiar la cadena.", "error");
    }
  };

  const copiarTexto = (texto: string) => void (async () => {
    try {
      await navigator.clipboard.writeText(texto);
      mostrarAviso("Cadena copiada.");
    } catch {
      mostrarAviso("No fue posible copiar la cadena.", "error");
    }
  })();

  const hayFiltrosEspacios = filtro !== "todos" || filtroConexion !== "todos" || filtroCategoria !== "todos" || Boolean(consulta.trim());
  const limpiarFiltrosEspacios = () => {
    setFiltro("todos");
    setFiltroConexion("todos");
    setFiltroCategoria("todos");
    setConsulta("");
  };

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">SE</span><div><strong>Sala de Enlace</strong><span>Red del colegio</span></div><NavSecciones activa="red" /></div>
        <div className="header-actions"><button className="icon-button" onClick={() => void cargar()} aria-label={cargando ? "Actualizando datos" : "Actualizar datos"} disabled={cargando}>{cargando ? "…" : "↻"}</button><div className="date-chip"><span>ÚLTIMA SINCRONIZACIÓN</span><b>{ultimaSync ? new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(ultimaSync) : "Sin sincronizar"}</b></div></div>
      </header>

      <section className="shell">
        {errorCarga && <div className="error-banner" role="alert"><span>{errorCarga}</span><button type="button" onClick={() => void cargar()} disabled={cargando}>{cargando ? "Reintentando…" : "Reintentar"}</button></div>}
        <div className="workspace-head"><div><h1>Red del colegio</h1><p className="subtitle">{estado.racks.length} racks · {estado.puertos.filter(puerto => puerto.n > 0).length} puertos · {estado.espacios.length} espacios · {estado.cubiculos.length} cubículos.</p></div><div className="workspace-actions"><button className="secondary toolbar-action" onClick={() => setNuevoAbierto(true)}>Agregar elemento</button><button className="secondary toolbar-action" onClick={() => setCapturaAbierta(true)}>Captura rápida</button><details className="workspace-menu"><summary>Más acciones</summary><div><button type="button" className="workspace-action-link" onClick={evento => { evento.currentTarget.closest("details")?.removeAttribute("open"); setTiposAbierto(true); }}>Administrar tipos de espacio <small>Crear, renombrar o reasignar</small></button><div className="workspace-menu-separator" /><button type="button" className="danger-link" disabled={!estado.enlaces.length || guardando} onClick={evento => { evento.currentTarget.closest("details")?.removeAttribute("open"); setLimpiezaAbierta(true); }}>Limpiar todas las conexiones <small>{estado.enlaces.length} registradas</small></button></div></details></div></div>

        <section className="room-surface">
          <div className="room-toolbar">
            <div>
              <h2>{vista === "espacios" ? <>Espacios del colegio <span>{estado.espacios.length}</span></> : vista === "racks" ? "Racks y puertos" : vista === "cobertura" ? "Cobertura del levantamiento" : "Diagrama de la red"}</h2>
              <p>{vista === "espacios" ? "Estado operativo y conexión documentada de cada espacio." : vista === "racks" ? "Equipos y puertos disponibles en cada rack." : vista === "cobertura" ? "Avance global del levantamiento y pendientes por resolver." : "Recorrido completo de las conexiones del colegio."}</p>
            </div>
          </div>

          <div className="net-navigation-bar">
            <div className="net-seg" role="group" aria-label="Vista de la red">
              <button className={vista === "espacios" ? "on" : ""} aria-pressed={vista === "espacios"} onClick={() => setVista("espacios")}>Espacios</button>
              <button className={vista === "racks" ? "on" : ""} aria-pressed={vista === "racks"} onClick={() => setVista("racks")}>Racks</button>
              <button className={vista === "cobertura" ? "on" : ""} aria-pressed={vista === "cobertura"} onClick={() => setVista("cobertura")}>Cobertura</button>
              <button className={vista === "diagrama" ? "on" : ""} aria-pressed={vista === "diagrama"} onClick={() => setVista("diagrama")}>Diagrama</button>
            </div>
            <div className="search net-global-search" role="search">
              <span aria-hidden="true">⌕</span>
              <span className="sr-only">Buscar por espacio, ubicación, rack o puerto</span>
              <input ref={buscadorRef} value={consulta} aria-label="Buscar por espacio, ubicación, rack o puerto" onChange={event => setConsulta(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && coincidenciaBuscador) abrirFicha(coincidenciaBuscador); }} placeholder="Buscar por espacio, ubicación, rack o puerto…" />
              {consulta ? <button type="button" className="net-search-clear" onClick={() => setConsulta("")} aria-label="Limpiar búsqueda">×</button> : <kbd aria-hidden="true">/</kbd>}
            </div>
          </div>

          {vista === "espacios" && <>
            <button type="button" className="net-mobile-filter-toggle" aria-expanded={filtrosMovilAbiertos} aria-controls="filtros-espacios" onClick={() => setFiltrosMovilAbiertos(actual => !actual)}>
              <span>Filtros {hayFiltrosEspacios ? `· ${espaciosVisibles.length} resultados` : ""}</span><i aria-hidden="true">⌄</i>
            </button>
            <section id="filtros-espacios" className={`net-space-filters ${filtrosMovilAbiertos ? "open" : ""}`} aria-label="Filtros de espacios">
              <div className="net-filter-row">
                <span className="net-filter-label">Estado</span>
                <div className="net-filter-chips">
                  <button type="button" className={filtro === "todos" ? "on" : ""} aria-pressed={filtro === "todos"} onClick={() => setFiltro("todos")}><i className="all" aria-hidden="true" />Todos <strong>{estado.espacios.length}</strong></button>
                  {estadosEspacio.map(valor => <button type="button" key={valor} className={`${valor} ${filtro === valor ? "on" : ""}`} aria-pressed={filtro === valor} onClick={() => setFiltro(valor)}><i aria-hidden="true" />{etiquetasEstadoEspacio[valor]} <strong>{conteos[valor]}</strong></button>)}
                </div>
              </div>
              <div className="net-filter-row">
                <span className="net-filter-label">Documentación</span>
                <div className="net-filter-chips connection">
                  <button type="button" className={filtroConexion === "todos" ? "on" : ""} aria-pressed={filtroConexion === "todos"} onClick={() => setFiltroConexion("todos")}>Todos <strong>{estado.espacios.length}</strong></button>
                  <button type="button" className={filtroConexion === "con-puerto" ? "on" : ""} aria-pressed={filtroConexion === "con-puerto"} onClick={() => setFiltroConexion("con-puerto")}><i className="documented" aria-hidden="true" />Con puerto <strong>{conteosConexion.conPuerto}</strong></button>
                  <button type="button" className={filtroConexion === "sin-puerto" ? "on" : ""} aria-pressed={filtroConexion === "sin-puerto"} onClick={() => setFiltroConexion("sin-puerto")}><i className="undocumented" aria-hidden="true" />Sin documentar <strong>{conteosConexion.sinPuerto}</strong></button>
                </div>
              </div>
            </section>

            <div className="net-space-controls">
              <p><strong>{espaciosVisibles.length}</strong> de {estado.espacios.length} espacios</p>
              <div>
                <label className="net-control-select"><span>Tipo</span><select value={filtroCategoria} onChange={event => setFiltroCategoria(event.target.value)}><option value="todos">Todos</option>{estado.categorias.map(categoria => <option key={categoria.id} value={categoria.id}>{categoria.nombre} ({conteosCategorias[categoria.id] ?? 0})</option>)}</select></label>
                <label className="net-control-select"><span>Orden</span><select value={ordenEspacios} onChange={event => setOrdenEspacios(event.target.value as CriterioOrden)}>{criteriosOrden.map(valor => <option key={valor} value={valor}>{etiquetasCriterioOrden[valor]}</option>)}</select></label>
                <button type="button" className={`net-group-toggle ${agrupar ? "on" : ""}`} aria-pressed={agrupar} onClick={() => setAgrupar(!agrupar)}><i aria-hidden="true" />Agrupar</button>
                <div className="net-seg compact" role="group" aria-label="Formato de espacios">
                  <button type="button" className={formatoEspacios === "lista" ? "on" : ""} aria-pressed={formatoEspacios === "lista"} onClick={() => setFormatoEspacios("lista")}>Lista</button>
                  <button type="button" className={formatoEspacios === "cuadricula" ? "on" : ""} aria-pressed={formatoEspacios === "cuadricula"} onClick={() => setFormatoEspacios("cuadricula")}>Cuadrícula</button>
                </div>
              </div>
            </div>

            {hayFiltrosEspacios && <div className="net-active-filters" role="status">
              <span>Filtros activos</span>
              <div>
                {consulta && <button type="button" onClick={() => setConsulta("")}>Búsqueda: “{consulta}” <i aria-hidden="true">×</i></button>}
                {filtro !== "todos" && <button type="button" onClick={() => setFiltro("todos")}>Estado: {etiquetasEstadoEspacio[filtro]} <i aria-hidden="true">×</i></button>}
                {filtroConexion !== "todos" && <button type="button" onClick={() => setFiltroConexion("todos")}>{filtroConexion === "con-puerto" ? "Con puerto" : "Sin documentar"} <i aria-hidden="true">×</i></button>}
                {filtroCategoria !== "todos" && <button type="button" onClick={() => setFiltroCategoria("todos")}>Tipo: {estado.categorias.find(categoria => categoria.id === filtroCategoria)?.nombre ?? filtroCategoria} <i aria-hidden="true">×</i></button>}
              </div>
              <button type="button" className="net-clear-filters" onClick={limpiarFiltrosEspacios}>Limpiar todo</button>
            </div>}
          </>}

          {coincidenciaBuscador && <div className="net-quick"><span className="net-quick-chain">{cadenaComoTexto(cadenaBuscador)}</span><div className="net-quick-actions"><button className="secondary" type="button" onClick={() => void copiarCadenaBuscador()}>Copiar</button><button className="secondary" type="button" onClick={() => abrirFicha(coincidenciaBuscador)}>Abrir ficha</button></div></div>}
          <div className={cargando ? "net-body is-loading" : "net-body"}>
            {vista === "espacios"
              ? <VistaEspacios espacios={espaciosVisibles} categorias={estado.categorias} orden={ordenEspacios} agrupar={agrupar} formato={formatoEspacios} puertosDe={puertosDe} etiquetaDePuerto={etiquetaDePuerto} cubiculos={estado.cubiculos} seleccionado={seleccionado} onAbrir={abrirFicha} onLimpiar={limpiarFiltrosEspacios} />
              : vista === "racks"
                ? <VistaRacks estado={estado} rackActivo={rackVisible} onRack={setRackActivo} formato={formatoRacks} onFormato={setFormatoRacks} seleccionado={seleccionado} onAbrir={abrirFicha} />
                : vista === "cobertura"
                  ? <VistaCobertura estado={estado} onAbrir={abrirFicha} />
                  : <Diagrama estado={estado} seleccionado={seleccionado} centrarEn={vista === "diagrama" ? coincidenciaBuscador : ""} onAbrir={abrirFicha} onSeleccionar={setSeleccionado} onConectar={asignarRapido} onDesconectar={borrarEnlace} onReenlazar={reenlazar} onReordenar={reordenar} onRestablecerOrden={restablecerOrden} hayOrden={Object.keys(estado.orden).length > 0} guardando={guardando} onAviso={mensaje => mostrarAviso(mensaje, "error")} onCopiar={copiarTexto} />}
          </div>
        </section>
      </section>

      {fichaAbierta && <Ficha key={fichaAbierta} estado={estado} endpointId={fichaAbierta} cadena={cadenaFicha} guardando={guardando} onCerrar={() => setFichaAbierta("")} onGuardarCampos={guardarCampos} onGuardarRecurso={guardarRecurso} onCrearEnlace={crearEnlace} onBorrarEnlace={borrarEnlace} onEliminarEspacio={setPorEliminar} />}
      {fichaAbierta && <button className="backdrop" onClick={() => setFichaAbierta("")} aria-label="Cerrar ficha" />}
      {capturaAbierta && <Captura estado={estado} sesion={sesion} puertoInicial={seleccionado.startsWith("pto:") ? seleccionado : ""} onCerrar={() => setCapturaAbierta(false)} onAsignar={asignarRapido} onMarcarLibre={marcarLibre} onDeshacer={deshacerAsignacion} />}
      {nuevoAbierto && <NuevoRecurso categorias={estado.categorias} guardando={guardando} onCerrar={() => setNuevoAbierto(false)} onCrear={crearRecurso} />}
      {limpiezaAbierta && <LimpiarConexiones cantidad={estado.enlaces.length} guardando={guardando} onCerrar={() => setLimpiezaAbierta(false)} onLimpiar={limpiarConexiones} />}
      {tiposAbierto && <TiposEspacio categorias={estado.categorias} conteos={conteosCategorias} guardando={guardando} onCerrar={() => setTiposAbierto(false)} onCrear={nombre => void crearCategoria(nombre)} onRenombrar={(id, nombre) => void renombrarCategoria(id, nombre)} onEliminar={(id, reasignar) => void eliminarCategoria(id, reasignar)} />}
      {espacioPorEliminar && planEliminar?.ok && <EliminarEspacio nombre={espacioPorEliminar.nombre} enlaces={planEliminar.enlaces.length} guardando={guardando} onCerrar={() => setPorEliminar("")} onEliminar={() => void eliminarEspacio(espacioPorEliminar.id)} />}
      {aviso && <div className={`toast ${tipoAviso}`} role={tipoAviso === "error" ? "alert" : "status"} aria-live="polite">{aviso}</div>}
    </main>
  );
}
