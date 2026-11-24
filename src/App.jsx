import React, { useEffect, useMemo, useState } from "react";

const EMPTY_FORM = {
  plate: "",
  loadStatus: "Carregada",
  location: "Pátio",
  dockNumber: "",
  situation: "Liberada",
  reason: "",
  preventiveActive: false,
  preventiveType: "KM",
  preventiveValue: ""
};

async function request(path, options) {
  const token = localStorage.getItem("frota_auth_token");
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers
    },
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
    share: <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M4 13v6h16v-6" /></>,
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

function formatTrailerLocation(trailer) {
  return trailer.location === "Doca" ? `Doca ${trailer.dockNumber}` : "Pátio";
}

function getTimeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function formatPreventive(trailer) {
  const value = trailer.preventiveValue || trailer.preventiveKm || 0;
  return trailer.preventiveType === "DIAS"
    ? `${value} dias vencidos`
    : `${value} km ultrapassados`;
}

function isAvailableEmpty(trailer) {
  return trailer.loadStatus === "Vazia" && trailer.situation === "Liberada";
}

function createSummaryMessage(trailers, counts, dateLabel) {
  const preventiveTrailers = trailers.filter(trailer => trailer.preventiveActive);
  const lines = [
    "📊 *FROTA BLU-GASPAR | RESUMO OPERACIONAL*",
    `📅 ${dateLabel}`,
    "",
    `${getTimeGreeting()}!`,
    "Segue o resumo da operação de hoje:",
    "",
    `🚛 Carretas cadastradas: ${counts.total}`,
    `🔵 Carregadas: ${counts.loaded}`,
    `🟢 Vazias: ${counts.empty}`,
    `🔴 Bloqueadas: ${counts.blocked}`,
    `🟠 Preventivas: ${preventiveTrailers.length}`,
  ];

  if (preventiveTrailers.length) {
    lines.push("", "⚠️ *Carretas em preventiva:*");
    preventiveTrailers.forEach(trailer => {
      lines.push(`• ${trailer.plate} — ${formatTrailerLocation(trailer)} — ${formatPreventive(trailer)}`);
    });
  }

  lines.push(
    "",
    "Seguimos acompanhando as operações do pátio e das docas.",
    "Atenciosamente,",
    "Equipe FROTA BLU-GASPAR"
  );
  return lines.join("\n");
}

function createSummaryImage(trailers, counts, dateLabel) {
  const width = 1080;
  const blockedTrailers = trailers.filter(trailer => trailer.situation === "Bloqueada");
  const preventiveTrailers = trailers.filter(trailer => trailer.preventiveActive);
  const rows = blockedTrailers.slice(0, 12);
  const preventiveRows = preventiveTrailers.slice(0, 12);
  const blockedDisplayRows = Math.max(rows.length, 1) + (blockedTrailers.length > 12 ? 1 : 0);
  const preventiveDisplayRows = preventiveRows.length ? preventiveRows.length : 1;
  const height = 450 + blockedDisplayRows * 54 + preventiveDisplayRows * 54 + 70;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Seu navegador não conseguiu criar a imagem.");

  context.fillStyle = "#f2f5f8";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#14283e";
  context.fillRect(0, 0, width, 166);
  context.fillStyle = "#7de0ce";
  context.fillRect(60, 40, 5, 76);
  context.fillStyle = "#ffffff";
  context.font = "700 34px Segoe UI, Arial, sans-serif";
  context.fillText("FROTA BLU-GASPAR", 84, 76);
  context.font = "600 17px Segoe UI, Arial, sans-serif";
  context.fillStyle = "#bfcedb";
  context.fillText(`RESUMO DO DIA  ·  ${dateLabel}`, 84, 108);

  const cards = [
    { label: "CADASTRADAS", value: counts.total, color: "#51677e" },
    { label: "CARREGADAS", value: counts.loaded, color: "#2377c8" },
    { label: "VAZIAS", value: counts.empty, color: "#198257" },
    { label: "BLOQUEADAS", value: counts.blocked, color: "#c44444" }
  ];
  cards.forEach((card, index) => {
    const x = 60 + index * 244;
    context.fillStyle = "#ffffff";
    context.fillRect(x, 192, 228, 116);
    context.fillStyle = "#718094";
    context.font = "600 13px Segoe UI, Arial, sans-serif";
    context.fillText(card.label, x + 20, 224);
    context.fillStyle = card.color;
    context.font = "700 36px Segoe UI, Arial, sans-serif";
    context.fillText(String(card.value), x + 20, 278);
  });

  context.fillStyle = "#20364c";
  context.font = "700 19px Segoe UI, Arial, sans-serif";
  context.fillText("Carretas bloqueadas", 60, 354);
  const rowList = rows.length ? rows : [null];
  rowList.forEach((trailer, index) => {
    const y = 376 + index * 54;
    if (!trailer) {
      context.fillStyle = "#ffffff";
      context.fillRect(60, y, 960, 46);
      context.fillStyle = "#748397";
      context.font = "500 15px Segoe UI, Arial, sans-serif";
      context.fillText("Nenhuma carreta bloqueada hoje.", 78, y + 29);
      return;
    }
    context.fillStyle = "#fff0ef";
    context.fillRect(60, y, 960, 46);
    context.fillStyle = "#d34742";
    context.fillRect(60, y, 6, 46);
    context.fillStyle = "#c44444";
    context.font = "700 16px Segoe UI, Arial, sans-serif";
    context.fillText(trailer.plate, 78, y + 29);
    const detail = `${trailer.loadStatus}  ·  ${formatTrailerLocation(trailer)}  ·  Motivo: ${trailer.reason}`;
    context.fillStyle = "#704442";
    context.font = "500 14px Segoe UI, Arial, sans-serif";
    context.fillText(detail, 270, y + 29, 730);
  });
  if (blockedTrailers.length > 12) {
    const y = 376 + rows.length * 54;
    context.fillStyle = "#748397";
    context.font = "500 14px Segoe UI, Arial, sans-serif";
    context.fillText(`E mais ${blockedTrailers.length - 12} carreta(s) bloqueada(s).`, 78, y + 29);
  }

  const preventiveSectionY = 376 + blockedDisplayRows * 54;
  context.fillStyle = "#925412";
  context.font = "700 19px Segoe UI, Arial, sans-serif";
  context.fillText("Carretas em preventiva", 60, preventiveSectionY);
  const preventiveRowList = preventiveRows.length ? preventiveRows : [null];
  preventiveRowList.forEach((trailer, index) => {
    const y = preventiveSectionY + 22 + index * 54;
    if (!trailer) {
      context.fillStyle = "#ffffff";
      context.fillRect(60, y, 960, 46);
      context.fillStyle = "#748397";
      context.font = "500 15px Segoe UI, Arial, sans-serif";
      context.fillText("Nenhuma carreta em preventiva.", 78, y + 29);
      return;
    }
    context.fillStyle = "#fff4df";
    context.fillRect(60, y, 960, 46);
    context.fillStyle = "#df8b21";
    context.fillRect(60, y, 6, 46);
    context.fillStyle = "#94570d";
    context.font = "700 16px Segoe UI, Arial, sans-serif";
    context.fillText(trailer.plate, 78, y + 29);
    const detail = `${trailer.loadStatus}  ·  ${formatTrailerLocation(trailer)}  ·  ${formatPreventive(trailer)}`;
    context.fillStyle = "#75552e";
    context.font = "500 14px Segoe UI, Arial, sans-serif";
    context.fillText(detail, 270, y + 29, 730);
  });
  if (preventiveTrailers.length > 12) {
    const y = preventiveSectionY + 22 + preventiveRows.length * 54;
    context.fillStyle = "#748397";
    context.font = "500 14px Segoe UI, Arial, sans-serif";
    context.fillText(`E mais ${preventiveTrailers.length - 12} carreta(s) em preventiva.`, 78, y + 29);
  }
  context.fillStyle = "#82909c";
  context.font = "500 12px Segoe UI, Arial, sans-serif";
  context.fillText("FROTA BLU-GASPAR  ·  Resumo gerado pelo sistema", 60, height - 24);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("Não foi possível gerar a imagem do resumo."));
    }, "image/png");
  });
}

function DailySummaryDialog({ summary, onClose, onShare }) {
  if (!summary) return null;
  return (
    <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="modal summary-modal" role="dialog" aria-modal="true" aria-labelledby="summary-title">
        <header className="modal-header">
          <div><h2 id="summary-title">Resumo do dia</h2><p>Indicadores do dia e detalhes apenas das carretas bloqueadas.</p></div>
          <button className="close-button" type="button" aria-label="Fechar" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="summary-image-wrap">
          <img className="summary-image" src={summary.url} alt="Resumo diário da FROTA BLU-GASPAR com indicadores e carretas bloqueadas" />
        </div>
        <pre className="summary-message">{summary.message}</pre>
        <div className="summary-send-row">
          <button
            className="button whatsapp-button send-icon-button"
            type="button"
            aria-label="Compartilhar resumo no WhatsApp"
            title="Compartilhar resumo no WhatsApp"
            onClick={onShare}
          >
            📤
          </button>
        </div>
        <footer className="modal-actions summary-actions">
          <button className="button button-muted" type="button" onClick={onClose}>Fechar</button>
          <a className="button button-muted download-summary" href={summary.url} download={summary.filename}>Baixar imagem</a>
        </footer>
      </section>
    </div>
  );
}

function Modal({ dialog, form, setForm, onClose, onSubmit, busy }) {
  if (!dialog) return null;
  const isNew = dialog.type === "new";
  const needsDock = isNew && form.location === "Doca";
  const needsReason = isNew && form.situation === "Bloqueada";
  const isDockAction = dialog.type === "dock";
  const isBlockAction = dialog.type === "block";
  const isPreventiveAction = dialog.type === "preventive";
  const isExit = dialog.type === "exit";
  const title = isNew ? "Nova carreta" : isDockAction ? "Mover para doca" : isBlockAction ? "Bloquear carreta" : isPreventiveAction ? "Preventiva" : "Dar saída";
  const copy = isNew
    ? "Preencha os dados para adicionar ao controle."
    : isDockAction
      ? `Informe a doca de destino para ${dialog.trailer.plate}.`
      : isBlockAction
        ? `Informe o motivo do bloqueio de ${dialog.trailer.plate}.`
        : isPreventiveAction
          ? `Informe KM ultrapassado ou dias vencidos em ${dialog.trailer.plate}.`
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
          {isPreventiveAction && <>
            <div className="field"><label htmlFor="preventive-type">Tipo de vencimento</label><select id="preventive-type" value={form.preventiveType} onChange={event => update("preventiveType", event.target.value)}><option value="KM">KM ultrapassado</option><option value="DIAS">Dias vencidos</option></select></div>
            <div className="field"><label htmlFor="preventive-value">{form.preventiveType === "KM" ? "KM ultrapassado" : "Dias vencidos"} <span>*</span></label><input id="preventive-value" type="number" min="1" max="9999999" autoFocus required value={form.preventiveValue} placeholder={form.preventiveType === "KM" ? "Ex.: 250" : "Ex.: 7"} onChange={event => update("preventiveValue", event.target.value)} /></div>
          </>}
          <footer className="modal-actions">
            <button className="button button-muted" type="button" onClick={onClose}>Cancelar</button>
            <button className={`button ${isExit ? "button-danger" : "button-primary"}`} type="submit" disabled={busy}>
              {busy ? "Aguarde..." : isNew ? "Cadastrar carreta" : isDockAction ? "Mover para doca" : isBlockAction ? "Bloquear" : isPreventiveAction ? "Salvar preventiva" : "Dar saída"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function AuthScreen({ needsSetup, onAuthenticated }) {
  const [form, setForm] = useState({
    name: "",
    username: "",
    password: ""
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function update(field, value) {
    setForm(current => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await request(
        needsSetup ? "/api/auth/setup" : "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify(
            needsSetup
              ? form
              : { username: form.username, password: form.password }
          )
        }
      );
      localStorage.setItem("frota_auth_token", result.token);
      onAuthenticated(result.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand"><span className="brand-icon"><Icon name="truck" size={27} /></span><div><span className="eyebrow">OPERAÇÃO · TEMPO REAL</span><h1>FROTA BLU-GASPAR</h1></div></div>
        <h2>{needsSetup ? "Criar primeiro usuário" : "Entrar no sistema"}</h2>
        <p>{needsSetup ? "Este usuário será administrador e poderá criar novos operadores." : "Use seu usuário e senha para continuar."}</p>
        <form onSubmit={submit}>
          {needsSetup && <div className="field"><label htmlFor="auth-name">Nome completo</label><input id="auth-name" required minLength={2} value={form.name} onChange={event => update("name", event.target.value)} /></div>}
          <div className="field"><label htmlFor="auth-username">Usuário</label><input id="auth-username" required minLength={3} autoComplete="username" value={form.username} onChange={event => update("username", event.target.value)} /></div>
          <div className="field"><label htmlFor="auth-password">Senha</label><input id="auth-password" required minLength={needsSetup ? 6 : 1} type="password" autoComplete={needsSetup ? "new-password" : "current-password"} value={form.password} onChange={event => update("password", event.target.value)} /></div>
          {error && <div className="error-banner auth-error" role="alert">{error}</div>}
          <button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? "Aguarde..." : needsSetup ? "Criar administrador" : "Entrar"}</button>
        </form>
      </section>
    </main>
  );
}

function UsersDialog({ open, onClose }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "operador" });
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open) return;
    request("/api/auth/users")
      .then(setUsers)
      .catch(requestError => setError(requestError.message));
  }, [open]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (editingId) {
        const payload = {
          name: form.name,
          username: form.username,
          role: form.role,
          ...(form.password ? { password: form.password } : {})
        };
        const updated = await request(`/api/auth/users/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        setUsers(current => current.map(user => user.id === editingId ? { ...user, ...updated } : user).sort((a, b) => a.name.localeCompare(b.name)));
        setNotice(`Usuário ${updated.username} atualizado.`);
      } else {
      const created = await request("/api/auth/users", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setUsers(current => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNotice(`Usuário ${created.username} criado.`);
      }
      setForm({ name: "", username: "", password: "", role: "operador" });
      setEditingId(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  function startEditing(user) {
    setEditingId(user.id);
    setForm({ name: user.name, username: user.username, password: "", role: user.role });
    setError("");
    setNotice("");
  }
  function cancelEditing() {
    setEditingId(null);
    setForm({ name: "", username: "", password: "", role: "operador" });
    setError("");
  }
  return (
    <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="modal users-modal" role="dialog" aria-modal="true" aria-labelledby="users-title">
        <header className="modal-header">
          <div><h2 id="users-title">Usuários</h2><p>Cadastre operadores e administradores.</p></div>
          <button className="close-button" type="button" aria-label="Fechar" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="users-content">
          <form className="users-form" onSubmit={submit}>
            <div className="field"><label htmlFor="new-user-name">Nome</label><input id="new-user-name" required minLength={2} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></div>
            <div className="form-grid">
              <div className="field"><label htmlFor="new-user-username">Usuário</label><input id="new-user-username" required minLength={3} value={form.username} onChange={event => setForm(current => ({ ...current, username: event.target.value }))} /></div>
              <div className="field"><label htmlFor="new-user-password">Senha {editingId ? "(opcional)" : ""}</label><input id="new-user-password" required={!editingId} minLength={6} type="password" value={form.password} onChange={event => setForm(current => ({ ...current, password: event.target.value }))} /></div>
            </div>
            <div className="field"><label htmlFor="new-user-role">Perfil</label><select id="new-user-role" value={form.role} onChange={event => setForm(current => ({ ...current, role: event.target.value }))}><option value="operador">Operador</option><option value="admin">Administrador</option></select></div>
            {error && <div className="error-banner users-error" role="alert">{error}</div>}
            {notice && <p className="users-notice" role="status">{notice}</p>}
            <footer className="modal-actions">{editingId && <button className="button button-muted" type="button" onClick={cancelEditing}>Cancelar edição</button>}<button className="button button-primary" type="submit" disabled={busy}>{busy ? "Salvando..." : editingId ? "Salvar alterações" : "Criar usuário"}</button></footer>
          </form>
          <div className="users-list">
            {users.map(user => <button className={`user-row user-row-button ${editingId === user.id ? "selected" : ""}`} type="button" key={user.id} onClick={() => startEditing(user)}><span><strong>{user.name}</strong><small>{user.username}</small></span><span className={`badge ${user.role === "admin" ? "blocked" : "free"}`}>{user.role}</span></button>)}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
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
  const [summary, setSummary] = useState(null);
  const [usersDialog, setUsersDialog] = useState(false);

  useEffect(() => {
    async function initializeAuth() {
      try {
        const status = await request("/api/auth/status");
        setNeedsSetup(status.needsSetup);
        if (!status.needsSetup) {
          try {
            setAuthUser(await request("/api/auth/me"));
          } catch {
            localStorage.removeItem("frota_auth_token");
            setAuthUser(null);
          }
        }
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setAuthLoading(false);
      }
    }
    initializeAuth();
  }, []);

  useEffect(() => {
    const imageUrl = summary?.url;
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [summary]);

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

  useEffect(() => {
    if (authUser) refresh();
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    const pollInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 3000);
    return () => window.clearInterval(pollInterval);
  }, [authUser]);

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
    empty: todayTrailers.filter(isAvailableEmpty).length,
    blocked: todayTrailers.filter(item => item.situation === "Bloqueada").length,
    preventive: todayTrailers.filter(item => item.preventiveActive).length
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
      } else if (dialog.type === "preventive") {
        const preventiveValue = Number(form.preventiveValue);
        await request(`/api/trailers/${dialog.trailer.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            preventiveActive: true,
            preventiveType: form.preventiveType,
            preventiveValue,
            preventiveKm: form.preventiveType === "KM" ? preventiveValue : 0
          })
        });
        setNotice(`${dialog.trailer.plate} marcada em preventiva por ${preventiveValue} ${form.preventiveType === "KM" ? "km ultrapassados" : "dias vencidos"}.`);
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
    } else if (action === "preventive") {
      setForm({
        ...EMPTY_FORM,
        preventiveType: trailer.preventiveType || "KM",
        preventiveValue: trailer.preventiveValue ? String(trailer.preventiveValue) : (trailer.preventiveKm ? String(trailer.preventiveKm) : "")
      });
      setDialog({ type: "preventive", trailer });
    } else if (action === "unblock") {
      updateTrailer(trailer, { situation: "Liberada", reason: "" }, `${trailer.plate} desbloqueada.`);
    } else if (action === "exit") {
      setDialog({ type: "exit", trailer });
    }
  }

  async function openDailySummary() {
    setError("");
    setNotice("");
    try {
      const dateLabel = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" })
        .format(new Date(`${today}T12:00:00`));
      const blob = await createSummaryImage(todayTrailers, counts, dateLabel);
      const message = createSummaryMessage(todayTrailers, counts, dateLabel);
      setSummary({
        url: URL.createObjectURL(blob),
        blob,
        filename: `resumo-frota-blu-gaspar-${today}.png`,
        message
      });
    } catch (summaryError) {
      setError(`Não foi possível gerar o resumo: ${summaryError.message}`);
    }
  }

  async function shareDailySummary() {
    if (!summary) return;
    setError("");
    try {
      const imageFile = typeof File === "undefined"
        ? null
        : new File([summary.blob], summary.filename, { type: "image/png" });
      if (imageFile && navigator.share && navigator.canShare?.({ files: [imageFile] })) {
        await navigator.share({
          files: [imageFile],
          title: "Resumo diário — FROTA BLU-GASPAR",
          text: summary.message
        });
        setNotice("Resumo compartilhado. Selecione WhatsApp e o contato na janela de compartilhamento.");
        return;
      }

      const downloadLink = document.createElement("a");
      downloadLink.href = summary.url;
      downloadLink.download = summary.filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();

      const whatsappLink = document.createElement("a");
      whatsappLink.href = `https://wa.me/?text=${encodeURIComponent(summary.message)}`;
      whatsappLink.target = "_blank";
      whatsappLink.rel = "noopener noreferrer";
      document.body.appendChild(whatsappLink);
      whatsappLink.click();
      whatsappLink.remove();
      setNotice("Imagem baixada e mensagem aberta no WhatsApp. Anexe o PNG antes de enviar.");
    } catch (shareError) {
      if (shareError.name === "AbortError") return;
      setError(`Não foi possível compartilhar o resumo: ${shareError.message}`);
    }
  }

  const filters = ["Todas", "Carregada", "Vazia", "Bloqueada"];
  const hasBlockedTrailers = trailers.some(item => item.situation === "Bloqueada");

  async function logout() {
    try {
      await request("/api/auth/logout", { method: "POST", body: "{}" });
    } catch {
      // Limpa a sessão local mesmo se a API estiver temporariamente indisponível.
    }
    localStorage.removeItem("frota_auth_token");
    setAuthUser(null);
  }

  if (authLoading) {
    return <main className="auth-page"><section className="auth-card"><p>Carregando...</p></section></main>;
  }

  if (!authUser) {
    return <AuthScreen needsSetup={needsSetup} onAuthenticated={setAuthUser} />;
  }

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon"><Icon name="truck" size={27} /></span>
          <div><span className="eyebrow">OPERAÇÃO · TEMPO REAL</span><h1>FROTA BLU-GASPAR</h1><p className="subtitle">Acompanhamento do pátio e das docas</p></div>
        </div>
        <div className="topbar-actions">
          <button
            className="button button-share summary-icon-button"
            type="button"
            aria-label="Abrir resumo do dia"
            title="Resumo do dia"
            onClick={openDailySummary}
          >
            📤
          </button>
          {authUser.role === "admin" && <button className="button button-share" type="button" onClick={() => setUsersDialog(true)}>Usuários</button>}
          <button className="button button-share user-button" type="button" title="Sair" onClick={logout}><span>{authUser.name}</span></button>
          <button className="button button-accent" type="button" onClick={openNew}><Icon name="plus" /> + Nova Carreta</button>
        </div>
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

      {trailers.some(item => item.preventiveActive) && <section className="preventives" aria-label="Carretas em preventiva" aria-live="polite">
        {trailers.filter(item => item.preventiveActive).map(trailer => <article className="preventive" key={trailer.id}>
          <div className="preventive-main">
            <span className="preventive-symbol">⚠</span>
            <div>
              <p className="preventive-title">Preventiva</p>
              <div className="preventive-copy"><strong>{trailer.plate}</strong><span> · {trailer.location === "Doca" ? `Doca ${trailer.dockNumber}` : "Pátio"} · {(trailer.preventiveValue || trailer.preventiveKm || 0)} {(trailer.preventiveType === "DIAS") ? "dias vencidos" : "km ultrapassados"}</span></div>
            </div>
          </div>
          {authUser.role === "admin" && <button className="button preventive-button" type="button" onClick={() => quickAction("preventive", trailer)}>Atualizar</button>}
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
            <thead><tr><th scope="col">Placa</th><th scope="col">Status da carga</th><th scope="col">Local</th><th scope="col">Situação</th><th scope="col">Cadastrada por</th><th scope="col">Ações rápidas</th></tr></thead>
            <tbody>
              {visibleTrailers.map(trailer => <tr key={trailer.id}>
                <td><span className="plate">{trailer.plate}</span><span className="subtext">Entrada {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(trailer.createdAt))}</span></td>
                <td><span className={`badge ${trailer.loadStatus === "Carregada" ? "loaded" : "empty"}`}>{trailer.loadStatus}</span></td>
                <td className="location"><span className="location-icon"><Icon name="pin" size={15} /></span>{trailer.location === "Doca" ? `Doca ${trailer.dockNumber}` : "Pátio"}</td>
                <td><span className={`badge ${trailer.situation === "Bloqueada" ? "blocked" : "free"}`}>{trailer.situation}</span>{trailer.situation === "Bloqueada" && trailer.reason && <span className="subtext reason">{trailer.reason}</span>}</td>
                <td><span className="subtext creator-name">{trailer.createdByName || "Usuário não identificado"}</span></td>
                <td><div className="actions">
                  {authUser.role === "admin" && <>
                  <button className="icon-button" type="button" onClick={() => quickAction("load", trailer)}>{trailer.loadStatus === "Carregada" ? "Marcar vazia" : "Marcar carregada"}</button>
                  <button className="icon-button" type="button" onClick={() => quickAction("location", trailer)}>{trailer.location === "Doca" ? "Mover p/ pátio" : "Mover p/ doca"}</button>
                  <button className="icon-button" type="button" onClick={() => quickAction(trailer.situation === "Bloqueada" ? "unblock" : "block", trailer)}>{trailer.situation === "Bloqueada" ? "Desbloquear" : "Bloquear"}</button>
                  <button className="icon-button preventive-action" type="button" onClick={() => quickAction("preventive", trailer)}>Preventiva</button>
                  <button className="icon-button exit-button" type="button" onClick={() => quickAction("exit", trailer)}>Dar saída</button>
                  </>}
                </div></td>
              </tr>)}
            </tbody>
          </table>
          {!visibleTrailers.length && <div className="empty-state"><span className="empty-icon"><Icon name="fleet" size={23} /></span><strong>{loading ? "Carregando carretas..." : "Nenhuma carreta encontrada"}</strong><span>{loading ? "Buscando os dados da operação." : "Cadastre uma carreta ou ajuste os filtros da busca."}</span></div>}
        </div>
      </section>
      <p className="message" role="status" aria-live="polite">{notice}</p>
      {authUser.role === "admin" && <UsersDialog open={usersDialog} onClose={() => setUsersDialog(false)} />}
      <DailySummaryDialog summary={summary} onClose={() => setSummary(null)} onShare={shareDailySummary} />
      <Modal dialog={dialog} form={form} setForm={setForm} onClose={() => setDialog(null)} onSubmit={submitDialog} busy={busy} />
    </main>
  );
}
