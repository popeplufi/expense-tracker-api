# Frontend Next Architecture

This workspace is a Next.js + TypeScript app layer for the Expense Chat backend + gateway.

## Stack
- Next.js App Router (SSR capable)
- TypeScript contracts (`src/lib/contracts/api.ts`)
- Typed API clients (`src/lib/api/client.ts`, `src/lib/api/gateway.ts`)
- WebCrypto AES-GCM encryption helpers (`src/lib/crypto/webcrypto.ts`)
- Service Worker (`public/sw.js` + `src/components/sw-register.tsx`)
- IndexedDB encrypted storage wrapper (`src/lib/storage/indexeddb.ts`)
- Socket.IO realtime client (`src/lib/realtime/socket.ts`)

## Run
```bash
cd frontend-next
npm install
npm run dev
```

## Environment
Copy `.env.example` to `.env.local` and set:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:5000
NEXT_PUBLIC_GATEWAY_HTTP_BASE=http://127.0.0.1:4000
NEXT_PUBLIC_GATEWAY_WS_BASE=http://127.0.0.1:4000
```

## Pages
- `/` architecture landing
- `/chat` frontend Phase 1 workspace:
  - login/logout
  - chat list + thread view
  - optimistic send flow
  - socket ACK/receipt/presence/typing wiring
