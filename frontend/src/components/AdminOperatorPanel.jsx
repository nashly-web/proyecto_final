// frontend/src/components/AdminOperatorPanel.jsx
import { useState, useEffect, useRef } from "react";

const API = "/api/operator_chat";

// ─────────────────────────────────────────────
// Ventana de chat individual (admin → usuario)
// ─────────────────────────────────────────────
function AdminChatWindow({ adminEmail, targetUser, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const pollRef = useRef(null);
  const textareaRef = useRef(null);

  const fetchMessages = async () => {
    try {
      const res = await fetch(
        `${API}/${targetUser.id}?requester_email=${encodeURIComponent(adminEmail)}`,
        { credentials: "include", cache: "no-store" },
      );
      const data = await res.json();
      if (data.messages) setMessages(data.messages);
    } catch (e) {
      console.error("[AdminChat] fetchMessages:", e);
    }
  };

  useEffect(() => {
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, 1500);
    setTimeout(() => textareaRef.current?.focus(), 200);
    return () => clearInterval(pollRef.current);
  }, [targetUser.id]);

  useEffect(() => {
    const onFocus = () => fetchMessages();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [targetUser.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setLoading(true);
    setInput("");
    const optimistic = {
      id: Date.now(),
      x_sender_role: "admin",
      x_content: text,
      x_timestamp: new Date().toISOString(),
      _optimistic: true,
    };
    setMessages((p) => [...p, optimistic]);
    try {
      await fetch(`${API}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sender_email: adminEmail,
          user_id: targetUser.id,
          content: text,
        }),
      });
      await fetchMessages();
    } catch (e) {
      console.error("[AdminChat] sendMessage:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const fmt = (ts) =>
    ts
      ? new Date(ts).toLocaleTimeString("es-DO", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

  const groupByDate = (msgs) => {
    const groups = [];
    let lastDate = null;
    msgs.forEach((msg) => {
      const d = msg.x_timestamp
        ? new Date(msg.x_timestamp).toLocaleDateString("es-DO", {
            day: "numeric",
            month: "long",
          })
        : null;
      if (d && d !== lastDate) {
        groups.push({ type: "date", label: d });
        lastDate = d;
      }
      groups.push({ type: "msg", msg });
    });
    return groups;
  };

  const initials = targetUser.name
    ? targetUser.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  return (
    <div className="adm-chat-window">
      {/* Header */}
      <div className="adm-chat-header">
        <button className="adm-back-btn" onClick={onBack}>
          ←
        </button>
        <div className="adm-chat-header-avatar">
          {targetUser.image_128 ? (
            <img
              src={`data:image/png;base64,${targetUser.image_128}`}
              className="adm-avatar-img"
              alt=""
            />
          ) : (
            <span style={{ fontSize: 15, fontWeight: 700, color: "#ef4444" }}>
              {initials}
            </span>
          )}
          <div className="adm-online-dot" />
        </div>
        <div className="adm-chat-header-info">
          <div className="adm-chat-header-name">{targetUser.name}</div>
          <div className="adm-chat-header-sub">{targetUser.login}</div>
        </div>
      </div>

      {/* Mensajes */}
      <div className="adm-messages">
        {messages.length === 0 && (
          <div className="adm-empty">
            <div className="adm-empty-icon">💬</div>
            <p>
              Sin mensajes aún.
              <br />
              Inicia la conversación.
            </p>
          </div>
        )}
        {groupByDate(messages).map((item, i) =>
          item.type === "date" ? (
            <div key={`d-${i}`} className="adm-date-label">
              {item.label}
            </div>
          ) : (
            <div
              key={item.msg.id}
              className={`adm-bubble-wrap ${item.msg.x_sender_role === "admin" ? "admin" : "user"}`}
            >
              <div
                className={`adm-bubble ${item.msg.x_sender_role === "admin" ? "admin" : "user"}${item.msg._optimistic ? " optimistic" : ""}`}
              >
                {item.msg.x_content}
                <div className="adm-bubble-meta">
                  {fmt(item.msg.x_timestamp)}
                  {item.msg.x_sender_role === "admin" && (
                    <span style={{ marginLeft: 3 }}>
                      {item.msg.x_read ? "✓✓" : "✓"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ),
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="adm-input-bar">
        <textarea
          ref={textareaRef}
          className="adm-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={`Mensaje a ${targetUser.name}...`}
          rows={1}
        />
        <button
          className={`adm-send-btn ${input.trim() ? "active" : ""}`}
          onClick={sendMessage}
          disabled={loading || !input.trim()}
        >
          ➤
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Gestor de mensajes automáticos
// ─────────────────────────────────────────────
function ScheduleManager({ adminEmail, allUsers }) {
  const [schedules, setSchedules] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    content: "",
    send_time: "08:00",
    target_user_ids: [],
  });
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);

  const fetchSchedules = async () => {
    try {
      const res = await fetch(
        `${API}/schedule?admin_email=${encodeURIComponent(adminEmail)}`,
      );
      const data = await res.json();
      if (data.items) setSchedules(data.items);
    } catch (e) {
      console.error("[Schedule] fetch:", e);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  const generateWithAI = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch(`${API}/schedule/generate-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_email: adminEmail, topic: aiPrompt }),
      });
      const data = await res.json();
      if (data.content) {
        setForm((f) => ({ ...f, content: data.content }));
        setAiGenerated(true);
      }
    } catch (e) {
      console.error("[Schedule] AI:", e);
    } finally {
      setAiLoading(false);
    }
  };

  const createSchedule = async () => {
    if (
      !form.content.trim() ||
      !form.send_time ||
      form.target_user_ids.length === 0
    )
      return;
    setSaving(true);
    try {
      await fetch(`${API}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_email: adminEmail,
          content: form.content,
          send_time: form.send_time,
          target_user_ids: form.target_user_ids,
          ai_generated: aiGenerated,
        }),
      });
      setShowForm(false);
      setForm({ content: "", send_time: "08:00", target_user_ids: [] });
      setAiPrompt("");
      setAiGenerated(false);
      await fetchSchedules();
    } catch (e) {
      console.error("[Schedule] create:", e);
    } finally {
      setSaving(false);
    }
  };

  const toggleSchedule = async (id) => {
    try {
      await fetch(
        `${API}/schedule/${id}/toggle?admin_email=${encodeURIComponent(adminEmail)}`,
        {
          method: "PATCH",
        },
      );
      await fetchSchedules();
    } catch (e) {}
  };

  const deleteSchedule = async (id) => {
    if (!window.confirm("¿Eliminar este mensaje programado?")) return;
    try {
      await fetch(
        `${API}/schedule/${id}?admin_email=${encodeURIComponent(adminEmail)}`,
        {
          method: "DELETE",
        },
      );
      await fetchSchedules();
    } catch (e) {}
  };

  const toggleUser = (uid) =>
    setForm((f) => ({
      ...f,
      target_user_ids: f.target_user_ids.includes(uid)
        ? f.target_user_ids.filter((x) => x !== uid)
        : [...f.target_user_ids, uid],
    }));

  return (
    <div className="adm-schedule">
      <div className="adm-schedule-header">
        <span className="adm-schedule-title">Mensajes Automáticos</span>
        <button className="adm-new-btn" onClick={() => setShowForm((f) => !f)}>
          {showForm ? "✕ Cancelar" : "+ Nuevo"}
        </button>
      </div>

      {showForm && (
        <div className="adm-form-card">
          {/* IA */}
          <div className="adm-field">
            <label className="adm-label">✨ Generar con IA (opcional)</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                className="adm-input"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Ej: mensaje motivador para usuarios en riesgo"
                style={{ flex: 1 }}
              />
              <button
                className={`adm-ai-btn ${aiPrompt.trim() ? "active" : ""}`}
                onClick={generateWithAI}
                disabled={aiLoading || !aiPrompt.trim()}
              >
                {aiLoading ? "..." : "Generar"}
              </button>
            </div>
          </div>

          {/* Mensaje */}
          <div className="adm-field">
            <label className="adm-label">
              Mensaje {aiGenerated && <span className="adm-ai-tag">✨ IA</span>}
            </label>
            <textarea
              className="adm-textarea adm-form-textarea"
              value={form.content}
              onChange={(e) => {
                setForm((f) => ({ ...f, content: e.target.value }));
                setAiGenerated(false);
              }}
              rows={3}
              placeholder="Escribe el mensaje..."
            />
          </div>

          {/* Hora */}
          <div className="adm-field">
            <label className="adm-label">⏰ Hora de envío diario</label>
            <input
              type="time"
              className="adm-input"
              value={form.send_time}
              onChange={(e) =>
                setForm((f) => ({ ...f, send_time: e.target.value }))
              }
              style={{ width: "auto" }}
            />
          </div>

          {/* Usuarios */}
          <div className="adm-field">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <label className="adm-label" style={{ margin: 0 }}>
                👥 Destinatarios ({form.target_user_ids.length} sel.)
              </label>
              <button
                className="adm-link-btn"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    target_user_ids: allUsers.map((u) => u.id),
                  }))
                }
              >
                Todos
              </button>
            </div>
            <div className="adm-user-checklist">
              {allUsers.map((u) => (
                <label key={u.id} className="adm-check-row">
                  <input
                    type="checkbox"
                    checked={form.target_user_ids.includes(u.id)}
                    onChange={() => toggleUser(u.id)}
                    style={{ accentColor: "#ef4444" }}
                  />
                  <span style={{ fontWeight: 500, fontSize: 12 }}>
                    {u.name}
                  </span>
                  <span style={{ color: "#9ca3af", fontSize: 11 }}>
                    {u.login}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              className="adm-cancel-btn"
              onClick={() => setShowForm(false)}
            >
              Cancelar
            </button>
            <button
              className="adm-save-btn"
              onClick={createSchedule}
              disabled={
                saving ||
                !form.content.trim() ||
                form.target_user_ids.length === 0
              }
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {schedules.length === 0 ? (
        <div className="adm-empty" style={{ padding: "40px 0" }}>
          <div className="adm-empty-icon">🕐</div>
          <p>No hay mensajes programados</p>
        </div>
      ) : (
        <div className="adm-schedule-list">
          {schedules.map((s) => (
            <div
              key={s.id}
              className={`adm-schedule-item ${s.x_active ? "active" : "inactive"}`}
            >
              <div className="adm-schedule-item-top">
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="adm-schedule-icon">
                    {s.x_ai_generated ? "✨" : "📅"}
                  </span>
                  <span
                    className={`adm-schedule-badge ${s.x_active ? "on" : "off"}`}
                  >
                    {s.x_active ? `🕐 ${s.x_send_time}` : "Inactivo"}
                  </span>
                  <span className="adm-schedule-users">
                    {(s.targets || []).length} usuario(s)
                  </span>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    className="adm-icon-btn"
                    onClick={() => toggleSchedule(s.id)}
                    title={s.x_active ? "Desactivar" : "Activar"}
                  >
                    {s.x_active ? "⏸" : "▶"}
                  </button>
                  <button
                    className="adm-icon-btn danger"
                    onClick={() => deleteSchedule(s.id)}
                    title="Eliminar"
                  >
                    🗑
                  </button>
                </div>
              </div>
              <p className="adm-schedule-content">{s.x_content}</p>
              {s.x_last_sent && (
                <div className="adm-schedule-last">
                  Último envío:{" "}
                  {new Date(s.x_last_sent).toLocaleString("es-DO")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Lista de chats estilo WhatsApp
// ─────────────────────────────────────────────
function ChatList({ users, loading, onSelect, search, setSearch }) {
  const filtered = users.filter(
    (u) =>
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.login?.toLowerCase().includes(search.toLowerCase()),
  );

  const totalUnread = users.reduce((acc, u) => acc + (u.unread_count || 0), 0);

  const initials = (name) =>
    name
      ? name
          .split(" ")
          .map((w) => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()
      : "?";

  return (
    <div className="adm-chatlist">
      {/* Search */}
      <div className="adm-search-bar">
        <span className="adm-search-icon">🔍</span>
        <input
          className="adm-search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar usuario..."
        />
        {search && (
          <button className="adm-search-clear" onClick={() => setSearch("")}>
            ✕
          </button>
        )}
      </div>

      {totalUnread > 0 && (
        <div className="adm-unread-banner">
          <span>📬</span>
          <span>
            {totalUnread} mensaje{totalUnread > 1 ? "s" : ""} sin leer
          </span>
        </div>
      )}

      {loading ? (
        <div className="adm-loading">
          <div className="adm-spinner" />
          <span>Cargando usuarios...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="adm-empty" style={{ padding: "48px 0" }}>
          <div className="adm-empty-icon">👥</div>
          <p>{search ? "Sin resultados" : "No hay usuarios registrados"}</p>
        </div>
      ) : (
        <div className="adm-user-list">
          {filtered.map((u) => (
            <div
              key={u.id}
              className="adm-user-row"
              onClick={() => onSelect(u)}
            >
              <div className="adm-user-avatar">
                {u.image_128 ? (
                  <img
                    src={`data:image/png;base64,${u.image_128}`}
                    className="adm-avatar-img"
                    alt=""
                  />
                ) : (
                  <span
                    style={{ fontSize: 15, fontWeight: 700, color: "#ef4444" }}
                  >
                    {initials(u.name)}
                  </span>
                )}
                {u.unread_count > 0 && (
                  <div className="adm-avatar-badge">
                    {u.unread_count > 9 ? "9+" : u.unread_count}
                  </div>
                )}
              </div>
              <div className="adm-user-info">
                <div className="adm-user-name">{u.name}</div>
                <div className="adm-user-email">{u.login}</div>
              </div>
              <div className="adm-user-chevron">›</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Panel principal
// ─────────────────────────────────────────────
export default function AdminOperatorPanel({ adminEmail }) {
  const [tab, setTab] = useState("chats");
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch] = useState("");
  const pendingOpenRef = useRef(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch(
          `${API}/users?admin_email=${encodeURIComponent(adminEmail)}`,
          { credentials: "include", cache: "no-store" },
        );
        const data = await res.json();
        if (data.users) setUsers(data.users);
      } catch (e) {
        console.error("[AdminPanel] fetchUsers:", e);
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsers();
    const interval = setInterval(fetchUsers, 4000);
    return () => clearInterval(interval);
  }, [adminEmail]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("adminOperatorChatUserId");
      const id = raw ? parseInt(raw, 10) : null;
      pendingOpenRef.current = Number.isFinite(id) ? id : null;
    } catch {
      pendingOpenRef.current = null;
    }
  }, []);

  useEffect(() => {
    const id = pendingOpenRef.current;
    if (!id || !Array.isArray(users) || users.length === 0) return;
    const u = users.find((x) => Number(x.id) === Number(id));
    if (!u) return;
    setTab("chats");
    setSelectedUser(u);
    pendingOpenRef.current = null;
    try {
      localStorage.removeItem("adminOperatorChatUserId");
    } catch {}
  }, [users]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');

        .adm-panel {
          background: #fff;
          border-radius: 18px;
          box-shadow: 0 8px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
          overflow: hidden;
          width: 100%;
          max-width: 100%;
          height: 600px;
          display: flex;
          flex-direction: column;
          font-family: 'DM Sans', system-ui, sans-serif;
        }

        /* Header */
        .adm-header {
          background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
          padding: 18px 18px 16px;
          color: #fff;
          position: relative;
          overflow: hidden;
          flex-shrink: 0;
        }
        .adm-header::before {
          content: '';
          position: absolute;
          top: -30px; right: -30px;
          width: 110px; height: 110px;
          border-radius: 50%;
          background: rgba(255,255,255,0.07);
        }
        .adm-header-title {
          font-size: 17px;
          font-weight: 700;
          letter-spacing: -0.02em;
          position: relative;
          z-index: 1;
        }
        .adm-header-sub {
          font-size: 12px;
          opacity: 0.8;
          margin-top: 2px;
          position: relative;
          z-index: 1;
        }

        /* Tabs */
        .adm-tabs {
          display: flex;
          border-bottom: 1px solid #f3f4f6;
          background: #fff;
          flex-shrink: 0;
        }
        .adm-tab {
          flex: 1;
          padding: 11px 8px;
          border: none;
          background: transparent;
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: 12px;
          font-weight: 500;
          color: #9ca3af;
          cursor: pointer;
          transition: all 0.15s;
          border-bottom: 2px solid transparent;
          position: relative;
        }
        .adm-tab.active {
          color: #ef4444;
          font-weight: 700;
          border-bottom-color: #ef4444;
          background: #fff;
        }
        .adm-tab-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #ef4444;
          color: #fff;
          border-radius: 20px;
          font-size: 9px;
          font-weight: 700;
          min-width: 16px;
          height: 16px;
          padding: 0 4px;
          margin-left: 4px;
          vertical-align: middle;
        }

        /* Content */
        .adm-content {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        /* Chat list */
        .adm-chatlist {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .adm-search-bar {
          margin: 10px 12px;
          background: #f9fafb;
          border: 1.5px solid #f3f4f6;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 7px 12px;
          transition: border-color 0.2s;
          flex-shrink: 0;
        }
        .adm-search-bar:focus-within {
          border-color: #ef4444;
          background: #fff;
        }
        .adm-search-icon { font-size: 13px; flex-shrink: 0; }
        .adm-search-input {
          flex: 1;
          border: none;
          background: transparent;
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: 13px;
          color: #111827;
          outline: none;
        }
        .adm-search-input::placeholder { color: #d1d5db; }
        .adm-search-clear {
          border: none;
          background: none;
          cursor: pointer;
          color: #9ca3af;
          font-size: 12px;
          padding: 0;
          display: flex;
          align-items: center;
        }

        .adm-unread-banner {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          margin: 0 12px 8px;
          padding: 6px 10px;
          font-size: 11px;
          font-weight: 600;
          color: #b91c1c;
          flex-shrink: 0;
        }

        .adm-user-list {
          flex: 1;
          overflow-y: auto;
        }
        .adm-user-list::-webkit-scrollbar { width: 4px; }
        .adm-user-list::-webkit-scrollbar-thumb { background: #f3f4f6; border-radius: 4px; }

        .adm-user-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 11px 16px;
          cursor: pointer;
          border-bottom: 1px solid #f9fafb;
          transition: background 0.15s;
        }
        .adm-user-row:hover { background: #fef2f2; }
        .adm-user-row:active { background: #fee2e2; }

        .adm-user-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: #fef2f2;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          overflow: visible;
          position: relative;
          border: 2px solid #fecaca;
        }
        .adm-avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 50%;
        }
        .adm-avatar-badge {
          position: absolute;
          top: -7px;
          right: -7px;
          background: #ef4444;
          color: #fff;
          border-radius: 50%;
          width: 18px;
          height: 18px;
          font-size: 9px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid #fff;
        }

        .adm-user-info { flex: 1; min-width: 0; }
        .adm-user-name {
          font-size: 14px;
          font-weight: 600;
          color: #111827;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .adm-user-email {
          font-size: 11px;
          color: #9ca3af;
          margin-top: 1px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .adm-user-chevron {
          color: #d1d5db;
          font-size: 20px;
          font-weight: 300;
          flex-shrink: 0;
        }

        /* Chat window */
        .adm-chat-window {
          display: flex;
          flex-direction: column;
          height: 100%;
          animation: slide-in 0.22s cubic-bezier(.34,1.2,.64,1);
        }
        @keyframes slide-in {
          from { opacity: 0; transform: translateX(18px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        .adm-chat-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-bottom: 1px solid #f3f4f6;
          background: #fff;
          flex-shrink: 0;
        }
        .adm-back-btn {
          background: #fef2f2;
          border: none;
          cursor: pointer;
          font-size: 18px;
          color: #ef4444;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: background 0.15s;
        }
        .adm-back-btn:hover { background: #fee2e2; }

        .adm-chat-header-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #fef2f2;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          overflow: hidden;
          position: relative;
          border: 2px solid #fecaca;
        }
        .adm-online-dot {
          position: absolute;
          bottom: 1px;
          right: 1px;
          width: 8px;
          height: 8px;
          background: #4ade80;
          border-radius: 50%;
          border: 2px solid #fff;
        }
        .adm-chat-header-name {
          font-size: 14px;
          font-weight: 700;
          color: #111827;
        }
        .adm-chat-header-sub {
          font-size: 11px;
          color: #9ca3af;
        }

        /* Messages */
        .adm-messages {
          flex: 1;
          overflow-y: auto;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          background: #f9fafb;
          scroll-behavior: smooth;
        }
        .adm-messages::-webkit-scrollbar { width: 4px; }
        .adm-messages::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }

        .adm-date-label {
          text-align: center;
          font-size: 10px;
          color: #9ca3af;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          margin: 6px 0 2px;
        }

        .adm-bubble-wrap {
          display: flex;
          animation: bubble-in 0.18s ease;
        }
        @keyframes bubble-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .adm-bubble-wrap.admin { justify-content: flex-end; }
        .adm-bubble-wrap.user  { justify-content: flex-start; }

        .adm-bubble {
          max-width: 78%;
          padding: 8px 12px;
          font-size: 13px;
          line-height: 1.45;
          word-break: break-word;
        }
        .adm-bubble.admin {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #fff;
          border-radius: 16px 16px 3px 16px;
          box-shadow: 0 2px 8px rgba(239,68,68,0.22);
        }
        .adm-bubble.user {
          background: #fff;
          color: #111827;
          border-radius: 16px 16px 16px 3px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.07);
          border: 1px solid #f3f4f6;
        }
        .adm-bubble.optimistic { opacity: 0.65; }

        .adm-bubble-meta {
          font-size: 10px;
          opacity: 0.65;
          margin-top: 3px;
          text-align: right;
        }

        /* Input */
        .adm-input-bar {
          padding: 10px 12px;
          border-top: 1px solid #f3f4f6;
          display: flex;
          gap: 8px;
          align-items: flex-end;
          background: #fff;
          flex-shrink: 0;
        }
        .adm-textarea {
          flex: 1;
          border: 1.5px solid #e5e7eb;
          border-radius: 18px;
          padding: 8px 14px;
          font-size: 13px;
          font-family: 'DM Sans', system-ui, sans-serif;
          resize: none;
          outline: none;
          line-height: 1.4;
          max-height: 80px;
          overflow-y: auto;
          transition: border-color 0.2s;
          background: #f9fafb;
          color: #111827;
        }
        .adm-textarea:focus {
          border-color: #ef4444;
          background: #fff;
        }
        .adm-send-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: none;
          cursor: default;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 16px;
          background: #f3f4f6;
          color: #9ca3af;
          transition: background 0.2s, transform 0.15s;
        }
        .adm-send-btn.active {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #fff;
          cursor: pointer;
          box-shadow: 0 2px 10px rgba(239,68,68,0.3);
        }
        .adm-send-btn.active:hover { transform: scale(1.08); }

        /* Schedule */
        .adm-schedule { padding: 14px; overflow-y: auto; flex: 1; }
        .adm-schedule::-webkit-scrollbar { width: 4px; }
        .adm-schedule-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
        }
        .adm-schedule-title { font-size: 14px; font-weight: 700; color: #111827; }
        .adm-new-btn {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 6px 12px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          font-family: 'DM Sans', system-ui, sans-serif;
          transition: opacity 0.15s;
        }
        .adm-new-btn:hover { opacity: 0.88; }

        .adm-form-card {
          background: #f9fafb;
          border: 1px solid #f3f4f6;
          border-radius: 14px;
          padding: 14px;
          margin-bottom: 14px;
        }
        .adm-field { margin-bottom: 10px; }
        .adm-label {
          display: block;
          font-size: 11px;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 5px;
        }
        .adm-input {
          border: 1.5px solid #e5e7eb;
          border-radius: 9px;
          padding: 7px 11px;
          font-size: 12px;
          font-family: 'DM Sans', system-ui, sans-serif;
          outline: none;
          background: #fff;
          color: #111827;
          width: 100%;
          box-sizing: border-box;
          transition: border-color 0.2s;
        }
        .adm-input:focus { border-color: #ef4444; }
        .adm-form-textarea {
          width: 100%;
          box-sizing: border-box;
          border-radius: 9px;
          padding: 8px 11px;
          resize: none;
          font-family: 'DM Sans', system-ui, sans-serif;
        }
        .adm-ai-btn {
          background: #e5e7eb;
          color: #9ca3af;
          border: none;
          border-radius: 8px;
          padding: 7px 10px;
          cursor: default;
          font-size: 11px;
          font-weight: 600;
          font-family: 'DM Sans', system-ui, sans-serif;
          white-space: nowrap;
          transition: background 0.2s;
        }
        .adm-ai-btn.active { background: #7c3aed; color: #fff; cursor: pointer; }
        .adm-ai-tag {
          background: #ede9fe;
          color: #7c3aed;
          padding: 1px 5px;
          border-radius: 4px;
          font-size: 10px;
        }
        .adm-user-checklist {
          max-height: 90px;
          overflow-y: auto;
          border: 1.5px solid #e5e7eb;
          border-radius: 9px;
          padding: 6px;
          background: #fff;
        }
        .adm-check-row {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 3px 2px;
          cursor: pointer;
          font-size: 12px;
          color: #374151;
        }
        .adm-link-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 11px;
          color: #ef4444;
          font-weight: 700;
          font-family: 'DM Sans', system-ui, sans-serif;
        }
        .adm-cancel-btn {
          background: none;
          border: 1.5px solid #e5e7eb;
          border-radius: 8px;
          padding: 6px 14px;
          cursor: pointer;
          font-size: 12px;
          font-family: 'DM Sans', system-ui, sans-serif;
          color: #6b7280;
        }
        .adm-save-btn {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 6px 14px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          font-family: 'DM Sans', system-ui, sans-serif;
          opacity: 1;
          transition: opacity 0.15s;
        }
        .adm-save-btn:disabled { opacity: 0.55; cursor: default; }

        .adm-schedule-list { display: flex; flex-direction: column; gap: 10px; }
        .adm-schedule-item {
          border-radius: 12px;
          padding: 12px;
          border: 1.5px solid;
          transition: opacity 0.2s;
        }
        .adm-schedule-item.active { background: #fff; border-color: #fecaca; }
        .adm-schedule-item.inactive { background: #f9fafb; border-color: #e5e7eb; opacity: 0.65; }
        .adm-schedule-item-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }
        .adm-schedule-icon { font-size: 14px; }
        .adm-schedule-badge {
          padding: 2px 8px;
          border-radius: 20px;
          font-size: 10px;
          font-weight: 700;
        }
        .adm-schedule-badge.on { background: #fee2e2; color: #ef4444; }
        .adm-schedule-badge.off { background: #f3f4f6; color: #9ca3af; }
        .adm-schedule-users { font-size: 10px; color: #9ca3af; }
        .adm-icon-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 14px;
          padding: 3px;
          border-radius: 6px;
          transition: background 0.15s;
        }
        .adm-icon-btn:hover { background: #f3f4f6; }
        .adm-icon-btn.danger:hover { background: #fef2f2; }
        .adm-schedule-content {
          margin: 0;
          font-size: 12px;
          color: #374151;
          line-height: 1.45;
        }
        .adm-schedule-last {
          font-size: 10px;
          color: #9ca3af;
          margin-top: 4px;
        }

        /* States */
        .adm-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          padding: 48px;
          color: #9ca3af;
          font-size: 13px;
        }
        .adm-spinner {
          width: 24px;
          height: 24px;
          border: 2.5px solid #fecaca;
          border-top-color: #ef4444;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .adm-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: #9ca3af;
        }
        .adm-empty-icon {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: #fef2f2;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
        }
        .adm-empty p {
          margin: 0;
          font-size: 12px;
          color: #9ca3af;
          text-align: center;
          line-height: 1.5;
        }
      `}</style>

      <div className="adm-panel">
        {/* Header */}
        <div className="adm-header">
          <div className="adm-header-title">Panel de Operador</div>
          <div className="adm-header-sub">
            {users.length} usuario{users.length !== 1 ? "s" : ""} registrado
            {users.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Tabs */}
        <div className="adm-tabs">
          {[
            {
              key: "chats",
              label: "💬 Conversaciones",
              badge: users.reduce((a, u) => a + (u.unread_count || 0), 0),
            },
            { key: "schedule", label: "🕐 Automáticos" },
          ].map((t) => (
            <button
              key={t.key}
              className={`adm-tab ${tab === t.key ? "active" : ""}`}
              onClick={() => {
                setTab(t.key);
                setSelectedUser(null);
              }}
            >
              {t.label}
              {t.badge > 0 && <span className="adm-tab-badge">{t.badge}</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="adm-content">
          {tab === "chats" && !selectedUser && (
            <ChatList
              users={users}
              loading={loadingUsers}
              onSelect={setSelectedUser}
              search={search}
              setSearch={setSearch}
            />
          )}

          {tab === "chats" && selectedUser && (
            <AdminChatWindow
              adminEmail={adminEmail}
              targetUser={selectedUser}
              onBack={() => setSelectedUser(null)}
            />
          )}

          {tab === "schedule" && (
            <ScheduleManager adminEmail={adminEmail} allUsers={users} />
          )}
        </div>
      </div>
    </>
  );
}
