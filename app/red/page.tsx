"use client";

import { useEffect, useMemo, useState } from "react";
import NavSecciones from "../nav-secciones";
import VistaEspacios from "./vista-espacios";
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
import { criteriosOrden, etiquetasCriterioOrden, type CriterioOrden } from "../../lib/red/agrupar";
import { estadosEspacio, etiquetaEndpoint, etiquetaPuerto, etiquetasEstadoEspacio, planEliminarEspacio, puertosDeEndpoint, type Enlace, type EstadoEspacio, type EstadoRed } from "../../lib/red/modelo";

const estadoVacio: EstadoRed = { racks: [], equipos: [], puertos: [], espacios: [], enlaces: [], bitacora: [], cubiculos: [], categorias: [], orden: {} };

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
  const [agrupar, setAgrupar] = useState(false);
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
    if (!window.confirm("¿Volver al orden automático del diagrama? Se pierde el orden que definiste a mano.")) return;
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

  const conteos = useMemo(() => Object.fromEntries(estadosEspacio.map(valor => [valor, estado.espacios.filter(espacio => espacio.estado === valor).length])) as Record<EstadoEspacio, number>, [estado.espacios]);

  const conteosCategorias = useMemo(() => {
    const total: Record<string, number> = {};
    for (const espacio of estado.espacios) total[espacio.categoria] = (total[espacio.categoria] ?? 0) + 1;
    return total;
  }, [estado.espacios]);

  const espacioPorEliminar = estado.espacios.find(espacio => espacio.id === porEliminar);
  const planEliminar = porEliminar ? planEliminarEspacio(estado, porEliminar) : null;

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
      const tipo = estado.categorias.find(categoria => categoria.id === espacio.categoria)?.nombre ?? "";
      return `${espacio.nombre} ${espacio.ubicacion} ${espacio.categoria} ${tipo} ${puertos}`.toLowerCase().includes(texto);
    });
  }, [estado, filtro, consulta]);

  const coincidenciaBuscador = useMemo(() => {
    const texto = consulta.trim().toLowerCase();
    if (texto.length < 2) return "";
    const normalizar = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const buscado = normalizar(texto);
    const espacio = estado.espacios.find(candidato => normalizar(`${candidato.nombre} ${candidato.ubicacion}`).includes(buscado));
    if (espacio) return espacio.id;
    const cubiculo = estado.cubiculos.find(candidato => `cubiculo ${candidato.id}`.includes(buscado) || `cub ${candidato.id}` === buscado);
    if (cubiculo) return `cub:${cubiculo.id}`;
    const puerto = estado.puertos.find(candidato => normalizar(etiquetaPuerto(estado, candidato.id)).replace(/[\s/]/g, "").includes(buscado.replace(/[\s/]/g, "")));
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

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">SE</span><div><strong>Sala de Enlace</strong><span>Red del colegio</span></div><NavSecciones activa="red" /></div>
        <div className="header-actions"><button className="icon-button" onClick={() => void cargar()} aria-label={cargando ? "Actualizando datos" : "Actualizar datos"} disabled={cargando}>{cargando ? "…" : "↻"}</button><div className="date-chip"><span>ÚLTIMA SINCRONIZACIÓN</span><b>{ultimaSync ? new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(ultimaSync) : "Sin sincronizar"}</b></div></div>
      </header>

      <section className="shell">
        {errorCarga && <div className="error-banner" role="alert"><span>{errorCarga}</span><button type="button" onClick={() => void cargar()} disabled={cargando}>{cargando ? "Reintentando…" : "Reintentar"}</button></div>}
        <div className="workspace-head"><div><h1>Red del colegio</h1><p className="subtitle">{estado.racks.length} racks · {estado.puertos.filter(puerto => puerto.n > 0).length} puertos · {estado.espacios.length} espacios · {estado.cubiculos.length} cubículos.</p></div><div className="workspace-actions"><button className="secondary toolbar-action" onClick={() => setNuevoAbierto(true)}>Agregar elemento</button><button className="secondary toolbar-action" onClick={() => setCapturaAbierta(true)}>Captura rápida</button><details className="workspace-menu"><summary>Más acciones</summary><div><button type="button" className="danger-link" disabled={!estado.enlaces.length || guardando} onClick={evento => { evento.currentTarget.closest("details")?.removeAttribute("open"); setLimpiezaAbierta(true); }}>Limpiar todas las conexiones <small>{estado.enlaces.length} registradas</small></button></div></details></div></div>

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
          {vista === "espacios" && <div className="net-orden-bar">
            <label className="net-orden-select">Ordenar por
              <select value={ordenEspacios} onChange={event => setOrdenEspacios(event.target.value as CriterioOrden)}>
                {criteriosOrden.map(valor => <option key={valor} value={valor}>{etiquetasCriterioOrden[valor]}</option>)}
              </select>
            </label>
            <button type="button" className={`net-toggle ${agrupar ? "on" : ""}`} aria-pressed={agrupar} onClick={() => setAgrupar(!agrupar)}>Agrupar por tipo</button>
            <button type="button" className="secondary net-orden-tipos" onClick={() => setTiposAbierto(true)}>Administrar tipos</button>
          </div>}
          {coincidenciaBuscador && <div className="net-quick"><span className="net-quick-chain">{cadenaComoTexto(cadenaBuscador)}</span><div className="net-quick-actions"><button className="secondary" type="button" onClick={() => void copiarCadenaBuscador()}>Copiar</button><button className="secondary" type="button" onClick={() => abrirFicha(coincidenciaBuscador)}>Abrir ficha</button></div></div>}
          <div className={cargando ? "net-body is-loading" : "net-body"}>
            {vista === "espacios"
              ? <VistaEspacios espacios={espaciosVisibles} categorias={estado.categorias} orden={ordenEspacios} agrupar={agrupar} puertosDe={puertosDe} etiquetaDePuerto={etiquetaDePuerto} cubiculos={estado.cubiculos} seleccionado={seleccionado} onAbrir={abrirFicha} />
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
