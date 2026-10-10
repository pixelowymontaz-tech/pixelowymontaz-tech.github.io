// Tłumaczenia EN / PL.
// Domyślnie strona jest po angielsku (tekst w HTML). Elementy z data-i18n="klucz"
// dostają tekst z tego słownika — zawsze przez textContent, nigdy jako HTML.
// Polską wersję proponujemy, gdy przeglądarka jest w polskiej strefie czasowej
// albo ma polski język — sprawdzane lokalnie, bez wysyłania IP.
// Wybór zapisuje się w przeglądarce (localStorage), więc pytamy raz.

(function () {
  const DICT = {
    en: {
      "meta.title": "MOVO — a 360° camera from scratch · Ignacy",
      "meta.desc": "MOVO — a 360° camera built from scratch. Electronics, PCB, then stitching software.",
      "nav.about": "About",
      "nav.stages": "Stages",
      "nav.updates": "Updates",
      "nav.contact": "Contact",
      "nav.back": "← back",
      "hero.lead": "A 360° camera I'm building myself, from scratch. Planning for now, then the PCB and software.",
      "hero.latest": "Latest:",
      "about.title": "Hi, I'm Ignacy.",
      "about.p1": "I'm 13 and I'm building a 360° camera from scratch.",
      "about.p2": "I design the electronics and the PCB myself. Later I'll also write the software that stitches the images from two lenses into one panorama. I'm learning everything as I go, so plenty of things don't work the first time.",
      "about.p3": "This is where I write down what I did, what didn't work and what's next.",
      "stages.title": "Where I'm at",
      "stages.lead": "Build stages, roughly in order. The black one is where I am right now.",
      "id.age": "Age",
      "id.role": "Role",
      "id.roleV": "Builder",
      "id.project": "Project",
      "id.projectV": "360° camera",
      "id.status": "Status",
      "id.statusV": "Planning",
      "posts.emptySub": "The first post is coming soon. Planning comes first.",
      "st.done": "done",
      "st.now": "now",
      "st.later": "later",
      "s1.t": "Planning",
      "s1.d": "Picking parts, the schematic, a plan for the whole thing.",
      "s2.t": "PCB",
      "s2.d": "Layout, ordering, soldering the first version.",
      "s3.t": "Bring-up",
      "s3.d": "First image from the sensor. Or the first smoke.",
      "s4.t": "Enclosure",
      "s4.d": "Something to fit it all in.",
      "s5.t": "Software",
      "s5.d": "Stitching two lenses into one panorama.",
      "updates.title": "Updates",
      "updates.all": "all posts",
      "goals.title": "What I'm aiming for",
      "goals.lead": "Not promises, just goals. We'll see how much of this survives contact with reality.",
      "g1": "fisheye lenses, ~200° each",
      "g2": "target panorama: 8K resolution at 30 frames per second",
      "g3": "all the electronics on one board",
      "g4.v": "$0",
      "g4": "on off-the-shelf camera modules. All my own",
      "contact.lead": "Got a question, an idea, or a sensor you don't need?",
      "contact.copy": "Copy",
      "social.follow": "Follow the build",
      "social.soon": "Coming soon",
      "contact.copied": "Copied!",
      "footer.top": "back to top",
      "footer.privacy": "Privacy & cookies",
      "privacy.meta": "Privacy & cookies — MOVO",
      "blog.meta": "Log — MOVO",
      "blog.title": "Log",
      "blog.lead": "Everything in order: what I did, what didn't work and what's next. Posts:",
      "posts.empty": "Nothing here yet.",
      "posts.error": "Couldn't load the posts.",
      "404.text": "Nothing here. The lens is staring into the void.",
      "404.back": "Back to the homepage",
      "lang.switch": "PL",
      "lang.label": "Zmień język na polski",
    },
    pl: {
      "meta.title": "MOVO — kamera 360° od zera · Ignacy",
      "meta.desc": "MOVO — kamera 360° budowana od zera. Elektronika, PCB, a potem software do sklejania obrazu.",
      "nav.about": "O mnie",
      "nav.stages": "Etapy",
      "nav.updates": "Postępy",
      "nav.contact": "Kontakt",
      "nav.back": "← wróć",
      "hero.lead": "Kamera 360°, którą buduję sam, od zera. Na razie planowanie, potem PCB i software.",
      "hero.latest": "Ostatnio:",
      "about.title": "Cześć, jestem Ignacy.",
      "about.p1": "Mam 13 lat i buduję od zera kamerę 360°.",
      "about.p2": "Sam projektuję elektronikę i płytkę PCB. Docelowo napiszę też oprogramowanie, które skleja obraz z dwóch obiektywów w jedną panoramę. Uczę się wszystkiego w trakcie, więc sporo rzeczy nie wychodzi za pierwszym razem.",
      "about.p3": "Tutaj zapisuję, co zrobiłem, co nie zadziałało i co dalej.",
      "stages.title": "Gdzie jestem",
      "stages.lead": "Etapy budowy, mniej więcej po kolei. Czarny to ten, na którym jestem teraz.",
      "id.age": "Wiek",
      "id.role": "Rola",
      "id.roleV": "Konstruktor",
      "id.project": "Projekt",
      "id.projectV": "Kamera 360°",
      "id.status": "Status",
      "id.statusV": "Planowanie",
      "posts.emptySub": "Pierwszy wpis już wkrótce. Najpierw planowanie.",
      "st.done": "zrobione",
      "st.now": "teraz",
      "st.later": "później",
      "s1.t": "Planowanie",
      "s1.d": "Wybór części, schemat, plan całości.",
      "s2.t": "Płytka PCB",
      "s2.d": "Layout, zamówienie, lutowanie pierwszej wersji.",
      "s3.t": "Uruchomienie",
      "s3.d": "Pierwszy obraz z sensora. Albo pierwszy dym.",
      "s4.t": "Obudowa",
      "s4.d": "Coś, w czym to wszystko się zmieści.",
      "s5.t": "Software",
      "s5.d": "Sklejanie obrazu z dwóch obiektywów w panoramę.",
      "updates.title": "Postępy",
      "updates.all": "wszystkie wpisy",
      "goals.title": "Do czego dążę",
      "goals.lead": "To nie są obietnice, tylko cele. Zobaczymy, ile z tego przeżyje kontakt z rzeczywistością.",
      "g1": "obiektywy rybie oko, ~200° każdy",
      "g2": "docelowo panorama 8K przy 30 klatkach na sekundę",
      "g3": "cała elektronika na jednej płytce",
      "g4.v": "0 zł",
      "g4": "na gotowe moduły kamer. Wszystko własne",
      "contact.lead": "Masz pytanie, pomysł albo sensor, którego nie potrzebujesz?",
      "contact.copy": "Kopiuj",
      "social.follow": "Śledź budowę",
      "social.soon": "Wkrótce",
      "contact.copied": "Skopiowano!",
      "footer.top": "do góry",
      "footer.privacy": "Prywatność i cookies",
      "privacy.meta": "Prywatność i cookies — MOVO",
      "blog.meta": "Dziennik — MOVO",
      "blog.title": "Dziennik",
      "blog.lead": "Wszystko po kolei: co zrobiłem, co nie wyszło i co dalej. Wpisów:",
      "posts.empty": "Na razie pusto.",
      "posts.error": "Nie udało się wczytać wpisów.",
      "404.text": "Tu nic nie ma. Obiektyw patrzy w pustkę.",
      "404.back": "Wróć na stronę główną",
      "lang.switch": "EN",
      "lang.label": "Switch language to English",
    },
  };

  const KEY = "movo-lang";
  function stored() {
    try { const v = localStorage.getItem(KEY); return v === "pl" || v === "en" ? v : null; } catch (_) { return null; }
  }
  function store(v) {
    try { localStorage.setItem(KEY, v); } catch (_) {}
  }

  let lang = stored() || "en";
  const t = (k) => (DICT[lang] && DICT[lang][k]) || DICT.en[k] || "";

  function apply() {
    document.documentElement.lang = lang;
    // długie teksty (np. polityka prywatności) mają osobne bloki dla każdego języka
    document.querySelectorAll("[data-lang-block]").forEach((el) => (el.hidden = el.dataset.langBlock !== lang));
    // podpis etapu wynika z jego statusu (data-stage="done|now|later")
    document.querySelectorAll("[data-stage]").forEach((li) => {
      const label = li.querySelector("[data-stage-label]");
      if (label) label.dataset.i18n = "st." + li.dataset.stage;
    });
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const v = t(el.dataset.i18n);
      if (v) el.textContent = v;
    });
    const title = document.querySelector("title[data-i18n-title]");
    if (title) document.title = t(title.dataset.i18nTitle);
    const desc = document.querySelector('meta[name="description"][data-i18n-desc]');
    if (desc) desc.setAttribute("content", t("meta.desc"));
    document.querySelectorAll("[data-lang-toggle]").forEach((b) => {
      b.textContent = t("lang.switch");
      b.setAttribute("aria-label", t("lang.label"));
    });
    document.dispatchEvent(new CustomEvent("movo:lang", { detail: lang }));
  }

  function set(next) {
    if (next !== "en" && next !== "pl") return;
    lang = next;
    store(next);
    const offer = document.getElementById("lang-offer");
    if (offer) offer.remove();
    apply();
  }

  window.MOVO_I18N = { get: () => lang, t, set };

  document.querySelectorAll("[data-lang-toggle]").forEach((b) =>
    b.addEventListener("click", () => set(lang === "en" ? "pl" : "en"))
  );
  apply();

  // ---------- Propozycja polskiej wersji po kraju (IP) ----------
  if (stored() || !document.querySelector("[data-lang-toggle]")) return;

  function offerPolish() {
    if (lang !== "en" || document.getElementById("lang-offer")) return;
    const box = document.createElement("div");
    box.id = "lang-offer";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Wybór języka");
    box.className = "glass glass-nav fixed inset-x-3 bottom-3 z-[70] mx-auto flex max-w-md flex-col gap-3 rounded-[24px] p-5 text-sm sm:bottom-6 sm:flex-row sm:items-center";

    const txt = document.createElement("p");
    txt.className = "flex-1 leading-snug text-neutral-800";
    txt.textContent = "Wygląda na to, że jesteś w Polsce. Przełączyć stronę na polski?";

    const btns = document.createElement("div");
    btns.className = "flex shrink-0 gap-2";
    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "rounded-full bg-black px-4 py-2 font-medium text-white transition hover:bg-neutral-800";
    yes.textContent = "Tak, po polsku";
    const no = document.createElement("button");
    no.type = "button";
    no.className = "rounded-full px-3 py-2 text-neutral-600 transition hover:bg-white/60 hover:text-black";
    no.textContent = "English";
    btns.append(yes, no);
    box.append(txt, btns);

    yes.addEventListener("click", () => { set("pl"); box.remove(); });
    no.addEventListener("click", () => { store("en"); box.remove(); });
    document.body.appendChild(box);
  }

  // Polska = strefa czasowa Europe/Warsaw albo polski język przeglądarki.
  // Wszystko sprawdzane lokalnie — nic nie jest nigdzie wysyłane.
  let tz = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (_) {}
  const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""]).map((l) => String(l).toLowerCase());
  if (tz === "Europe/Warsaw" || langs.some((l) => l.startsWith("pl"))) setTimeout(offerPolish, 1200);
})();
