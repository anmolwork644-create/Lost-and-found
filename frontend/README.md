# CampusFind frontend

This folder contains the CampusFind React 19 and TanStack Start application. It calls the Express API in the sibling `backend/` folder; see the repository [README](../README.md) for complete local setup, environment variables, database administration, API routes, and deployment instructions.

## Development

```sh
npm ci
```

Set `VITE_API_URL` in a local `.env` file to the backend origin (defaults to `http://localhost:5000`), then run:

```sh
npm run dev
```

The API must have `CLIENT_ORIGIN` set to the exact frontend origin printed by Vite. Keep both local `.env` files out of source control.

## Checks

```sh
npm test
npm run lint
npm run build
```

The frontend is built for Cloudflare Workers using the TanStack Start/Nitro setup from the existing project configuration. See [`wrangler.jsonc`](wrangler.jsonc) and the root README for deployment steps.
