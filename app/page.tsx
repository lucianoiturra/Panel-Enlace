"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "operational" | "attention" | "offline" | "pending";
type Station = { id: number; brandModel: string; serialNumber: string; inventoryCode: string; keyboard: string; mouse: string; ip: string; observations: string; status: Status; updatedAt: string };
type Item = { id: number; label: string; createdAt: string };
type Result = { id: number; cubicleId: number; itemId: number; checked: boolean };

const statusInfo: Record<Status, { label: string; short: string }> = {
  operational: { label: "Operativo", short: "OK" },
  attention: { label: "Requiere atención", short: "!" },
  offline: { label: "Fuera de servicio", short: "×" },
  pending: { label: "Sin revisar", short: "—" },
};

const emptyStations = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, brandModel: "", serialNumber: "", inventoryCode: "", keyboard: "Sin registrar", mouse: "Sin registrar", ip: "", observations: "", status: "pending" as Status, updatedAt: "" }));

export default function Home() {
  const [stations, setStations] = useState<Station[]>(emptyStations);
  const [items, setItems] = useState<Item[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState<Station | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<Status | "all">("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [newCheck, setNewCheck] = useState("");

  const load = async () => {
    try {
      const response = await fetch("/api/room");
      if (!response.ok) throw new Error();
      const data = await response.json() as { stations: Station[]; items: Item[]; results: Result[] };
      setStations(data.stations); setItems(data.items); setResults(data.results);
    } catch { setNotice("No se pudo conectar con el almacenamiento. Intenta recargar."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const counts = useMemo(() => ({
    operational: stations.filter(s => s.status === "operational").length,
    attention: stations.filter(s => s.status === "attention").length,
    offline: stations.filter(s => s.status === "offline").length,
    pending: stations.filter(s => s.status === "pending").length,
  }), [stations]);

  const layoutStations = useMemo(() => [...stations].sort((a, b) => b.id - a.id), [stations]);

  const visible = (station: Station) => {
    const text = `${station.id} ${station.ip} ${station.serialNumber} ${station.inventoryCode} ${station.brandModel}`.toLowerCase();
    return (filter === "all" || station.status === filter) && text.includes(query.toLowerCase());
  };

  const openStation = (id: number) => {
    const station = stations.find(s => s.id === id)!;
    setSelected(id); setDraft({ ...station });
    const next: Record<string, boolean> = {};
    items.forEach(item => { next[item.id] = !!results.find(r => r.cubicleId === id && r.itemId === item.id)?.checked; });
    setChecks(next); setNotice("");
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const response = await fetch("/api/room", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, checks }) });
    if (response.ok) {
      setStations(current => current.map(s => s.id === draft.id ? { ...draft, updatedAt: new Date().toISOString() } : s));
      setResults(current => {
        const rest = current.filter(r => r.cubicleId !== draft.id);
        return [...rest, ...Object.entries(checks).map(([itemId, checked], index) => ({ id: -index - 1, cubicleId: draft.id, itemId: Number(itemId), checked }))];
      });
      setNotice(`Cubículo ${draft.id} actualizado correctamente.`);
      setTimeout(() => setNotice(""), 3000);
    } else setNotice("No fue posible guardar los cambios.");
    setSaving(false);
  };

  const addChecklist = async () => {
    if (!newCheck.trim()) return;
    const response = await fetch("/api/checklist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: newCheck }) });
    if (response.ok) { const { item } = await response.json(); setItems(current => [...current, item]); setNewCheck(""); }
  };

  const removeChecklist = async (id: number) => {
    if (!confirm("¿Eliminar esta verificación de todos los cubículos?")) return;
    const response = await fetch(`/api/checklist?id=${id}`, { method: "DELETE" });
    if (response.ok) { setItems(current => current.filter(i => i.id !== id)); setResults(current => current.filter(r => r.itemId !== id)); }
  };

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">SE</span><div><strong>Sala de Enlace</strong><span>Control de equipamiento</span></div></div>
        <div className="header-actions"><button className="icon-button" onClick={() => void load()} aria-label="Actualizar datos">↻</button><div className="date-chip"><span>ÚLTIMA REVISIÓN</span><b>{new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", year: "numeric" }).format(new Date())}</b></div></div>
      </header>

      <section className="shell">
        <div className="hero-row"><div><p className="eyebrow">INVENTARIO EN TIEMPO REAL</p><h1>Estado de la sala</h1><p className="subtitle">40 cubículos · 4 filas · Selecciona un puesto para revisar su ficha</p></div><button className="primary" onClick={() => document.getElementById("checklist-admin")?.showModal()}>＋ Administrar checklist</button></div>

        <div className="stats">
          {(["operational", "attention", "offline", "pending"] as Status[]).map(status => <button key={status} className={`stat-card ${status} ${filter === status ? "active" : ""}`} onClick={() => setFilter(filter === status ? "all" : status)}><span className="stat-icon">{statusInfo[status].short}</span><div><strong>{counts[status]}</strong><span>{statusInfo[status].label}</span></div></button>)}
        </div>

        <section className="room-card">
          <div className="room-toolbar"><div><span className="section-kicker">PLANO DE LA SALA</span><h2>Distribución de cubículos</h2></div><label className="search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar cubículo, IP o serie" /></label></div>
          <div className="orientation"><span>ENTRADA / MESÓN TÉCNICO</span><i></i><span>PANTALLA PRINCIPAL</span></div>
          <div className={`room-plan ${loading ? "is-loading" : ""}`}>
            <div className="wall-label left">MURO INTERIOR</div>
            {[0, 1, 2, 3].map((row) => <section className={`computer-row row-${row + 1}`} key={row} aria-label={`Fila ${row + 1}`}>
              <div className="row-title"><span>FILA {row + 1}</span><small>{row === 0 ? "Muro izquierdo" : row === 3 ? "Ventanas" : "Isla central"}</small></div>
              <div className="row-stations">{layoutStations.slice(row * 10, row * 10 + 10).map(station => <button key={station.id} disabled={!visible(station)} className={`station ${station.status} ${selected === station.id ? "selected" : ""}`} onClick={() => openStation(station.id)} aria-label={`Cubículo ${station.id}, ${statusInfo[station.status].label}`}><span className="station-top"><b>{String(station.id).padStart(2, "0")}</b><i>{statusInfo[station.status].short}</i></span><span className="monitor"><i></i></span><small>{station.inventoryCode || station.brandModel || "Sin registrar"}</small></button>)}</div>
            </section>)}
            <div className="wall-label right">VENTANALES</div>
            <div className="access-door"><i></i><span>PUERTA DE ACCESO</span></div>
            <div className="main-aisle">ESCRITORIO PRINCIPAL</div>
          </div>
          <div className="legend"><span><i className="dot operational"></i>Operativo</span><span><i className="dot attention"></i>Requiere atención</span><span><i className="dot offline"></i>Fuera de servicio</span><span><i className="dot pending"></i>Sin revisar</span></div>
        </section>
      </section>

      <aside className={`drawer ${draft ? "open" : ""}`} aria-hidden={!draft}>
        {draft && <><div className="drawer-head"><div><span>FICHA DE EQUIPO</span><h2>Cubículo {String(draft.id).padStart(2, "0")}</h2></div><button onClick={() => { setDraft(null); setSelected(null); }} aria-label="Cerrar">×</button></div><div className="drawer-body">
          <label>Estado<select className={`status-select ${draft.status}`} value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as Status })}>{Object.entries(statusInfo).map(([value, info]) => <option key={value} value={value}>{info.label}</option>)}</select></label>
          <div className="two-cols"><label>Marca y modelo<input value={draft.brandModel} onChange={e => setDraft({ ...draft, brandModel: e.target.value })} placeholder="Ej: Dell OptiPlex 7090" /></label><label>N.º de serie<input value={draft.serialNumber} onChange={e => setDraft({ ...draft, serialNumber: e.target.value })} placeholder="S/N del equipo" /></label></div>
          <label>Código de inventario fijo<input value={draft.inventoryCode} onChange={e => setDraft({ ...draft, inventoryCode: e.target.value })} placeholder="Ej: AF-2026-001" /></label>
          <label>Dirección IP<input value={draft.ip} onChange={e => setDraft({ ...draft, ip: e.target.value })} placeholder="Ej: 192.168.1.101" /></label>
          <div className="two-cols"><label>Teclado<select value={draft.keyboard} onChange={e => setDraft({ ...draft, keyboard: e.target.value })}><option>Sin registrar</option><option>Operativo</option><option>Con fallas</option><option>No disponible</option></select></label><label>Mouse<select value={draft.mouse} onChange={e => setDraft({ ...draft, mouse: e.target.value })}><option>Sin registrar</option><option>Operativo</option><option>Con fallas</option><option>No disponible</option></select></label></div>
          <div className="check-section"><div><span>CHECKLIST</span><small>{Object.values(checks).filter(Boolean).length} de {items.length} completados</small></div>{items.map(item => <label className="check-row" key={item.id}><input type="checkbox" checked={!!checks[item.id]} onChange={e => setChecks({ ...checks, [item.id]: e.target.checked })} /><span>{item.label}</span></label>)}</div>
          <label>Observaciones<textarea value={draft.observations} onChange={e => setDraft({ ...draft, observations: e.target.value })} placeholder="Registra fallas, cambios o información relevante…" rows={4} /></label>
        </div><div className="drawer-foot"><button className="secondary" onClick={() => { setDraft(null); setSelected(null); }}>Cancelar</button><button className="primary" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button></div></>}
      </aside>
      {draft && <button className="backdrop" onClick={() => { setDraft(null); setSelected(null); }} aria-label="Cerrar ficha" />}

      <dialog id="checklist-admin" className="modal"><div className="modal-head"><div><span>CONFIGURACIÓN POR LOTE</span><h2>Checklist de la sala</h2><p>Cada nueva verificación aparecerá automáticamente en los 40 cubículos.</p></div><button onClick={() => (document.getElementById("checklist-admin") as HTMLDialogElement)?.close()}>×</button></div><div className="modal-list">{items.map(item => <div key={item.id}><span className="drag">⋮⋮</span><span>{item.label}</span><button onClick={() => removeChecklist(item.id)} aria-label={`Eliminar ${item.label}`}>Eliminar</button></div>)}</div><div className="add-row"><input value={newCheck} onChange={e => setNewCheck(e.target.value)} onKeyDown={e => e.key === "Enter" && void addChecklist()} placeholder="Nueva verificación (ej: Cámara web)" /><button className="primary" onClick={addChecklist}>Agregar</button></div></dialog>
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}
