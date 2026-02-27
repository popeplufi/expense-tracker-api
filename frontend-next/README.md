# Frontend Next Architecture

This workspace is a Next.js + TypeScript app layer for the Expense Chat backend.

## Stack
- Next.js App Router (SSR capable)
- TypeScript contracts (`src/lib/contracts/api.ts`)
- Typed API client (`src/lib/api/client.ts`)
- WebCrypto AES-GCM encryption helpers (`src/lib/crypto/webcrypto.ts`)
- Service Worker (`public/sw.js` + `src/components/sw-register.tsx`)
- IndexedDB encrypted storage wrapper (`src/lib/storage/indexeddb.ts`)

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
```

## Notes
- `/` includes an architecture demo that checks `/readyz` and saves encrypted drafts to IndexedDB.
- This app is scaffolded separately from the existing `frontend/` Vite app so migration can happen incrementally.
