// Wspólny skrypt dla index.html i blog.html.
// Wpisy są wstawiane wyłącznie przez textContent — nigdy jako HTML.

(function () {
  // Ochrona przed clickjackingiem — strona nie działa osadzona w cudzej ramce
  if (window.top !== window.self) {
    document.documentElement.style.display = "none";
    try { window.top.location = window.self.location.href; } catch (_) {}
    return;
  }

  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  const I18N = window.MOVO_I18N || { get: () => "en", t: () => "" };
  const lang = () => I18N.get();

  function formatDate(iso) {
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return "";
    return d.toLocaleDateString(lang() === "pl" ? "pl-PL" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  }

  // Wpis ma treść po polsku (title/text) i opcjonalnie po angielsku (title_en/text_en).
  // Brakująca wersja językowa → pokazujemy tę, która jest.
  function localized(p) {
    if (lang() === "en") return { title: p.title_en || p.title, text: p.text_en || p.text };
    return { title: p.title || p.title_en, text: p.text || p.text_en };
  }

  function paragraphs(text) {
    const wrap = el("div", "post-text");
    String(text || "")
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => wrap.appendChild(el("p", "", s)));
    return wrap;
  }

  function renderPost(p, i, short) {
    const art = el("article", "reveal grid gap-2 border-t border-black/10 py-9 md:grid-cols-[170px_1fr] md:gap-10");
    art.style.transitionDelay = i * 70 + "ms";

    const time = el("time", "text-sm tabular-nums text-neutral-500", formatDate(p.date));
    time.dateTime = p.date;
    art.appendChild(time);

    const loc = localized(p);
    const body = el("div");
    body.appendChild(el("h3", "font-display text-2xl font-semibold tracking-tight md:text-[1.75rem]", loc.title));
    const text = paragraphs(loc.text);
    text.className += " mt-3 max-w-2xl leading-relaxed text-neutral-600" + (short ? " line-clamp-3" : "");
    body.appendChild(text);

    if (Array.isArray(p.tags) && p.tags.length) {
      const tags = el("div", "mt-4 flex flex-wrap gap-x-3 gap-y-1 text-sm text-neutral-400");
      p.tags.forEach((t) => tags.appendChild(el("span", "", "#" + t)));
      body.appendChild(tags);
    }
    art.appendChild(body);
    return art;
  }

  async function loadPosts() {
    const res = await fetch("posts.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("posts.json: " + res.status);
    const data = await res.json();
    return (Array.isArray(data) ? data : [])
      .filter((p) => p && typeof p.title === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  // ---------- Pojawianie się przy scrollu ----------
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const io =
    "IntersectionObserver" in window && !reduced
      ? new IntersectionObserver(
          (entries) =>
            entries.forEach((e) => {
              if (e.isIntersecting) {
                e.target.classList.add("is-visible");
                io.unobserve(e.target);
              }
            }),
          { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
        )
      : null;
  function observe(root) {
    root.querySelectorAll(".reveal:not(.is-visible)").forEach((n) => (io ? io.observe(n) : n.classList.add("is-visible")));
  }
  observe(document);

  // ---------- Wpisy ----------
  const containers = document.querySelectorAll("[data-posts]");
  const needsPosts = containers.length || document.querySelector("[data-latest],[data-post-count]");
  let posts = null;
  function renderAll() {
    if (!posts) return;
    containers.forEach((c) => {
      const limit = parseInt(c.dataset.limit || "0", 10);
      const list = limit > 0 ? posts.slice(0, limit) : posts;
      c.replaceChildren(...list.map((p, i) => renderPost(p, i, limit > 0)));
      if (!list.length) c.appendChild(el("p", "py-9 text-neutral-500", I18N.t("posts.empty")));
      observe(c);
    });
    document.querySelectorAll("[data-post-count]").forEach((n) => (n.textContent = posts.length));
    document.querySelectorAll("[data-latest]").forEach((n) => (n.textContent = posts[0] ? localized(posts[0]).title : ""));
    // bez wpisów nie pokazujemy pustego „Ostatnio:”
    document.querySelectorAll("[data-latest-row]").forEach((n) => n.classList.toggle("hidden", !posts.length));
  }
  if (needsPosts) {
    loadPosts()
      .then((list) => {
        posts = list;
        renderAll();
      })
      .catch(() => {
        containers.forEach((c) => c.replaceChildren(el("p", "py-9 text-neutral-500", I18N.t("posts.error"))));
      });
    document.addEventListener("movo:lang", renderAll);
  }

  // ---------- Odblask na szkle ----------
  if (!reduced && window.matchMedia("(pointer: fine)").matches) {
    document.addEventListener(
      "pointermove",
      (e) => {
        document.querySelectorAll(".glass").forEach((g) => {
          const r = g.getBoundingClientRect();
          g.style.setProperty("--mx", e.clientX - r.left + "px");
          g.style.setProperty("--my", e.clientY - r.top + "px");
        });
      },
      { passive: true }
    );
  }

  // ---------- Pasek postępu przewijania ----------
  const bar = document.querySelector("[data-progress]");
  if (bar) {
    let ticking = false;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = "scaleX(" + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ")";
      ticking = false;
    };
    window.addEventListener("scroll", () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  // ---------- Placeholder znika, gdy zdjęcie się wczyta ----------
  document.querySelectorAll("img[data-photo]").forEach((img) => {
    const ph = img.previousElementSibling;
    const ok = () => ph && ph.remove();
    const fail = () => img.remove();
    if (img.complete) return img.naturalWidth ? ok() : fail();
    img.addEventListener("load", ok);
    img.addEventListener("error", fail);
  });

  // ---------- E-mail składany w przeglądarce (nie ma go w kodzie wprost) ----------
  document.querySelectorAll("[data-mail]").forEach((a) => {
    const u = a.dataset.u, d = a.dataset.d;
    if (!u || !d) return;
    const addr = u + "@" + d;
    a.href = "mailto:" + addr;
    a.textContent = addr;
  });

  document.querySelectorAll("[data-year]").forEach((n) => (n.textContent = new Date().getFullYear()));
})();
