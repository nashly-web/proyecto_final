"""
routes/weather.py - Alertas climaticas en tiempo real via Open-Meteo (sin API key).

Cubre la Republica Dominicana por defecto (lat=18.48, lng=-69.93).
Devuelve nivel de alerta (green/orange/red) y descripcion en tiempo real.
"""

import os
import time
import requests
from flask import Blueprint, jsonify

weather_bp = Blueprint("weather", __name__)

# Cache simple en memoria (TTL 10 minutos)
_cache = {"data": None, "ts": 0}
CACHE_TTL = 600  # segundos

# Coordenadas RD (Santo Domingo) — punto central
RD_LAT = 18.4861
RD_LNG = -69.9312

# WMO Weather Codes → nivel de alerta
# https://open-meteo.com/en/docs#weathervariables
def _wmo_to_alert(code, wind_kmh=0, precip_mm=0, cape=0):
    """
    Devuelve (level, label, description) basado en condicion climatica.
    level: 'green' | 'orange' | 'red'
    """
    if code is None:
        return "green", "Normal", "Condiciones normales"

    code = int(code)

    # Lluvia extrema / tormenta tropical
    if code in (82, 95, 96, 99) or precip_mm > 20 or wind_kmh > 80:
        return "red", "Alerta Roja", _red_description(code, wind_kmh, precip_mm)

    # Lluvia moderada / tormenta
    if code in (63, 65, 73, 75, 77, 80, 81, 85, 86) or precip_mm > 5 or wind_kmh > 50 or cape > 1000:
        return "orange", "Alerta Naranja", _orange_description(code, wind_kmh, precip_mm)

    # Lluvia leve / nublado
    if code in (51, 53, 55, 56, 57, 61) or precip_mm > 0.5:
        return "yellow", "Precaucion", _yellow_description(code)

    return "green", "Normal", _green_description(code)


def _red_description(code, wind, precip):
    parts = []
    if code in (95, 96, 99):
        parts.append("Tormenta electrica severa")
    if code == 82:
        parts.append("Lluvias torrenciales")
    if precip > 20:
        parts.append(f"Precipitacion: {precip:.1f}mm/h")
    if wind > 80:
        parts.append(f"Vientos fuertes: {wind:.0f} km/h")
    return " · ".join(parts) if parts else "Condiciones meteorologicas peligrosas"


def _orange_description(code, wind, precip):
    parts = []
    if code in (80, 81):
        parts.append("Chubascos")
    if code in (63, 65):
        parts.append("Lluvia moderada")
    if precip > 5:
        parts.append(f"Precipitacion: {precip:.1f}mm/h")
    if wind > 50:
        parts.append(f"Viento: {wind:.0f} km/h")
    return " · ".join(parts) if parts else "Condiciones adversas"


def _yellow_description(code):
    labels = {
        51: "Llovizna ligera", 53: "Llovizna moderada", 55: "Llovizna densa",
        61: "Lluvia ligera", 80: "Chubascos ligeros",
    }
    return labels.get(code, "Lluvia leve")


def _green_description(code):
    labels = {
        0: "Cielo despejado", 1: "Mayormente despejado",
        2: "Parcialmente nublado", 3: "Nublado",
        45: "Niebla", 48: "Niebla con escarcha",
    }
    return labels.get(code, "Condiciones normales")


def fetch_weather_rd():
    """Consulta Open-Meteo para RD y devuelve datos de alerta."""
    now = time.time()
    if _cache["data"] and (now - _cache["ts"]) < CACHE_TTL:
        return _cache["data"]

    try:
        url = (
            "https://api.open-meteo.com/v1/forecast"
            f"?latitude={RD_LAT}&longitude={RD_LNG}"
            "&current=weather_code,wind_speed_10m,precipitation,cape"
            "&hourly=precipitation_probability"
            "&forecast_days=1"
            "&timezone=America/Santo_Domingo"
        )
        resp = requests.get(url, timeout=8)
        resp.raise_for_status()
        d = resp.json()

        current = d.get("current", {})
        wmo     = current.get("weather_code")
        wind    = current.get("wind_speed_10m", 0) or 0
        precip  = current.get("precipitation", 0) or 0
        cape    = current.get("cape", 0) or 0

        level, label, description = _wmo_to_alert(wmo, wind, precip, cape)

        # Probabilidad de lluvia en las proximas horas
        hourly = d.get("hourly", {})
        precip_prob = hourly.get("precipitation_probability", [])
        next_6h_max = max(precip_prob[:6]) if precip_prob else 0

        result = {
            "ok":          True,
            "level":       level,
            "label":       label,
            "description": description,
            "wmo_code":    wmo,
            "wind_kmh":    round(wind, 1),
            "precip_mm":   round(precip, 2),
            "cape":        round(cape),
            "precip_prob_next6h": next_6h_max,
            "lat":         RD_LAT,
            "lng":         RD_LNG,
            "updated_at":  now,
        }

        _cache["data"] = result
        _cache["ts"]   = now
        return result

    except Exception as e:
        print(f"[weather] Error consultando Open-Meteo: {e}")
        # Fallback: devolver nivel desconocido sin crashear
        return {
            "ok":          False,
            "level":       "unknown",
            "label":       "Sin datos",
            "description": "No se pudo obtener informacion climatica",
            "error":       str(e),
        }


@weather_bp.route("/alerts", methods=["GET"])
def get_weather_alerts():
    """GET /api/weather/alerts — Devuelve nivel de alerta climatica actual para RD."""
    data = fetch_weather_rd()
    return jsonify(data)


@weather_bp.route("/ping", methods=["GET"])
def ping():
    return jsonify({"ok": True, "service": "weather"})