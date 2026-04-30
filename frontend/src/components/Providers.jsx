// UI helpers globales:
// - ToastProvider: mensajes cortos (exito/error) que desaparecen solos.
// - ModalProvider: modales reutilizables (confirmaciones, dialogs, etc.).
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";

/* --- TOAST --------------------------- */
const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  // Mantiene una lista de toasts. En esta app se muestra solo 1 a la vez.
  const [list, setList] = useState([]);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const toast = useCallback((msg, type = "ok") => {
    const id = Date.now();
    if (timerRef.current) clearTimeout(timerRef.current);
    // Only show one toast at a time (replace previous).
    setList([{ id, msg, type }]);
    timerRef.current = setTimeout(() => {
      setList([]);
      timerRef.current = null;
    }, 3000);
  }, []);

  const icons = {
  ok: "ri-check-line",
  err: "ri-error-warning-line",
  warn: "ri-alert-line",
  };

  return (
  <ToastCtx.Provider value={toast}>
  {children}
  {list.map((t) => (
  <div key={t.id} className={`toast ${t.type}`}>
  <i className={icons[t.type] || "ri-information-line"} />
  {t.msg}
  </div>
  ))}
  </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* --- MODAL --------------------------- */
const ModalCtx = createContext(null);

export function ModalProvider({ children }) {
  // Modal simple:
  // - content: JSX que se renderiza dentro del modal
  // - fullscreen: variante visual para pantallas grandes (ej: mapas, chat)
  const [content, setContent] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);

  const openModal = useCallback((jsx, fs = false) => {
  setContent(jsx);
  setFullscreen(fs);
  }, []);
  const closeModal = useCallback(() => {
  setContent(null);
  setFullscreen(false);
  }, []);

  return (
  <ModalCtx.Provider value={{ openModal, closeModal }}>
  {children}
  {content && (
  <div
  className="overlay"
  onClick={(e) => {
  if (e.target.classList.contains("overlay")) closeModal();
  }}
  >
  <div className={fullscreen ? "modal modal-full" : "modal"}>
  {content}
  </div>
  </div>
  )}
  </ModalCtx.Provider>
  );
}

export const useModal = () => useContext(ModalCtx);

/* --- CONFIRM helper ------------------- */
export function ConfirmModal({ title, msg, onConfirm, onClose }) {
  return (
  <>
  <div className="m-head">
  <h3>{title}</h3>
  <button className="m-close" onClick={onClose}>
  <i className="ri-close-line" />
  </button>
  </div>
  <div className="m-body">
  <p style={{ color: "var(--muted)" }}>{msg}</p>
  </div>
  <div className="m-foot">
  <button className="btn btn-muted" onClick={onClose}>
  Cancelar
  </button>
  <button
  className="btn btn-danger"
  onClick={() => {
  onConfirm();
  onClose();
  }}
  >
  Eliminar
  </button>
  </div>
  </>
  );
}
