# Ledgerly Billing

React billing dashboard with invoice creation, PDF download, inventory, supplier, report, settings, and dark-mode screens. It includes an Express/MySQL API foundation.

## Run the frontend

```bash
npm install
npm run dev
```

## Run the API

1. Create the database tables with `server/schema.sql`.
2. Copy `.env.example` to `.env` and set your MySQL credentials.
3. Start it with:

```bash
npm run server
```

The API runs on port 5000 by default. Available endpoints include `GET/POST /api/items`, `GET/POST /api/invoices`, and `GET /api/health`.
