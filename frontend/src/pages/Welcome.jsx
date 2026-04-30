// Welcome: pantalla inicial (landing) con acceso a login/registro.
export default function Welcome({ onGoAuth }) {
  return (
  <div className="welcome">
  <div className="welcome-inner">
  <div className="w-badge">
  <span className="dot" /> Sistema activo 24/7
  </div>
  <div className="w-logo">
  <img
  src="/src/assets/logo.png"
  alt="EmergeLens"
  style={{ width: "110px", height: "110px", objectFit: "contain" }}
  />
  </div>
  <h1 className="w-title">
  SOS <span>EmergeLens</span>
  </h1>
  <p className="w-sub">Tu sistema de emergencia integral</p>
  <span className="w-tagline">"Un toque, mil manos que te ayudan"</span>

  <div className="w-features">
  <div className="w-feat">
  <i className="ri-alarm-warning-fill" />
  <span>Boton SOS</span>
  </div>
  <div className="w-feat">
  <i className="ri-map-pin-fill" />
  <span>Ubicacion</span>
  </div>
  <div className="w-feat">
  <i className="ri-chat-3-fill" />
  <span>Chat SOS</span>
  </div>
  <div className="w-feat">
  <i className="ri-hand-heart-fill" />
  <span>Donaciones</span>
  </div>
  </div>

  <div className="w-btns">
  <button className="btn btn-red" onClick={() => onGoAuth("login")}>
  <i className="ri-login-box-fill" /> Iniciar Sesion
  </button>
  <button
  className="btn btn-ghost"
  onClick={() => onGoAuth("register")}
  >
  <i className="ri-user-add-fill" /> Registrarse
  </button>
  </div>
  </div>
  </div>
  );
}
