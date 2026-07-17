# MHN Sales

Personal sales pipeline tool (HubSpot-style Kanban) with a Claude Fable–inspired design. Data syncs across devices via **Supabase**.

## Features

- **Board** — Prospects, Interested, Committed, Paid, Failed (drag & drop)
- **Pipeline** — timeline of committed deals
- **History** — dismissed deals
- Filters (Owner / Industry / Tool), search, notes
- Cloud sync via Supabase (with localStorage fallback)

## Cloud write protection

Only the **GitHub Pages** app (`*.github.io`) can write to Supabase.

| Origin | Read cloud | Write cloud |
|--------|------------|-------------|
| `https://macadosis.github.io/MHNsales/` | yes | **yes** (after load) |
| `localhost` / `file://` / Desktop | yes | **no** |

Additional safeguards:
- Saves **upsert** deals only — they never mass-delete other cloud rows
- Cloud writes are refused until a successful Supabase load in that session
- Permanent delete removes a single deal by id

Use the deployed URL for real sales data. Local copies are for UI/preview only.

## Setup

### 1. Supabase

1. Open your **MHNsales** project in [Supabase](https://supabase.com).
2. Go to **SQL Editor**, paste and run `supabase/schema.sql`.
3. Go to **Project Settings → API** and copy:
   - Project URL
   - `anon` `public` key
4. Put them in `config.js`:

```js
window.MHN_CONFIG = {
  supabaseUrl: "https://YOUR_REF.supabase.co",
  supabaseAnonKey: "YOUR_ANON_KEY",
};
```

Existing browser data is migrated to Supabase automatically on first successful connect (when the remote table is empty).

### 2. Local run

```bash
python3 -m http.server 8000
```

Open http://localhost:8000

### 3. GitHub Pages

After pushing to the **MHNsales** repo:

1. **Settings → Pages**
2. Source: **Deploy from a branch** → `main` → `/` (root)
3. Site URL: `https://YOUR_USERNAME.github.io/MHNsales/`

Keep the repo **private** if you use the open RLS policy in `schema.sql` (personal multi-device use).

## Files

| File | Role |
|------|------|
| `index.html` / `styles.css` / `app.js` | UI |
| `config.js` | Supabase URL + anon key |
| `db.js` | Supabase load / save / realtime |
| `supabase/schema.sql` | Database table + policies |
