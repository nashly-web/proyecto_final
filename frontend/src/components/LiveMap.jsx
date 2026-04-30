// LiveMap: mapa en vivo (Leaflet) para mostrar ubicacion actual / punto de emergencia.
// Incluye un helper (RecenterMap) porque Leaflet no re-centra automaticamente.
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";

function mkIcon(kind) {
  const cls = kind === "alert" ? "map-pin map-pin--alert" : "map-pin map-pin--me";
  return L.divIcon({
    className: "",
    html: `<div class="${cls}"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}

// MapContainer no reacciona a cambios de center; este componente si.
function RecenterMap({ center }) {
  const map = useMap();
  const prev = useRef(null);

  useEffect(() => {
    if (center?.lat == null || center?.lng == null) return;
    const key = `${center.lat},${center.lng}`;
    if (key === prev.current) return;
    prev.current = key;
    map.setView([center.lat, center.lng]);
  }, [center, map]);

  return null;
}

export default function LiveMap({ center, zoom = 15, markers = [], className = "" }) {
  const icons = useMemo(
    () => ({
      me: mkIcon("me"),
      alert: mkIcon("alert"),
    }),
    [],
  );

  if (center?.lat == null || center?.lng == null) return null;

  const safeMarkers = Array.isArray(markers) ? markers : [];

  return (
    <div className={`map-root ${className}`.trim()}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        scrollWheelZoom={false}
        style={{ width: "100%", height: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <RecenterMap center={center} />

        {safeMarkers
          .filter((m) => m && m.lat != null && m.lng != null)
          .map((m) => (
            <Marker
              key={m.id || `${m.lat},${m.lng}`}
              position={[m.lat, m.lng]}
              icon={m.kind === "alert" ? icons.alert : icons.me}
            >
              {m.title || m.subtitle ? (
                <Popup>
                  <div style={{ minWidth: 160 }}>
                    {m.title ? <strong>{m.title}</strong> : null}
                    {m.subtitle ? (
                      <div style={{ marginTop: 4, opacity: 0.85 }}>{m.subtitle}</div>
                    ) : null}
                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                      {Number(m.lat).toFixed(6)}, {Number(m.lng).toFixed(6)}
                    </div>
                  </div>
                </Popup>
              ) : null}
            </Marker>
          ))}
      </MapContainer>
    </div>
  );
}
