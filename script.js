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

  // ---------- Sign-up form ----------
  const form = $("signup-form");
  if (form) {
    form.addEventListener("submit", async (ev) => {
      // If Formspree (or equivalent) endpoint hasn't been configured yet,
      // fall back to a clear placeholder behaviour rather than silently failing.
      const action = form.getAttribute("action") || "";
      if (action.includes("REPLACE_ME")) {
        ev.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        console.info("[Gap in the Map] Sign-up captured locally (no backend configured):", data);
        const success = $("signup-success");
        if (success) {
          success.hidden = false;
          success.textContent =
            "✓ Captured locally (no backend configured yet). Wire up Formspree, Netlify Forms or your own endpoint in index.html to start collecting.";
        }
        form.reset();
        return;
      }
      // Otherwise let Formspree handle the POST normally and show success after.
      // (For pure UX we could intercept with fetch() — keeping native submit for reliability.)
    });
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
})();
