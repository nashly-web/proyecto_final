"""
routes/lens_call.py - LENS (operadora por voz / chat) para emergencias.

Resumen:
- Recibe un mensaje del usuario y un historial corto desde el frontend.
- Construye un prompt con reglas de operadora 911 (1 pregunta a la vez, sin emojis).
- Si hay GROQ_API_KEY configurada, consulta a Groq y devuelve la respuesta.
- Si no hay key o falla la llamada, devuelve un fallback para mantener el flujo.
"""

from flask import Blueprint, request, jsonify
import requests, os, re

lens_call_bp = Blueprint("lens_call", __name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "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")

# -----------------------------------------------------------------------------
# Prompt base (reglas de comportamiento)
# - Define personalidad, prioridades y restricciones (sin confirmaciones de alerta).
# - Se rellena {user_name} para personalizar la conversacion.
# -----------------------------------------------------------------------------
SYSTEM_BASE = """Eres LENS, operadora de emergencias de SOS EmergeLens. Estás atendiendo una llamada de emergencia REAL con {user_name}.

PERSONALIDAD:
- Hablas como una operadora 911 profesional: calmada, directa, empática pero enfocada
- NUNCA repites exactamente lo mismo — cada respuesta analiza lo que el usuario acaba de decir
- Haces UNA pregunta específica a la vez, no varias
- Das instrucciones concretas según la situación que describes
- NUNCA uses emojis ni markdown
- Responde SIEMPRE en español
- Máximo 2-3 oraciones por respuesta

REGLAS CRÍTICAS:
- Analiza cada mensaje del usuario y adapta tu respuesta a lo que dijo
- NO hagas preguntas genéricas — haz preguntas específicas basadas en lo que describió
- Si el usuario dice que alguien lo persigue, NO le preguntes síntomas médicos
- Si menciona fuego, pregunta primero si puede salir
- NUNCA menciones la alerta, que fue enviada, que la ayuda va en camino, ni nada relacionado con confirmaciones de alerta. El usuario ya lo sabe.

PRIORIDAD DE SÍNTOMAS (responde siempre al más grave primero):
1. Dolor en pecho / corazón / no puede respirar — MÁXIMA URGENCIA
2. Sangrado abundante — URGENCIA ALTA
3. Pérdida de conciencia o desmayo — URGENCIA ALTA
4. Dolor en cuello o espalda — NO MOVER
5. Dolor en extremidades — URGENCIA MEDIA
6. Mareo, cabeza, náuseas — URGENCIA MEDIA

PUNTO DE CIERRE — MUY IMPORTANTE:
Cuando ya hayas hecho al menos 3-4 intercambios Y tengas información suficiente sobre la situación (qué pasó, dónde duele, estado del usuario), debes cerrar la fase de preguntas así:
- Di algo como: "Mantente en línea, {user_name}. La unidad ya está cerca. Si algo cambia o sientes algo nuevo, dímelo de inmediato."
- Después del cierre: si el usuario sigue hablando o da nueva información, RESPONDE a eso normalmente como operadora activa.
- El cierre NO es colgar. Es pasar a modo de espera activa donde el usuario puede seguir informando.
- Solo hay UN cierre por llamada. No lo repitas si ya lo dijiste.
"""

CONTEXT_BY_TYPE = {
    "medical": """
TIPO: EMERGENCIA MÉDICA
- Pregunta síntomas específicos según lo que diga el usuario
- Si hay inconsciencia: instruye RCP si hay alguien cerca
- Si es sangrado: instruye presionar con tela limpia
- Pregunta si hay alguien más presente que pueda ayudar""",

    "security": """
TIPO: EMERGENCIA DE SEGURIDAD
- PRIMERO: pregunta si el agresor está presente ahora mismo
- Si está presente: no hacer movimientos bruscos, hablar bajo
- Si lo persiguen: entrar a lugar público iluminado
- NO le pidas que confronte al agresor""",

    "fire": """
TIPO: INCENDIO
- PRIMERO: pregunta si puede salir del edificio ahora mismo
- Si puede salir: agachado, tocar puertas antes de abrir, no usar ascensor
- Si no puede salir: sellar ranuras, ir a ventana, hacer señales
- Pregunta si hay otras personas atrapadas""",

    "accident": """
TIPO: ACCIDENTE
- PRIMERO: pregunta si está consciente y puede moverse
- Si hay dolor en cuello/espalda: NO moverse hasta que llegue ayuda
- Si hay sangrado: presión directa con cualquier tela
- Pregunta si hay más personas involucradas""",
}

# -----------------------------------------------------------------------------
# Utilidades internas
# - Limpieza de texto y normalizacion para prompts.
# - Deteccion de "cierre" (cuando LENS pasa a modo espera activa).
# - Anti-repeticion para evitar respuestas demasiado parecidas.
# -----------------------------------------------------------------------------

def _clean(s):
    return re.sub(r"\s+", " ", (s or "").strip())


def _count_exchanges(history):
    """Cuenta cuantos turnos completos (user+assistant) hay en el historial."""
    user_turns = sum(1 for m in history if m.get("role") == "user")
    return user_turns


def _already_closed(history):
    """Detecta si LENS ya hizo el cierre de llamada."""
    close_keywords = ["mantente en línea", "mantente en linea", "si algo cambia", "si sientes algo nuevo", "la unidad ya está cerca", "la unidad ya esta cerca"]
    for m in history:
        if m.get("role") != "assistant":
            continue
        content = _clean(m.get("content", "")).lower()
        if any(k in content for k in close_keywords):
            return True
    return False


def _last_assistant_text(history):
    for m in reversed(history or []):
        if m.get("role") == "assistant":
            c = _clean(m.get("content", ""))
            if c:
                return c
    return ""


def _norm(s):
    s = _clean(s).lower()
    s = re.sub(r"[^a-z0-9\u00f1\u00e1\u00e9\u00ed\u00f3\u00fa\s]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def _too_similar(a, b):
    a, b = _norm(a), _norm(b)
    if not a or not b:
        return False
    if a == b:
        return True
    words_a = set(a.split()[:8])
    words_b = set(b.split()[:8])
    if len(words_a) > 2 and len(words_b) > 2:
        overlap = len(words_a & words_b) / max(len(words_a), len(words_b))
        if overlap > 0.7:
            return True
    return False


def _emergency_fallback(user_text, e_type, user_name="Usuario"):
    text = _clean(user_text).lower()

    if any(k in text for k in ("corazon", "pecho", "paro", "infarto", "para el corazon")):
        return "No te muevas. Respira lento por la nariz. El dolor es como presión o punzada?"

    if any(k in text for k in ("no puedo respirar", "me ahogo", "me falta el aire")):
        return "Siéntate derecho. Inhala por la nariz 4 segundos, exhala por la boca 6."

    if any(k in text for k in ("sangre", "sangrando", "hemorragia")):
        return "Presiona con fuerza con una tela limpia sin soltar. En qué parte del cuerpo?"

    if any(k in text for k in ("fuego", "incendio", "humo", "quema", "llamas")):
        return "Agáchate lo más posible. Puedes llegar a una salida ahora?"

    if any(k in text for k in ("espalda", "cuello")):
        return "No te muevas absolutamente nada. Sientes hormigueo en brazos o piernas?"

    if any(k in text for k in ("mano", "manos", "brazo", "brazos")):
        return "Eleva los brazos por encima del corazón. El dolor es constante o va y viene?"

    if any(k in text for k in ("pie", "pies", "pierna", "piernas")):
        return "Siéntate y no apoyes el peso. El dolor es constante o va y viene?"

    if any(k in text for k in ("cabeza", "mareo")):
        return "Acuéstate boca arriba despacio. El dolor es pulsante o es presión?"

    if any(k in text for k in ("duele", "dolor")):
        return "Dónde exactamente sientes el dolor más fuerte ahora?"

    if any(k in text for k in ("mas o menos", "regular", "mas o menos bien")):
        return "Entendido. Cuál es la parte del cuerpo donde el dolor es peor ahora mismo?"

    if e_type == "security":
        return "El peligro sigue cerca de ti en este momento?"
    if e_type == "fire":
        return "Puedes moverte hacia una salida o estás atrapado?"

    return "Dime cuál es el síntoma más fuerte que sientes ahora mismo."


@lens_call_bp.route("/message", methods=["POST"])
def lens_call_message():
    # Endpoint consumido por el frontend (CallSimulator / LENS):
    # - Recibe: texto + tipo + nombre + ubicacion + historial.
    # - Devuelve: reply corto (2-3 oraciones) como "operadora" LENS.
    data      = request.get_json() or {}
    user_text = data.get("message", "").strip()
    e_type    = data.get("eType", "medical")
    user_name = data.get("userName", "Usuario")
    lat       = data.get("lat")
    lng       = data.get("lng")
    history   = data.get("history", [])

    if not user_text:
        return jsonify({"ok": False, "error": "Sin mensaje"}), 400

    loc_str = f"Lat {lat:.5f}, Lng {lng:.5f}" if lat and lng else "registrada en el sistema"
    context = CONTEXT_BY_TYPE.get(e_type, CONTEXT_BY_TYPE["medical"])

    exchanges    = _count_exchanges(history)
    closed       = _already_closed(history)

    # Resumen legible del historial para el prompt
    recent = []
    for m in history[-8:]:
        role    = m.get("role", "")
        content = _clean(m.get("content", ""))
        if role == "assistant" and content:
            recent.append(f"LENS: {content}")
        elif role == "user" and content:
            recent.append(f"USUARIO: {content}")
    history_summary = "\n".join(recent) if recent else "Inicio de llamada."

    # Instruccion de cierre
    if exchanges >= 4 and not closed:
        cierre_instruccion = (
            f"\n\nINSTRUCCION ESPECIAL: Ya tienes suficiente información sobre la situación de {user_name}. "
            f"En esta respuesta, da UNA instrucción final concreta y luego cierra con algo como: "
            f"'Mantente en línea, {user_name}. La unidad ya está cerca. Si algo cambia o sientes algo nuevo, dímelo de inmediato.' "
            f"Adapta el cierre a la situación específica que describió. Solo cierra UNA vez."
        )
    elif closed:
        cierre_instruccion = (
            f"\n\nINSTRUCCION ESPECIAL: Ya hiciste el cierre de llamada antes. "
            f"El usuario sigue hablando. Responde SOLO a lo que acaba de decir ahora, "
            f"como operadora activa en espera. No repitas el cierre. "
            f"Si da nueva información sobre su estado, responde a eso directamente."
        )
    else:
        cierre_instruccion = ""

    system_prompt = (
        SYSTEM_BASE.format(user_name=user_name)
        + f"\n\n{context}"
        + f"\nUsuario: {user_name} | GPS: {loc_str} | Tipo: {e_type}"
        + f"\n\nCONVERSACION HASTA AHORA:\n{history_summary}"
        + f"\n\nUSUARIO DICE AHORA: \"{user_text}\""
        + cierre_instruccion
        + "\n\nTu respuesta (max 2-3 oraciones, sin mencionar alertas ni confirmaciones de envío):"
    )

    messages = []
    for m in history[-10:]:
        role    = m.get("role", "user")
        content = m.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_text})

    if not GROQ_API_KEY:
        # Modo fallback: sin IA externa (no detiene el flujo).
        return jsonify({"ok": True, "reply": _emergency_fallback(user_text, e_type, user_name)})

    try:
        # Llamada a Groq (formato compatible con OpenAI chat completions).
        res = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type":  "application/json",
            },
            json={
                "model":             "llama-3.3-70b-versatile",
                "messages":          [{"role": "system", "content": system_prompt}] + messages,
                "max_tokens":        150,
                "temperature":       0.7,
                "frequency_penalty": 1.3,
                "presence_penalty":  0.9,
            },
            timeout=10,
        )
        res.raise_for_status()
        reply = _clean(res.json()["choices"][0]["message"]["content"])

        # Filtros de seguridad/UX:
        # - Bloquea frases prohibidas (ej: "alerta enviada", "ayuda en camino").
        # - Evita repetir demasiado la ultima respuesta del asistente.
        # Bloquear menciones de alerta
        alert_phrases = [
            "ya envié", "ya envi", "alerta enviada", "ayuda en camino",
            "alerta activa", "seguimos con la alerta", "ya activé la alerta",
            "los servicios", "ya alertamos", "en seguimiento"
        ]
        if any(p in reply.lower() for p in alert_phrases):
            reply = _emergency_fallback(user_text, e_type, user_name)

        # Anti-repeticion
        last = _last_assistant_text(history)
        if _too_similar(reply, last):
            reply = _emergency_fallback(user_text, e_type, user_name)

        return jsonify({"ok": True, "reply": reply})

    except Exception as e:
        return jsonify({
            "ok":    True,
            "error": str(e),
            "reply": _emergency_fallback(user_text, e_type, user_name),
        })
