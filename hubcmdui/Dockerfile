# Node 20 已于 2026-04 EOL，不再接收安全补丁（含 2026-10 的 HIGH 级修复）。
# 22.x 为维护期 LTS，仍在官方安全发布线内，故统一升到 22。
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY src/package.json src/package-lock.json* ./src/
RUN cd src && npm install
COPY src/ ./src/

COPY config/ ./config/

RUN echo "$CACHEBUST" >/dev/null && cd src && npm run build


FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
# 容器内监听端口
ENV PORT=3000
COPY . .
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/web/dist ./web/dist

EXPOSE 3000
CMD ["node", "server.js"]
