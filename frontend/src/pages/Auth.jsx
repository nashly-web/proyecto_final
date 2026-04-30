// Auth: login/registro.
// El backend guarda la session (cookie), por eso el frontend luego puede llamar /api/auth/me.
import { useState } from "react";
import { useStore } from "../store";
import { useToast, useModal } from "../components/Providers";
import { odooLogin, odooRegister } from "../api";

export default function Auth({ initialTab, onBack, onEnterDash }) {
  const { setUser, setPin, setLocConsent } = useStore();
  const toast = useToast();
  const { openModal, closeModal } = useModal();

  const [tab, setTab] = useState(initialTab || "login");
  const [regStep, setRegStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [welcomeMsg, setWelcomeMsg] = useState("");

  const [lEmail, setLEmail] = useState("");
  const [lPass, setLPass] = useState("");

  const [rName, setRName] = useState("");
  const [rEmail, setREmail] = useState("");
  const [rPhone, setRPhone] = useState("");
  const [rPass, setRPass] = useState("");
  const [rPass2, setRPass2] = useState("");
  const [rPin, setRPin] = useState("");
  const [chkTerms, setChkTerms] = useState(false);
  const [chkLoc, setChkLoc] = useState(false);

  function switchTab(t) {
    setTab(t);
    setRegStep(1);
  }

  function nextStep(n) {
    if (regStep === 1 && n === 2) {
      if (!rName || !rEmail || !rPhone) {
        toast("Completa todos los campos", "err");
        return;
      }
    }
    if (regStep === 2 && n === 3) {
      if (rPass.length < 8) {
        toast("La contraseña debe tener 8+ caracteres", "err");
        return;
      }
      if (rPass !== rPass2) {
        toast("Las contraseñas no coinciden", "err");
        return;
      }
    }
    setRegStep(n);
  }

  async function doLogin(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await odooLogin(lEmail, lPass);
      // ✅ RF23: al hacer login, pedir consentimiento de ubicación si no lo dio
      setLocConsent(false); // se pedirá al activar SOS
      setUser({ name: result.name, email: lEmail, phone: "", uid: result.uid });
      onEnterDash(false);
    } catch (err) {
      toast(err.message || "Error al iniciar sesión", "err");
    } finally {
      setLoading(false);
    }
  }

  async function doRegister(e) {
    e.preventDefault();
    if (!chkTerms) {
      toast("Acepta los términos", "err");
      return;
    }
    if (rPin.length !== 4) {
      toast("PIN debe ser de 4 dígitos", "err");
      return;
    }

    setLoading(true);
    try {
      const userId = await odooRegister(rName, rEmail, rPass);
      setPin(rPin);
      // ✅ RF23: guardar consentimiento de ubicación en el store
      setLocConsent(chkLoc);
      setUser({ name: rName, email: rEmail, phone: rPhone, uid: userId });
      setWelcomeMsg(`¡Bienvenido ${rName}! Tu cuenta ya está lista.`);
      setTimeout(() => setWelcomeMsg(""), 4500);
      toast("¡Cuenta creada!", "ok");
      onEnterDash(true);
    } catch (err) {
      toast(err.message || "Error al crear cuenta", "err");
    } finally {
      setLoading(false);
    }
  }

  function openTerms(e) {
    e.preventDefault();
    openModal(
      <>
        <div className="m-head">
          <h3>Términos y Condiciones</h3>
          <button className="m-close" onClick={closeModal}>
            <i className="ri-close-line" />
          </button>
        </div>
        <div className="m-body">
          <div className="terms-box">
            <h4>1. Aceptación</h4>
            <p>
              Al utilizar SOS EmergeLens, aceptas estos términos en su
              totalidad.
            </p>
            <h4>2. Uso del Servicio</h4>
            <p>
              EmergeLens es para emergencias y ayuda social. El uso indebido
              (falsas alarmas) resultará en suspensión.
            </p>
            <h4>3. Privacidad y Ubicación</h4>
            <p>
              Tu ubicación{" "}
              <strong>solo se comparte cuando activas una emergencia</strong> y
              únicamente si otorgaste consentimiento. Puedes revocar este
              permiso en cualquier momento desde tu perfil. Protegemos tus datos
              según la ley.
            </p>
            <h4>4. Contactos</h4>
            <p>
              Eres responsable de mantener actualizados tus contactos de
              emergencia.
            </p>
            <h4>5. Donaciones</h4>
            <p>
              Las donaciones son voluntarias. Verificamos cada caso antes de
              publicarlo.
            </p>
            <h4>6. Limitación</h4>
            <p>EmergeLens no sustituye servicios de emergencia oficiales.</p>
            <h4>7. Modificaciones</h4>
            <p>Nos reservamos el derecho de modificar estos términos.</p>
          </div>
        </div>
        <div className="m-foot">
          <button
            className="btn btn-red"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={closeModal}
          >
            Entendido
          </button>
        </div>
      </>,
    );
  }

  const isLogin = tab === "login";

  return (
    <div className="auth-page">
      {welcomeMsg && (
        <div className="welcome-bubble" role="status" aria-live="polite">
          <div className="welcome-bubble-inner">
            <div className="welcome-bubble-title">Mensaje</div>
            <div className="welcome-bubble-text">{welcomeMsg}</div>
          </div>
        </div>
      )}

      <div className="auth-visual">
        <div className="auth-visual-inner">
          <div className="av-rings">
            <div className="av-ring" />
            <div className="av-ring" />
            <div className="av-ring" />
            <div className="av-center">
              <i className="ri-heart-pulse-fill" />
            </div>
          </div>
          <h2 className="av-title">
            SOS <span>EmergeLens</span>
          </h2>
          <p className="av-desc">
            Plataforma diseñada para brindarte ayuda inmediata en situaciones de
            emergencia y conectarte con una comunidad solidaria.
          </p>
          <div className="av-stats">
            <div className="av-stat">
              <strong>24/7</strong>
              <span>Disponibilidad</span>
            </div>
            <div className="av-stat">
              <strong>5s</strong>
              <span>Respuesta</span>
            </div>
            <div className="av-stat">
              <strong>100%</strong>
              <span>Seguro</span>
            </div>
          </div>
        </div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-wrap">
          <button className="auth-back" onClick={onBack}>
            <i className="ri-arrow-left-s-line" /> Volver
          </button>
          <div className="auth-logo-sm">
            <img
              src="/src/assets/logo.png"
              alt="EmergeLens"
              style={{ width: "110px", height: "110px", objectFit: "contain" }}
            />
          </div>
          <h2 className="auth-heading">
            {isLogin ? "Bienvenido de vuelta" : "Crea tu cuenta"}
          </h2>
          <p className="auth-sub">
            {isLogin
              ? "Ingresa tus credenciales para continuar"
              : "Completa los pasos para registrarte"}
          </p>

          <div className="seg-control">
            <button
              className={`seg-btn ${tab === "login" ? "active" : ""}`}
              onClick={() => switchTab("login")}
            >
              Iniciar Sesión
            </button>
            <button
              className={`seg-btn ${tab === "register" ? "active" : ""}`}
              onClick={() => switchTab("register")}
            >
              Registrarse
            </button>
          </div>

          {/* ── LOGIN ── */}
          {isLogin && (
            <form onSubmit={doLogin}>
              <div className="field">
                <label>Correo electrónico</label>
                <div className="field-input">
                  <i className="ri-mail-fill" />
                  <input
                    type="email"
                    placeholder="tucorreo@ejemplo.com"
                    value={lEmail}
                    onChange={(e) => setLEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="field">
                <label>Contraseña</label>
                <div className="field-input">
                  <i className="ri-lock-fill" />
                  <input
                    type={showPw ? "text" : "password"}
                    placeholder="••••••••"
                    value={lPass}
                    onChange={(e) => setLPass(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="pw-toggle"
                    onClick={() => setShowPw((p) => !p)}
                  >
                    <i className={showPw ? "ri-eye-fill" : "ri-eye-off-fill"} />
                  </button>
                </div>
              </div>
              <button
                type="submit"
                className="btn btn-red auth-submit"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <i className="ri-loader-4-line" /> Cargando...
                  </>
                ) : (
                  <>
                    <i className="ri-login-box-fill" /> Iniciar Sesión
                  </>
                )}
              </button>
              <div className="auth-divider">o continúa con</div>
              <div className="auth-social">
                <button type="button" className="social-btn">
                  <i className="ri-google-fill" /> Google
                </button>
                <button type="button" className="social-btn">
                  <i className="ri-github-fill" /> GitHub
                </button>
              </div>
              <p className="auth-footer-text">
                ¿No tienes cuenta?{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    switchTab("register");
                  }}
                >
                  Crear cuenta
                </a>
              </p>
            </form>
          )}

          {/* ── REGISTER ── */}
          {!isLogin && (
            <form onSubmit={doRegister}>
              <div className="stepper">
                {[1, 2, 3].map((s, i) => (
                  <span key={s}>
                    <div
                      className={`step-dot ${regStep === s ? "active" : ""} ${regStep > s ? "done" : ""}`}
                    />
                    {i < 2 && <div className="step-line" />}
                  </span>
                ))}
              </div>

              {regStep === 1 && (
                <div>
                  <div className="field">
                    <label>Nombre completo</label>
                    <div className="field-input">
                      <i className="ri-user-fill" />
                      <input
                        type="text"
                        placeholder="Juan Pérez"
                        value={rName}
                        onChange={(e) => setRName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>Correo electrónico</label>
                    <div className="field-input">
                      <i className="ri-mail-fill" />
                      <input
                        type="email"
                        placeholder="tucorreo@ejemplo.com"
                        value={rEmail}
                        onChange={(e) => setREmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>Teléfono</label>
                    <div className="field-input">
                      <i className="ri-phone-fill" />
                      <input
                        type="tel"
                        placeholder="+1 809 000 0000"
                        value={rPhone}
                        onChange={(e) => setRPhone(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-red auth-submit"
                    onClick={() => nextStep(2)}
                  >
                    <i className="ri-arrow-right-line" /> Siguiente
                  </button>
                </div>
              )}

              {regStep === 2 && (
                <div>
                  <div className="field">
                    <label>Contraseña</label>
                    <div className="field-input">
                      <i className="ri-lock-fill" />
                      <input
                        type={showPw ? "text" : "password"}
                        placeholder="Mínimo 8 caracteres"
                        value={rPass}
                        onChange={(e) => setRPass(e.target.value)}
                        required
                        minLength={8}
                      />
                      <button
                        type="button"
                        className="pw-toggle"
                        onClick={() => setShowPw((p) => !p)}
                      >
                        <i
                          className={showPw ? "ri-eye-fill" : "ri-eye-off-fill"}
                        />
                      </button>
                    </div>
                  </div>
                  <div className="field">
                    <label>Confirmar contraseña</label>
                    <div className="field-input">
                      <i className="ri-lock-fill" />
                      <input
                        type={showPw2 ? "text" : "password"}
                        placeholder="Repite tu contraseña"
                        value={rPass2}
                        onChange={(e) => setRPass2(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        className="pw-toggle"
                        onClick={() => setShowPw2((p) => !p)}
                      >
                        <i
                          className={
                            showPw2 ? "ri-eye-fill" : "ri-eye-off-fill"
                          }
                        />
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="button"
                      className="btn btn-muted"
                      style={{ flex: 1, justifyContent: "center" }}
                      onClick={() => nextStep(1)}
                    >
                      <i className="ri-arrow-left-line" /> Atrás
                    </button>
                    <button
                      type="button"
                      className="btn btn-red"
                      style={{ flex: 1, justifyContent: "center" }}
                      onClick={() => nextStep(3)}
                    >
                      Siguiente <i className="ri-arrow-right-line" />
                    </button>
                  </div>
                </div>
              )}

              {regStep === 3 && (
                <div>
                  <div className="field">
                    <label>PIN de cancelación de emergencia (4 dígitos)</label>
                    <div className="field-input">
                      <i className="ri-shield-keyhole-fill" />
                      <input
                        type="password"
                        placeholder="1234"
                        maxLength={4}
                        pattern="[0-9]{4}"
                        value={rPin}
                        onChange={(e) => setRPin(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="check-row">
                    <input
                      type="checkbox"
                      id="chkTerms"
                      checked={chkTerms}
                      onChange={(e) => setChkTerms(e.target.checked)}
                      required
                    />
                    <label htmlFor="chkTerms">
                      Acepto los{" "}
                      <a href="#" onClick={openTerms}>
                        Términos y Condiciones
                      </a>{" "}
                      y la{" "}
                      <a href="#" onClick={openTerms}>
                        Política de Privacidad
                      </a>{" "}
                      de SOS EmergeLens
                    </label>
                  </div>

                  {/* ✅ RF23 — consentimiento de ubicación */}
                  <div className="check-row">
                    <input
                      type="checkbox"
                      id="chkLoc"
                      checked={chkLoc}
                      onChange={(e) => setChkLoc(e.target.checked)}
                    />
                    <label htmlFor="chkLoc">
                      Autorizo compartir mi ubicación en tiempo real durante
                      emergencias
                    </label>
                  </div>

                  {/* ✅ Aviso de privacidad visible */}
                  <div
                    style={{
                      background: "rgba(21,101,192,.1)",
                      border: "1px solid rgba(21,101,192,.3)",
                      borderRadius: 10,
                      padding: "10px 14px",
                      fontSize: ".78rem",
                      color: "var(--muted)",
                      marginTop: 10,
                      marginBottom: 14,
                      lineHeight: 1.5,
                    }}
                  >
                    <i
                      className="ri-shield-check-fill"
                      style={{ color: "#1565C0", marginRight: 6 }}
                    />
                    Tu ubicación{" "}
                    <strong>solo se comparte al activar una emergencia</strong>.
                    Nunca se comparte en segundo plano sin tu consentimiento.
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="button"
                      className="btn btn-muted"
                      style={{ flex: 1, justifyContent: "center" }}
                      onClick={() => nextStep(2)}
                    >
                      <i className="ri-arrow-left-line" /> Atrás
                    </button>
                    <button
                      type="submit"
                      className="btn btn-red"
                      style={{ flex: 1, justifyContent: "center" }}
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <i className="ri-loader-4-line" /> Creando...
                        </>
                      ) : (
                        <>
                          <i className="ri-check-fill" /> Crear Cuenta
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
