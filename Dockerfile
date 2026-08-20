# ---------- shared base ----------
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm install
COPY . .

# ---------- API ----------
FROM base AS api
RUN npx prisma generate --schema server/prisma/schema.prisma
RUN npm run build --workspace server
EXPOSE 4000
CMD ["npm", "run", "start"]

# ---------- Web (static build served by nginx) ----------
FROM base AS webbuild
ENV VITE_API_URL=http://localhost:4000
RUN npm run build --workspace web

FROM nginx:alpine AS web
COPY --from=webbuild /app/web/dist /usr/share/nginx/html
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  location / { try_files $uri /index.html; }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
