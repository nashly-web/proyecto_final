// Hook: lee bateria/carga del dispositivo si el navegador lo soporta.
// Se usa durante una emergencia para notificar si la bateria esta baja.
import { useEffect, useState } from "react";

/**
 * useBattery - wrapper sobre Battery Status API
 * Devuelve: { level: 0-100 | null, charging: boolean, supported: boolean }
 *
 * Nota: En muchos navegadores (especialmente iOS/Safari) esta API no esta disponible.
 */
export function useBattery() {
  const [state, setState] = useState({
    level: null,
    charging: false,
    supported: false,
  });

  useEffect(() => {
    if (!navigator.getBattery) return;

    let battery = null;

    const update = (b) => {
      const level01 = typeof b.level === "number" ? b.level : null;
      const levelOk =
        level01 !== null && Number.isFinite(level01) && level01 >= 0 && level01 <= 1;

      setState({
        level: levelOk ? Math.round(level01 * 100) : null,
        charging: !!b.charging,
        supported: true,
      });
    };

    const onLevel = () => battery && update(battery);
    const onCharging = () => battery && update(battery);

    navigator
      .getBattery()
      .then((b) => {
        battery = b;
        update(b);
        battery.addEventListener("levelchange", onLevel);
        battery.addEventListener("chargingchange", onCharging);
      })
      .catch(() => {
        setState({ level: null, charging: false, supported: false });
      });

    return () => {
      if (battery) {
        battery.removeEventListener("levelchange", onLevel);
        battery.removeEventListener("chargingchange", onCharging);
      }
    };
  }, []);

  return state;
}

/**
 * BatteryIcon - icono segun nivel y estado de carga
 * Props: level (0-100 | null), charging (bool), size (px, default 18)
 */
export function BatteryIcon({ level, charging, size = 18 }) {
  const color = charging
    ? "var(--teal, #26d0b2)"
    : level === null
      ? "var(--muted, #94a3b8)"
      : level <= 10
        ? "#E53935"
        : level <= 25
          ? "#F59E0B"
          : level <= 50
            ? "#FFA000"
            : "var(--teal, #26d0b2)";

  const icon = charging
    ? "ri-battery-charge-fill"
    : level === null
      ? "ri-battery-line"
      : level <= 10
        ? "ri-battery-fill"
        : level <= 25
          ? "ri-battery-low-fill"
          : level <= 50
            ? "ri-battery-2-charge-fill"
            : level <= 75
              ? "ri-battery-3-charge-fill"
              : "ri-battery-fill";

  const title =
    level === null
      ? "Bateria no disponible"
      : `${level}%${charging ? " - Cargando" : ""}`;

  return <i className={icon} style={{ fontSize: size, color, lineHeight: 1 }} title={title} />;
}

/**
 * BatteryBadge - pastilla compacta nivel + icono
 * Props: level, charging, showLabel (bool, default true)
 */
export function BatteryBadge({ level, charging, showLabel = true }) {
  if (level === null) return null;

  const color = charging
    ? "var(--teal, #26d0b2)"
    : level <= 10
      ? "#E53935"
      : level <= 25
        ? "#F59E0B"
        : "var(--teal, #26d0b2)";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 12,
        fontWeight: 600,
        color,
        background: color + "18",
        padding: "2px 8px",
        borderRadius: 20,
        whiteSpace: "nowrap",
      }}
    >
      <BatteryIcon level={level} charging={charging} size={14} />
      {showLabel ? `${level}%` : null}
    </span>
  );
}
