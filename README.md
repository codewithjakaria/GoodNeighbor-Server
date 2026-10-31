# GoodNeighbor Server

Express API for the GoodNeighbor community event platform.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

MongoDB is optional for the first API walkthrough. If `MONGODB_URI` is blank, event GET routes return temporary sample records from memory. Set `MONGODB_URI` and `DB_NAME` in `.env` to read events from MongoDB. Never commit `.env`.

## Current routes

- `GET /api/health` — server health
- `GET /api/events` — future events ordered by date; accepts `?limit=6`
- `GET /api/events/:id` — public event details
- `POST /api/auth/sign-up/email` and `POST /api/auth/sign-in/email` — create an account and log in
- `POST /api/events` — create an event; requires a login token
- `PUT /api/events/:id` — update your own event; requires a login token
- `DELETE /api/events/:id` — delete your own event; requires a login token
- `POST /api/events/:id/join` — join an event; requires a login token
- `GET /api/users/:email/events` — see your joined events; requires a login token for that email

After login, send the returned JWT in the request header as `Authorization: Bearer YOUR_TOKEN` when calling protected event routes. The event creator's email comes from the login token, so it should not be sent in the event body.
