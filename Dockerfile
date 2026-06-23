# Etapa: Construir el backend
FROM node:20 AS backend-build
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
