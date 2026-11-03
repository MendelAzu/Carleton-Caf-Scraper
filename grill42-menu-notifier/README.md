# Grill 42 Menu Notifier

A Node.js and Express website that checks the Carleton University Teraanga Commons Dining Hall menu and emails the items listed under **The Grill 42**.

## Setup

1. Open a terminal in `grill42-menu-notifier`.
2. Install dependencies:

   ```bash
   npm install
   npx playwright install chromium
   ```

3. Create a Supabase project and a `subscriptions` table by running this SQL in the Supabase SQL Editor:

   ```sql
   create table public.subscriptions (
     email text primary key,
     subscribed_at timestamptz not null default now()
   );

   alter table public.subscriptions enable row level security;
   ```

   In the project settings, copy the Project URL and a server-side secret/service-role API key. Add them to `.env` as `SUPABASE_URL` and `SUPABASE_SECRET`, along with the SMTP values:

   ```env
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SECRET=<your-server-side-secret-or-service-role-key>
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=youraddress@gmail.com
   SMTP_PASSWORD=your-16-character-app-password
   EMAIL_FROM=Grill 42 Menu Notifier <youraddress@gmail.com>
   ```

   `SUPABASE_SECRET` is read only by the server (`SUPABASE_TOKEN` is also accepted as a fallback). Use a server-side secret/service-role key with database access, not a publishable/anon key or a user's temporary JWT; the server-side key bypasses Row Level Security and must never be sent to browser code. Keep `.env` private and never commit it.
4. Start the server:

   ```bash
   npm start
   ```

   Run this command while your terminal is inside `grill42-menu-notifier`. From the parent folder, use `npm --prefix .\grill42-menu-notifier start`.

5. Open `http://localhost:3000` in your browser. Do not open `public/index.html` directly; the page needs the running Express server for its API requests.

For Gmail, use these SMTP values and a Google App Password, not your regular Gmail password:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=youraddress@gmail.com
SMTP_PASSWORD=your-16-character-app-password
EMAIL_FROM=Grill 42 Menu Notifier <youraddress@gmail.com>
```

Enable two-step verification on the Google account, create an App Password in the Google Account security settings, and replace the placeholder password in `.env`. Never commit `.env` or share its contents.

Email subscriptions are stored in the Supabase `public.subscriptions` table. Email addresses are normalized to lowercase and the email primary key prevents duplicate subscriptions. If a previous local `data/recipient.json` exists, its email is migrated to Supabase at startup. Supabase credentials are only read by the server and are never sent to the browser.

## Scheduling

The default checks target 11:01 AM and 4:31 PM in `America/Toronto`. Change `TIMEZONE` and `CHECK_SCHEDULES` in `.env` to configure them. `CHECK_SCHEDULES` accepts semicolon-separated five-field cron expressions, for example:

```env
TIMEZONE=America/Toronto
CHECK_SCHEDULES=1 11 * * *;31 16 * * *
```

When running with `npm start` on a continuously running server, these are server-side jobs, so the browser does not need to stay open.

## Vercel deployment

The app is configured as a Vercel serverless function. `vercel.json` targets the Toronto checks using UTC cron entries for both daylight-saving offsets; the endpoint verifies which entry corresponds to the configured local time. If you change `TIMEZONE` or `CHECK_SCHEDULES`, update the corresponding UTC schedules in `vercel.json` too.

**Vercel Hobby does not guarantee exact notification times.** Its cron jobs have per-hour precision and may run up to 59 minutes after their configured time. The configured targets are 11:01 AM and 4:31 PM Eastern, but on Hobby notifications can arrive as late as 12:00 PM and 5:30 PM, respectively. Minute-level timing requires a plan with per-minute cron precision or an external scheduler.

Set these variables in the Vercel project (Production, and Preview if needed): `SUPABASE_URL`, `SUPABASE_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`, `TIMEZONE`, `CHECK_SCHEDULES`, and a long random `CRON_SECRET`. The cron endpoint requires `CRON_SECRET` as a bearer token. Do not deploy `VERCEL_TOKEN` as an application environment variable.

Deploy from this directory with:

```bash
npx vercel
npx vercel --prod
```

The deploy CLI will link or create the Vercel project. Add the required environment variables through the Vercel dashboard or `vercel env add` before production deployment.

## Scraping behavior

The scraper opens the live page with Playwright, waits for the client-rendered content to include Grill 42, and scopes extraction to the observed Grill 42 station target (`#295922`) or the exact visible station heading. It never scans the other station sections. If the station cannot be found, the check fails with a clear server-console error. A page with no items is reported as an empty menu rather than crashing.

## API

- `GET /api/menu` - current Grill 42 menu
- `POST /api/check-menu` - run a manual scrape
- `POST /api/subscribe` - subscribe `{ "email": "you@example.com" }` to scheduled menu emails
- `POST /api/unsubscribe` - remove `{ "email": "you@example.com" }` from scheduled menu emails
- `POST /api/test-email` - send the current menu to the subscribed email in `{ "email": "you@example.com" }`
- `GET /api/status` - last result, next check, timezone, and subscriber count
- `GET /api/cron` - authenticated Vercel scheduled check; requires `CRON_SECRET`

The source page is [Carleton Dining Hall](https://carleton.mydininghub.ca/en/location/teraanga-commons-dining-hall).
