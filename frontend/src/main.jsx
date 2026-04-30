// Punto de entrada del frontend (React + Vite).
// Aqui se monta la app en el div#root y se activa StrictMode para detectar
// patrones inseguros durante desarrollo.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
  <App />
  </StrictMode>,
)
