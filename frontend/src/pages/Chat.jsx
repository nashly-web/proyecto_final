// Chat: chat informativo (no es la llamada LENS).
// Se usa para consejos/soporte y puede conectarse a endpoints del backend.
import { useState, useEffect, useRef } from "react";
import { useStore } from "../store";
import { useToast, useModal, ConfirmModal } from "../components/Providers";
import CallSimulator from "./CallSimulator";

const API = "/api";

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return d.toLocaleDateString("es", { day: "numeric", month: "short" });
}

export default function Chat({ onFireSOS }) {
  const { user, eType } = useStore();
  const toast = useToast();
  const { openModal, closeModal } = useModal();

  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [location, setLocation] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(true);
  const [drawerTab, setDrawerTab] = useState("chats");
  const [search, setSearch] = useState("");

  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState("");

  const [ctxMenu, setCtxMenu] = useState(null);

  const [drawerTop, setDrawerTop] = useState(() => {
    if (typeof document === "undefined") return 0;
    const el = document.querySelector(".top-bar");
    const h = el ? el.getBoundingClientRect().height : 0;
    return Math.round(h + 10);
  });

  const bottomRef = useRef(null);
  const msgsRef = useRef([]);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const drawerRef = useRef(null);
  const ctxRef = useRef(null);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (p) => setLocation({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
    );
    loadConversations();
  }, []);

  useEffect(() => {
    if (bottomRef.current)
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    msgsRef.current = messages;
  }, [messages]);

  useEffect(() => {
    function handler(e) {
      if (drawerRef.current && drawerRef.current.contains(e.target)) return;
      if (ctxRef.current && ctxRef.current.contains(e.target)) return;
      setCtxMenu(null);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    function measure() {
      const el = document.querySelector(".top-bar");
      const h = el ? el.getBoundingClientRect().height : 0;
      setDrawerTop(Math.round(h + 10));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  function openLensCall() {
    const type = eType || "medical";
    openModal(
      <CallSimulator
        eType={type}
        userName={(user && user.name) || "Usuario"}
        loc={location}
        onClose={closeModal}
      />,
      true,
    );
  }

  async function loadConversations() {
    try {
      const res = await fetch(`${API}/chat/conversations`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) setConversations(data.conversations);
    } catch {}
  }

  async function newConversation() {
    try {
      const res = await fetch(`${API}/chat/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: "Nueva conversacion" }),
      });
      const data = await res.json();
      if (data.ok) {
        const conv = {
          id: data.id,
          x_title: "Nueva conversacion",
          create_date: new Date().toISOString(),
          x_status: "active",
        };
        setConversations((prev) => [conv, ...prev]);
        openConversation(conv);
      }
    } catch {}
  }

  async function openConversation(conv) {
    setActiveConv(conv);
    setCtxMenu(null);
    setMessages([
      { role: "assistant", content: "Hola  soy LENS. En que puedo ayudarte" },
    ]);
    try {
      const res = await fetch(`${API}/chat/conversations/${conv.id}/messages`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok && data.messages.length > 0) {
        setMessages(
          data.messages.map((m) => ({
            role: m.x_role,
            content: m.x_content,
            audio: m.x_audio_url || null,
          })),
        );
      }
    } catch {}
  }

  async function renameConversation(id, newTitle) {
    if (!newTitle.trim()) return;
    try {
      await fetch(`${API}/chat/conversations/${id}/rename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: newTitle }),
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, x_title: newTitle } : c)),
      );
      if (activeConv && activeConv.id === id)
        setActiveConv((a) => ({ ...a, x_title: newTitle }));
    } catch {}
    setRenamingId(null);
  }

  async function archiveConversation(id) {
    try {
      const res = await fetch(`${API}/chat/conversations/${id}/archive`, {
        method: "PATCH",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error || "No se pudo archivar");
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, x_status: "archived" } : c)),
      );
      if (activeConv && activeConv.id === id) setActiveConv(null);
      toast("Chat archivado", "ok");
    } catch (e) {
      toast(e.message || "Error al archivar", "err");
    }
    setCtxMenu(null);
  }

  async function trashConversation(id) {
    try {
      const res = await fetch(`${API}/chat/conversations/${id}/trash`, {
        method: "PATCH",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok)
        throw new Error(data.error || "No se pudo mover a papelera");
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, x_status: "trashed" } : c)),
      );
      if (activeConv && activeConv.id === id) setActiveConv(null);
      toast("Chat movido a papelera", "ok");
    } catch (e) {
      toast(e.message || "Error al borrar", "err");
    }
    setCtxMenu(null);
  }

  async function restoreConversation(id) {
    try {
      const res = await fetch(`${API}/chat/conversations/${id}/restore`, {
        method: "PATCH",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error || "No se pudo restaurar");
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, x_status: "active" } : c)),
      );
      toast("Chat restaurado", "ok");
    } catch (e) {
      toast(e.message || "Error al restaurar", "err");
    }
    setCtxMenu(null);
  }

  async function deleteForever(id) {
    try {
      const res = await fetch(`${API}/chat/conversations/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error || "No se pudo eliminar");
      setConversations((prev) => prev.filter((c) => c.id !== id));
      toast("Chat eliminado", "ok");
    } catch (e) {
      toast(e.message || "Error al eliminar", "err");
    }
    setCtxMenu(null);
  }

  async function emptyTrashForever() {
    try {
      const res = await fetch(`${API}/chat/conversations/empty-trash`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok)
        throw new Error(data.error || "No se pudo vaciar");
      const trashedIds = new Set(
        conversations.filter((c) => c.x_status === "trashed").map((c) => c.id),
      );
      setConversations((prev) => prev.filter((c) => c.x_status !== "trashed"));
      if (activeConv && trashedIds.has(activeConv.id)) setActiveConv(null);
      toast(`Papelera vaciada (${data.deleted || 0})`, "ok");
    } catch (e) {
      toast(e.message || "Error al vaciar papelera", "err");
    }
    setCtxMenu(null);
  }

  const activeList = conversations.filter(
    (c) =>
      c.x_status !== "archived" &&
      c.x_status !== "trashed" &&
      (c.x_title.toLowerCase().includes(search.toLowerCase()) || !search),
  );
  const archivedList = conversations.filter((c) => c.x_status === "archived");
  const trashedList = conversations.filter((c) => c.x_status === "trashed");

  async function handleSend(text) {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput("");

    const userMsg = { role: "user", content: msg };
    const newMessages = [...(msgsRef.current || messages), userMsg];
    setMessages(newMessages);
    setLoading(true);

    let convId = activeConv ? activeConv.id : null;
    if (!convId) {
      try {
        const res = await fetch(`${API}/chat/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ title: msg.slice(0, 40) }),
        });
        const data = await res.json();
        if (data.ok) {
          convId = data.id;
          const conv = {
            id: data.id,
            x_title: msg.slice(0, 40),
            create_date: new Date().toISOString(),
            x_status: "active",
          };
          setActiveConv(conv);
          setConversations((prev) => [conv, ...prev]);
        }
      } catch {}
    }

    try {
      const history = newMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const res = await fetch(`${API}/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: msg,
          history,
          location,
          conv_id: convId,
        }),
      });
      const data = await res.json();

      if (data.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.message },
        ]);
        // SOS se activa sin toast
        if (data.is_emergency && onFireSOS) {
          onFireSOS(data.emergency_data);
        }
        if (messages.length <= 1 && activeConv) {
          const short = msg.slice(0, 40);
          setConversations((prev) =>
            prev.map((c) => (c.id === convId ? { ...c, x_title: short } : c)),
          );
          setActiveConv((a) => (a ? { ...a, x_title: short } : a));
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Lo siento, hubo un error." },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error de conexion." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timerRef.current);
        setRecSecs(0);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const audioUrl = URL.createObjectURL(blob);
        setMessages((prev) => [
          ...prev,
          {
            role: "user",
            content: " Nota de voz",
            audio: audioUrl,
            transcribing: true,
          },
        ]);
        setLoading(true);
        try {
          const formData = new FormData();
          formData.append("audio", blob, "audio.webm");
          formData.append("location", location ? JSON.stringify(location) : "");
          formData.append(
            "history",
            JSON.stringify(
              (msgsRef.current || messages).map((m) => ({
                role: m.role,
                content: m.content,
              })),
            ),
          );
          formData.append("conv_id", (activeConv && activeConv.id) || "");
          const res = await fetch(`${API}/chat/transcribe`, {
            method: "POST",
            credentials: "include",
            body: formData,
          });
          const data = await res.json();
          if (data.ok) {
            setMessages((prev) =>
              prev.map((m, i) =>
                i === prev.length - 1
                  ? {
                      ...m,
                      content: ` "${data.transcript}"`,
                      transcribing: false,
                    }
                  : m,
              ),
            );
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: data.message },
            ]);
            // SOS sin toast
            if (data.is_emergency && onFireSOS) {
              onFireSOS(data.emergency_data);
            }
          } else {
            setMessages((prev) =>
              prev.map((m, i) =>
                i === prev.length - 1
                  ? {
                      ...m,
                      content: " Error al transcribir",
                      transcribing: false,
                    }
                  : m,
              ),
            );
          }
        } catch {
          setMessages((prev) =>
            prev.map((m, i) =>
              i === prev.length - 1
                ? { ...m, content: " Error de conexion", transcribing: false }
                : m,
            ),
          );
        } finally {
          setLoading(false);
        }
      };
      mediaRef.current = recorder;
      recorder.start();
      setRecording(true);
      timerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch {
      alert("No se pudo acceder al microfono");
    }
  }

  function stopRecording() {
    if (mediaRef.current) mediaRef.current.stop();
    setRecording(false);
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function fmtSecs(s) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function openCtx(e, conv) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({
      id: conv.id,
      status: conv.x_status,
      x: e.clientX,
      y: e.clientY,
    });
  }

  function ConvItem({ conv }) {
    const isActive = activeConv && activeConv.id === conv.id;
    const isRenaming = renamingId === conv.id;
    const [hover, setHover] = useState(false);
    return (
      <div
        onClick={() => !isRenaming && openConversation(conv)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderRadius: 10,
          marginBottom: 2,
          background: isActive ? "rgba(255,255,255,.08)" : "transparent",
          cursor: "pointer",
          transition: "background .15s",
          position: "relative",
        }}
        onMouseEnter={(e) => {
          setHover(true);
          if (!isActive)
            e.currentTarget.style.background = "rgba(255,255,255,.04)";
        }}
        onMouseLeave={(e) => {
          setHover(false);
          if (!isActive) e.currentTarget.style.background = "transparent";
        }}
        onContextMenu={(e) => openCtx(e, conv)}
      >
        <i
          className="ri-chat-3-line"
          style={{ color: "var(--muted)", fontSize: 15, flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          {isRenaming ? (
            <input
              autoFocus
              value={renameVal}
              onChange={(e) => setRenameVal(e.target.value)}
              onBlur={() => renameConversation(conv.id, renameVal)}
              onKeyDown={(e) => {
                if (e.key === "Enter") renameConversation(conv.id, renameVal);
                if (e.key === "Escape") setRenamingId(null);
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                background: "var(--navy-light)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "2px 8px",
                color: "#fff",
                fontSize: ".85rem",
              }}
            />
          ) : (
            <p
              style={{
                fontSize: ".85rem",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {conv.x_title || "Nueva conversacion"}
            </p>
          )}
        </div>
        <span
          style={{ fontSize: ".7rem", color: "var(--muted)", flexShrink: 0 }}
        >
          {timeAgo(conv.create_date)}
        </span>
        <button
          onClick={(e) => openCtx(e, conv)}
          style={{
            background: "none",
            border: "none",
            color: "var(--muted)",
            fontSize: 16,
            padding: "2px 4px",
            flexShrink: 0,
            opacity: isActive || hover ? 1 : 0,
            pointerEvents: isActive || hover ? "auto" : "none",
            transition: "opacity .15s",
          }}
          className="conv-opts"
        >
          <i className="ri-more-line" />
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        height: "calc(100vh - 130px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* DRAWER */}
      <div
        ref={drawerRef}
        style={{
          position: "fixed",
          top: drawerTop,
          left: 0,
          bottom: 0,
          width: 280,
          background: "var(--navy-mid)",
          borderRight: "1px solid var(--border)",
          borderTopRightRadius: 14,
          boxShadow: "0 14px 34px rgba(0,0,0,.45)",
          zIndex: 101,
          display: "flex",
          flexDirection: "column",
          transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform .25s cubic-bezier(.4,0,.2,1)",
        }}
      >
        <div
          style={{
            padding: "16px 14px 12px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <h4 style={{ fontSize: ".95rem" }}>Conversaciones</h4>
            <button
              onClick={() => setDrawerOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: "var(--muted)",
                fontSize: 20,
              }}
              title="Cerrar lista"
            >
              <i className="ri-close-line" />
            </button>
          </div>
          <div style={{ position: "relative" }}>
            <i
              className="ri-search-line"
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--muted)",
                fontSize: 14,
              }}
            />
            <input
              type="text"
              placeholder="Buscar conversacion..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                background: "var(--navy)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "8px 10px 8px 32px",
                color: "#fff",
                fontSize: ".82rem",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        <div
          style={{ display: "flex", borderBottom: "1px solid var(--border)" }}
        >
          {[
            ["chats", "Chats", "ri-chat-3-line"],
            ["archived", "Archivo", "ri-archive-line"],
            ["trash", "Papelera", "ri-delete-bin-line"],
          ].map(([tab, label, icon]) => (
            <button
              key={tab}
              onClick={() => setDrawerTab(tab)}
              style={{
                flex: 1,
                padding: "10px 4px",
                background: "none",
                border: "none",
                color: drawerTab === tab ? "var(--red)" : "var(--muted)",
                borderBottom:
                  drawerTab === tab
                    ? "2px solid var(--red)"
                    : "2px solid transparent",
                fontSize: ".78rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
              }}
            >
              <i className={icon} style={{ fontSize: 16 }} />
              {label}
            </button>
          ))}
        </div>

        {drawerTab === "chats" && (
          <div style={{ padding: "10px 14px" }}>
            <button
              onClick={newConversation}
              style={{
                width: "100%",
                padding: "9px",
                borderRadius: 8,
                background: "var(--red)",
                border: "none",
                color: "#fff",
                fontWeight: 600,
                fontSize: ".85rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <i className="ri-add-line" /> Nuevo chat
            </button>
          </div>
        )}

        {drawerTab === "trash" && trashedList.length > 0 && (
          <div style={{ padding: "10px 14px" }}>
            <button
              onClick={() =>
                openModal(
                  <ConfirmModal
                    title="Vaciar papelera"
                    msg="Esto elimina permanentemente todos los chats en papelera. No se puede deshacer."
                    onConfirm={emptyTrashForever}
                    onClose={closeModal}
                  />,
                  false,
                )
              }
              style={{
                width: "100%",
                padding: "9px",
                borderRadius: 8,
                background: "rgba(229,57,53,.12)",
                border: "1px solid rgba(229,57,53,.35)",
                color: "#fff",
                fontWeight: 600,
                fontSize: ".85rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <i className="ri-delete-bin-6-line" /> Vaciar papelera
            </button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
          {drawerTab === "chats" &&
            (activeList.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "var(--muted)",
                  fontSize: ".82rem",
                  padding: 24,
                }}
              >
                Sin conversaciones
              </div>
            ) : (
              activeList.map((c) => <ConvItem key={c.id} conv={c} />)
            ))}

          {drawerTab === "archived" &&
            (archivedList.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "var(--muted)",
                  fontSize: ".82rem",
                  padding: 24,
                }}
              >
                Sin chats archivados
              </div>
            ) : (
              archivedList.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    borderRadius: 10,
                    marginBottom: 2,
                  }}
                >
                  <i
                    className="ri-archive-line"
                    style={{ color: "var(--muted)", fontSize: 15 }}
                  />
                  <p
                    style={{
                      flex: 1,
                      fontSize: ".85rem",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {c.x_title}
                  </p>
                  <button
                    onClick={() => restoreConversation(c.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--muted)",
                      fontSize: 14,
                    }}
                    title="Restaurar"
                  >
                    <i className="ri-arrow-go-back-line" />
                  </button>
                </div>
              ))
            ))}

          {drawerTab === "trash" &&
            (trashedList.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "var(--muted)",
                  fontSize: ".82rem",
                  padding: 24,
                }}
              >
                Papelera vacia
              </div>
            ) : (
              trashedList.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    borderRadius: 10,
                    marginBottom: 2,
                  }}
                >
                  <i
                    className="ri-delete-bin-line"
                    style={{ color: "var(--muted)", fontSize: 15 }}
                  />
                  <p
                    style={{
                      flex: 1,
                      fontSize: ".85rem",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      opacity: 0.6,
                    }}
                  >
                    {c.x_title}
                  </p>
                  <button
                    onClick={() => restoreConversation(c.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--muted)",
                      fontSize: 14,
                    }}
                    title="Restaurar"
                  >
                    <i className="ri-arrow-go-back-line" />
                  </button>
                  <button
                    onClick={() => deleteForever(c.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--red)",
                      fontSize: 14,
                    }}
                    title="Eliminar para siempre"
                  >
                    <i className="ri-delete-bin-fill" />
                  </button>
                </div>
              ))
            ))}
        </div>
      </div>

      {/* CONTEXT MENU */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          style={{
            position: "fixed",
            top: ctxMenu.y,
            left: ctxMenu.x,
            zIndex: 200,
            background: "var(--navy-mid)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 6,
            minWidth: 160,
            boxShadow: "0 8px 24px rgba(0,0,0,.4)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {ctxMenu.status !== "trashed" && ctxMenu.status !== "archived" && (
            <>
              <button
                onClick={() => {
                  setRenamingId(ctxMenu.id);
                  setRenameVal(
                    (conversations.find((c) => c.id === ctxMenu.id) || {})
                      .x_title || "",
                  );
                  setCtxMenu(null);
                }}
                className="ctx-item"
              >
                <i className="ri-pencil-line" /> Renombrar
              </button>
              <button
                onClick={() => archiveConversation(ctxMenu.id)}
                className="ctx-item"
              >
                <i className="ri-archive-line" /> Archivar
              </button>
              <button
                onClick={() => trashConversation(ctxMenu.id)}
                className="ctx-item"
                style={{ color: "var(--red)" }}
              >
                <i className="ri-delete-bin-line" /> Mover a papelera
              </button>
            </>
          )}
          {ctxMenu.status === "trashed" && (
            <>
              <button
                onClick={() => restoreConversation(ctxMenu.id)}
                className="ctx-item"
              >
                <i className="ri-arrow-go-back-line" /> Restaurar
              </button>
              <button
                onClick={() => deleteForever(ctxMenu.id)}
                className="ctx-item"
                style={{ color: "var(--red)" }}
              >
                <i className="ri-delete-bin-fill" /> Eliminar para siempre
              </button>
            </>
          )}
          {ctxMenu.status === "archived" && (
            <button
              onClick={() => restoreConversation(ctxMenu.id)}
              className="ctx-item"
            >
              <i className="ri-arrow-go-back-line" /> Restaurar
            </button>
          )}
        </div>
      )}

      {/* CHAT HEAD */}
      <div className="chat-head" style={{ borderRadius: "14px 14px 0 0" }}>
        <button onClick={() => setDrawerOpen(true)} title="Ver lista">
          <i className="ri-menu-line" />
        </button>
        <div style={{ flex: 1 }}>
          <h4>
            {(activeConv && activeConv.x_title) ||
              "LENS  Asistente Inteligente"}
          </h4>
          <p>IA disponible 24/7 Escribe o habla sobre cualquier tema</p>
        </div>
        {location && (
          <span
            style={{
              fontSize: ".72rem",
              color: "rgba(255,255,255,.8)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <i className="ri-map-pin-fill" /> Ubicacion activa
          </span>
        )}
        <button
          onClick={openLensCall}
          title="Llamar a LENS"
          style={{ fontSize: 20, color: "#CE93D8" }}
        >
          <i className="ri-phone-fill" />
        </button>
        <button
          onClick={newConversation}
          title="Nuevo chat"
          style={{ fontSize: 20 }}
        >
          <i className="ri-add-circle-line" />
        </button>
      </div>

      {/* MESSAGES */}
      <div className="chat-msgs" style={{ flex: 1 }}>
        {!activeConv && messages.length === 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 12,
            }}
          >
            <i
              className="ri-chat-ai-fill"
              style={{ fontSize: 48, color: "var(--muted)" }}
            />
            <h3 style={{ color: "var(--white)" }}>En que puedo ayudarte</h3>
            <p style={{ color: "var(--muted)", fontSize: ".85rem" }}>
              Escribe algo o graba una nota de voz
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role === "user" ? "out" : "in"}`}>
            {m.audio && (
              <audio
                controls
                src={m.audio}
                style={{
                  display: "block",
                  maxWidth: 220,
                  marginBottom: 6,
                  borderRadius: 8,
                }}
              />
            )}
            <p
              style={{
                whiteSpace: "pre-wrap",
                opacity: m.transcribing ? 0.6 : 1,
              }}
            >
              {m.transcribing ? "Transcribiendo..." : m.content}
            </p>
            <div className="msg-time">
              {m.role === "user"
                ? ((user && user.name) || "Tu").split(" ")[0] || "Tu"
                : "LENS"}
            </div>
          </div>
        ))}
        {loading && !recording && (
          <div className="msg in">
            <p style={{ color: "var(--muted)" }}>
              <i className="ri-loader-4-line" /> LENS esta escribiendo...
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* INPUT BAR */}
      <div className="chat-bar">
        {recording ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "0 16px",
              color: "var(--red)",
              fontWeight: 600,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "var(--red)",
                animation: "blink 1s infinite",
              }}
            />
            Grabando {fmtSecs(recSecs)}
          </div>
        ) : (
          <input
            type="text"
            placeholder="Escribe cualquier cosa..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={loading}
          />
        )}
        <button
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: "none",
            background: recording ? "var(--red)" : "var(--navy-light)",
            color: recording ? "#fff" : "var(--muted)",
            fontSize: 18,
            display: "grid",
            placeItems: "center",
            marginRight: 4,
          }}
          onClick={recording ? stopRecording : startRecording}
          disabled={loading && !recording}
        >
          <i className={recording ? "ri-stop-fill" : "ri-mic-fill"} />
        </button>
        {!recording && (
          <button
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: "none",
              background: input.trim() ? "var(--red)" : "var(--navy-light)",
              color: "#fff",
              fontSize: 18,
              display: "grid",
              placeItems: "center",
            }}
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
          >
            <i className="ri-send-plane-fill" />
          </button>
        )}
      </div>
    </div>
  );
}
