FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787
COPY package*.json ./
RUN npm ci --omit=dev
COPY server/index.mjs ./server/index.mjs
COPY server/gc ./server/gc
COPY server/data/constants ./server/data/constants
COPY --from=build /app/dist ./dist
EXPOSE 8787
CMD ["node", "server/index.mjs"]
