# OptiShift — Production Deployment Guide

Stack: **Vercel** (Next.js) + **Neon** (PostgreSQL) + **Render** (Python/FastAPI Engine)

> Tüm servisler **ücretsiz** tier kullanır.

---

## Step 1: Neon PostgreSQL Setup

1. Go to https://neon.tech and sign up / log in
2. Create a new project — name it "optishift"
3. In the project dashboard, click **Connection Details**
4. Copy the **Connection string** (format: `postgresql://user:pass@ep-xxx.region.neon.tech/neondb?sslmode=require`)
5. Save this URL — you'll need it in Steps 3 and 4

### Push the database schema to Neon

```bash
cd web

# Set the real DATABASE_URL temporarily
export DATABASE_URL="postgresql://user:pass@ep-xxx.region.neon.tech/neondb?sslmode=require"

# Push the schema (creates all tables)
npx drizzle-kit push

# Optionally seed a demo organization (edit seed_brulee.js with real data first)
node ../seed_brulee.js
```

---

## Step 2: Render FastAPI Engine Deploy (Ücretsiz)

> Not: Render'ın ücretsiz tier'ı 15 dakika kullanılmazsa uyur. İlk vardiya üretme isteğinde ~30 sn gecikme olabilir — sonraki istekler anında gelir.

1. https://render.com adresine git, GitHub ile kayıt ol
2. **New** → **Web Service** seç
3. GitHub repo'nu bağla → **OptiShift** repo'sunu seç
4. Ayarlar:
   - **Name:** `optishift-engine`
   - **Root Directory:** `engine`
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Plan:** `Free`
5. **Create Web Service** tıkla — deploy ~3 dakika sürer
6. Deploy bittikten sonra Render sana bir URL verir: `https://optishift-engine.onrender.com`
7. Test: `curl https://optishift-engine.onrender.com/health` → `{"status":"ok"}` dönmeli

**Environment variables:** Engine stateless, ek env var gerektirmez.

---

## Step 3: Vercel Next.js Deploy

1. Go to https://vercel.com and sign up / log in
2. Click **Add New Project** → Import from GitHub → select **OptiShift** repo
3. Set **Root Directory** to `web`
4. Under **Environment Variables**, add:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Your Neon connection string from Step 1 |
| `ENGINE_URL` | Your Render URL from Step 2 (e.g. `https://optishift-engine.onrender.com`) |
| `JWT_SECRET` | A random 64-char string (generate: `openssl rand -hex 32`) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | From your `.env.local` |
| `VAPID_PRIVATE_KEY` | From your `.env.local` |
| `VAPID_SUBJECT` | `mailto:sgndgdu@gmail.com` |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (for AI summary feature) |

5. Click **Deploy**
6. After deploy, your app is live at `https://your-project.vercel.app`

---

## Step 4: Create the First Admin Account

After Vercel deploy, navigate to your Vercel URL:

1. Go to `/register` — create the first organization and admin account
2. Log in at `/login`
3. Add locations, shift definitions, and personnel via the admin UI

---

## Local Development (after cloud setup)

Update `web/.env.local` with real values:

```env
DATABASE_URL=postgresql://user:pass@ep-xxx.region.neon.tech/neondb?sslmode=require
ENGINE_URL=http://localhost:8000
JWT_SECRET=your-secret-here
```

Run the Python engine locally:
```bash
cd engine
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Run Next.js:
```bash
cd web
npm install
npm run dev
```

---

## Architecture Summary

```
Browser
  └─ Vercel (Next.js)
       ├─ /api/* — all API routes (PostgreSQL via Neon HTTP driver)
       ├─ /api/generate — calls ENGINE_URL/generate via fetch()
       └─ Static pages — SSG on Vercel Edge

Neon PostgreSQL (serverless)
  └─ All application data (users, personnel, shifts, etc.)
  └─ Connected via @neondatabase/serverless HTTP driver (no TCP/WebSocket)

Render FastAPI (ücretsiz)
  └─ Python + Google OR-Tools
  └─ Receives JSON payload, returns optimized schedule
  └─ Stateless — no database connection needed
```

---

## Troubleshooting

**"No database connection string was provided"** — `DATABASE_URL` env var not set in Vercel  
**"ENGINE_URL not responding"** — Render servisi uyuyor olabilir (ilk istek ~30 sn sürer), ya da URL yanlış  
**Schema out of sync** — Re-run `npx drizzle-kit push` with the Neon DATABASE_URL set  
**Auth failures** — Ensure `JWT_SECRET` is the same in all environments  
