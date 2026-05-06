# Gap in SE Map — Campaign Site

Static campaign site for the South London transport black hole.
SE1 · SE5 · SE15 · SE16 · SE17 — Walworth, Camberwell, North Peckham, Bermondsey.

## Files

- `index.html` — full single-page site (hero, gap, people, asks, take action, rights, funding, FAQ, footer)
- `style.css` — all styling, dark editorial aesthetic
- `data.js` — copy that goes into emails and share text. **Edit the email templates here.**
- `script.js` — sign-up + mailto + share interactions

No build step. No framework. Open `index.html` in a browser.

## Run locally

```sh
cd /Users/luke/dev/tflcampaign
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

Pick one — all are free for this use case:

- **Cloudflare Pages** — drag-and-drop or connect to a git repo.
- **Netlify** — same, plus built-in form handling (see below).
- **GitHub Pages** — push to a public repo, enable Pages.
- **Vercel** — drag-and-drop deploy.

## Wire up the sign-up form

The form currently posts to a `REPLACE_ME` Formspree endpoint. Pick a backend:

### Option A — Formspree (easiest)
1. Sign up at <https://formspree.io>.
2. Create a new form, copy the endpoint (looks like `https://formspree.io/f/abc123`).
3. In `index.html`, replace `https://formspree.io/f/REPLACE_ME` with your endpoint.

### Option B — Netlify Forms (free with Netlify hosting)
1. Add `netlify` attribute to the form: `<form ... netlify>`.
2. Remove the `action` attribute.
3. Submissions appear in your Netlify dashboard.

### Option C — Self-hosted
Replace the action with a POST endpoint you control. Stash data in Postgres / sqlite / a Google Sheet via Apps Script.

If no backend is configured, the form logs to the browser console and shows a placeholder success message — useful for previewing without spamming a service.

## Customise the campaign

All editable copy that ships into emails or social posts is in `data.js`:

- `mps` — names, constituencies, emails. Add more if your area is covered by other MPs.
- `mayor`, `tfl` — recipient emails for the standard buttons.
- `emails.mp / mayor / tfl` — the full pre-written letter bodies. Tweak tone or asks.
- `share.text` — the social-share message.

Most of the long-form prose lives directly in `index.html`. To change the four asks, edit the `<ol class="asks">` block. To change the stats, edit the `stat-grid` cards.

## Domain

Suggested: `gapinsemap.london`, `gapinsemap.uk`, `gapinsemap.org`. `.london` and `.uk` are ~£10–25/yr.

## Custom analytics

None included by default (privacy-respecting). Add Plausible, Fathom or umami via a one-line `<script>` if needed.

## Licence

CC0 / public domain — fork freely. No need to credit.

## Sources for the figures on this site

See the FAQ section of the page for full source links. Headline numbers:

- 120,000 residents — sum of Southwark wards in the gap (Census 2021), conservative.
- £400m income tax + NI — derived from ~50,000 employed × ~£8k average tax.
- £90m council tax + GLA precept — ~50,000 households × ~£1,800 (Southwark Band D 2026/27 = £1,967).
- 12,000 new homes / 5,000 jobs by 2041 — Mayor's London Plan, Old Kent Road OA.
- 25,000 homes unlocked — TfL Bakerloo Line Extension page.
- 89% support — TfL 2019 BLE consultation.
- £30m Camberwell / £50m Walworth Road — TfL 2014 feasibility study (today: ~2× those).
- £25m Surrey Canal Road — Lewisham Council / TfL.
