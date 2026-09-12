# Grill 42 Menu Notifier

A Node.js and Express website that checks the Carleton University Teraanga Commons Dining Hall menu and emails the items listed under **The Grill 42**.

## Setup

1. Open a terminal in `grill42-menu-notifier`.
2. Install dependencies:

   ```bash
   npm install
   npx playwright install chromium
   ```

3. Copy `.env.example` to `.env` and fill in the SMTP values.
4. Start the server:

   ```bash
   npm start
   ```

5. Open `http://localhost:3000`.

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

The saved recipient is stored locally in `data/recipient.json`. The `data` directory is created after the first email is saved and should not be committed. SMTP credentials are only read by the server and are never sent to the browser.

## Scheduling

The default checks run at 11:01 AM and 4:31 PM in `America/Toronto`. Change `TIMEZONE` and `CHECK_SCHEDULES` in `.env` to configure them. `CHECK_SCHEDULES` accepts semicolon-separated five-field cron expressions, for example:

```env
TIMEZONE=America/Toronto
CHECK_SCHEDULES=1 11 * * *;31 16 * * *
```

These are server-side jobs, so the browser does not need to stay open.

## Scraping behavior

The scraper opens the live page with Playwright, waits for the client-rendered content to include Grill 42, and scopes extraction to the observed Grill 42 station target (`#295922`) or the exact visible station heading. It never scans the other station sections. If the station cannot be found, the check fails with a clear server-console error. A page with no items is reported as an empty menu rather than crashing.

## API

- `GET /api/menu` - current Grill 42 menu
- `POST /api/check-menu` - run a manual scrape
- `POST /api/save-email` - save `{ "email": "you@example.com" }`
- `POST /api/test-email` - send the current menu to the saved recipient
- `GET /api/status` - last result, next check, timezone, and saved recipient

The source page is [Carleton Dining Hall](https://carleton.mydininghub.ca/en/location/teraanga-commons-dining-hall).
