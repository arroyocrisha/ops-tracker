# Ops Tracker

A small web app for tracking which team members are assigned to which
clients. It reads and writes `data.json` straight to this GitHub repo, so
when someone clicks **Save**, the change is committed and everyone else
sees it too.

Your 98 clients from the spreadsheet are already loaded into `data.json`.

## 1. Create the repo

1. On GitHub, click **New repository**.
2. Name it (e.g. `ops-tracker`). See the note on **public vs. private**
   below before you choose.
3. Upload these four files to the repo (drag-and-drop on the GitHub web
   UI works fine, or use `git push`):
   - `index.html`
   - `style.css`
   - `app.js`
   - `data.json`

## 2. Turn on GitHub Pages

1. In the repo, go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to `Deploy from a
   branch`, branch `main`, folder `/ (root)`.
3. Save. GitHub gives you a URL like
   `https://yourname.github.io/ops-tracker/` — that's the tracker.
   It takes a minute or two to go live after each change.

## 3. Create a token so editing can save

Anyone who wants to **add or edit** clients needs a personal access
token scoped to this one repo. Viewing the tracker doesn't require one.

1. Go to **github.com/settings/personal-access-tokens/new** (fine-grained
   tokens).
2. Under **Repository access**, choose **Only select repositories** and
   pick this repo.
3. Under **Permissions → Repository permissions**, set **Contents** to
   **Read and write**.
4. Generate the token and copy it (you won't see it again).
5. On the tracker page, click **Connect GitHub** in the top bar and
   enter:
   - your GitHub username or org
   - the repo name
   - the token
6. The app checks it can read `data.json`, then remembers it in that
   browser only. Each person who wants to edit connects their own token
   once, on their own device.

## Important: public vs. private repo

Client names, contract dates, and industries are business data — decide
how visible you want that:

- **Public repo** — GitHub Pages works on any (free) GitHub plan, and
  anyone with the link can view the tracker. Only people who connect a
  token can edit.
- **Private repo** — keeps everything restricted to people with repo
  access, but GitHub Pages for private repos requires a paid plan
  (GitHub Pro, Team, or Enterprise). On the free plan, you can still use
  the app by cloning the repo and opening `index.html` from a local
  server instead of Pages (e.g. `python3 -m http.server` in the folder),
  or hosting the four files anywhere else you like — the app doesn't
  need a special server, just something that serves static files.

If you're not sure, start private and revisit once you know who needs
access.

## Using it day to day

- **Add a client** — top-right button, fill in the drawer, Save.
- **Edit a client** — click any row.
- **Filter** — status chips, the "assigned to" dropdown, or the search
  box (matches client name, industry, and any assigned person).
- **Sort** — click a column header; click again to reverse.
- The small dot next to "Connect GitHub" shows sync status: grey = not
  connected, green = connected, amber = saving, red = last save failed.

## Notes on the data

Each client record in `data.json` has: `name`, six role fields (`cho`,
`crsm`, `csm`, `ccm`, `wpo`, `des`), `status` (`Active` / `Contract
Ending` / `Paused`), `contractStart`, `contractEnd`, `industry`,
`packages`, `hosted`, and `closedWinDate`. You can edit `data.json`
directly on GitHub too — the app just re-reads whatever is there.
