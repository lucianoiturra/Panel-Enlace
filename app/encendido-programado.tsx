"use client";

import { useCallback, useEffect, useState } from "react";
import { haceCuanto } from "../lib/formato-tiempo";
import { useAhora, useRefrescoPeriodico } from "./use-refresco";
import { DIAS, estadoBoton, etiquetaDias, etiquetaObjetivo, normalizarDias } from "../lib/wol/programa";

type Programa = { id: number; nombre: string; dias: string; hora: string; objetivo: string; activo: boolean };
type Resumen = {
  hubo: boolean; cuando: string; enviados: number; yaEncendidos: number;
  despertaron: number; dormidos: number[]; sinVerificar: number;
};
type Datos = {
  programas: Programa[]; resumen: Resumen; conMac: number;
  pedidoPendiente: { id: number; objetivo: string } | null; ahoraServidor: string;
};

const CADA_MS = 60_000;
const vacio = { nombre: "", dias: "12345", hora: "07:45", objetivo: "todos" };

/**
 * Encendido programado. Vive en SALA y no en una pestaña propia porque la
 * pregunta que se hace todos los días —"¿despertaron todos esta mañana?"— es
 * sobre la sala, y su respuesta pertenece al lado del plano.
 */
export default function EncendidoProgramado({ onAviso }: { onAviso: (mensaje: string, tipo?: "success" | "error") => void }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState(vacio);
  const [editando, setEditando] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [ahora, anclarReloj] = useAhora();

  const cargar = useCallback(async () => {
    try {
      const respuesta = await fetch("/api/wol", { cache: "no-store" });
      if (!respuesta.ok) return;
      const cuerpo = await respuesta.json() as Datos;
      anclarReloj(cuerpo.ahoraServidor);
      setDatos(cuerpo);
    } catch { /* el encendido programado no puede romper la pantalla de la sala */ }
  }, [anclarReloj]);

  useEffect(() => { void cargar(); }, [cargar]);
  useRefrescoPeriodico(() => void cargar(), CADA_MS);

  const pedir = async (cuerpo: unknown, metodo = "POST", url = "/api/wol") => {
    setOcupado(true); setError("");
    try {
      const respuesta = await fetch(url, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: metodo === "DELETE" ? undefined : JSON.stringify(cuerpo),
      });
      if (!respuesta.ok) {
        const datosError = await respuesta.json().catch(() => ({})) as { error?: string };
        throw new Error(datosError.error || "No fue posible completar la acción.");
      }
      await cargar();
      return await respuesta.json().catch(() => ({})) as Record<string, unknown>;
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : "No fue posible completar la acción.");
      return null;
    } finally { setOcupado(false); }
  };

  const encenderAhora = async () => {
    if (!window.confirm("Se enviará el paquete de encendido a los computadores apagados de la sala. ¿Continuar?")) return;
    const resultado = await pedir({ accion: "encender", objetivo: "todos" });
    if (!resultado) return;
    onAviso(resultado.yaEnCola
      ? "Ya había un encendido en cola; no se duplicó."
      : "Encendido en cola. El servidor lo envía en menos de un minuto.");
  };

  const guardar = async () => {
    const cuerpo = editando === null ? borrador : { ...borrador, id: editando };
    const resultado = await pedir(cuerpo, editando === null ? "POST" : "PATCH");
    if (!resultado) return;
    onAviso(editando === null ? "Horario agregado." : "Horario actualizado.");
    setBorrador(vacio); setEditando(null);
  };

  const alternar = (dia: string) => setBorrador(actual => ({
    ...actual,
    dias: normalizarDias(actual.dias.includes(dia) ? actual.dias.replace(dia, "") : actual.dias + dia),
  }));

  const resumen = datos?.resumen;
  const boton = datos
    ? estadoBoton(datos.resumen, datos.pedidoPendiente, ahora)
    : { puede: false, etiqueta: "Encender ahora" };
  return (
    <>
      <div className="wol-linea">
        <div className="wol-linea-texto">
          <span className="wol-etiqueta">ENCENDIDO PROGRAMADO</span>
          {!datos ? <b>—</b> : datos.programas.filter(p => p.activo).length === 0
            ? <b className="pending">Sin horarios activos</b>
            : <b>{datos.programas.filter(p => p.activo).map(p => `${p.hora} ${etiquetaDias(p.dias)}`).join(" · ")}</b>}
          {resumen?.hubo && (
            // Lo accionable es quién NO despertó. Si despertaron todos, se dice
            // en una línea y se sale del paso; nadie necesita leer 38 nombres.
            <small className={resumen.dormidos.length ? "wol-mal" : "wol-bien"}>
              {haceCuanto(resumen.cuando, ahora)}:{" "}
              {resumen.sinVerificar > 0 && resumen.despertaron === 0 && resumen.dormidos.length === 0
                ? `${resumen.enviados} enviados, verificando…`
                : resumen.dormidos.length
                  ? `no despertaron los cubículos ${resumen.dormidos.join(", ")}`
                  : `despertaron los ${resumen.enviados} que estaban apagados`}
            </small>
          )}
        </div>
        <div className="wol-linea-acciones">
          <button type="button" className="secondary" disabled={ocupado || !boton.puede} onClick={() => void encenderAhora()}
            title={boton.puede ? undefined : "Hay un encendido en curso: los equipos tardan unos minutos en aparecer en la red."}>
            {boton.etiqueta}
          </button>
          <button type="button" className="secondary" onClick={() => setAbierto(true)}>Horarios</button>
        </div>
      </div>

      {abierto && (
        <div className="modal-fondo" role="dialog" aria-modal="true" aria-labelledby="wol-titulo">
          <div className="modal wol-modal">
            <div className="modal-head">
              <div>
                <span>ENCENDIDO PROGRAMADO</span>
                <h2 id="wol-titulo">Horarios de la sala</h2>
                <p>cabserver manda el paquete de encendido a los {datos?.conMac ?? 0} computadores con MAC documentada. Apagar no se puede desde acá: eso vive en cada PC.</p>
              </div>
              <button onClick={() => { setAbierto(false); setError(""); setEditando(null); setBorrador(vacio); }} aria-label="Cerrar">×</button>
            </div>

            {error && <div className="modal-error" role="alert">{error}</div>}

            <div className="modal-list">
              {datos?.programas.length ? datos.programas.map(programa => (
                <div key={programa.id} className={programa.activo ? "" : "wol-inactivo"}>
                  <span>
                    <b>{programa.hora}</b> · {etiquetaDias(programa.dias)} · {etiquetaObjetivo(programa.objetivo)}
                    <small>{programa.nombre}</small>
                  </span>
                  <div className="wol-fila-acciones">
                    <button type="button" disabled={ocupado} onClick={() => void pedir({ id: programa.id, activo: !programa.activo }, "PATCH")}>
                      {programa.activo ? "Desactivar" : "Activar"}
                    </button>
                    <button type="button" disabled={ocupado} onClick={() => {
                      setEditando(programa.id);
                      setBorrador({ nombre: programa.nombre, dias: programa.dias, hora: programa.hora, objetivo: programa.objetivo });
                    }}>Editar</button>
                    <button type="button" disabled={ocupado} onClick={() => {
                      if (window.confirm(`¿Eliminar el horario "${programa.nombre}"? El registro de encendidos anteriores se conserva.`)) {
                        void pedir(null, "DELETE", `/api/wol?id=${programa.id}`).then(r => r && onAviso("Horario eliminado."));
                      }
                    }}>Eliminar</button>
                  </div>
                </div>
              )) : <p className="empty-state">Todavía no hay horarios. Agrega el primero abajo.</p>}
            </div>

            <div className="wol-form">
              <label>Nombre
                <input value={borrador.nombre} maxLength={80} placeholder="Ej: Apertura de la sala"
                  onChange={e => setBorrador({ ...borrador, nombre: e.target.value })} />
              </label>
              <fieldset className="wol-dias">
                <legend>Días</legend>
                {DIAS.map(dia => (
                  <button type="button" key={dia.digito} className={borrador.dias.includes(dia.digito) ? "on" : ""}
                    aria-pressed={borrador.dias.includes(dia.digito)} aria-label={dia.largo}
                    onClick={() => alternar(dia.digito)}>{dia.corto}</button>
                ))}
              </fieldset>
              <div className="two-cols">
                <label>Hora
                  <input type="time" value={borrador.hora} onChange={e => setBorrador({ ...borrador, hora: e.target.value })} />
                </label>
                <label>Cubículos
                  <input value={borrador.objetivo} placeholder="todos, o 3,7,12"
                    onChange={e => setBorrador({ ...borrador, objetivo: e.target.value })} />
                </label>
              </div>
              <div className="wol-form-acciones">
                {editando !== null && (
                  <button type="button" className="secondary" onClick={() => { setEditando(null); setBorrador(vacio); }}>Cancelar</button>
                )}
                <button type="button" className="primary" disabled={ocupado} onClick={() => void guardar()}>
                  {editando === null ? "Agregar horario" : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>
          <button className="backdrop" onClick={() => { setAbierto(false); setError(""); }} aria-label="Cerrar horarios" />
        </div>
      )}
    </>
  );
}
