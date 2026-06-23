# Etapa 1: Preparar el backend
FROM node:20 AS backend-build
# Configurar proxy (reemplaza con tus credenciales)
ENV HTTP_PROXY=http://alexrey:alexrey10@192.168.30.120:3128
ENV HTTPS_PROXY=http://alexrey:alexrey10@192.168.30.120:3128
ENV NO_PROXY=localhost,127.0.0.1
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --legacy-peer-deps
COPY backend/ ./

# Etapa final: imagen para producción
FROM node:20
WORKDIR /app
COPY --from=backend-build /app/backend /app/backend
# Copiar el frontend ya construido (desde tu PC) a la carpeta public del backend
COPY frontend/dist /app/backend/public
WORKDIR /app/backend
EXPOSE 3001
CMD ["npm", "start"]
