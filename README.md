# Praavi Sales Arena

Internal full-stack sales tracker with:
- `frontend/`: Next.js + Tailwind CSS + Framer Motion dark-theme scoreboard UI
- `backend/`: Node.js + Express API + SQLite (`node:sqlite`) + nodemailer

## Features Implemented

- Privyr webhook ingestion: `POST /api/webhooks/privyr`
- SQLite lead storage with round-robin assignment (`Vishal`/`Aryan`)
- Simple auth users: `admin`, `vishal`, `aryan`
- Sales daily numeric updates (no manual lead entry)
  - Followups
  - Closures
  - Website closures
  - Revenue
  - Calls done today
  - Demo meetings booked
  - Interested / Not interested / Will call back
  - Calls not received
- Incentive engine:
  - first 20 website closures: `Rs200` each
  - beyond 20: `Rs500` each
- Lead lifecycle tracking:
  - lead status updates
  - call outcomes
  - next follow-up date/time
  - notes
  - demo booked flag
  - closure type + revenue per lead
  - lead activity timeline table
- Competitive animated dashboard:
  - glowing numbers
  - leader crown
  - race-to-20 progress
  - milestone unlock banner + confetti
- Admin tools:
  - CSV export
  - manual daily report trigger
  - scheduled daily analytical email report at 8:30 PM

## Quick Start

1. Install dependencies:

```bash
npm install
npm run install:all
```

2. Configure environment:
- Optional backend env: copy `backend/.env.example` to `backend/.env`
- Optional frontend env: copy `frontend/.env.local.example` to `frontend/.env.local`

3. Run both services:

```bash
npm run dev
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`

## Deploy Backend on Render

1. Create a **Web Service** in Render from this repo.
2. Use these settings:
   - Root Directory: `backend`
   - Build Command: `npm install`
   - Start Command: `npm start`
3. Set environment variables:
   - `HOST=0.0.0.0`
   - `FRONTEND_ORIGIN=https://<your-frontend-domain>`
   - `JWT_SECRET=<strong-random-secret>`
   - `APP_TIMEZONE=Asia/Kolkata`
   - `ADMIN_PASSWORD`, `VISHAL_PASSWORD`, `ARYAN_PASSWORD`
   - Optional SMTP vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`)
4. For persistent SQLite storage on Render disk, set:
   - `SQLITE_PATH=/var/data/sales.db`

Note: Render free plan does not support persistent disk, so SQLite data may reset on restart/redeploy unless you use a paid plan with disk.

## Default Login Credentials

- Admin: `admin` / `admin123`
- Vishal: `vishal` / `vishal123`
- Aryan: `aryan` / `aryan123`

## Privyr Webhook

Endpoint:

```http
POST /api/webhooks/privyr
Content-Type: application/json
```

Example payload:

```json
{
  "lead_id": "privyr-123",
  "name": "Riya Sharma",
  "phone": "9999999999",
  "email": "riya@example.com",
  "source": "Facebook Ads",
  "created_at": "2026-02-12T10:00:00.000Z"
}
```

## Key API Endpoints

- `POST /api/auth/login`
- `GET /api/dashboard/summary`
- `POST /api/sales/update`
- `POST /api/webhooks/privyr`
- `GET /api/leads/options`
- `GET /api/leads`
- `PATCH /api/leads/:leadId`
- `GET /api/leads/:leadId/activities`
- `POST /api/leads/:leadId/activities`
- `GET /api/admin/export/csv`
- `POST /api/admin/send-daily-report`

## Important Note

This app uses Node's built-in `node:sqlite` module (SQLite-backed, no external native package install needed on your current environment). Node may show an experimental warning for this module.
