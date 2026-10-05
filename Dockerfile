# ---- build stage: compile the React client ----
FROM node:20-alpine AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
# vite outDir is ../dist -> /app/dist
RUN npm run build

# ---- runtime stage: server + the built client ----
FROM node:20-alpine
ENV NODE_ENV=production \
    PORT=3001
WORKDIR /app

# server dependencies (production only)
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

COPY server/ ./server/
# the server serves ../dist and imports the shared engine from ../client/src/lib
COPY --from=client /app/dist ./dist
COPY client/src/lib ./client/src/lib

EXPOSE 3001
CMD ["node", "server/index.js"]
