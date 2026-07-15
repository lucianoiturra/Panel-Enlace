"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Status = "operational" | "attention" | "offline" | "pending" | "no_computer";
type PinStatus = "unreviewed" | "configured" | "no_pin" | "not_applicable";
type InternetType = "unreviewed" | "ethernet" | "wifi" | "none";
type OutletStatus = "unreviewed" | "operational" | "repair";
type Station = { id: number; brandModel: string; serialNumber: string; inventoryCode: string; adminPinStatus: PinStatus; studentPinStatus: PinStatus; adminPin: string; studentPin: string; internetType: InternetType; outletStatus: OutletStatus; keyboard: string; mouse: string; ip: string; mac: string; observations: string; status: Status; updatedAt: string };
type Item = { id: number; label: string; createdAt: string };
type Result = { id: number; cubicleId: number; itemId: number; checked: boolean };
type Task = { id: number; cubicleId: number; description: string; completed: boolean; createdAt: string };
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

const readApiError = async (response: Response, fallback: string) => {
  try {
    const data = await response.json() as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
};

const isValidIpv4 = (value: string) => {
  if (!value.trim()) return true;
  const parts = value.trim().split(".");
  return parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
};

const isValidMac = (value: string) => !value.trim() || /^(?:[0-9A-F]{2}-){5,6}[0-9A-F]{2}$/i.test(value.trim());
const isValidPin = (value: string) => /^[^\s]{4,64}$/.test(value.trim());

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
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeKind, setNoticeKind] = useState<"success" | "error">("success");
  const [loadError, setLoadError] = useState("");
  const [drawerError, setDrawerError] = useState("");
  const [taskError, setTaskError] = useState("");
  const [checklistError, setChecklistError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [busyAction, setBusyAction] = useState("");
  const [pendingTaskDeletion, setPendingTaskDeletion] = useState<Task | null>(null);
  const [newCheck, setNewCheck] = useState("");
  const [showAdminPin, setShowAdminPin] = useState(false);
  const [showStudentPin, setShowStudentPin] = useState(false);
  const [newTask, setNewTask] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const taskDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = (message: string, kind: "success" | "error" = "success") => {
    setNotice(message);
    setNoticeKind(kind);
  };

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/room");
      if (!response.ok) throw new Error(await readApiError(response, "No fue posible cargar los datos."));
      const data = await response.json() as { stations: Station[]; items: Item[]; results: Result[]; tasks: Task[] };
      setStations(data.stations); setItems(data.items); setResults(data.results); setTasks(data.tasks);
      setLastSyncAt(new Date());
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo conectar con el almacenamiento.";
      setLoadError(`${message} Revisa la conexión e inténtalo nuevamente.`);
      showNotice("No se pudieron actualizar los datos.", "error");
    }
    finally { setLoading(false); }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // Initial fetch only; manual refreshes call load directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (selected !== null) closeButtonRef.current?.focus();
  }, [selected]);

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
    return { checklist: Math.max(0, activeIds.size * items.length - completedChecks), tasks: tasks.filter(task => !task.completed).length };
  }, [stations, items, results, tasks]);

  const visible = (station: Station) => {
    const text = `${station.id} ${station.ip} ${station.mac} ${station.serialNumber} ${station.inventoryCode} ${station.brandModel}`.toLowerCase();
    return (filter === "all" || station.status === filter) && text.includes(query.toLowerCase());
  };

  const openStation = (id: number) => {
    const station = stations.find(s => s.id === id)!;
    setSelected(id); setDraft({ ...station }); setInitialDraft({ ...station }); setShowAdminPin(false); setShowStudentPin(false);
    const next: Record<string, boolean> = {};
    items.forEach(item => { next[item.id] = !!results.find(r => r.cubicleId === id && r.itemId === item.id)?.checked; });
    setChecks(next); setInitialChecks(next); setDrawerError(""); setTaskError(""); setFieldErrors({});
  };

  const requestCloseDrawer = () => {
    if (isDirty && !window.confirm("Hay cambios sin guardar. ¿Quieres descartarlos y cerrar la ficha?")) return;
    setDraft(null); setInitialDraft(null); setSelected(null); setDrawerError(""); setFieldErrors({});
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

  const save = async () => {
    if (!draft || saving) return;
    const errors = validateDraft(draft);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setDrawerError("Revisa los campos marcados antes de guardar.");
      return;
    }
    setSaving(true);
    setDrawerError("");
    try {
      const response = await fetch("/api/room", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, checks }) });
      if (!response.ok) throw new Error(await readApiError(response, "No fue posible guardar los cambios."));
      const saved = { ...draft, updatedAt: new Date().toISOString() };
      setStations(current => current.map(s => s.id === draft.id ? saved : s));
      setResults(current => {
        const rest = current.filter(r => r.cubicleId !== draft.id);
        return [...rest, ...Object.entries(checks).map(([itemId, checked], index) => ({ id: -index - 1, cubicleId: draft.id, itemId: Number(itemId), checked }))];
      });
      setDraft(saved); setInitialDraft(saved); setInitialChecks({ ...checks }); setLastSyncAt(new Date());
      showNotice(`Cubículo ${draft.id} actualizado correctamente.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No fue posible guardar los cambios.";
      setDrawerError(`${message} Tus cambios siguen en la ficha; vuelve a intentarlo.`);
      showNotice("No se guardaron los cambios.", "error");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!draft) return;
    const onKeyDown = (event: KeyboardEvent) => {
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
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

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

  const commitTaskDeletion = async (task: Task) => {
    setPendingTaskDeletion(null);
    try {
      const response = await fetch(`/api/tasks?id=${task.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await readApiError(response, "No fue posible eliminar la tarea."));
      setTasks(current => current.filter(item => item.id !== task.id));
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "No fue posible eliminar la tarea.");
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

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">SE</span><div><strong>Sala de Enlace</strong><span>Control de equipamiento</span></div></div>
        <div className="header-actions"><button className="icon-button" onClick={() => void load()} aria-label={loading ? "Actualizando datos" : "Actualizar datos"} disabled={loading}>{loading ? "…" : "↻"}</button><div className="date-chip"><span>ÚLTIMA SINCRONIZACIÓN</span><b>{lastSyncAt ? new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(lastSyncAt) : "Sin sincronizar"}</b></div></div>
      </header>

      <section className="shell">
        {loadError && <div className="error-banner" role="alert"><span>{loadError}</span><button type="button" onClick={() => void load()} disabled={loading}>{loading ? "Reintentando…" : "Reintentar"}</button></div>}
        <div className="workspace-head"><div><h1>Estado de la sala</h1><p className="subtitle">40 puestos en 4 filas. Selecciona uno para revisar o actualizar.</p></div><button className="secondary toolbar-action" onClick={() => (document.getElementById("checklist-admin") as HTMLDialogElement | null)?.showModal()}>Administrar checklist</button></div>

        <section className="status-rail" aria-label="Filtros y pendientes de la sala">
          <div className="status-filters">
            {(["operational", "attention", "offline", "pending", "no_computer"] as Status[]).map(status => <button key={status} className={`status-filter ${status} ${filter === status ? "active" : ""}`} aria-pressed={filter === status} onClick={() => setFilter(filter === status ? "all" : status)}><i aria-hidden="true">{statusInfo[status].short}</i><strong>{counts[status]}</strong><span>{statusInfo[status].label}</span></button>)}
          </div>
          <p className="pending-line"><span><strong>{pendingSummary.checklist}</strong> revisiones pendientes</span><span><strong>{pendingSummary.tasks}</strong> tareas</span></p>
        </section>

        <section className="room-surface">
          <div className="room-toolbar"><h2>Plano de la sala</h2><label className="search"><span aria-hidden="true">⌕</span><span className="sr-only">Buscar cubículo, IP, MAC, serie o inventario</span><input value={query} aria-label="Buscar cubículo, IP, MAC, serie o inventario" onChange={e => setQuery(e.target.value)} placeholder="Buscar cubículo, IP, MAC o serie" /></label></div>
          <div className={`room-plan ${loading ? "is-loading" : ""}`}>
            <div className="wall-label left">MURO INTERIOR</div>
            {[0, 1, 2, 3].map((row) => <section className={`computer-row row-${row + 1}`} key={row} aria-label={`Fila ${4 - row}`}>
              <div className="row-title"><span>FILA {4 - row}</span>{row !== 3 && <small>{row === 0 ? "Muro izquierdo" : "Isla central"}</small>}</div>
              <div className="row-stations">{layoutStations.slice(row * 10, row * 10 + 10).map(station => <button key={station.id} disabled={!visible(station)} className={`station ${station.status} ${selected === station.id ? "selected" : ""}`} onClick={() => openStation(station.id)} aria-label={`Cubículo ${station.id}, ${statusInfo[station.status].label}`}><span className="station-top"><b>{String(station.id).padStart(2, "0")}</b><i>{statusInfo[station.status].short}</i></span>{station.status !== "no_computer" && <span className="monitor"><i></i></span>}<small>{station.status === "no_computer" ? "Puesto vacío" : station.inventoryCode || station.brandModel || "Sin registrar"}</small></button>)}</div>
            </section>)}
            <div className="wall-label right">VENTANALES</div>
            <div className="access-door"><i></i><span>PUERTA DE ACCESO</span></div>
            <div className="main-aisle">ESCRITORIO PRINCIPAL</div>
          </div>
        </section>
      </section>

      <aside className={`drawer ${draft ? "open" : ""}`} aria-hidden={!draft} role="dialog" aria-modal={!!draft} aria-labelledby="drawer-title">
        {draft && <><div className="drawer-head"><div><span>FICHA DE EQUIPO</span><h2 id="drawer-title">Cubículo {String(draft.id).padStart(2, "0")}</h2>{isDirty && <small className="unsaved-label">Cambios sin guardar</small>}</div><button ref={closeButtonRef} onClick={requestCloseDrawer} aria-label="Cerrar">×</button></div><div className="drawer-body">
          {drawerError && <div className="inline-error" role="alert">{drawerError}</div>}
          <label>Estado<select className={`status-select ${draft.status}`} value={draft.status} onChange={e => { const status = e.target.value as Status; setDraft({ ...draft, status, ...(status === "no_computer" ? { adminPinStatus: "not_applicable", studentPinStatus: "not_applicable" } : {}) }); }}>{Object.entries(statusInfo).map(([value, info]) => <option key={value} value={value}>{info.label}</option>)}</select></label>
          <div className="two-cols"><label>Marca y modelo<input value={draft.brandModel} maxLength={160} onChange={e => setDraft({ ...draft, brandModel: e.target.value })} placeholder="Ej: Dell OptiPlex 7090" /></label><label>N.º de serie<input value={draft.serialNumber} maxLength={100} aria-invalid={!!fieldErrors.serialNumber} aria-describedby={fieldErrors.serialNumber ? "serial-error" : undefined} onChange={e => { setDraft({ ...draft, serialNumber: e.target.value }); setFieldErrors(current => ({ ...current, serialNumber: undefined })); }} placeholder="S/N del equipo" />{fieldErrors.serialNumber && <small id="serial-error" className="field-error">{fieldErrors.serialNumber}</small>}</label></div>
          <label>Código de inventario fijo<input value={draft.inventoryCode} maxLength={100} aria-invalid={!!fieldErrors.inventoryCode} aria-describedby={fieldErrors.inventoryCode ? "inventory-error" : undefined} onChange={e => { setDraft({ ...draft, inventoryCode: e.target.value }); setFieldErrors(current => ({ ...current, inventoryCode: undefined })); }} placeholder="Ej: AF-2026-001" />{fieldErrors.inventoryCode && <small id="inventory-error" className="field-error">{fieldErrors.inventoryCode}</small>}</label>
          <div className="two-cols"><label>Conexión a internet<select value={draft.internetType} onChange={e => setDraft({ ...draft, internetType: e.target.value as InternetType })}>{Object.entries(internetInfo).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Estado del enchufe<select value={draft.outletStatus} onChange={e => setDraft({ ...draft, outletStatus: e.target.value as OutletStatus })}>{Object.entries(outletInfo).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
          <div className="two-cols pin-fields"><div className="pin-control"><label>PIN administrador<select value={draft.adminPinStatus} onChange={e => { const value = e.target.value as PinStatus; setDraft({ ...draft, adminPinStatus: value, ...(value !== "configured" ? { adminPin: "" } : {}) }); setFieldErrors(current => ({ ...current, adminPin: undefined })); }}>{Object.entries(pinInfo).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{draft.adminPinStatus === "configured" && <label className="pin-entry">Ingresar PIN<div><input type={showAdminPin ? "text" : "password"} autoComplete="off" maxLength={64} aria-invalid={!!fieldErrors.adminPin} aria-describedby={fieldErrors.adminPin ? "admin-pin-error" : undefined} value={draft.adminPin} onChange={e => { setDraft({ ...draft, adminPin: e.target.value.replace(/\s/g, "") }); setFieldErrors(current => ({ ...current, adminPin: undefined })); }} placeholder="4 a 64 caracteres" /><button type="button" onClick={() => setShowAdminPin(!showAdminPin)}>{showAdminPin ? "Ocultar" : "Ver"}</button></div>{fieldErrors.adminPin && <small id="admin-pin-error" className="field-error">{fieldErrors.adminPin}</small>}</label>}</div><div className="pin-control"><label>PIN cuenta estudiante<select value={draft.studentPinStatus} onChange={e => { const value = e.target.value as PinStatus; setDraft({ ...draft, studentPinStatus: value, ...(value !== "configured" ? { studentPin: "" } : {}) }); setFieldErrors(current => ({ ...current, studentPin: undefined })); }}>{Object.entries(pinInfo).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{draft.studentPinStatus === "configured" && <label className="pin-entry">Ingresar PIN<div><input type={showStudentPin ? "text" : "password"} autoComplete="off" maxLength={64} aria-invalid={!!fieldErrors.studentPin} aria-describedby={fieldErrors.studentPin ? "student-pin-error" : undefined} value={draft.studentPin} onChange={e => { setDraft({ ...draft, studentPin: e.target.value.replace(/\s/g, "") }); setFieldErrors(current => ({ ...current, studentPin: undefined })); }} placeholder="4 a 64 caracteres" /><button type="button" onClick={() => setShowStudentPin(!showStudentPin)}>{showStudentPin ? "Ocultar" : "Ver"}</button></div>{fieldErrors.studentPin && <small id="student-pin-error" className="field-error">{fieldErrors.studentPin}</small>}</label>}</div></div>
          <div className="two-cols"><label>Dirección IP<input value={draft.ip} maxLength={15} inputMode="decimal" aria-invalid={!!fieldErrors.ip} aria-describedby={fieldErrors.ip ? "ip-error" : undefined} onChange={e => { setDraft({ ...draft, ip: e.target.value }); setFieldErrors(current => ({ ...current, ip: undefined })); }} placeholder="Ej: 192.168.1.101" />{fieldErrors.ip && <small id="ip-error" className="field-error">{fieldErrors.ip}</small>}</label><label>Dirección MAC<input value={draft.mac} maxLength={20} autoCapitalize="characters" aria-invalid={!!fieldErrors.mac} aria-describedby={fieldErrors.mac ? "mac-error" : undefined} onChange={e => { setDraft({ ...draft, mac: e.target.value.toUpperCase() }); setFieldErrors(current => ({ ...current, mac: undefined })); }} placeholder="Ej: 1C-83-41-1C-7D-A7" />{fieldErrors.mac && <small id="mac-error" className="field-error">{fieldErrors.mac}</small>}</label></div>
          <div className="two-cols"><label>Teclado<select value={draft.keyboard} onChange={e => setDraft({ ...draft, keyboard: e.target.value })}><option>Sin registrar</option><option>Operativo</option><option>Con fallas</option><option>No disponible</option></select></label><label>Mouse<select value={draft.mouse} onChange={e => setDraft({ ...draft, mouse: e.target.value })}><option>Sin registrar</option><option>Operativo</option><option>Con fallas</option><option>No disponible</option></select></label></div>
          <div className="check-section"><div><span>CHECKLIST</span><small>{Object.values(checks).filter(Boolean).length} de {items.length} completados</small></div>{items.map(item => <label className="check-row" key={item.id}><input type="checkbox" checked={!!checks[item.id]} onChange={e => setChecks({ ...checks, [item.id]: e.target.checked })} /><span>{item.label}</span></label>)}</div>
          <div className="task-section"><div className="task-heading"><span>TAREAS ESPECÍFICAS</span><small>{tasks.filter(task => task.cubicleId === draft.id && !task.completed && task.id !== pendingTaskDeletion?.id).length} pendientes</small></div>{taskError && <div className="field-error" role="alert">{taskError}</div>}<div className="task-list">{tasks.filter(task => task.cubicleId === draft.id && task.id !== pendingTaskDeletion?.id).map(task => <div className={`task-row ${task.completed ? "completed" : ""}`} key={task.id}><button className="task-check" type="button" disabled={!!busyAction} onClick={() => void toggleTask(task)} aria-label={task.completed ? "Marcar pendiente" : "Marcar completada"}>{task.completed ? "✓" : ""}</button><span>{task.description}</span><button className="task-delete" type="button" disabled={!!pendingTaskDeletion || !!busyAction} onClick={() => removeTask(task)} aria-label="Eliminar tarea">×</button></div>)}</div><div className="task-add"><input value={newTask} maxLength={160} aria-invalid={!!taskError} onChange={e => { setNewTask(e.target.value); setTaskError(""); }} onKeyDown={e => e.key === "Enter" && void addTask()} placeholder="Ej: Actualizar tarjeta Wi‑Fi" /><button type="button" disabled={!!busyAction} onClick={() => void addTask()}>{busyAction === "add-task" ? "Agregando…" : "Agregar"}</button></div></div>
          <label>Observaciones<textarea value={draft.observations} maxLength={2000} onChange={e => setDraft({ ...draft, observations: e.target.value })} placeholder="Registra fallas, cambios o información relevante…" rows={4} /><small className="character-count">{draft.observations.length}/2000</small></label>
        </div><div className="drawer-foot"><span className="shortcut-hint">Ctrl/⌘ + S para guardar</span><button className="secondary" onClick={requestCloseDrawer} disabled={saving}>Cancelar</button><button className="primary" onClick={save} disabled={saving || !isDirty}>{saving ? "Guardando…" : isDirty ? "Guardar cambios" : "Sin cambios"}</button></div></>}
      </aside>
      {draft && <button className="backdrop" onClick={requestCloseDrawer} aria-label="Cerrar ficha" />}

      <dialog id="checklist-admin" className="modal"><div className="modal-head"><div><span>CONFIGURACIÓN POR LOTE</span><h2>Checklist de la sala</h2><p>Cada nueva verificación se aplicará a los cubículos que tengan computador.</p></div><button onClick={() => (document.getElementById("checklist-admin") as HTMLDialogElement)?.close()} aria-label="Cerrar checklist">×</button></div>{checklistError && <div className="modal-error" role="alert">{checklistError}</div>}<div className="modal-list">{items.length ? items.map(item => <div key={item.id}><span>{item.label}</span><button disabled={!!busyAction} onClick={() => removeChecklist(item.id)} aria-label={`Eliminar ${item.label}`}>{busyAction === `delete-checklist-${item.id}` ? "Eliminando…" : "Eliminar"}</button></div>) : <p className="empty-state">Aún no hay verificaciones. Agrega la primera para comenzar.</p>}</div><div className="add-row"><input value={newCheck} maxLength={120} aria-invalid={!!checklistError} onChange={e => { setNewCheck(e.target.value); setChecklistError(""); }} onKeyDown={e => e.key === "Enter" && void addChecklist()} placeholder="Nueva verificación (ej: Cámara web)" /><button className="primary" disabled={!!busyAction} onClick={addChecklist}>{busyAction === "add-checklist" ? "Agregando…" : "Agregar"}</button></div></dialog>
      {pendingTaskDeletion && <div className="undo-toast" role="status"><span>Tarea eliminada.</span><button type="button" onClick={undoTaskDeletion}>Deshacer</button></div>}
      {notice && <div className={`toast ${noticeKind}`} role={noticeKind === "error" ? "alert" : "status"} aria-live="polite">{notice}</div>}
    </main>
  );
}
