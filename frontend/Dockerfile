FROM node:20-alpine

# frontend/Dockerfile
#
# Imagen del frontend React (Vite dev server).
# - Base: node:20-alpine (ligera)
# - Instala dependencias con npm
# - Copia el codigo del frontend
# - Arranca Vite en modo dev expuesto a la red (0.0.0.0)
#
# Nota: comentarios ASCII (sin tildes/emojis) para evitar texto raro.

WORKDIR /app

# Instalar dependencias (package-lock asegura versiones)
COPY package.json package-lock.json* ./
RUN npm install

# Copiar codigo fuente
COPY . .

EXPOSE 5173

# Vite dev server accesible desde fuera del contenedor
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
