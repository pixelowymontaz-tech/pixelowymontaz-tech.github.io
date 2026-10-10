// Panel admina MOVO.
//
// GitHub Pages to hosting statyczny — nie ma serwera ani bazy danych (więc nie ma też
// czego atakować SQL injection). Uwierzytelnianie i autoryzację robi GitHub:
// panel zapisuje posts.json w repozytorium przez GitHub API, a zapis jest możliwy
// tylko tokenem z prawem zapisu do tego repo. Ten plik nie zawiera żadnych sekretów.

(function () {
  // Uzupełnij, żeby nie wpisywać za każdym razem (to nie są dane tajne):
  const CONFIG = {
    owner: "pixelowymontaz-tech",
    repo: "pixelowymontaz-tech.github.io",
    branch: "main",
    path: "posts.json",
    idleMinutes: 30,  // automatyczne wylogowanie po bezczynności
  };

  const API = "https://api.github.com";
  const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
  const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
  const TOKEN_RE = /^(github_pat_|ghp_)[A-Za-z0-9_]{20,250}$/;
  const SS_KEY = "movo-admin";

  const $ = (id) => document.getElementById(id);
  const state = { token: null, owner: CONFIG.owner, repo: CONFIG.repo, posts: [], sha: null, editingId: null, busy: false };

  // ---------- Storage (tylko sessionStorage, z zabezpieczeniem) ----------
  function saveSession() {
    try {
      sessionStorage.setItem(SS_KEY, JSON.stringify({ token: state.token, owner: state.owner, repo: state.repo }));
    } catch (_) {}
  }
  function loadSession() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SS_KEY) || "null");
      if (s && TOKEN_RE.test(s.token) && OWNER_RE.test(s.owner) && REPO_RE.test(s.repo)) return s;
    } catch (_) {}
    return null;
  }
  function clearSession() {
    try { sessionStorage.removeItem(SS_KEY); } catch (_) {}
  }

  // ---------- Base64 <-> UTF-8 ----------
  function toB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function fromB64(b64) {
    const bin = atob(b64.replace(/\s/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }

  // ---------- GitHub API ----------
  async function gh(path, opts) {
    opts = opts || {};
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + state.token,
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (opts.body) headers["Content-Type"] = "application/json";
    const res = await fetch(API + path, { method: opts.method || "GET", headers, body: opts.body, cache: "no-store", referrerPolicy: "no-referrer" });
    if (!res.ok) {
      const err = new Error("GitHub " + res.status);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }
  const repoPath = () => "/repos/" + encodeURIComponent(state.owner) + "/" + encodeURIComponent(state.repo);
  const contentsPath = () => repoPath() + "/contents/" + CONFIG.path.split("/").map(encodeURIComponent).join("/");

  // ---------- Walidacja i czyszczenie danych ----------
  // usuwa znaki kontrolne (poza \n) i normalizuje końce linii
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
    const base = title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ł/g, "l")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "wpis";
    const rnd = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, "0")).join("");
    return base + "-" + rnd;
  }
  function buildPost(raw, id) {
    const title = clean(raw.title, 120).replace(/\n/g, " ");
    const text = clean(raw.text, 5000).replace(/\n{3,}/g, "\n\n");
    const date = clean(raw.date, 10);
    const tags = clean(raw.tags, 150)
      .split(",")
      .map((t) => t.trim().replace(/[^\p{L}\p{N} +#._-]/gu, "").slice(0, 24))
      .filter(Boolean)
      .slice(0, 5);
    if (!title) throw new Error("Podaj tytuł.");
    if (!text) throw new Error("Podaj treść.");
    if (!validDate(date)) throw new Error("Nieprawidłowa data.");
    return { id: id || makeId(title), date, title, text, tags };
  }
  function sanitizeList(data) {
    if (!Array.isArray(data)) return [];
    return data
      .map((p) => {
        try {
          return buildPost({ title: p.title, text: p.text, date: p.date, tags: (p.tags || []).join(",") }, typeof p.id === "string" ? p.id.slice(0, 64) : null);
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
  function setBusy(b) {
    state.busy = b;
    $("save-btn").disabled = b;
    document.querySelectorAll("[data-action]").forEach((x) => (x.disabled = b));
  }
  function showEditor(on) {
    $("login-view").classList.toggle("hidden", on);
    $("editor-view").classList.toggle("hidden", !on);
    $("logout").classList.toggle("hidden", !on);
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
      d.textContent = p.date;
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
    $("f-title").value = p.title;
    $("f-date").value = p.date;
    $("f-text").value = p.text;
    $("f-tags").value = p.tags.join(", ");
    $("form-title").textContent = "Edycja wpisu";
    $("save-btn").textContent = "Zapisz zmiany";
    $("cancel-edit").classList.remove("hidden");
    $("f-title").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- Operacje ----------
  async function fetchPosts() {
    try {
      const file = await gh(contentsPath() + "?ref=" + encodeURIComponent(CONFIG.branch));
      state.sha = file.sha;
      state.posts = sanitizeList(JSON.parse(fromB64(file.content)));
    } catch (e) {
      if (e.status === 404) {
        state.sha = null;
        state.posts = [];
      } else throw e;
    }
    renderList();
  }

  async function commit(newPosts, message) {
    const body = {
      message: message,
      content: toB64(JSON.stringify(newPosts, null, 2) + "\n"),
      branch: CONFIG.branch,
    };
    if (state.sha) body.sha = state.sha;
    const res = await gh(contentsPath(), { method: "PUT", body: JSON.stringify(body) });
    state.sha = res.content.sha;
    state.posts = newPosts;
    renderList();
  }

  function explain(e) {
    if (e.status === 401) return "Token jest nieprawidłowy albo wygasł.";
    if (e.status === 403) return "Brak uprawnień albo limit zapytań GitHuba. Spróbuj za chwilę.";
    if (e.status === 404) return "Nie znaleziono repozytorium (albo token nie ma do niego dostępu).";
    if (e.status === 409 || e.status === 422) return "Plik zmienił się w międzyczasie. Odświeżyłem listę, spróbuj ponownie.";
    return e.message || "Coś poszło nie tak.";
  }

  async function login(token, owner, repo) {
    state.token = token;
    state.owner = owner;
    state.repo = repo;
    const info = await gh(repoPath());
    if (!info.permissions || !info.permissions.push) {
      const err = new Error("Ten token nie ma prawa zapisu do repozytorium.");
      throw err;
    }
    await fetchPosts();
    saveSession();
    resetForm();
    showEditor(true);
    armIdleTimer();
  }

  function logout() {
    clearSession();
    state.token = null;
    state.posts = [];
    state.sha = null;
    $("token").value = "";
    showEditor(false);
  }

  async function removePost(id) {
    const p = state.posts.find((x) => x.id === id);
    if (!p || state.busy) return;
    if (!confirm("Usunąć wpis „" + p.title + "”?")) return;
    setBusy(true);
    try {
      await commit(state.posts.filter((x) => x.id !== id), "Usuń wpis: " + p.title);
      if (state.editingId === id) resetForm();
      msg($("post-msg"), "Usunięto. Strona odświeży się za ok. minutę.");
    } catch (e) {
      msg($("post-msg"), explain(e), true);
      if (e.status === 409 || e.status === 422) await fetchPosts().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  // ---------- Automatyczne wylogowanie ----------
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
    const owner = $("owner").value.trim();
    const repo = $("repo").value.trim();
    const token = $("token").value.trim();
    const out = $("login-msg");
    if (!OWNER_RE.test(owner)) return msg(out, "Nieprawidłowa nazwa użytkownika.", true);
    if (!REPO_RE.test(repo)) return msg(out, "Nieprawidłowa nazwa repozytorium.", true);
    if (!TOKEN_RE.test(token)) return msg(out, "To nie wygląda na token GitHuba.", true);

    const btn = e.submitter || e.target.querySelector("button");
    btn.disabled = true;
    msg(out, "Sprawdzam…");
    try {
      await login(token, owner, repo);
      msg(out, "");
    } catch (err) {
      state.token = null;
      msg(out, err.status ? explain(err) : err.message, true);
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
        { title: $("f-title").value, text: $("f-text").value, date: $("f-date").value, tags: $("f-tags").value },
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
      await commit(next, (editing ? "Edytuj wpis: " : "Nowy wpis: ") + post.title);
      resetForm();
      msg(out, "Gotowe. Strona odświeży się za ok. minutę.");
    } catch (err) {
      msg(out, explain(err), true);
      if (err.status === 409 || err.status === 422) await fetchPosts().catch(() => {});
    } finally {
      setBusy(false);
    }
  });

  $("cancel-edit").addEventListener("click", resetForm);
  $("logout").addEventListener("click", logout);

  // ---------- Start ----------
  $("owner").value = CONFIG.owner;
  $("repo").value = CONFIG.repo;
  const s = loadSession();
  if (s) {
    login(s.token, s.owner, s.repo).catch(() => {
      clearSession();
      showEditor(false);
    });
  }
})();
