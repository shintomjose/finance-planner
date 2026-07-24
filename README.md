# Finance Planner

Read-only Google Sheets finance dashboard SPA, deployed to GitHub Pages.

```bash
npm run dev       # Start dev server
npm run test      # Run tests
npm run build     # Build for production
```

## Setup

The app reads a private Google Sheet client-side via the Sheets API and signs
the user in with Google Identity Services (GIS) — no backend. One-time setup
in Google Cloud Console + GitHub is required before it works.

### 1. Create a GCP project

Go to [console.cloud.google.com](https://console.cloud.google.com), and from
the project picker create a new project (any name, e.g. `finance-planner`).

### 2. Enable the Google Sheets API

With the new project selected: **APIs & Services → Library**, search for
"Google Sheets API", open it, and click **Enable**.

### 3. Configure the OAuth consent screen

**APIs & Services → OAuth consent screen** (shown as "Google Auth Platform"
in the current console):

- User type: **External**.
- App name: anything (e.g. `Finance Planner`).
- User support email and developer contact: your own Gmail address.
- Audience / Publishing status: leave as **Testing** — do not submit for
  verification, this app is for personal use only.
- Scopes: no manual scope needs to be added here. The app requests the
  read-only Sheets scope (`spreadsheets.readonly`) at sign-in time; adding it
  as a "sensitive" scope on this screen is optional and not required for
  Testing mode.
- Test users: add your own Gmail address under **Test users**. Only accounts
  listed here (or the project owner) can sign in while the app is in Testing
  mode.

### 4. Create an OAuth client ID

**APIs & Services → Credentials → Create credentials → OAuth client ID**:

- Application type: **Web application**.
- Name: anything (e.g. `Finance Planner Web`).
- Authorized JavaScript origins — add both:
  - `https://<your-github-username>.github.io`
  - `http://localhost:5173`
- Authorized redirect URIs: leave empty. GIS's token-client flow (used here)
  does not use redirects.

Click **Create** and copy the generated **Client ID**
(`....apps.googleusercontent.com`).

### 5. Fill in `src/config.ts`

Open `src/config.ts` and replace the placeholders:

- `clientId` — the OAuth client ID from step 4.
- `sheetId` — the spreadsheet ID from your Google Sheet's URL, the segment
  between `/d/` and `/edit`:
  `https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`.

The sheet must be a spreadsheet your Google account (the one listed as a
test user) already has at least read access to.

### 6. Configure GitHub Pages

The repo must be **public** (or on a GitHub Pro/Team plan that allows Pages
on private repos). Then, in **Settings → Pages**, set **Source** to
**GitHub Actions**.

### 7. Verify locally, then deploy

- Run `npm run dev`, open the local URL, sign in with your Gmail test
  account, and confirm the sheet data loads (Overview shows the current
  month).
- Commit and push to `main`. The GitHub Actions workflow builds and deploys
  to Pages automatically.
- Open `https://<your-github-username>.github.io/finance-planner/` and sign
  in there too — it's a separate authorized origin from localhost.

### Notes

- OAuth access tokens last about 1 hour. When a call fails with an auth
  error, the app returns to the sign-in screen with a "Session expired" note
  — one click re-authenticates via GIS. (Silent, automatic re-auth is
  planned for a later iteration.)
- Because the app stays in **Testing** publishing status, Google shows a
  "Google hasn't verified this app" consent screen and the sign-in popup can
  reappear once per browser session. This is expected for personal-use apps
  and does not require submitting the app for Google's verification review.
