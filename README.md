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

Create/update/delete, join, users, and JWT authentication are scaffolded for subsequent implementation and are not active yet.
