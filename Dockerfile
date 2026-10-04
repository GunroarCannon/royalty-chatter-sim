# Royal Banter: one container serves the game (Vite build) and the API.
# Build from a checkout that includes the portrait submodule (git clone --recurse-submodules).
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN test -f public/portrait/js/core/render.js || (echo "public/portrait is empty: clone with --recurse-submodules" && exit 1)
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/package.json ./
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8080
CMD ["node", "server/index.js"]
