// Gap in the Map — interactions

(function () {
  const C = window.CAMPAIGN;
  if (!C) return;

  const $ = (id) => document.getElementById(id);

  // ---------- helpers ----------
  function mailtoFromTemplate(t) {
    const url = new URL("mailto:" + t.to);
    url.searchParams.set("subject", t.subject);
    url.searchParams.set("body", t.body);
    // mailto: doesn't actually like URL encoding via URLSearchParams for everything,
    // build manually so newlines and quotes survive cleanly.
    const enc = encodeURIComponent;
    return `mailto:${t.to}?subject=${enc(t.subject)}&body=${enc(t.body)}`;
  }

  function openMailto(t) {
    const href = mailtoFromTemplate(t);
    // window.location works better than window.open for mailto:
    window.location.href = href;
  }

  // ---------- MP picker ----------
  const mpSelect = $("mp-select");
  const mpSend = $("mp-send");
  if (mpSelect && mpSend) {
    mpSend.addEventListener("click", () => {
      const key = mpSelect.value;
      if (!key || !C.mps[key]) {
        mpSelect.focus();
        mpSelect.style.borderColor = "#ff3b3b";
        return;
      }
      mpSelect.style.borderColor = "";
      openMailto(C.emails.mp({ mp: C.mps[key] }));
    });
  }

  // ---------- Mayor / TfL buttons ----------
  const mayorBtn = $("mayor-send");
  if (mayorBtn) mayorBtn.addEventListener("click", () => openMailto(C.emails.mayor()));

  const tflBtn = $("tfl-send");
  if (tflBtn) tflBtn.addEventListener("click", () => openMailto(C.emails.tfl()));

  // ---------- Sign-up form (encrypted submission) ----------
  // Posts to our Cloudflare Worker after end-to-end encrypting the payload.
  // The worker only ever sees ciphertext + the postcode district (for stats).
  const form = $("signup-form");
  if (form) {
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const success = $("signup-success");
      const apiUrl = (C.api && C.api.url) || "";
      const cryptoMod = window.CAMPAIGN_CRYPTO;
      const pubKey = (C.crypto && C.crypto.publicKey) || "";

      // No backend / no key configured yet → log to console + show notice.
      if (!apiUrl || !cryptoMod || !pubKey || pubKey === "REPLACE_ME") {
        const data = Object.fromEntries(new FormData(form).entries());
        console.info("[Gap in SE Map] Captured locally (backend not configured):", data);
        if (success) {
          success.hidden = false;
          success.textContent =
            "✓ Captured locally. Backend not yet configured — see MODERATION.md for setup.";
        }
        form.reset();
        return;
      }

      // Build the encrypted submission. Show a status line while PoW solves.
      const submitBtn = form.querySelector('button[type="submit"]');
      const formData = Object.fromEntries(new FormData(form).entries());
      const status = ensurePowStatus(form);
      status.classList.add("visible", "solving");
      status.textContent = "Verifying… (one-time CPU work, ~1 second)";
      if (submitBtn) submitBtn.disabled = true;

      try {
        const submission = await cryptoMod.buildSubmission(formData);
        status.textContent = "Sending encrypted…";
        const r = await fetch(apiUrl.replace(/\/$/, "") + "/submit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(submission),
        });
        if (r.status === 429) {
          status.classList.remove("solving");
          status.textContent = "You've hit the per-hour limit. Please try again in an hour.";
          return;
        }
        if (!r.ok) {
          const body = await r.text().catch(() => "");
          throw new Error(`Server returned ${r.status} ${body}`);
        }
        status.classList.remove("solving");
        status.classList.add("success");
        status.textContent = "✓ Encrypted & submitted. We'll be in touch.";
        if (success) {
          success.hidden = false;
          success.textContent = "✓ Thanks — you're in. Now share the campaign with one neighbour.";
        }
        form.reset();
      } catch (err) {
        console.error("[Gap in SE Map] submit failed:", err);
        status.classList.remove("solving");
        status.textContent = "Couldn't submit. Please try again, or email us directly.";
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  function ensurePowStatus(form) {
    let s = form.querySelector(".pow-status");
    if (s) return s;
    s = document.createElement("p");
    s.className = "pow-status";
    s.setAttribute("role", "status");
    form.appendChild(s);
    return s;
  }

  // ---------- Share buttons ----------
  const shareUrl = C.site.url;
  const shareText = C.share.text + shareUrl;

  const sx = $("share-x");
  if (sx) sx.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;

  const swa = $("share-wa");
  if (swa) swa.href = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  const slink = $("share-link");
  if (slink) {
    slink.addEventListener("click", async (ev) => {
      ev.preventDefault();
      try {
        await navigator.clipboard.writeText(shareUrl);
        const old = slink.textContent;
        slink.textContent = "Copied ✓";
        setTimeout(() => (slink.textContent = old), 1800);
      } catch {
        prompt("Copy this link:", shareUrl);
      }
    });
  }

  // ---------- Petition link placeholder ----------
  const petition = $("petition-link");
  if (petition) {
    petition.addEventListener("click", (ev) => {
      // Until the petition is live, route to parliament.uk petitions home.
      if (petition.getAttribute("href") === "#") {
        ev.preventDefault();
        window.open("https://petition.parliament.uk/", "_blank", "noopener");
      }
    });
  }

  // ---------- Live sign-up counter (loads stats.json) ----------
  // The site is static; stats.json in the repo is updated either by hand,
  // or by a GitHub Action that polls Formspree/Tally. Keeps front-end zero-dep.
  fetch("stats.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((stats) => {
      if (!stats || typeof stats.signups !== "number") return;
      const el = $("signup-count");
      const strip = $("signup-strip");
      if (el) el.textContent = stats.signups.toLocaleString("en-GB");
      // Only reveal the strip once we have a number — avoids "—" flash on slow connections.
      if (strip && stats.signups >= 0) strip.hidden = false;
    })
    .catch(() => { /* fail silently — stats are decorative, not critical */ });

  // ---------- Testimonials renderer (loads testimonials.json) ----------
  // Built with DOM methods (not innerHTML) so any future content changes can't
  // accidentally inject markup. Every text bit goes through textContent.
  const tHost = $("testimonials");
  if (tHost) {
    fetch("testimonials.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        while (tHost.firstChild) tHost.removeChild(tHost.firstChild);
        const entries = (data && Array.isArray(data.entries)) ? data.entries : [];
        if (!entries.length) {
          const p = document.createElement("p");
          p.className = "muted small";
          p.textContent =
            "No testimonials yet. Be the first — sign up above and tick the testimonial box.";
          tHost.appendChild(p);
          return;
        }
        for (const entry of entries) {
          tHost.appendChild(buildTestimonial(entry));
        }
      })
      .catch(() => {
        tHost.replaceChildren();
        const p = document.createElement("p");
        p.className = "muted small";
        p.textContent =
          "Could not load testimonials. Try refreshing or skip ahead to Take Action.";
        tHost.appendChild(p);
      });
  }

  // Pure DOM construction — every user-supplied string goes through textContent.
  function buildTestimonial(t) {
    const article = document.createElement("article");
    article.className = "testimonial";

    const bq = document.createElement("blockquote");
    bq.textContent = String(t.quote || "");
    article.appendChild(bq);

    const cite = document.createElement("cite");

    const area = document.createElement("span");
    area.className = "testimonial-area";
    area.textContent = String(t.area || "");
    cite.appendChild(area);

    const nameStrong = document.createElement("strong");
    nameStrong.textContent = t.displayName ? String(t.displayName) : "Anonymous";
    cite.appendChild(nameStrong);

    if (t.verified) {
      const sep = document.createTextNode("   ");
      cite.appendChild(sep);
      const v = document.createElement("span");
      v.className = "testimonial-verified";
      v.title = "Address verified by campaign team";
      v.textContent = "✓ verified resident";
      cite.appendChild(v);
    }

    article.appendChild(cite);
    return article;
  }
})();
