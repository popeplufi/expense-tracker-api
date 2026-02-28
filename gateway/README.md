# Gateway Service (Professional API Layer)

Node.js Fastify gateway implementing:

- JWT auth with rotating refresh tokens
- Redis-backed global rate limiting
- Audit logging for every HTTP response
- WebSocket server with stateless JWT socket auth
- Redis pub/sub adapter for horizontal scaling
- Device key registration + pre-key bundle retrieval for async encrypted messaging

## Endpoints

- `GET /healthz`
- `GET /readyz`
- `GET /metrics` (Prometheus format)
- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `GET /v1/chats`
- `GET /v1/chats/:chatId/messages`
- `POST /v1/chats/:chatId/messages`
- `POST /v1/devices/keys`
- `GET /v1/devices/keys/:userId`
- `GET /v1/audit/logs`

## Realtime

- Socket path: `/ws`
- Uses Redis adapter (`@socket.io/redis-adapter`) for cluster fanout
- JWT access token required in socket auth payload (`token`) or `Authorization` header

## Local run

```bash
cd gateway
cp .env.example .env
npm install
npm run migrate
npm run dev
```

## Database

Migrations run from `gateway/migrations/*.sql` via `npm run migrate`.

The bootstrap admin user is:
- username: `admin`
- password: `admin12345`

Change this immediately in production.
