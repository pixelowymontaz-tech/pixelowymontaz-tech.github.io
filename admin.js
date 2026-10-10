// Panel admina MOVO — logowanie hasłem.
//
// GitHub Pages to hosting statyczny: nie ma serwera ani bazy danych (więc nie ma
// też czego atakować SQL injection). Zapisywać pliki w repo może tylko token GitHuba.
// Dlatego token jest raz wklejany przy konfiguracji i SZYFROWANY hasłem:
//   hasło --PBKDF2-SHA256 (1 000 000 iteracji, losowa sól)--> klucz AES-256-GCM
// Zaszyfrowany token leży w admin-key.json. Bez hasła jest bezużyteczny,
// a duża liczba iteracji sprawia, że zgadywanie haseł jest bardzo wolne.
// W kodzie nie ma żadnych sekretów.

(function () {
  const CONFIG = {
    owner: "pixelowymontaz-tech",
    repo: "pixelowymontaz-tech.github.io",
    branch: "main",
    postsPath: "posts.json",
    keyPath: "admin-key.json",
    iterations: 1000000,
    minPassword: 12,
    idleMinutes: 30,
  };

  const API = "https://api.github.com";
  const TOKEN_RE = /^(github_pat_|ghp_)[A-Za-z0-9_]{20,250}$/;
  const SS_KEY = "movo-admin";
  const AAD = new TextEncoder().encode("movo-admin-v1");

  const $ = (id) => document.getElementById(id);
  const state = { token: null, posts: [], postsSha: null, editingId: null, busy: false, failures: 0, lockedUntil: 0 };

  $("token-link").href =
    "https://github.com/settings/personal-access-tokens/new?name=MOVO+panel&description=Panel+admina+strony+MOVO" +
    "&target_name=" + encodeURIComponent(CONFIG.owner) + "&expires_in=366&contents=write";

  // ---------- Pomocnicze: base64 ----------
  function bytesToB64(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64ToBytes(b64) {
    const bin = atob(String(b64).replace(/\s/g, ""));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }
  const strToB64 = (s) => bytesToB64(new TextEncoder().encode(s));
  const b64ToStr = (b) => new TextDecoder().decode(b64ToBytes(b));

  // ---------- Kryptografia (Web Crypto) ----------
  async function deriveKey(password, salt, iterations) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }
  async function encryptToken(token, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt, CONFIG.iterations);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD }, key, new TextEncoder().encode(JSON.stringify({ t: token }))));
    return { v: 1, kdf: "PBKDF2-SHA256", iter: CONFIG.iterations, salt: bytesToB64(salt), iv: bytesToB64(iv), ct: bytesToB64(ct) };
  }
  async function decryptToken(blob, password) {
    if (!blob || blob.v !== 1 || blob.kdf !== "PBKDF2-SHA256") throw new Error("Nieznany format klucza.");
    const iter = Math.min(Math.max(blob.iter | 0, 100000), 10000000);
    const key = await deriveKey(password, b64ToBytes(blob.salt), iter);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(blob.iv), additionalData: AAD }, key, b64ToBytes(blob.ct));
    const t = JSON.parse(new TextDecoder().decode(pt)).t;
    if (!TOKEN_RE.test(t)) throw new Error("Uszkodzony klucz.");
    return t;
  }

  // ---------- Sesja (tylko w tej karcie) ----------
  function saveSession() {
    try { sessionStorage.setItem(SS_KEY, state.token); } catch (_) {}
  }
  function loadSession() {
    try { const t = sessionStorage.getItem(SS_KEY); return TOKEN_RE.test(t || "") ? t : null; } catch (_) { return null; }
  }
  function clearSession() {
    try { sessionStorage.removeItem(SS_KEY); } catch (_) {}
  }

  // ---------- GitHub API ----------
  async function gh(path, opts) {
    opts = opts || {};
    const headers = { Accept: "application/vnd.github+json", Authorization: "Bearer " + state.token, "X-GitHub-Api-Version": "2022-11-28" };
    if (opts.body) headers["Content-Type"] = "application/json";
    const res = await fetch(API + path, { method: opts.method || "GET", headers, body: opts.body, cache: "no-store", referrerPolicy: "no-referrer" });
    if (!res.ok) {
      const err = new Error("GitHub " + res.status);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }
  const repoPath = "/repos/" + encodeURIComponent(CONFIG.owner) + "/" + encodeURIComponent(CONFIG.repo);
  const contents = (p) => repoPath + "/contents/" + p.split("/").map(encodeURIComponent).join("/");

  async function getFile(path) {
    try {
      const f = await gh(contents(path) + "?ref=" + encodeURIComponent(CONFIG.branch));
      return { sha: f.sha, text: b64ToStr(f.content) };
    } catch (e) {
      if (e.status === 404) return { sha: null, text: null };
      throw e;
    }
  }
  async function putFile(path, text, sha, message) {
    const body = { message, content: strToB64(text), branch: CONFIG.branch };
    if (sha) body.sha = sha;
    const res = await gh(contents(path), { method: "PUT", body: JSON.stringify(body) });
    return res.content.sha;
  }

  // Publiczny plik z zaszyfrowanym tokenem (bez logowania)
  async function fetchKeyBlob() {
    const res = await fetch(CONFIG.keyPath + "?t=" + Date.now(), { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("admin-key.json: " + res.status);
    return res.json();
  }

  // ---------- Walidacja i czyszczenie wpisów ----------
  function clean(str, max) {
    return String(str || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0009\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "")
      .trim()
      .slice(0, max);
  }
  function validDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + "T00:00:00Z");
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
  }
  function makeId(title) {
    const base = title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "wpis";
    const rnd = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, "0")).join("");
    return base + "-" + rnd;
  }
  function buildPost(raw, id) {
    const one = (s) => clean(s, 120).replace(/\n/g, " ");
    const body = (s) => clean(s, 5000).replace(/\n{3,}/g, "\n\n");
    const post = {
      id: id || null,
      date: clean(raw.date, 10),
      title: one(raw.title),
      text: body(raw.text),
      title_en: one(raw.title_en),
      text_en: body(raw.text_en),
      tags: clean(raw.tags, 150).split(",").map((t) => t.trim().replace(/[^\p{L}\p{N} +#._-]/gu, "").slice(0, 24)).filter(Boolean).slice(0, 5),
    };
    if (!post.title) throw new Error("Podaj tytuł po polsku.");
    if (!post.text) throw new Error("Podaj treść po polsku.");
    if (!validDate(post.date)) throw new Error("Nieprawidłowa data.");
    if (!!post.title_en !== !!post.text_en) throw new Error("Wersja angielska: wypełnij i tytuł, i treść (albo zostaw oba puste).");
    if (!post.id) post.id = makeId(post.title);
    if (!post.title_en) { delete post.title_en; delete post.text_en; }
    return post;
  }
  function sanitizeList(data) {
    if (!Array.isArray(data)) return [];
    return data
      .map((p) => {
        try {
          return buildPost({ ...p, tags: Array.isArray(p.tags) ? p.tags.join(",") : "" }, typeof p.id === "string" ? p.id.replace(/[^a-z0-9-]/gi, "").slice(0, 64) : null);
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  // ---------- UI ----------
  function msg(el, text, isError) {
    el.textContent = text || "";
    el.classList.toggle("text-black", !!isError);
    el.classList.toggle("font-medium", !!isError);
  }
  function show(view) {
    ["loading", "login-view", "setup-view", "editor-view", "pass-view"].forEach((id) => $(id).classList.add("hidden"));
    if (view) $(view).classList.remove("hidden");
    $("session-actions").classList.toggle("hidden", view !== "editor-view");
    $("session-actions").classList.toggle("flex", view === "editor-view");
  }
  function setBusy(b) {
    state.busy = b;
    $("save-btn").disabled = b;
    document.querySelectorAll("[data-action]").forEach((x) => (x.disabled = b));
  }
  function resetForm() {
    state.editingId = null;
    $("post-form").reset();
    $("f-date").value = new Date().toISOString().slice(0, 10);
    $("form-title").textContent = "Nowy wpis";
    $("save-btn").textContent = "Opublikuj";
    $("cancel-edit").classList.add("hidden");
  }
  function renderList() {
    const ul = $("post-list");
    ul.replaceChildren();
    if (!state.posts.length) {
      const li = document.createElement("li");
      li.className = "py-4 text-sm text-neutral-500";
      li.textContent = "Brak wpisów.";
      ul.appendChild(li);
      return;
    }
    state.posts.forEach((p) => {
      const li = document.createElement("li");
      li.className = "flex items-start justify-between gap-4 py-4";
      const info = document.createElement("div");
      info.className = "min-w-0";
      const t = document.createElement("p");
      t.className = "truncate font-medium";
      t.textContent = p.title;
      const d = document.createElement("p");
      d.className = "text-sm text-neutral-500";
      d.textContent = p.date + (p.title_en ? " · PL + EN" : " · tylko PL");
      info.append(t, d);

      const actions = document.createElement("div");
      actions.className = "flex shrink-0 gap-3 text-sm";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.dataset.action = "edit";
      edit.className = "underline-offset-4 hover:underline disabled:opacity-40";
      edit.textContent = "edytuj";
      edit.addEventListener("click", () => startEdit(p.id));
      const del = document.createElement("button");
      del.type = "button";
      del.dataset.action = "delete";
      del.className = "text-neutral-500 underline-offset-4 hover:text-black hover:underline disabled:opacity-40";
      del.textContent = "usuń";
      del.addEventListener("click", () => removePost(p.id));
      actions.append(edit, del);
      li.append(info, actions);
      ul.appendChild(li);
    });
  }
  function startEdit(id) {
    const p = state.posts.find((x) => x.id === id);
    if (!p) return;
    state.editingId = id;
    $("f-date").value = p.date;
    $("f-title").value = p.title;
    $("f-text").value = p.text;
    $("f-title-en").value = p.title_en || "";
    $("f-text-en").value = p.text_en || "";
    $("f-tags").value = p.tags.join(", ");
    $("form-title").textContent = "Edycja wpisu";
    $("save-btn").textContent = "Zapisz zmiany";
    $("cancel-edit").classList.remove("hidden");
    $("f-title").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function explain(e) {
    if (e.status === 401) return "Token wygasł albo został usunięty. Kliknij „Nie pamiętam hasła” i ustaw nowy.";
    if (e.status === 403) return "Brak uprawnień albo limit zapytań GitHuba. Spróbuj za chwilę.";
    if (e.status === 404) return "Token nie ma dostępu do repozytorium strony.";
    if (e.status === 409 || e.status === 422) return "Plik zmienił się w międzyczasie. Odświeżyłem listę, spróbuj ponownie.";
    return e.message || "Coś poszło nie tak.";
  }

  // ---------- Wpisy ----------
  async function fetchPosts() {
    const f = await getFile(CONFIG.postsPath);
    state.postsSha = f.sha;
    state.posts = f.text ? sanitizeList(JSON.parse(f.text)) : [];
    renderList();
  }
  async function commitPosts(next, message) {
    state.postsSha = await putFile(CONFIG.postsPath, JSON.stringify(next, null, 2) + "\n", state.postsSha, message);
    state.posts = next;
    renderList();
  }
  async function removePost(id) {
    const p = state.posts.find((x) => x.id === id);
    if (!p || state.busy) return;
    if (!confirm("Usunąć wpis „" + p.title + "”?")) return;
    setBusy(true);
    try {
      await commitPosts(state.posts.filter((x) => x.id !== id), "Usuń wpis: " + p.title);
      if (state.editingId === id) resetForm();
      msg($("post-msg"), "Usunięto. Strona odświeży się za ok. minutę.");
    } catch (e) {
      msg($("post-msg"), explain(e), true);
      if (e.status === 409 || e.status === 422) await fetchPosts().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  // ---------- Logowanie / konfiguracja ----------
  async function enter(token) {
    state.token = token;
    const info = await gh(repoPath);
    if (!info.permissions || !info.permissions.push) {
      const e = new Error("Ten token nie ma prawa zapisu do repozytorium strony.");
      throw e;
    }
    await fetchPosts();
    saveSession();
    resetForm();
    show("editor-view");
    armIdleTimer();
  }
  function logout() {
    clearSession();
    state.token = null;
    state.posts = [];
    $("password").value = "";
    show("login-view");
  }
  function checkNewPassword(a, b) {
    if (a.length < CONFIG.minPassword) return "Hasło musi mieć co najmniej " + CONFIG.minPassword + " znaków.";
    if (a !== b) return "Hasła się różnią.";
    if (/^(.)\1+$/.test(a) || /^(?:0123456789|1234567890|qwertyuiop|password|haslo)/i.test(a)) return "To hasło jest za łatwe.";
    return null;
  }
  async function saveKey(token, password, message) {
    const blob = await encryptToken(token, password);
    const existing = await getFile(CONFIG.keyPath);
    await putFile(CONFIG.keyPath, JSON.stringify(blob, null, 2) + "\n", existing.sha, message);
  }

  let idleTimer;
  function armIdleTimer() {
    clearTimeout(idleTimer);
    if (!state.token) return;
    idleTimer = setTimeout(() => {
      logout();
      msg($("login-msg"), "Wylogowano po " + CONFIG.idleMinutes + " min bezczynności.");
    }, CONFIG.idleMinutes * 60 * 1000);
  }
  ["pointerdown", "keydown"].forEach((ev) => document.addEventListener(ev, armIdleTimer, { passive: true }));

  // ---------- Zdarzenia ----------
  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const out = $("login-msg");
    const wait = state.lockedUntil - Date.now();
    if (wait > 0) return msg(out, "Za dużo prób. Poczekaj " + Math.ceil(wait / 1000) + " s.", true);
    const btn = e.submitter || e.target.querySelector("button");
    btn.disabled = true;
    msg(out, "Sprawdzam…");
    try {
      const blob = await fetchKeyBlob();
      if (!blob) { show("setup-view"); return; }
      let token;
      try {
        token = await decryptToken(blob, $("password").value);
      } catch (_) {
        state.failures++;
        state.lockedUntil = Date.now() + Math.min(2 ** state.failures, 60) * 1000;
        throw new Error("Złe hasło.");
      }
      state.failures = 0;
      await enter(token);
      msg(out, "");
      $("password").value = "";
    } catch (err) {
      state.token = null;
      msg(out, err.status ? explain(err) : err.message, true);
    } finally {
      btn.disabled = false;
    }
  });

  $("setup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const out = $("setup-msg");
    const token = $("setup-token").value.trim();
    const p1 = $("setup-pass").value, p2 = $("setup-pass2").value;
    if (!TOKEN_RE.test(token)) return msg(out, "To nie wygląda na token GitHuba (zaczyna się od github_pat_).", true);
    const bad = checkNewPassword(p1, p2);
    if (bad) return msg(out, bad, true);
    const btn = e.submitter || e.target.querySelector("button");
    btn.disabled = true;
    msg(out, "Sprawdzam token i szyfruję…");
    try {
      await enter(token);
      await saveKey(token, p1, "Panel: ustaw hasło");
      e.target.reset();
      msg($("post-msg"), "Gotowe! Od teraz logujesz się samym hasłem.");
    } catch (err) {
      state.token = null;
      show("setup-view");
      msg(out, err.status ? explain(err) : err.message, true);
    } finally {
      btn.disabled = false;
    }
  });

  $("pass-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const out = $("pass-msg");
    const bad = checkNewPassword($("new-pass").value, $("new-pass2").value);
    if (bad) return msg(out, bad, true);
    const btn = e.submitter || e.target.querySelector("button");
    btn.disabled = true;
    msg(out, "Szyfruję…");
    try {
      await saveKey(state.token, $("new-pass").value, "Panel: zmiana hasła");
      e.target.reset();
      msg(out, "Hasło zmienione.");
    } catch (err) {
      msg(out, explain(err), true);
    } finally {
      btn.disabled = false;
    }
  });

  $("post-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (state.busy) return;
    const out = $("post-msg");
    let post;
    try {
      post = buildPost(
        { date: $("f-date").value, title: $("f-title").value, text: $("f-text").value, title_en: $("f-title-en").value, text_en: $("f-text-en").value, tags: $("f-tags").value },
        state.editingId
      );
    } catch (err) {
      return msg(out, err.message, true);
    }
    const editing = !!state.editingId;
    const next = editing ? state.posts.map((p) => (p.id === post.id ? post : p)) : [post, ...state.posts];
    next.sort((a, b) => b.date.localeCompare(a.date));
    setBusy(true);
    msg(out, "Zapisuję…");
    try {
      await commitPosts(next, (editing ? "Edytuj wpis: " : "Nowy wpis: ") + post.title);
      resetForm();
      msg(out, "Gotowe. Strona odświeży się za ok. minutę.");
    } catch (err) {
      msg(out, explain(err), true);
      if (err.status === 409 || err.status === 422) await fetchPosts().catch(() => {});
    } finally {
      setBusy(false);
    }
  });

  $("forgot").addEventListener("click", () => {
    $("setup-title").textContent = "Nowe hasło";
    $("back-to-login").classList.remove("hidden");
    show("setup-view");
  });
  $("back-to-login").addEventListener("click", () => show("login-view"));
  $("change-pass").addEventListener("click", () => $("pass-view").classList.toggle("hidden"));
  $("cancel-edit").addEventListener("click", resetForm);
  $("logout").addEventListener("click", logout);

  // ---------- Start ----------
  (async function start() {
    const saved = loadSession();
    if (saved) {
      try { await enter(saved); return; } catch (_) { clearSession(); }
    }
    try {
      show((await fetchKeyBlob()) ? "login-view" : "setup-view");
    } catch (_) {
      show("login-view");
    }
  })();
})();
