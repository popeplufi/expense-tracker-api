FROM node:22-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=optional

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=base /app/package*.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist

EXPOSE 4000
CMD ["sh", "-c", "node dist/scripts/migrate.js && node dist/index.js"]
