// frontend/src/components/OperatorChat.jsx
import { useState, useEffect, useRef } from "react";
import { useStore } from "../store";

const API = "/api/operator_chat";

export default function OperatorChat() {
  const { user } = useStore();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [pendingNew, setPendingNew] = useState(0);
  const bottomRef = useRef(null);
  const pollRef = useRef(null);
  const textareaRef = useRef(null);
  const messagesBoxRef = useRef(null);
  const atBottomRef = useRef(true);
  const prevLenRef = useRef(0);
  const justOpenedRef = useRef(false);

  const fetchMessages = async () => {
    if (!user || !user.uid) return;
    try {
      const res = await fetch(
        `${API}/operator-chat/${user.uid}?requester_email=${encodeURIComponent(user.email || "")}`,
        { credentials: "include", cache: "no-store" },
      );
      const data = await res.json();
      if (data.messages) setMessages(data.messages);
    } catch (e) {
      console.error("[OperatorChat] fetchMessages:", e);
    }
  };

  const fetchUnread = async () => {
    if (!user || !user.uid || open) return;
    try {
      const res = await fetch(`${API}/operator-chat/unread/${user.uid}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      setUnread(data.unread || 0);
    } catch (_) {}
  };

  useEffect(() => {
    if (!user || !user.uid) return;
    fetchUnread();
    const msgPollMs = 1500;
    const unreadPollMs = 5000;
    pollRef.current = setInterval(() => {
      if (open) fetchMessages();
      else fetchUnread();
    }, open ? msgPollMs : unreadPollMs);
    return () => clearInterval(pollRef.current);
  }, [user && user.uid, open]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setPendingNew(0);
      justOpenedRef.current = true;
      fetchMessages();
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [open]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("operatorChat:open", onOpen);
    return () => window.removeEventListener("operatorChat:open", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onFocus = () => fetchMessages();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [open]);

  const scrollToBottom = (behavior = "auto") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  };

  const computeIsAtBottom = () => {
    const box = messagesBoxRef.current;
    if (!box) return true;
    const thresholdPx = 80;
    const distance = box.scrollHeight - box.scrollTop - box.clientHeight;
    return distance <= thresholdPx;
  };

  useEffect(() => {
    if (!open) {
      prevLenRef.current = messages.length;
      return;
    }

    if (justOpenedRef.current) {
      // On first open, always go to the bottom (even if the list is long).
      justOpenedRef.current = false;
      setPendingNew(0);
      scrollToBottom("auto");
      prevLenRef.current = messages.length;
      return;
    }

    const had = prevLenRef.current || 0;
    const hasNew = messages.length > had;
    prevLenRef.current = messages.length;

    if (!hasNew) return;

    // Solo contar como "nuevo" lo que venga del admin.
    const newSlice = messages.slice(had);
    const newAdminCount = newSlice.filter((m) => m?.x_sender_role === "admin").length;
    if (newAdminCount <= 0) return;

    const atBottom = computeIsAtBottom();
    atBottomRef.current = atBottom;

    if (atBottom) {
      setPendingNew(0);
      scrollToBottom("auto");
    } else {
      setPendingNew((p) => p + newAdminCount);
    }
  }, [messages, open]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading || !user || !user.uid) return;
    setLoading(true);
    setInput("");

    const optimistic = {
      id: Date.now(),
      x_sender_role: "user",
      x_content: text,
      x_timestamp: new Date().toISOString(),
      x_read: false,
      _optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      await fetch(`${API}/operator-chat/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sender_email: user.email,
          user_id: user.uid,
          content: text,
        }),
      });
      await fetchMessages();
    } catch (e) {
      console.error("[OperatorChat] sendMessage:", e);
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

  const formatTime = (ts) => {
    if (!ts) return "";
    return new Date(ts).toLocaleTimeString("es-DO", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

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

  const ADMIN_EMAIL = "sosemergelens@gmail.com";
  if (!user || !user.uid) return null;
  if (user.email === ADMIN_EMAIL) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');

        .op-chat-fab {
          position: fixed;
          bottom: 88px;
          right: 16px;
          width: 54px;
          height: 54px;
          border-radius: 50%;
          background: linear-gradient(145deg, #ef4444, #b91c1c);
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(239,68,68,0.45), 0 0 0 0 rgba(239,68,68,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9998;
          transition: transform 0.2s cubic-bezier(.34,1.56,.64,1), box-shadow 0.2s;
          animation: fab-pulse 3s infinite;
        }
        @keyframes fab-pulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(239,68,68,0.45), 0 0 0 0 rgba(239,68,68,0.3); }
          50% { box-shadow: 0 4px 24px rgba(239,68,68,0.55), 0 0 0 10px rgba(239,68,68,0); }
        }
        .op-chat-fab:hover {
          transform: scale(1.08);
        }
        .op-chat-fab.is-open {
          animation: none;
          box-shadow: 0 4px 20px rgba(239,68,68,0.4);
        }

        .op-chat-window {
          position: fixed;
          bottom: 155px;
          right: 16px;
          width: 330px;
          height: 460px;
          background: #fff;
          border-radius: 20px;
          box-shadow: 0 12px 50px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
          display: flex;
          flex-direction: column;
          z-index: 9999;
          overflow: hidden;
          font-family: 'DM Sans', system-ui, sans-serif;
          animation: chat-in 0.28s cubic-bezier(.34,1.56,.64,1);
          transform-origin: bottom right;
        }
        @keyframes chat-in {
          from { opacity: 0; transform: scale(0.88) translateY(12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }

        .op-chat-header {
          background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
          padding: 14px 16px;
          color: #fff;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
          position: relative;
          overflow: hidden;
        }
        .op-chat-header::before {
          content: '';
          position: absolute;
          top: -20px; right: -20px;
          width: 80px; height: 80px;
          border-radius: 50%;
          background: rgba(255,255,255,0.07);
        }
        .op-chat-header::after {
          content: '';
          position: absolute;
          bottom: -30px; left: 30px;
          width: 100px; height: 100px;
          border-radius: 50%;
          background: rgba(255,255,255,0.05);
        }

        .op-avatar {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: rgba(255,255,255,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          flex-shrink: 0;
          border: 2px solid rgba(255,255,255,0.3);
          position: relative;
          z-index: 1;
        }
        .op-online-dot {
          position: absolute;
          bottom: 1px;
          right: 1px;
          width: 9px;
          height: 9px;
          background: #4ade80;
          border-radius: 50%;
          border: 2px solid #ef4444;
        }

        .op-messages {
          flex: 1;
          overflow-y: auto;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          background: #f9fafb;
        }
        .op-messages::-webkit-scrollbar { width: 4px; }
        .op-messages::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }

        .op-new-msg {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          bottom: 66px;
          background: rgba(17,24,39,0.92);
          color: #fff;
          border: none;
          border-radius: 999px;
          padding: 7px 12px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 10px 28px rgba(0,0,0,0.25);
          display: inline-flex;
          align-items: center;
          gap: 8px;
          z-index: 4;
        }
        .op-new-msg:hover { filter: brightness(1.03); }
        .op-new-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ef4444;
          box-shadow: 0 0 0 3px rgba(239,68,68,0.22);
        }

        .op-date-label {
          text-align: center;
          font-size: 10px;
          color: #9ca3af;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          margin: 6px 0 2px;
        }

        .op-bubble-wrap {
          display: flex;
          animation: bubble-in 0.18s ease;
        }
        @keyframes bubble-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .op-bubble-wrap.user { justify-content: flex-end; }
        .op-bubble-wrap.admin { justify-content: flex-start; }

        .op-bubble {
          max-width: 78%;
          padding: 8px 12px;
          font-size: 13px;
          line-height: 1.45;
          position: relative;
          word-break: break-word;
        }
        .op-bubble.user {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #fff;
          border-radius: 16px 16px 3px 16px;
          box-shadow: 0 2px 8px rgba(239,68,68,0.25);
        }
        .op-bubble.admin {
          background: #fff;
          color: #111827;
          border-radius: 16px 16px 16px 3px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.08);
          border: 1px solid #f3f4f6;
        }
        .op-bubble.optimistic { opacity: 0.65; }

        .op-bubble-role {
          font-size: 9px;
          font-weight: 700;
          color: #ef4444;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 2px;
        }
        .op-bubble-meta {
          font-size: 10px;
          opacity: 0.65;
          margin-top: 3px;
          text-align: right;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 3px;
        }

        .op-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #d1d5db;
          gap: 8px;
          padding-bottom: 20px;
        }
        .op-empty-icon {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: #fef2f2;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
        }
        .op-empty p { margin: 0; font-size: 12px; color: #9ca3af; text-align: center; line-height: 1.5; }

        .op-input-bar {
          padding: 10px 12px;
          border-top: 1px solid #f3f4f6;
          display: flex;
          gap: 8px;
          align-items: flex-end;
          background: #fff;
          flex-shrink: 0;
        }
        .op-textarea {
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
        .op-textarea:focus {
          border-color: #ef4444;
          background: #fff;
        }
        .op-send-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: background 0.2s, transform 0.15s;
        }
        .op-send-btn.active {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          box-shadow: 0 2px 10px rgba(239,68,68,0.3);
        }
        .op-send-btn.active:hover { transform: scale(1.08); }
        .op-send-btn.inactive { background: #f3f4f6; cursor: default; }

        .op-unread-badge {
          position: absolute;
          top: -8px;
          right: -8px;
          background: #ef4444;
          color: #fff;
          border-radius: 50%;
          width: 20px;
          height: 20px;
          font-size: 10px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid rgba(255,255,255,0.95);
          font-family: 'DM Sans', system-ui, sans-serif;
        }
      `}</style>

      {/* FAB */}
      <button
        className={`op-chat-fab${open ? " is-open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        title="Chat con operador"
      >
        <span style={{ fontSize: "22px", lineHeight: 1 }}>
          {open ? "✕" : "💬"}
        </span>
        {!open && unread > 0 && (
          <span className="op-unread-badge">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>

      {/* Ventana */}
      {open && (
        <div className="op-chat-window">
          {/* Header */}
          <div className="op-chat-header">
            <div className="op-avatar" style={{ position: "relative" }}>
              🛡️
              <div className="op-online-dot" />
            </div>
            <div style={{ flex: 1, position: "relative", zIndex: 1 }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "14px",
                  letterSpacing: "-0.01em",
                }}
              >
                Operador SOS
              </div>
              <div
                style={{
                  fontSize: "11px",
                  opacity: 0.85,
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#4ade80",
                    display: "inline-block",
                  }}
                />
                Respuesta de emergencias
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "rgba(255,255,255,0.15)",
                border: "none",
                color: "#fff",
                width: 28,
                height: 28,
                borderRadius: "50%",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                position: "relative",
                zIndex: 1,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.25)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.15)")
              }
            >
              ✕
            </button>
          </div>

          {/* Mensajes */}
          <div
            className="op-messages"
            ref={messagesBoxRef}
            onScroll={() => {
              const atBottom = computeIsAtBottom();
              atBottomRef.current = atBottom;
              if (atBottom) setPendingNew(0);
            }}
          >
            {messages.length === 0 ? (
              <div className="op-empty">
                <div className="op-empty-icon">💬</div>
                <p>
                  Escríbele al operador.
                  <br />
                  Te responderá a la brevedad.
                </p>
              </div>
            ) : (
              groupByDate(messages).map((item, i) =>
                item.type === "date" ? (
                  <div key={`d-${i}`} className="op-date-label">
                    {item.label}
                  </div>
                ) : (
                  <div
                    key={item.msg.id}
                    className={`op-bubble-wrap ${item.msg.x_sender_role === "user" ? "user" : "admin"}`}
                  >
                    <div
                      className={`op-bubble ${item.msg.x_sender_role === "user" ? "user" : "admin"}${item.msg._optimistic ? " optimistic" : ""}`}
                    >
                      {item.msg.x_sender_role !== "user" && (
                        <div className="op-bubble-role">Operador</div>
                      )}
                      <div>{item.msg.x_content}</div>
                      <div className="op-bubble-meta">
                        {formatTime(item.msg.x_timestamp)}
                        {item.msg.x_sender_role === "user" && (
                          <span>{item.msg.x_read ? "✓✓" : "✓"}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ),
              )
            )}
            <div ref={bottomRef} />
          </div>

          {pendingNew > 0 && (
            <button
              className="op-new-msg"
              onClick={() => {
                setPendingNew(0);
                scrollToBottom("smooth");
              }}
              title="Ver mensajes nuevos"
            >
              <span className="op-new-dot" />
              {pendingNew} nuevo{pendingNew > 1 ? "s" : ""}
              <i className="ri-arrow-down-s-line" style={{ fontSize: 16 }} />
            </button>
          )}

          {/* Input */}
          <div className="op-input-bar">
            <textarea
              ref={textareaRef}
              className="op-textarea"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Escribe un mensaje..."
              rows={1}
            />
            <button
              className={`op-send-btn ${input.trim() ? "active" : "inactive"}`}
              onClick={sendMessage}
              disabled={loading || !input.trim()}
            >
              <span
                style={{
                  color: input.trim() ? "#fff" : "#9ca3af",
                  fontSize: 16,
                }}
              >
                ➤
              </span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
