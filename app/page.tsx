"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import NavSecciones from "./nav-secciones";
import EncendidoProgramado from "./encendido-programado";
import { useRefrescoPeriodico } from "./use-refresco";
import { isValidIpv4, isValidMac, isValidPin } from "../lib/room-validation";

// La sala cambia cuando alguien la edita, no sola, así que dos minutos alcanzan:
// lo que se busca es que un panel dejado abierto no muestre lo de ayer.
const CADA_MS = 120_000;

type Status = "operational" | "attention" | "offline" | "pending" | "no_computer";
type PinStatus = "unreviewed" | "configured" | "no_pin" | "not_applicable";
type InternetType = "unreviewed" | "ethernet" | "wifi" | "none";
type OutletStatus = "unreviewed" | "operational" | "repair";
type Station = { id: number; brandModel: string; serialNumber: string; inventoryCode: string; adminPinStatus: PinStatus; studentPinStatus: PinStatus; adminPin: string; studentPin: string; internetType: InternetType; outletStatus: OutletStatus; keyboard: string; mouse: string; ip: string; mac: string; observations: string; status: Status; updatedAt: string };
type Item = { id: number; label: string; createdAt: string };
type Result = { id: number; cubicleId: number; itemId: number; checked: boolean };
type Task = { id: number; cubicleId: number; description: string; completed: boolean; createdAt: string };
type RoomData = { stations: Station[]; items: Item[]; results: Result[]; tasks: Task[] };
type FieldErrors = Partial<Record<"ip" | "mac" | "adminPin" | "studentPin" | "inventoryCode" | "serialNumber", string>>;

const statusInfo: Record<Status, { label: string; short: string }> = {
  operational: { label: "Operativo", short: "OK" },
  attention: { label: "Requiere atención", short: "!" },
  offline: { label: "Fuera de servicio", short: "×" },
  pending: { label: "Sin revisar", short: "—" },
  no_computer: { label: "Sin computador", short: "∅" },
};

const pinInfo: Record<PinStatus, string> = { unreviewed: "Sin revisar", configured: "Configurado", no_pin: "Sin PIN", not_applicable: "No aplica" };
const internetInfo: Record<InternetType, string> = { unreviewed: "Sin revisar", ethernet: "Internet por cable", wifi: "Internet por Wi‑Fi", none: "Sin conexión" };
const outletInfo: Record<OutletStatus, string> = { unreviewed: "Sin revisar", operational: "Enchufe operativo", repair: "Necesita reparación" };

const emptyStations = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, brandModel: "Lenovo IdeaCentre AIO 310-20IAP (Type F0CL)", serialNumber: "", inventoryCode: "", adminPinStatus: "unreviewed" as PinStatus, studentPinStatus: "unreviewed" as PinStatus, adminPin: "", studentPin: "", internetType: "unreviewed" as InternetType, outletStatus: "unreviewed" as OutletStatus, keyboard: "Sin registrar", mouse: "Sin registrar", ip: "", mac: "", observations: "", status: "pending" as Status, updatedAt: "" }));

const readApiFailure = async (response: Response, fallback: string) => {
  try {
    const data = await response.json() as { error?: string; code?: string };
    return { message: data.error || fallback, code: data.code ?? "" };
  } catch {
    return { message: fallback, code: "" };
  }
};

const readApiError = async (response: Response, fallback: string) => (await readApiFailure(response, fallback)).message;

// Quita acentos y espacios de sobra, pero conserva guiones y puntos: lo que más
// se busca acá son IP, MAC y códigos de inventario, y partirlos por la
// puntuación haría que "1C-83" dejara de encontrar su MAC.
const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

export default function Home() {
  const [stations, setStations] = useState<Station[]>(emptyStations);
  const [items, setItems] = useState<Item[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState<Station | null>(null);
  const [initialDraft, setInitialDraft] = useState<Station | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [initialChecks, setInitialChecks] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<Status | "all">("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  // Mientras no haya una carga con éxito, los 40 puestos del plano son sólo el
  // molde de la sala: no representan ningún dato y no se pueden abrir.
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingPins, setLoadingPins] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeId, setNoticeId] = useState(0);
  const [noticeKind, setNoticeKind] = useState<"success" | "error">("success");
  const [loadError, setLoadError] = useState("");
  const [drawerError, setDrawerError] = useState("");
  const [versionConflict, setVersionConflict] = useState(false);
  const [taskError, setTaskError] = useState("");
  const [checklistError, setChecklistError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [busyAction, setBusyAction] = useState("");
  // Cuenta las aperturas de la ficha, no el cubículo: recargar la ficha por un
  // conflicto de versión la reabre sin cambiar `selected`, y el foco tiene que
  // volver igual al cajón en lugar de quedar suelto en el documento.
  const [drawerOpenings, setDrawerOpenings] = useState(0);
  const [pendingTaskDeletion, setPendingTaskDeletion] = useState<Task | null>(null);
  const [newCheck, setNewCheck] = useState("");
  const [showAdminPin, setShowAdminPin] = useState(false);
  const [showStudentPin, setShowStudentPin] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [redCadena, setRedCadena] = useState<{ texto: string; completa: boolean } | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerReturnFocusRef = useRef<HTMLElement | null>(null);
  const taskDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shortcutsRef = useRef<(event: KeyboardEvent) => void>(() => {});
  // Cada apertura y cada cierre inicia una sesión nueva del cajón. Una
  // petición que resuelve después de terminada su sesión ya no puede escribir
  // en la ficha: para entonces puede estar cerrada, o mostrando otro cubículo.
  const drawerSessionRef = useRef(0);

  const showNotice = (message: string, kind: "success" | "error" = "success") => {
    setNotice(message);
    setNoticeKind(kind);
    setNoticeId(current => current + 1);
  };

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [notice, noticeId]);

  // `silencioso` es para el refresco de fondo: no atenúa el plano ni levanta un
  // toast. El error sí se muestra —callarlo dejaría la sala envejeciendo sin
  // avisar, que es justo lo que se quiere evitar—, pero sin interrumpir.
  const load = async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/room");
      if (!response.ok) throw new Error(await readApiError(response, "No fue posible cargar los datos."));
      const data = await response.json() as RoomData;
      setStations(data.stations); setItems(data.items); setResults(data.results); setTasks(data.tasks);
      setLoaded(true);
      setLastSyncAt(new Date());
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo conectar con el almacenamiento.";
      setLoadError(`${message} Revisa la conexión e inténtalo nuevamente.`);
      if (!silencioso) showNotice("No se pudieron actualizar los datos.", "error");
      return null;
    }
    finally { if (!silencioso) setLoading(false); }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // Initial fetch only; manual refreshes call load directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Con la ficha abierta no se refresca: `load` reescribe `stations`, y hacerlo
  // debajo de alguien que está escribiendo cambiaría los datos con los que se
  // comparan sus cambios sin guardar.
  useRefrescoPeriodico(() => void load(true), CADA_MS, draft === null);

  const isDirty = useMemo(() => {
    if (!draft || !initialDraft) return false;
    return JSON.stringify(draft) !== JSON.stringify(initialDraft) || JSON.stringify(checks) !== JSON.stringify(initialChecks);
  }, [checks, draft, initialChecks, initialDraft]);

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  useEffect(() => {
    if (selected !== null) {
      closeButtonRef.current?.focus();
    } else if (drawerReturnFocusRef.current) {
      if (drawerReturnFocusRef.current.isConnected) drawerReturnFocusRef.current.focus();
      drawerReturnFocusRef.current = null;
    }
  }, [selected, drawerOpenings]);

  useEffect(() => {
    if (!draft) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [draft]);

  useEffect(() => () => {
    if (taskDeleteTimerRef.current) clearTimeout(taskDeleteTimerRef.current);
  }, []);

  const counts = useMemo(() => ({
    operational: stations.filter(s => s.status === "operational").length,
    attention: stations.filter(s => s.status === "attention").length,
    offline: stations.filter(s => s.status === "offline").length,
    pending: stations.filter(s => s.status === "pending").length,
    no_computer: stations.filter(s => s.status === "no_computer").length,
  }), [stations]);

  const layoutStations = useMemo(() => [...stations].sort((a, b) => b.id - a.id), [stations]);

  const pendingSummary = useMemo(() => {
    const activeIds = new Set(stations.filter(station => station.status !== "no_computer").map(station => station.id));
    const completedChecks = results.filter(result => activeIds.has(result.cubicleId) && result.checked).length;
    // La tarea en espera de deshacer ya no se cuenta, igual que en la ficha:
    // el rail y el cajón tienen que decir el mismo número.
    return { checklist: Math.max(0, activeIds.size * items.length - completedChecks), tasks: tasks.filter(task => !task.completed && task.id !== pendingTaskDeletion?.id).length };
  }, [stations, items, results, tasks, pendingTaskDeletion]);

  const search = normalizeSearch(query);
  const visible = (station: Station) => {
    const text = normalizeSearch(`${station.id} ${station.ip} ${station.mac} ${station.serialNumber} ${station.inventoryCode} ${station.brandModel}`);
    return (filter === "all" || station.status === filter) && text.includes(search);
  };

  // `source` permite abrir la ficha con datos recién traídos del servidor sin
  // esperar a que el estado del componente se refresque: lo usa la recarga por
  // conflicto de versión.
  const openStation = (id: number, source?: RoomData) => {
    const from = source ?? { stations, items, results, tasks };
    const station = from.stations.find(s => s.id === id);
    if (!station) return;
    // Al reabrir sobre el propio cajón no se pisa el origen: el foco tiene que
    // volver al puesto del plano desde el que se abrió la primera vez.
    if (!drawerReturnFocusRef.current) drawerReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setRedCadena(null);
    setDrawerOpenings(current => current + 1);
    setSelected(id); setDraft({ ...station }); setInitialDraft({ ...station }); setShowAdminPin(false); setShowStudentPin(false);
    const next: Record<string, boolean> = {};
    from.items.forEach(item => { next[item.id] = !!from.results.find(r => r.cubicleId === id && r.itemId === item.id)?.checked; });
    setChecks(next); setInitialChecks(next); setDrawerError(""); setVersionConflict(false); setTaskError(""); setFieldErrors({});
    setLoadingPins(true);
    const session = ++drawerSessionRef.current;
    void (async () => {
      try {
        const response = await fetch(`/api/room?pinFor=${id}`, { cache: "no-store" });
        if (!response.ok) throw new Error(await readApiError(response, "No fue posible cargar los PIN."));
        const pins = await response.json() as { adminPin: string; studentPin: string };
        if (drawerSessionRef.current !== session) return;
        setDraft(current => current?.id === id ? { ...current, ...pins } : current);
        setInitialDraft(current => current?.id === id ? { ...current, ...pins } : current);
      } catch (error) {
        if (drawerSessionRef.current === session) setDrawerError(`${error instanceof Error ? error.message : "No fue posible cargar los PIN."} Cierra y vuelve a abrir la ficha antes de guardar.`);
      } finally {
        if (drawerSessionRef.current === session) setLoadingPins(false);
      }
    })();
    void (async () => {
      try {
        const response = await fetch(`/api/red/cadena?endpoint=cub:${id}`);
        if (!response.ok) throw new Error(await readApiError(response, "No fue posible consultar la cadena de red."));
        const cadena = await response.json() as { saltos: { etiqueta: string }[]; completa: boolean; motivo?: string };
        if (drawerSessionRef.current !== session) return;
        const ruta = cadena.saltos.map(salto => salto.etiqueta).join(" → ");
        setRedCadena({ texto: cadena.completa ? ruta : (cadena.motivo ?? "Sin puerto asignado"), completa: cadena.completa });
      } catch (error) {
        if (drawerSessionRef.current === session) setRedCadena({ texto: error instanceof Error ? error.message : "No fue posible consultar la cadena de red.", completa: false });
      }
    })();
  };

  const requestCloseDrawer = () => {
    if (isDirty && !window.confirm("Hay cambios sin guardar. ¿Quieres descartarlos y cerrar la ficha?")) return;
    drawerSessionRef.current += 1;
    setLoadingPins(false);
    setDraft(null); setInitialDraft(null); setSelected(null); setDrawerError(""); setVersionConflict(false); setFieldErrors({});
  };

  // Ante un conflicto de versión no sirve reintentar: la ficha local quedó
  // vieja y el servidor va a rechazar cada intento hasta que se traiga de nuevo.
  const reloadStation = async () => {
    if (!draft || saving || loading) return;
    const id = draft.id;
    if (!window.confirm("Se descartarán tus cambios locales y se traerá la versión guardada del cubículo. ¿Continuar?")) return;
    const data = await load();
    if (data) openStation(id, data);
  };

  const validateDraft = (value: Station) => {
    const errors: FieldErrors = {};
    if (!isValidIpv4(value.ip)) errors.ip = "Usa una dirección IPv4 válida, por ejemplo 192.168.1.101.";
    if (!isValidMac(value.mac)) errors.mac = "Usa una dirección MAC válida, por ejemplo 1C-83-41-1C-7D-A7.";
    if (value.adminPinStatus === "configured" && !isValidPin(value.adminPin)) errors.adminPin = "El PIN debe contener entre 4 y 64 caracteres, sin espacios.";
    if (value.studentPinStatus === "configured" && !isValidPin(value.studentPin)) errors.studentPin = "El PIN debe contener entre 4 y 64 caracteres, sin espacios.";
    const inventoryCode = value.inventoryCode.trim().toLocaleLowerCase("es-CL");
    const serialNumber = value.serialNumber.trim().toLocaleLowerCase("es-CL");
    if (inventoryCode && stations.some(station => station.id !== value.id && station.inventoryCode.trim().toLocaleLowerCase("es-CL") === inventoryCode)) errors.inventoryCode = "Este código ya está asignado a otro cubículo.";
    if (serialNumber && stations.some(station => station.id !== value.id && station.serialNumber.trim().toLocaleLowerCase("es-CL") === serialNumber)) errors.serialNumber = "Este número de serie ya está asignado a otro cubículo.";
    return errors;
  };

  // La lista y el checklist se actualizan siempre, porque reflejan lo que ya
  // quedó en el servidor. La ficha sólo se toca si sigue siendo la misma
  // sesión, y de ella únicamente se refresca la versión: lo que el usuario
  // haya seguido escribiendo durante la espera se conserva y queda marcado
  // como pendiente de guardar.
  const save = async () => {
    if (!draft || saving || loadingPins) return;
    const errors = validateDraft(draft);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setDrawerError("Revisa los campos marcados antes de guardar.");
      return;
    }
    const session = drawerSessionRef.current;
    const sent = draft;
    const sentChecks = checks;
    setSaving(true);
    setDrawerError(""); setVersionConflict(false);
    let conflict = false;
    try {
      const response = await fetch("/api/room", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...sent, checks: sentChecks }) });
      if (!response.ok) {
        const failure = await readApiFailure(response, "No fue posible guardar los cambios.");
        conflict = failure.code === "version";
        throw new Error(failure.message);
      }
      const { updatedAt } = await response.json() as { updatedAt: string };
      const saved = { ...sent, updatedAt };
      setStations(current => current.map(s => s.id === sent.id ? { ...saved, adminPin: "", studentPin: "" } : s));
      setResults(current => {
        const rest = current.filter(r => r.cubicleId !== sent.id);
        return [...rest, ...Object.entries(sentChecks).map(([itemId, checked], index) => ({ id: -index - 1, cubicleId: sent.id, itemId: Number(itemId), checked }))];
      });
      if (drawerSessionRef.current === session) {
        setDraft(current => current && current.id === sent.id ? { ...current, updatedAt } : current);
        setInitialDraft(saved); setInitialChecks({ ...sentChecks });
      }
      setLastSyncAt(new Date());
      showNotice(`Cubículo ${sent.id} actualizado correctamente.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible guardar los cambios.";
      if (drawerSessionRef.current === session) {
        setDrawerError(conflict ? message : `${message} Tus cambios siguen en la ficha; vuelve a intentarlo.`);
        setVersionConflict(conflict);
      }
      showNotice(`No se guardaron los cambios del cubículo ${sent.id}.`, "error");
    } finally {
      setSaving(false);
    }
  };

  // El manejador vive en un ref y el listener se inscribe una sola vez. Con el
  // closure directo el efecto no podía llevar dependencias —necesita el `draft`
  // y los `checks` del render actual—, así que se reinscribía en cada tecla
  // escrita dentro del cajón.
  useEffect(() => {
    shortcutsRef.current = (event: KeyboardEvent) => {
      if (!draft) return;
      if (event.key === "Escape") { event.preventDefault(); requestCloseDrawer(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); }
      if (event.key === "Tab") {
        const drawerElement = document.querySelector<HTMLElement>(".drawer.open");
        const focusable = drawerElement ? Array.from(drawerElement.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')) : [];
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (first && last && event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (first && last && !event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => shortcutsRef.current(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const addChecklist = async () => {
    const label = newCheck.trim();
    if (!label) { setChecklistError("Escribe una verificación antes de agregarla."); return; }
    if (label.length > 120) { setChecklistError("La verificación no puede superar 120 caracteres."); return; }
    if (busyAction) return;
    setBusyAction("add-checklist"); setChecklistError("");
    try {
      const response = await fetch("/api/checklist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
      if (!response.ok) throw new Error(await readApiError(response, "No fue posible agregar la verificación."));
      const { item } = await response.json() as { item: Item };
      setItems(current => [...current, item]); setNewCheck(""); showNotice("Verificación agregada.");
    } catch (error) {
      setChecklistError(error instanceof Error ? error.message : "No fue posible agregar la verificación.");
    } finally { setBusyAction(""); }
  };

  const removeChecklist = async (id: number) => {
    if (!confirm("¿Eliminar esta verificación y sus resultados de todos los cubículos? Esta acción no se puede deshacer.")) return;
    if (busyAction) return;
    setBusyAction(`delete-checklist-${id}`); setChecklistError("");
    try {
      const response = await fetch(`/api/checklist?id=${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await readApiError(response, "No fue posible eliminar la verificación."));
      setItems(current => current.filter(i => i.id !== id)); setResults(current => current.filter(r => r.itemId !== id)); showNotice("Verificación eliminada.");
    } catch (error) {
      setChecklistError(error instanceof Error ? error.message : "No fue posible eliminar la verificación.");
    } finally { setBusyAction(""); }
  };

  const addTask = async () => {
    const description = newTask.trim();
    if (!draft || !description) { setTaskError("Escribe una tarea antes de agregarla."); return; }
    if (description.length > 160) { setTaskError("La tarea no puede superar 160 caracteres."); return; }
    if (busyAction) return;
    setBusyAction("add-task"); setTaskError("");
    try {
      const response = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cubicleId: draft.id, description }) });
      if (!response.ok) throw new Error(await readApiError(response, "No fue posible agregar la tarea."));
      const { task } = await response.json() as { task: Task };
      setTasks(current => [...current, task]); setNewTask(""); showNotice("Tarea agregada.");
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "No fue posible agregar la tarea.");
    } finally { setBusyAction(""); }
  };

  const toggleTask = async (task: Task) => {
    if (busyAction) return;
    const completed = !task.completed;
    setBusyAction(`toggle-task-${task.id}`); setTaskError("");
    try {
      const response = await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: task.id, completed }) });
      if (!response.ok) throw new Error(await readApiError(response, "No fue posible actualizar la tarea."));
      setTasks(current => current.map(item => item.id === task.id ? { ...item, completed } : item));
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "No fue posible actualizar la tarea.");
    } finally { setBusyAction(""); }
  };

  // El borrado se confirma por temporizador, con la ficha abierta o cerrada, así
  // que el fallo se informa por el toast global: `taskError` sólo se ve dentro
  // del cajón y ahí el error pasaría inadvertido.
  const commitTaskDeletion = async (task: Task) => {
    taskDeleteTimerRef.current = null;
    setPendingTaskDeletion(null);
    try {
      const response = await fetch(`/api/tasks?id=${task.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await readApiError(response, "No fue posible eliminar la tarea."));
      setTasks(current => current.filter(item => item.id !== task.id));
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "No fue posible eliminar la tarea.", "error");
    }
  };

  const removeTask = (task: Task) => {
    if (pendingTaskDeletion) return;
    setPendingTaskDeletion(task); setTaskError("");
    taskDeleteTimerRef.current = setTimeout(() => void commitTaskDeletion(task), 6000);
  };

  const undoTaskDeletion = () => {
    if (taskDeleteTimerRef.current) clearTimeout(taskDeleteTimerRef.current);
    taskDeleteTimerRef.current = null; setPendingTaskDeletion(null); showNotice("La tarea se conservó.");
  };

  // Marcar el puesto como vacío apaga los dos PIN, y volver a ponerle
  // computador los devuelve a "sin revisar": dejarlos en "no aplica" declararía
  // algo falso de un equipo que sí está.
  const changeStatus = (status: Status) => {
    if (!draft) return;
    if (status === "no_computer") { setDraft({ ...draft, status, adminPinStatus: "not_applicable", studentPinStatus: "not_applicable" }); return; }
    const restore = (current: PinStatus) => draft.status === "no_computer" && current === "not_applicable" ? "unreviewed" : current;
    setDraft({ ...draft, status, adminPinStatus: restore(draft.adminPinStatus), studentPinStatus: restore(draft.studentPinStatus) });
  };

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">SE</span><div><strong>Sala de Enlace</strong><span>Control de equipamiento</span></div><NavSecciones activa="sala" /></div>
        <div className="header-actions"><button className="icon-button" onClick={() => void load()} aria-label={loading ? "Actualizando datos" : "Actualizar datos"} disabled={loading}>{loading ? "…" : "↻"}</button><div className="date-chip"><span>ÚLTIMA SINCRONIZACIÓN</span><b>{lastSyncAt ? new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(lastSyncAt) : "Sin sincronizar"}</b></div></div>
      </header>

      <section className="shell">
        {loadError && <div className="error-banner" role="alert"><span>{loadError}</span><button type="button" onClick={() => void load()} disabled={loading}>{loading ? "Reintentando…" : "Reintentar"}</button></div>}
        <div className="workspace-head"><div><h1>Estado de la sala</h1><p className="subtitle">40 puestos en 4 filas. Selecciona uno para revisar o actualizar.</p></div><button className="secondary toolbar-action" onClick={() => (document.getElementById("checklist-admin") as HTMLDialogElement | null)?.showModal()}>Administrar checklist</button></div>

        <section className="status-rail" aria-label="Filtros y pendientes de la sala">
          <div className="status-filters">
            {(["operational", "attention", "offline", "pending", "no_computer"] as Status[]).map(status => <button key={status} className={`status-filter ${status} ${filter === status ? "active" : ""}`} aria-pressed={filter === status} onClick={() => setFilter(filter === status ? "all" : status)}><i aria-hidden="true">{statusInfo[status].short}</i><strong>{loaded ? counts[status] : "—"}</strong><span>{statusInfo[status].label}</span></button>)}
          </div>
          <p className="pending-line"><span><strong>{loaded ? pendingSummary.checklist : "—"}</strong> revisiones pendientes</span><span><strong>{loaded ? pendingSummary.tasks : "—"}</strong> tareas</span></p>
        </section>

        <EncendidoProgramado onAviso={showNotice} />

        <section className="room-surface">
          <div className="room-toolbar"><h2>Plano de la sala</h2><label className="search"><span aria-hidden="true">⌕</span><span className="sr-only">Buscar cubículo, IP, MAC, serie o inventario</span><input value={query} aria-label="Buscar cubículo, IP, MAC, serie o inventario" onChange={e => setQuery(e.target.value)} placeholder="Buscar cubículo, IP, MAC o serie" /></label></div>
          <div className={`room-plan ${loading ? "is-loading" : ""} ${loaded ? "" : "no-data"}`}>
            <div className="wall-label left">MURO INTERIOR</div>
            {[0, 1, 2, 3].map((row) => <section className={`computer-row row-${row + 1}`} key={row} aria-label={`Fila ${4 - row}`}>
              <div className="row-title"><span>FILA {4 - row}</span>{row !== 3 && <small>{row === 0 ? "Muro izquierdo" : "Isla central"}</small>}</div>
              <div className="row-stations">{layoutStations.slice(row * 10, row * 10 + 10).map(station => <button key={station.id} disabled={!loaded || !visible(station)} className={`station ${station.status} ${selected === station.id ? "selected" : ""}`} onClick={() => openStation(station.id)} aria-label={loaded ? `Cubículo ${station.id}, ${statusInfo[station.status].label}` : `Cubículo ${station.id}, sin datos cargados`}><span className="station-top"><b>{String(station.id).padStart(2, "0")}</b><i>{loaded ? statusInfo[station.status].short : "—"}</i></span>{station.status !== "no_computer" && <span className="monitor"><i></i></span>}<small>{!loaded ? "Sin datos" : station.status === "no_computer" ? "Puesto vacío" : station.inventoryCode || station.brandModel || "Sin registrar"}</small></button>)}</div>
            </section>)}
            <div className="wall-label right">VENTANALES</div>
            <div className="access-door"><i></i><span>PUERTA DE ACCESO</span></div>
            <div className="main-aisle">ESCRITORIO PRINCIPAL</div>
          </div>
        </section>
      </section>

      <aside className={`drawer ${draft ? "open" : ""}`} aria-hidden={!draft} aria-busy={draft ? loadingPins : undefined} role="dialog" aria-modal={!!draft} aria-labelledby="drawer-title">
        {draft && <><div className="drawer-head"><div><span>FICHA DE EQUIPO</span><h2 id="drawer-title">Cubículo {String(draft.id).padStart(2, "0")}</h2>{isDirty && <small className="unsaved-label">Cambios sin guardar</small>}</div><button ref={closeButtonRef} onClick={requestCloseDrawer} aria-label="Cerrar">×</button></div><div className="drawer-body">
          {loadingPins && <div className="loading-note" role="status">Cargando credenciales protegidas…</div>}
          {drawerError && <div className="inline-error" role="alert"><span>{drawerError}</span>{versionConflict && <button type="button" disabled={saving || loading} onClick={() => void reloadStation()}>{loading ? "Recargando…" : "Recargar ficha"}</button>}</div>}
          <label>Estado<select className={`status-select ${draft.status}`} value={draft.status} onChange={e => changeStatus(e.target.value as Status)}>{Object.entries(statusInfo).map(([value, info]) => <option key={value} value={value}>{info.label}</option>)}</select></label>
          <div className="two-cols"><label>Marca y modelo<input value={draft.brandModel} maxLength={160} onChange={e => setDraft({ ...draft, brandModel: e.target.value })} placeholder="Ej: Dell OptiPlex 7090" /></label><label>N.º de serie<input value={draft.serialNumber} maxLength={100} aria-invalid={!!fieldErrors.serialNumber} aria-describedby={fieldErrors.serialNumber ? "serial-error" : undefined} onChange={e => { setDraft({ ...draft, serialNumber: e.target.value }); setFieldErrors(current => ({ ...current, serialNumber: undefined })); }} placeholder="S/N del equipo" />{fieldErrors.serialNumber && <small id="serial-error" className="field-error">{fieldErrors.serialNumber}</small>}</label></div>
          <label>Código de inventario fijo<input value={draft.inventoryCode} maxLength={100} aria-invalid={!!fieldErrors.inventoryCode} aria-describedby={fieldErrors.inventoryCode ? "inventory-error" : undefined} onChange={e => { setDraft({ ...draft, inventoryCode: e.target.value }); setFieldErrors(current => ({ ...current, inventoryCode: undefined })); }} placeholder="Ej: AF-2026-001" />{fieldErrors.inventoryCode && <small id="inventory-error" className="field-error">{fieldErrors.inventoryCode}</small>}</label>
          <div className="two-cols"><label>Conexión a internet<select value={draft.internetType} onChange={e => setDraft({ ...draft, internetType: e.target.value as InternetType })}>{Object.entries(internetInfo).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Estado del enchufe<select value={draft.outletStatus} onChange={e => setDraft({ ...draft, outletStatus: e.target.value as OutletStatus })}>{Object.entries(outletInfo).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
          <div className="two-cols pin-fields"><div className="pin-control"><label>PIN administrador<select value={draft.adminPinStatus} onChange={e => { const value = e.target.value as PinStatus; setDraft({ ...draft, adminPinStatus: value, ...(value !== "configured" ? { adminPin: "" } : {}) }); setFieldErrors(current => ({ ...current, adminPin: undefined })); }}>{Object.entries(pinInfo).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{draft.adminPinStatus === "configured" && <label className="pin-entry">Ingresar PIN<div><input type={showAdminPin ? "text" : "password"} autoComplete="off" maxLength={64} disabled={loadingPins} aria-invalid={!!fieldErrors.adminPin} aria-describedby={fieldErrors.adminPin ? "admin-pin-error" : undefined} value={draft.adminPin} onChange={e => { setDraft({ ...draft, adminPin: e.target.value.replace(/\s/g, "") }); setFieldErrors(current => ({ ...current, adminPin: undefined })); }} placeholder="4 a 64 caracteres" /><button type="button" onClick={() => setShowAdminPin(!showAdminPin)}>{showAdminPin ? "Ocultar" : "Ver"}</button></div>{fieldErrors.adminPin && <small id="admin-pin-error" className="field-error">{fieldErrors.adminPin}</small>}</label>}</div><div className="pin-control"><label>PIN cuenta estudiante<select value={draft.studentPinStatus} onChange={e => { const value = e.target.value as PinStatus; setDraft({ ...draft, studentPinStatus: value, ...(value !== "configured" ? { studentPin: "" } : {}) }); setFieldErrors(current => ({ ...current, studentPin: undefined })); }}>{Object.entries(pinInfo).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{draft.studentPinStatus === "configured" && <label className="pin-entry">Ingresar PIN<div><input type={showStudentPin ? "text" : "password"} autoComplete="off" maxLength={64} disabled={loadingPins} aria-invalid={!!fieldErrors.studentPin} aria-describedby={fieldErrors.studentPin ? "student-pin-error" : undefined} value={draft.studentPin} onChange={e => { setDraft({ ...draft, studentPin: e.target.value.replace(/\s/g, "") }); setFieldErrors(current => ({ ...current, studentPin: undefined })); }} placeholder="4 a 64 caracteres" /><button type="button" onClick={() => setShowStudentPin(!showStudentPin)}>{showStudentPin ? "Ocultar" : "Ver"}</button></div>{fieldErrors.studentPin && <small id="student-pin-error" className="field-error">{fieldErrors.studentPin}</small>}</label>}</div></div>
          <div className="two-cols"><label>Dirección IP<input value={draft.ip} maxLength={15} inputMode="decimal" aria-invalid={!!fieldErrors.ip} aria-describedby={fieldErrors.ip ? "ip-error" : undefined} onChange={e => { setDraft({ ...draft, ip: e.target.value }); setFieldErrors(current => ({ ...current, ip: undefined })); }} placeholder="Ej: 192.168.1.101" />{fieldErrors.ip && <small id="ip-error" className="field-error">{fieldErrors.ip}</small>}</label><label>Dirección MAC<input value={draft.mac} maxLength={20} autoCapitalize="characters" aria-invalid={!!fieldErrors.mac} aria-describedby={fieldErrors.mac ? "mac-error" : undefined} onChange={e => { setDraft({ ...draft, mac: e.target.value.toUpperCase() }); setFieldErrors(current => ({ ...current, mac: undefined })); }} placeholder="Ej: 1C-83-41-1C-7D-A7" />{fieldErrors.mac && <small id="mac-error" className="field-error">{fieldErrors.mac}</small>}</label></div>
          <div className="net-line"><span>RED</span>{redCadena ? <b className={redCadena.completa ? "" : "pending"}>{redCadena.texto}</b> : <b className="pending">Consultando…</b>}<a href={`/red?endpoint=cub:${draft.id}`}>Ver en la pestaña Red</a></div>
          <div className="two-cols"><label>Teclado<select value={draft.keyboard} onChange={e => setDraft({ ...draft, keyboard: e.target.value })}><option>Sin registrar</option><option>Operativo</option><option>Con fallas</option><option>No disponible</option></select></label><label>Mouse<select value={draft.mouse} onChange={e => setDraft({ ...draft, mouse: e.target.value })}><option>Sin registrar</option><option>Operativo</option><option>Con fallas</option><option>No disponible</option></select></label></div>
          <div className="check-section"><div><span>CHECKLIST</span><small>{draft.status === "no_computer" ? "No aplica" : `${Object.values(checks).filter(Boolean).length} de ${items.length} completados`}</small></div>{draft.status === "no_computer" ? <p className="empty-state">Un puesto sin computador no entra en el checklist de la sala.</p> : items.map(item => <label className="check-row" key={item.id}><input type="checkbox" checked={!!checks[item.id]} onChange={e => setChecks({ ...checks, [item.id]: e.target.checked })} /><span>{item.label}</span></label>)}</div>
          <div className="task-section"><div className="task-heading"><span>TAREAS ESPECÍFICAS</span><small>{tasks.filter(task => task.cubicleId === draft.id && !task.completed && task.id !== pendingTaskDeletion?.id).length} pendientes</small></div>{taskError && <div className="field-error" role="alert">{taskError}</div>}<div className="task-list">{tasks.filter(task => task.cubicleId === draft.id && task.id !== pendingTaskDeletion?.id).map(task => <div className={`task-row ${task.completed ? "completed" : ""}`} key={task.id}><button className="task-check" type="button" disabled={!!busyAction} onClick={() => void toggleTask(task)} aria-label={task.completed ? "Marcar pendiente" : "Marcar completada"}>{task.completed ? "✓" : ""}</button><span>{task.description}</span><button className="task-delete" type="button" disabled={!!pendingTaskDeletion || !!busyAction} onClick={() => removeTask(task)} aria-label="Eliminar tarea">×</button></div>)}</div><div className="task-add"><input value={newTask} maxLength={160} aria-label="Nueva tarea específica" aria-invalid={!!taskError} onChange={e => { setNewTask(e.target.value); setTaskError(""); }} onKeyDown={e => e.key === "Enter" && void addTask()} placeholder="Ej: Actualizar tarjeta Wi‑Fi" /><button type="button" disabled={!!busyAction} onClick={() => void addTask()}>{busyAction === "add-task" ? "Agregando…" : "Agregar"}</button></div></div>
          <label>Observaciones<textarea value={draft.observations} maxLength={2000} onChange={e => setDraft({ ...draft, observations: e.target.value })} placeholder="Registra fallas, cambios o información relevante…" rows={4} /><small className="character-count">{draft.observations.length}/2000</small></label>
        </div><div className="drawer-foot"><span className="shortcut-hint">Ctrl/⌘ + S para guardar</span><button className="secondary" onClick={requestCloseDrawer} disabled={saving}>Cancelar</button><button className="primary" onClick={save} disabled={saving || loadingPins || !isDirty}>{loadingPins ? "Cargando…" : saving ? "Guardando…" : isDirty ? "Guardar cambios" : "Sin cambios"}</button></div></>}
      </aside>
      {draft && <button className="backdrop" onClick={requestCloseDrawer} aria-label="Cerrar ficha" />}

      <dialog id="checklist-admin" className="modal"><div className="modal-head"><div><span>CONFIGURACIÓN POR LOTE</span><h2>Checklist de la sala</h2><p>Cada nueva verificación se aplicará a los cubículos que tengan computador.</p></div><button onClick={() => (document.getElementById("checklist-admin") as HTMLDialogElement)?.close()} aria-label="Cerrar checklist">×</button></div>{checklistError && <div className="modal-error" role="alert">{checklistError}</div>}<div className="modal-list">{items.length ? items.map(item => <div key={item.id}><span>{item.label}</span><button disabled={!!busyAction} onClick={() => removeChecklist(item.id)} aria-label={`Eliminar ${item.label}`}>{busyAction === `delete-checklist-${item.id}` ? "Eliminando…" : "Eliminar"}</button></div>) : <p className="empty-state">Aún no hay verificaciones. Agrega la primera para comenzar.</p>}</div><div className="add-row"><input value={newCheck} maxLength={120} aria-label="Nueva verificación del checklist" aria-invalid={!!checklistError} onChange={e => { setNewCheck(e.target.value); setChecklistError(""); }} onKeyDown={e => e.key === "Enter" && void addChecklist()} placeholder="Nueva verificación (ej: Cámara web)" /><button className="primary" disabled={!!busyAction} onClick={addChecklist}>{busyAction === "add-checklist" ? "Agregando…" : "Agregar"}</button></div></dialog>
      {pendingTaskDeletion && <div className="undo-toast" role="status"><span>Tarea eliminada.</span><button type="button" onClick={undoTaskDeletion}>Deshacer</button></div>}
      {notice && <div className={`toast ${noticeKind}`} role={noticeKind === "error" ? "alert" : "status"} aria-live="polite">{notice}</div>}
    </main>
  );
}
