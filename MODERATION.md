# Moderation & sign-up workflow

Day-to-day instructions for keeping the campaign live with real residents.

---

## One-time setup — pick a form backend

The form on the site posts to a placeholder. Until you wire a real backend in, every submission is dropped on the floor (logged to the browser console only). Pick one:

### Option A — Tally (recommended)
- Free, unlimited submissions, no credit card.
- Sign up at <https://tally.so>.
- Create a new form with these fields (matching the site form):
  - **Name** (short answer, required)
  - **Email** (email, required)
  - **Postcode** (short answer, required, regex `^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$`)
  - **I live or work in the gap area** (checkbox, required)
  - **Testimonial** (long text, optional)
  - **Display preference** (multiple choice, default Anonymous)
  - **Consent to publish** (checkbox, optional)
- After publishing the form, Tally gives you a form ID like `meQabc`.
- Tell me the ID — I'll wire the site to either:
  - **Embed mode** (form lives on tally.so; site links to it), or
  - **Action mode** (form on our site posts directly to `https://tally.so/api/v1/forms/meQabc/submissions`).

### Option B — Formspree
- Free tier: 50 submissions/month, then £8/mo.
- Sign up at <https://formspree.io>.
- Create a form, copy the endpoint (e.g. `https://formspree.io/f/abc123`).
- Tell me the endpoint — I replace `REPLACE_ME` in `index.html` with it.

### Option C — Cloudflare Worker
- More work (a day) but fully owned and free.
- Ask me to build it when you're ready.

---

## Each new sign-up

1. Submission arrives in your Tally / Formspree dashboard + email.
2. Open `stats.json`, increment `signups` by 1, update `lastUpdated`. Commit + push:
   ```
   {"signups": 47, "testimonials_published": 6, "lastUpdated": "2026-05-12"}
   ```
3. (Optional, automation): I can write a GitHub Action later that polls Tally hourly and updates `stats.json` automatically.

You can also batch — e.g. update once a week with the new total.

---

## Each new testimonial — moderation steps

When someone ticks "share a testimonial" on the form, you'll get the testimonial text plus their display preference. Steps:

### 1. Verify they live in the area
Email them back asking for proof of residence — any one of:
- Council tax bill
- Utility bill (gas/electric/water)
- Tenancy agreement
- Electoral register entry

Postcode alone isn't enough; fraud-resistance matters when this is being cited at the Mayor.

### 2. Decide if it's publishable
- Is it specific to the gap experience? (Generic "London transport is bad" → reject)
- Is it free of identifying personal info you wouldn't want public? (Names of children, exact addresses, etc → ask them to redact)
- Is it civil? (Not abusive)

### 3. Add to `testimonials.json`
Open the file. Append an entry to the `entries` array:

```json
{
  "id": "2026-05-12-anjali",
  "quote": "I've lived on Walworth Road for eleven years. My nearest station is Elephant — fifteen minutes if I walk fast, twenty-five with a buggy.",
  "area": "SE17",
  "displayName": "Anjali",
  "verified": true,
  "date": "2026-05-12"
}
```

`displayName` rules based on the radio they ticked:
- **Anonymous** → `null`
- **First name + area only** → `"Anjali"` (first name only)
- **Full name + area** → `"Anjali Patel"`

`area` is whatever you can derive from their postcode (the first letters: SE17, SE5, SE1, SE15, SE16).

### 4. Commit + push
```
git add testimonials.json stats.json
git commit -m "content: testimonial — Anjali, SE17"
git push
```

Site auto-redeploys via GitHub Actions in ~60s.

---

## Bulk update template (for after the launch surge)

If you get 20 testimonials in a day, do them in one batch:

```
git add testimonials.json stats.json
git commit -m "content: 20 new testimonials, weekly digest"
git push
```

---

## Future automation (when you want it)

When the manual flow gets old, ask me to add:

- **Tally → GitHub Issues webhook**: every form submission opens a GitHub Issue with the data pre-filled. You moderate by closing or labelling.
- **Auto-update stats.json hourly**: GitHub Action that polls Tally's API for the count and commits to `stats.json`.
- **Admin page**: a private `/admin.html` (token-protected) that lists pending testimonials and lets you approve with one click — runs in a Cloudflare Worker.

None of these are needed at launch. Start manual. Automate when manual hurts.
