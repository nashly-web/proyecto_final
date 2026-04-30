FROM python:3.11-slim

# backend/Dockerfile
#
# Imagen del backend Flask (API).
# - Base: python:3.11-slim (ligera)
# - Instala dependencias del sistema necesarias para compilar algunos paquetes Python
# - Instala dependencias Python desde requirements.txt
# - Copia el codigo del backend y arranca app.py
#
# Nota: comentarios ASCII (sin tildes/emojis) para evitar texto raro.

WORKDIR /app

# Dependencias del sistema (por ejemplo, para compilar wheels que requieran C)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar codigo del backend al contenedor
COPY . .

# Puerto del backend Flask
EXPOSE 5000

# Arranque del servidor (ver backend/app.py)
CMD ["python", "app.py"]
