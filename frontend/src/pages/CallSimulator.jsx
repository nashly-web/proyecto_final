// CallSimulator: interfaz de "llamada" con LENS.
// Envia mensajes al backend (/api/lens/message) y muestra la respuesta en pantalla.
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { useToast } from "../components/Providers";

const OPENING = {
  medical:
    "Aqui LENS emergencias. Recibi tu alerta medica. Dime que sientes ahora mismo.",
  security:
    "Aqui LENS emergencias. Recibi tu alerta de seguridad. Estas en un lugar seguro ahora mismo?",
  fire: "Aqui LENS emergencias. Recibi alerta de incendio. Puedes salir del lugar ahora?",
  accident:
    "Aqui LENS emergencias. Recibi tu alerta de accidente. Puedes hablar con claridad?",
};

const E_COLOR = {
  medical: "#E53935",
  security: "#1565C0",
  fire: "#E65100",
  accident: "#F57C00",
};

export default function CallSimulator({ eType, userName, loc, onClose }) {
  const { pin } = useStore();
  const toast = useToast();

  const [phase, setPhase] = useState("ringing");
  const [transcript, setTranscript] = useState([]);
  const [interimText, setInterimText] = useState(""); // ← texto en tiempo real
  const [listening, setListening] = useState(false);
  const [lensThinking, setLensThinking] = useState(false);
  const [timer, setTimer] = useState(0);
  const [statusText, setStatusText] = useState("Llamando a LENS...");
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinVal, setPinVal] = useState("");

  const synthRef = useRef(window.speechSynthesis);
  const recognRef = useRef(null);
  const timerRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const interimBufRef = useRef("");
  const finalBufRef = useRef("");
  const historyRef = useRef([]);
  const transcriptRef = useRef(null);
  const phaseRef = useRef("ringing");
  const speakingRef = useRef(false);
  const listeningRef = useRef(false);
  const lensThinkingRef = useRef(false);
  const recogSessionRef = useRef(0);
  const fetchAbortRef = useRef(null);
  const voiceRef = useRef(null);
  const color = E_COLOR[eType] || "#E53935";

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    lensThinkingRef.current = lensThinking;
  }, [lensThinking]);

  useEffect(() => {
    const synth = synthRef.current;
    function pickVoice() {
      const voices = synth.getVoices() || [];
      const esVoice =
        voices.find(
          (v) =>
            v.lang?.toLowerCase().startsWith("es") &&
            v.name?.toLowerCase().includes("female"),
        ) ||
        voices.find((v) => v.lang?.toLowerCase().startsWith("es")) ||
        null;
      voiceRef.current = esVoice;
    }
    pickVoice();
    synth.onvoiceschanged = pickVoice;
    return () => {
      synth.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    if (phase === "active") {
      timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [phase]);

  useEffect(() => {
    if (transcriptRef.current)
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [transcript, interimText, lensThinking, listening]);

  // Arrancar la llamada
  useEffect(() => {
    const t = setTimeout(() => {
      setPhase("active");
      phaseRef.current = "active";
      setStatusText("Conectado con LENS");
      lensSpeak(
        OPENING[eType] || "Aqui LENS emergencias. Cual es tu situacion?",
      );
    }, 800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    return () => {
      synthRef.current.cancel();
      try {
        fetchAbortRef.current?.abort();
      } catch {}
      try {
        recognRef.current?.abort();
      } catch {}
      try {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      } catch {}
      clearInterval(timerRef.current);
    };
  }, []);

  function clearSilenceTimer() {
    try {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    } catch {}
    silenceTimerRef.current = null;
  }

  function stopRecognition({ abort = true } = {}) {
    recogSessionRef.current += 1;
    listeningRef.current = false;
    setListening(false);
    setInterimText("");
    clearSilenceTimer();
    interimBufRef.current = "";
    finalBufRef.current = "";
    try {
      const r = recognRef.current;
      if (!r) return;
      if (abort) r.abort();
      else r.stop();
    } catch {}
  }

  function abortPendingFetch() {
    try {
      fetchAbortRef.current?.abort();
    } catch {}
    fetchAbortRef.current = null;
    lensThinkingRef.current = false;
    setLensThinking(false);
    if (phaseRef.current === "active") setStatusText("Conectado con LENS");
  }

  // ── Síntesis de voz ──────────────────────────────────────────────────────
  function lensSpeak(text) {
    stopRecognition({ abort: true });
    setTranscript((p) => [...p, { role: "lens", text }]);
    historyRef.current.push({ role: "assistant", content: text });

    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = "es-ES";
    utt.rate = 1.12;
    utt.pitch = 1.1;
    utt.volume = 1;

    if (voiceRef.current) utt.voice = voiceRef.current;

    speakingRef.current = true;
    let done = false;

    function finish() {
      if (done) return;
      done = true;
      speakingRef.current = false;
      clearInterval(watchdog);
      // Arrancar reconocimiento inmediatamente al terminar
      setTimeout(() => {
        if (phaseRef.current !== "active") return;
        if (lensThinkingRef.current) return;
        if (listeningRef.current) return;
        startListening();
      }, 550);
    }

    utt.onend = finish;
    utt.onerror = finish;

    synthRef.current.cancel();
    setTimeout(() => synthRef.current.speak(utt), 80);

    // Watchdog por si onend no dispara
    const watchdog = setInterval(() => {
      if (!synthRef.current.speaking && !done) finish();
    }, 250);
  }

  // ── Reconocimiento de voz con interimResults ─────────────────────────────
  function startListening() {
    if (phaseRef.current !== "active") return;

    abortPendingFetch();

    // Parar síntesis si estaba hablando
    if (speakingRef.current) {
      synthRef.current.cancel();
      speakingRef.current = false;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast("Tu navegador no soporta reconocimiento de voz.", "err");
      return;
    }

    if (listeningRef.current) return;
    stopRecognition({ abort: true });
    const sessionId = (recogSessionRef.current += 1);

    const recog = new SR();
    recognRef.current = recog;
    recog.lang = "es-ES";
    recog.continuous = true;
    recog.interimResults = true; // ← CLAVE: transcripción en tiempo real
    recog.maxAlternatives = 1;

    setListening(true);
    listeningRef.current = true;
    setInterimText("");
    clearSilenceTimer();
    interimBufRef.current = "";
    finalBufRef.current = "";
    setStatusText("Escuchando...");

    function commitBuffered() {
      if (sessionId !== recogSessionRef.current) return;
      const text = (finalBufRef.current || interimBufRef.current || "").trim();
      if (!text) return;

      clearSilenceTimer();
      interimBufRef.current = "";
      finalBufRef.current = "";

      listeningRef.current = false;
      setListening(false);
      setInterimText("");

      // Marcar "procesando" antes de que dispare onend, para evitar reinicios de escucha
      setStatusText("LENS procesando...");
      lensThinkingRef.current = true;
      setLensThinking(true);

      try {
        recog.stop();
      } catch {}

      handleUserSpeech(text);
    }

    function armSilenceCommit(delayMs) {
      clearSilenceTimer();
      silenceTimerRef.current = setTimeout(() => commitBuffered(), delayMs);
    }

    recog.onresult = (e) => {
      if (sessionId !== recogSessionRef.current) return;
      let interim = "";
      let final = "";

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const txt = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          final += txt;
        } else {
          interim += txt;
        }
      }

      if (final.trim()) {
        finalBufRef.current = (finalBufRef.current + " " + final.trim()).trim();
        interimBufRef.current = "";
        setInterimText("");
        armSilenceCommit(700);
        return;
      }

      if (interim.trim()) {
        interimBufRef.current = interim.trim();
        setInterimText(interimBufRef.current);
        armSilenceCommit(950);
      }
    };

    recog.onerror = (err) => {
      if (sessionId !== recogSessionRef.current) return;
      setListening(false);
      listeningRef.current = false;
      setInterimText("");
      setStatusText("Conectado con LENS");
      // Si no hubo voz, volver a escuchar automáticamente
      if (err.error === "no-speech" && phaseRef.current === "active") {
        setTimeout(() => startListening(), 600);
      }
    };

    recog.onend = () => {
      if (sessionId !== recogSessionRef.current) return;

      const buffered = (finalBufRef.current || interimBufRef.current || "").trim();
      if (
        buffered &&
        phaseRef.current === "active" &&
        !lensThinkingRef.current &&
        !speakingRef.current
      ) {
        clearSilenceTimer();
        interimBufRef.current = "";
        finalBufRef.current = "";
        setInterimText("");
        setListening(false);
        listeningRef.current = false;
        setStatusText("Conectado con LENS");
        handleUserSpeech(buffered);
        return;
      }

      // Si termina sin texto capturado y seguimos activos, reiniciar
      if (
        phaseRef.current === "active" &&
        !lensThinkingRef.current &&
        !speakingRef.current
      ) {
        setTimeout(() => startListening(), 450);
      }

      setListening(false);
      listeningRef.current = false;
      setInterimText("");
      clearSilenceTimer();
      interimBufRef.current = "";
      finalBufRef.current = "";
    };

    try {
      recog.start();
    } catch {
      setListening(false);
      listeningRef.current = false;
      clearSilenceTimer();
      interimBufRef.current = "";
      finalBufRef.current = "";
    }
  }

  // ── Enviar mensaje a LENS ────────────────────────────────────────────────
  async function handleUserSpeech(text) {
    // Parar reconocimiento mientras LENS responde
    stopRecognition({ abort: true });

    setTranscript((p) => [...p, { role: "user", text }]);
    historyRef.current.push({ role: "user", content: text });
    setLensThinking(true);
    lensThinkingRef.current = true;
    setStatusText("LENS procesando...");

    try {
      const controller = new AbortController();
      fetchAbortRef.current = controller;
      const res = await fetch("/api/lens/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          message: text,
          eType,
          userName,
          lat: loc?.lat,
          lng: loc?.lng,
          history: historyRef.current.slice(-10),
        }),
      });
      const data = await res.json();
      const reply = data.reply || "Estoy contigo. Dime como te sientes ahora.";
      setLensThinking(false);
      lensThinkingRef.current = false;
      fetchAbortRef.current = null;
      setStatusText("Conectado con LENS");
      lensSpeak(reply);
    } catch (e) {
      if (e?.name === "AbortError") return;
      setLensThinking(false);
      lensThinkingRef.current = false;
      fetchAbortRef.current = null;
      setStatusText("Conectado con LENS");
      lensSpeak("Estoy contigo. La ayuda va en camino. Dime que sientes ahora.");
    }
  }

  // ── PIN para colgar ──────────────────────────────────────────────────────
  function requestHangUp() {
    setShowPinModal(true);
    setPinVal("");
    synthRef.current.pause();
    abortPendingFetch();
    stopRecognition({ abort: true });
  }

  function confirmHangUp() {
    if (pinVal !== pin) {
      toast("PIN incorrecto", "err");
      setPinVal("");
      return;
    }
    setShowPinModal(false);
    synthRef.current.cancel();
    abortPendingFetch();
    stopRecognition({ abort: true });
    clearInterval(timerRef.current);
    phaseRef.current = "ended";
    setPhase("ended");
    setTimeout(() => onClose(), 600);
  }

  function cancelHangUp() {
    setShowPinModal(false);
    setPinVal("");
    synthRef.current.resume();
  }

  function fmtTime(s) {
    return `${Math.floor(s / 60)
      .toString()
      .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  }

  if (phase === "ended")
    return (
      <div className="call-sim call-ended">
        <i
          className="ri-phone-off-fill"
          style={{ fontSize: 52, color: "#666" }}
        />
        <p style={{ color: "var(--muted)", marginTop: 14 }}>
          Llamada finalizada
        </p>
      </div>
    );

  return (
    <div className="call-sim">
      {/* Header */}
      <div
        className="call-header"
        style={{ borderBottom: `2px solid ${color}` }}
      >
        <div className="call-avatar" style={{ background: color }}>
          <i className="ri-robot-fill" />
        </div>
        <div className="call-info">
          <h3>LENS — Emergencias</h3>
          <p className="call-status">
            {phase === "ringing" ? (
              <>
                <span
                  className="call-dot ringing"
                  style={{ background: "#FFC107" }}
                />{" "}
                Llamando...
              </>
            ) : (
              <>
                <span className="call-dot active" /> {statusText}
              </>
            )}
          </p>
          {phase === "active" && (
            <span className="call-timer">{fmtTime(timer)}</span>
          )}
        </div>
      </div>

      {/* Transcript */}
      <div className="call-transcript" ref={transcriptRef}>
        {phase === "ringing" && transcript.length === 0 && (
          <div className="call-ringing-anim">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="ring-pulse"
                style={{ borderColor: color, animationDelay: `${i * 0.5}s` }}
              />
            ))}
          </div>
        )}

        {transcript.map((msg, i) => (
          <div key={i} className={`call-msg ${msg.role}`}>
            <div
              className="call-bubble"
              style={
                msg.role === "lens"
                  ? {
                      background: `${color}18`,
                      borderLeft: `3px solid ${color}`,
                    }
                  : {
                      background: "rgba(255,255,255,.05)",
                      borderLeft: "3px solid #00897B",
                    }
              }
            >
              <span className="call-who">
                {msg.role === "lens" ? "🤖 LENS" : "🎙️ Tú"}
              </span>
              <p>{msg.text}</p>
            </div>
          </div>
        ))}

        {/* Texto provisional en tiempo real */}
        {interimText && (
          <div className="call-msg user">
            <div
              className="call-bubble"
              style={{
                background: "rgba(255,255,255,0.03)",
                borderLeft: "3px solid #00897B",
                opacity: 0.7,
              }}
            >
              <span className="call-who">🎙️ Tú</span>
              <p
                style={{ fontStyle: "italic", color: "rgba(255,255,255,0.6)" }}
              >
                {interimText}
                <span style={{ animation: "blink 1s infinite", marginLeft: 2 }}>
                  |
                </span>
              </p>
            </div>
          </div>
        )}

        {lensThinking && (
          <div className="call-msg lens">
            <div
              className="call-bubble"
              style={{
                background: `${color}18`,
                borderLeft: `3px solid ${color}`,
              }}
            >
              <span className="call-who">🤖 LENS</span>
              <div className="thinking-dots">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}

        {listening && !interimText && (
          <div className="call-listening">
            <div className="mic-wave">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <p>Habla ahora...</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="call-footer">
        {phase === "active" && (
          <button
            className={`call-btn mic ${listening ? "active" : ""}`}
            onClick={
              listening
                ? () => {
                    stopRecognition({ abort: true });
                  }
                : startListening
            }
          >
            <i className={listening ? "ri-mic-fill" : "ri-mic-off-fill"} />
            <span>
              {listening ? "Escuchando..." : lensThinking ? "Interrumpir" : "Hablar"}
            </span>
          </button>
        )}
        <button className="call-btn hangup" onClick={requestHangUp}>
          <i className="ri-phone-off-fill" />
          <span>Colgar</span>
        </button>
      </div>

      {/* Modal PIN */}
      {showPinModal && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 18,
            zIndex: 10,
          }}
        >
          <div
            style={{
              background: "var(--navy-mid)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: 24,
              width: "85%",
              maxWidth: 300,
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>
              <i
                className="ri-shield-keyhole-fill"
                style={{ color: "var(--red)", marginRight: 8 }}
              />
              Cancelar emergencia
            </h3>
            <p
              style={{
                color: "var(--muted)",
                fontSize: ".85rem",
                margin: "0 0 16px",
              }}
            >
              Ingresa tu PIN para colgar y cancelar la emergencia.
            </p>
            <div className="field">
              <div className="field-input">
                <i className="ri-shield-keyhole-fill" />
                <input
                  type="password"
                  maxLength={4}
                  placeholder=""
                  value={pinVal}
                  onChange={(e) => setPinVal(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmHangUp()}
                  autoFocus
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button
                className="btn btn-muted"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={cancelHangUp}
              >
                Volver
              </button>
              <button
                className="btn btn-red"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={confirmHangUp}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
