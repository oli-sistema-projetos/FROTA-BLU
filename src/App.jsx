import React, { useEffect, useMemo, useState } from "react";

const EMPTY_FORM = {
  plate: "",
  loadStatus: "Carregada",
  location: "Pátio",
  dockNumber: "",
  situation: "Liberada",
  reason: ""
};

async function request(path, options) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    throw new Error(Array.isArray(detail) ? detail.map(item => item.msg).join(", ") : detail || "A solicitação não foi concluída.");
  }
  return response.status === 204 ? null : response.json();
}

function Icon({ name, size = 18 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const paths = {
    truck: <><path d="M3 7h11v10H3zM14 11h4l3 3v3h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /><path d="M6 10h5" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    fleet: <><path d="M4 5h16v14H4zM8 9h8M8 13h5" /></>,
    loaded: <><path d="M4 17 10 11l4 4 6-8" /><path d="M15 7h5v5" /></>,
    empty: <><path d="m5 12 4 4L19 6" /></>,
    blocked: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v4m0 3h.01" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4 4" /></>,
    alert: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v4m0 3h.01" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function StatCard({ kind, label, value, icon }) {
  return (
    <article className={`stat-card ${kind}`}>
      <span className="stat-icon"><Icon name={icon} size={19} /></span>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
    </article>
  );
}

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function Modal({ dialog, form, setForm, onClose, onSubmit, busy }) {
  if (!dialog) return null;
  const isNew = dialog.type === "new";
  const needsDock = isNew && form.location === "Doca";
  const needsReason = isNew && form.situation === "Bloqueada";
  const isDockAction = dialog.type === "dock";
  const isBlockAction = dialog.type === "block";
  const isExit = dialog.type === "exit";
  const title = isNew ? "Nova carreta" : isDockAction ? "Mover para doca" : isBlockAction ? "Bloquear carreta" : "Dar saída";
  const copy = isNew
    ? "Preencha os dados para adicionar ao controle."
    : isDockAction
      ? `Informe a doca de destino para ${dialog.trailer.plate}.`
      : isBlockAction
        ? `Informe o motivo do bloqueio de ${dialog.trailer.plate}.`
        : `Confirma a saída de ${dialog.trailer.plate}? Ela será removida do controle.`;

  function update(key, value) {
    setForm(current => ({ ...current, [key]: value }));
  }

  return (
    <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modal-header">
          <div><h2 id="modal-title">{title}</h2><p>{copy}</p></div>
          <button className="close-button" type="button" aria-label="Fechar" onClick={onClose}><Icon name="close" /></button>
        </header>
        <form className="modal-form" onSubmit={event => { event.preventDefault(); onSubmit(); }}>
          {isNew && <>
            <div className="field">
              <label htmlFor="plate">Placa <span>*</span></label>
              <input id="plate" autoFocus required maxLength={10} value={form.plate} placeholder="Ex.: ABC1D23" onChange={event => update("plate", event.target.value.toLocaleUpperCase("pt-BR"))} />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="load-status">Status da carga</label>
                <select id="load-status" value={form.loadStatus} onChange={event => update("loadStatus", event.target.value)}>
                  <option value="Carregada">Carregada</option><option value="Vazia">Vazia (Descarregada)</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="location">Local</label>
                <select id="location" value={form.location} onChange={event => update("location", event.target.value)}>
                  <option value="Pátio">Pátio</option><option value="Doca">Doca</option>
                </select>
              </div>
            </div>
            {needsDock && <div className="field"><label htmlFor="dock-number">Número da doca <span>*</span></label><input id="dock-number" autoFocus required maxLength={12} value={form.dockNumber} placeholder="Ex.: 04" onChange={event => update("dockNumber", event.target.value)} /></div>}
            <div className="field">
              <label htmlFor="situation">Situação</label>
              <select id="situation" value={form.situation} onChange={event => update("situation", event.target.value)}>
                <option value="Liberada">Liberada</option><option value="Bloqueada">Bloqueada</option>
              </select>
            </div>
            {needsReason && <div className="field"><label htmlFor="reason">Motivo do bloqueio <span>*</span></label><input id="reason" autoFocus required maxLength={100} value={form.reason} placeholder="Ex.: Manutenção, Pneu, Avaria" onChange={event => update("reason", event.target.value)} /></div>}
          </>}
          {isDockAction && <div className="field"><label htmlFor="action-dock">Número da doca <span>*</span></label><input id="action-dock" autoFocus required maxLength={12} value={form.dockNumber} placeholder="Ex.: 04" onChange={event => update("dockNumber", event.target.value)} /></div>}
          {isBlockAction && <div className="field"><label htmlFor="action-reason">Motivo do bloqueio <span>*</span></label><input id="action-reason" autoFocus required maxLength={100} value={form.reason} placeholder="Ex.: Manutenção, Pneu, Avaria" onChange={event => update("reason", event.target.value)} /></div>}
          <footer className="modal-actions">
            <button className="button button-muted" type="button" onClick={onClose}>Cancelar</button>
            <button className={`button ${isExit ? "button-danger" : "button-primary"}`} type="submit" disabled={busy}>
              {busy ? "Aguarde..." : isNew ? "Cadastrar carreta" : isDockAction ? "Mover para doca" : isBlockAction ? "Bloquear" : "Dar saída"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export default function App() {
  const [trailers, setTrailers] = useState([]);
  const [activeFilter, setActiveFilter] = useState("Todas");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [today, setToday] = useState(() => localDateKey(new Date()));

  async function refresh() {
    setError("");
    try {
      setTrailers(await request("/api/trailers"));
      setUpdatedAt(new Date());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    let midnightTimer;
    const refreshDay = () => setToday(localDateKey(new Date()));
    const scheduleMidnightRefresh = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      midnightTimer = window.setTimeout(() => {
        refreshDay();
        scheduleMidnightRefresh();
      }, midnight.getTime() - now.getTime() + 50);
    };
    const synchronizeDay = () => {
      if (document.visibilityState === "visible") {
        window.clearTimeout(midnightTimer);
        refreshDay();
        scheduleMidnightRefresh();
      }
    };

    scheduleMidnightRefresh();
    window.addEventListener("focus", synchronizeDay);
    document.addEventListener("visibilitychange", synchronizeDay);
    return () => {
      window.clearTimeout(midnightTimer);
      window.removeEventListener("focus", synchronizeDay);
      document.removeEventListener("visibilitychange", synchronizeDay);
    };
  }, []);

  const todayTrailers = useMemo(
    () => trailers.filter(item => localDateKey(item.createdAt) === today),
    [trailers, today]
  );
  const counts = useMemo(() => ({
    total: todayTrailers.length,
    loaded: todayTrailers.filter(item => item.loadStatus === "Carregada").length,
    empty: todayTrailers.filter(item => item.loadStatus === "Vazia").length,
    blocked: todayTrailers.filter(item => item.situation === "Bloqueada").length
  }), [todayTrailers]);

  const visibleTrailers = useMemo(() => {
    const query = search.trim().toLocaleUpperCase("pt-BR");
    return trailers.filter(item => {
      const byStatus = activeFilter === "Todas" ||
        (activeFilter === "Bloqueada" ? item.situation === "Bloqueada" : item.loadStatus === activeFilter);
      return byStatus && item.plate.includes(query);
    });
  }, [trailers, activeFilter, search]);

  function openNew() {
    setForm({ ...EMPTY_FORM });
    setDialog({ type: "new" });
    setNotice("");
  }

  async function submitDialog() {
    if (!dialog) return;
    setBusy(true);
    setError("");
    try {
      if (dialog.type === "new") {
        await request("/api/trailers", { method: "POST", body: JSON.stringify(form) });
        setNotice(`Carreta ${form.plate.trim().toLocaleUpperCase("pt-BR")} cadastrada.`);
      } else if (dialog.type === "block") {
        await request(`/api/trailers/${dialog.trailer.id}`, { method: "PATCH", body: JSON.stringify({ situation: "Bloqueada", reason: form.reason.trim() }) });
        setNotice(`${dialog.trailer.plate} bloqueada.`);
      } else if (dialog.type === "dock") {
        await request(`/api/trailers/${dialog.trailer.id}`, { method: "PATCH", body: JSON.stringify({ location: "Doca", dockNumber: form.dockNumber.trim() }) });
        setNotice(`${dialog.trailer.plate} movida para a doca ${form.dockNumber.trim()}.`);
      } else {
        await request(`/api/trailers/${dialog.trailer.id}`, { method: "DELETE" });
        setNotice(`Saída registrada para ${dialog.trailer.plate}.`);
      }
      setDialog(null);
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateTrailer(trailer, patch, message) {
    setError("");
    try {
      await request(`/api/trailers/${trailer.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      setNotice(message);
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function quickAction(action, trailer) {
    setNotice("");
    if (action === "load") {
      const loadStatus = trailer.loadStatus === "Carregada" ? "Vazia" : "Carregada";
      updateTrailer(trailer, { loadStatus }, `Status de carga de ${trailer.plate} alterado para ${loadStatus.toLowerCase()}.`);
    } else if (action === "location" && trailer.location === "Doca") {
      updateTrailer(trailer, { location: "Pátio", dockNumber: "" }, `${trailer.plate} movida para o pátio.`);
    } else if (action === "location") {
      setForm({ ...EMPTY_FORM });
      setDialog({ type: "dock", trailer });
    } else if (action === "block") {
      setForm({ ...EMPTY_FORM });
      setDialog({ type: "block", trailer });
    } else if (action === "unblock") {
      updateTrailer(trailer, { situation: "Liberada", reason: "" }, `${trailer.plate} desbloqueada.`);
    } else if (action === "exit") {
      setDialog({ type: "exit", trailer });
    }
  }

  const filters = ["Todas", "Carregada", "Vazia", "Bloqueada"];
  const hasBlockedTrailers = trailers.some(item => item.situation === "Bloqueada");

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon"><Icon name="truck" size={27} /></span>
          <div><span className="eyebrow">OPERAÇÃO · TEMPO REAL</span><h1>FROTA BLU-GASPAR</h1><p className="subtitle">Acompanhamento do pátio e das docas</p></div>
        </div>
        <button className="button button-accent" type="button" onClick={openNew}><Icon name="plus" /> + Nova Carreta</button>
      </header>

      <section aria-labelledby="dashboard-title">
        <div className="section-heading">
          <div><span className="section-kicker">Indicadores do dia</span><h2 id="dashboard-title">Visão geral</h2></div>
          <span className="updated">{updatedAt ? `Atualizado às ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(updatedAt)}` : "Carregando..."}</span>
        </div>
        <div className="stats" aria-live="polite">
          <StatCard kind="total" label="Cadastradas hoje" value={counts.total} icon="fleet" />
          <StatCard kind="loaded" label="Carregadas" value={counts.loaded} icon="loaded" />
          <StatCard kind="empty" label="Vazias" value={counts.empty} icon="empty" />
          <StatCard kind="blocked" label="Bloqueadas" value={counts.blocked} icon="blocked" />
        </div>
        <p className="daily-note">Os indicadores zeram à meia-noite. A lista e os registros permanecem salvos.</p>
      </section>

      {hasBlockedTrailers && <section className="alerts" aria-label="Alertas de carretas bloqueadas" aria-live="polite">
        {trailers.filter(item => item.situation === "Bloqueada").map(trailer => <article className="alert" key={trailer.id}>
          <div className="alert-main"><span className="alert-symbol"><Icon name="alert" /></span><div><p className="alert-title">Carreta bloqueada</p><div className="alert-copy"><strong>{trailer.plate}</strong><span> · {trailer.location === "Doca" ? `Doca ${trailer.dockNumber}` : "Pátio"} · Motivo: {trailer.reason}</span></div></div></div>
          <button className="button alert-button" type="button" onClick={() => quickAction("unblock", trailer)}>Desbloquear</button>
        </article>)}
      </section>}

      <section className="fleet" aria-labelledby="fleet-title">
        <div className="fleet-header">
          <div className="fleet-title-wrap"><span className="fleet-heading-icon"><Icon name="fleet" /></span><div><h2 className="list-title" id="fleet-title">Carretas no pátio</h2><span className="fleet-subtitle">Acompanhe e atualize cada veículo</span></div><span className="count-pill">{visibleTrailers.length}</span></div>
          <div className="filters" role="group" aria-label="Filtrar por status">
            {filters.map(filter => <button key={filter} className="filter" type="button" aria-pressed={activeFilter === filter} onClick={() => setActiveFilter(filter)}>{filter === "Carregada" ? "Carregadas" : filter === "Vazia" ? "Vazias" : filter === "Bloqueada" ? "Bloqueadas" : filter}</button>)}
          </div>
        </div>
        <div className="tools">
          <label className="search"><Icon name="search" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por placa..." aria-label="Buscar por placa" /></label>
          <span className="search-hint">Pesquise pela placa da carreta</span>
        </div>
        {error && <div className="error-banner" role="alert">{error}</div>}
        <div className="table-wrap">
          <table>
            <thead><tr><th scope="col">Placa</th><th scope="col">Status da carga</th><th scope="col">Local</th><th scope="col">Situação</th><th scope="col">Ações rápidas</th></tr></thead>
            <tbody>
              {visibleTrailers.map(trailer => <tr key={trailer.id}>
                <td><span className="plate">{trailer.plate}</span><span className="subtext">Entrada {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(trailer.createdAt))}</span></td>
                <td><span className={`badge ${trailer.loadStatus === "Carregada" ? "loaded" : "empty"}`}>{trailer.loadStatus}</span></td>
                <td className="location"><span className="location-icon"><Icon name="pin" size={15} /></span>{trailer.location === "Doca" ? `Doca ${trailer.dockNumber}` : "Pátio"}</td>
                <td><span className={`badge ${trailer.situation === "Bloqueada" ? "blocked" : "free"}`}>{trailer.situation}</span>{trailer.situation === "Bloqueada" && trailer.reason && <span className="subtext reason">{trailer.reason}</span>}</td>
                <td><div className="actions">
                  <button className="icon-button" type="button" onClick={() => quickAction("load", trailer)}>{trailer.loadStatus === "Carregada" ? "Marcar vazia" : "Marcar carregada"}</button>
                  <button className="icon-button" type="button" onClick={() => quickAction("location", trailer)}>{trailer.location === "Doca" ? "Mover p/ pátio" : "Mover p/ doca"}</button>
                  <button className="icon-button" type="button" onClick={() => quickAction(trailer.situation === "Bloqueada" ? "unblock" : "block", trailer)}>{trailer.situation === "Bloqueada" ? "Desbloquear" : "Bloquear"}</button>
                  <button className="icon-button exit-button" type="button" onClick={() => quickAction("exit", trailer)}>Dar saída</button>
                </div></td>
              </tr>)}
            </tbody>
          </table>
          {!visibleTrailers.length && <div className="empty-state"><span className="empty-icon"><Icon name="fleet" size={23} /></span><strong>{loading ? "Carregando carretas..." : "Nenhuma carreta encontrada"}</strong><span>{loading ? "Buscando os dados da operação." : "Cadastre uma carreta ou ajuste os filtros da busca."}</span></div>}
        </div>
      </section>
      <p className="message" role="status" aria-live="polite">{notice}</p>
      <Modal dialog={dialog} form={form} setForm={setForm} onClose={() => setDialog(null)} onSubmit={submitDialog} busy={busy} />
    </main>
  );
}
