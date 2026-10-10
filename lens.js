// Soczewka rybie oko nad napisem MOVO.
// Tło hero (kropki + napis) jest odtwarzane w ukrytym canvasie, a soczewka
// co klatkę pobiera z niego piksele przez mapę zniekształcenia beczkowego —
// dokładnie tak, jak obiektyw 360° wygina obraz. Działa w każdej przeglądarce.
//
// Użycie: sekcja z [data-lens-host], napis z [data-lens-text].

(function () {
  const host = document.querySelector("[data-lens-host]");
  const word = host && host.querySelector("[data-lens-text]");
  if (!word || !document.createElement("canvas").getContext) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const BG = [244, 244, 243];
  const INK = "rgb(11,11,12)";
  const DOT = "rgba(0,0,0,0.16)";
  const GRID = 28; // musi się zgadzać z .lens-host w styles.css
  const BG32 = (255 << 24) | (BG[2] << 16) | (BG[1] << 8) | BG[0];

  const lens = document.createElement("div");
  lens.className = "lens";
  lens.setAttribute("aria-hidden", "true");
  const cv = document.createElement("canvas");
  const glass = document.createElement("div");
  glass.className = "lens-glass";
  lens.append(cv, glass);
  host.appendChild(lens);
  const out2d = cv.getContext("2d");

  let W, H, SS, dpr, srcW, srcH, src8, text;
  let size, R, D, out, out32, mapX, mapY, inside;
  const pos = { x: 0, y: 0 };
  let target = { x: 0, y: 0 };
  let pointer = null, raf = 0, running = false, last = { x: NaN, y: NaN };

  // ---------- Kopia tła: kropki + napis ----------
  function buildSource() {
    const hr = host.getBoundingClientRect();
    W = hr.width;
    H = hr.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    SS = Math.min(dpr * 1.6, 3); // wyższa rozdzielczość, bo w środku jest powiększenie
    srcW = Math.ceil(W * SS);
    srcH = Math.ceil(H * SS);

    const c = document.createElement("canvas");
    c.width = srcW;
    c.height = srcH;
    const g = c.getContext("2d");
    g.scale(SS, SS);
    g.fillStyle = "rgb(" + BG + ")";
    g.fillRect(0, 0, W, H);
    g.fillStyle = DOT;
    for (let y = GRID / 2; y < H; y += GRID) {
      for (let x = GRID / 2; x < W; x += GRID) {
        g.beginPath();
        g.arc(x, y, 1.1, 0, Math.PI * 2);
        g.fill();
      }
    }

    const cs = getComputedStyle(word);
    const fs = parseFloat(cs.fontSize);
    const ls = parseFloat(cs.letterSpacing) || 0;
    const lh = parseFloat(cs.lineHeight) || fs;
    g.font = cs.fontWeight + " " + fs + "px " + cs.fontFamily;
    g.fillStyle = INK;
    g.textBaseline = "alphabetic";
    const m = g.measureText("M");
    const asc = m.fontBoundingBoxAscent || fs * 1.05;
    const desc = m.fontBoundingBoxDescent || fs * 0.35;
    const wr = word.getBoundingClientRect();
    const x0 = wr.left - hr.left + (parseFloat(cs.paddingLeft) || 0);
    const top = wr.top - hr.top + (parseFloat(cs.paddingTop) || 0);
    const base = top + (lh - (asc + desc)) / 2 + asc;
    let x = x0;
    for (const ch of word.textContent.trim()) {
      g.fillText(ch, x, base);
      x += g.measureText(ch).width + ls;
    }
    text = { x: x0, y: top, w: x - ls - x0, h: lh };
    // wszystko jest w odcieniach szarości, więc wystarczy jeden kanał
    const rgba = g.getImageData(0, 0, srcW, srcH).data;
    src8 = new Uint8Array(srcW * srcH);
    for (let i = 0, n = src8.length; i < n; i++) src8[i] = rgba[i * 4];
  }

  // ---------- Mapa zniekształcenia (rybie oko) ----------
  // Dla piksela w odległości r od środka (0…1) bierzemy obraz z odległości
  // r·(0.62 + 0.63·r³): środek powiększony ~1.6×, a przy krawędzi soczewka
  // „zagina” obraz spoza siebie — jak prawdziwa szklana kula.
  function buildLens() {
    size = Math.round(Math.min(Math.max(W * 0.24, 150), 340));
    R = size / 2;
    D = Math.round(size * Math.min(dpr, 1.5)); // limit, żeby słabsze telefony nie gubiły klatek
    cv.width = D;
    cv.height = D;
    lens.style.width = lens.style.height = size + "px";
    out = out2d.createImageData(D, D);
    out32 = new Uint32Array(out.data.buffer);
    mapX = new Int32Array(D * D);
    mapY = new Int32Array(D * D);
    inside = new Uint8Array(D * D);
    for (let j = 0, k = 0; j < D; j++) {
      const ny = ((j + 0.5) / D) * 2 - 1;
      for (let i = 0; i < D; i++, k++) {
        const nx = ((i + 0.5) / D) * 2 - 1;
        const r2 = nx * nx + ny * ny;
        if (r2 > 1) continue;
        const r = Math.sqrt(r2);
        const s = 0.62 + 0.63 * r2 * r;
        inside[k] = 1;
        // stałoprzecinkowo (×256) — do interpolacji dwuliniowej
        mapX[k] = Math.round(nx * s * R * SS * 256);
        mapY[k] = Math.round(ny * s * R * SS * 256);
      }
    }
    last.x = NaN;
  }

  function render() {
    if (Math.abs(pos.x - last.x) < 0.05 && Math.abs(pos.y - last.y) < 0.05) return;
    last = { x: pos.x, y: pos.y };
    const cx = Math.round(pos.x * SS * 256);
    const cy = Math.round(pos.y * SS * 256);
    const maxX = srcW - 1, maxY = srcH - 1;
    for (let k = 0, n = D * D; k < n; k++) {
      if (!inside[k]) { out32[k] = 0; continue; }
      const fx = cx + mapX[k];
      const fy = cy + mapY[k];
      const x0 = fx >> 8, y0 = fy >> 8;
      if (x0 < 0 || y0 < 0 || x0 >= maxX || y0 >= maxY) { out32[k] = BG32; continue; }
      const ax = fx & 255, ay = fy & 255;
      const i = y0 * srcW + x0;
      const top = src8[i] * (256 - ax) + src8[i + 1] * ax;
      const bot = src8[i + srcW] * (256 - ax) + src8[i + srcW + 1] * ax;
      const v = (top * (256 - ay) + bot * ay) >> 16;
      out32[k] = 0xff000000 | (v << 16) | (v << 8) | v;
    }
    out2d.putImageData(out, 0, 0);
    lens.style.transform = "translate3d(" + (pos.x - R) + "px," + (pos.y - R) + "px,0)";
  }

  // ---------- Ruch ----------
  function drift(t) {
    return {
      x: text.x + text.w * (0.5 + 0.46 * Math.sin(t / 4300)),
      y: text.y + text.h * (0.5 + 0.55 * Math.sin(t / 2900 + 1.3)),
    };
  }
  function tick(t) {
    if (!pointer) target = drift(t);
    pos.x += (target.x - pos.x) * 0.075;
    pos.y += (target.y - pos.y) * 0.075;
    render();
    raf = requestAnimationFrame(tick);
  }
  function start() {
    if (running || reduced) return;
    running = true;
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function setPointer(e) {
    const hr = host.getBoundingClientRect();
    pointer = { x: e.clientX - hr.left, y: e.clientY - hr.top };
    target = pointer;
    if (reduced) { pos.x = target.x; pos.y = target.y; render(); }
  }
  host.addEventListener("pointermove", setPointer, { passive: true });
  host.addEventListener("pointerdown", setPointer, { passive: true });
  host.addEventListener("pointerleave", () => (pointer = null), { passive: true });

  function rebuild() {
    buildSource();
    buildLens();
    if (!pos.x) {
      const p = drift(performance.now());
      pos.x = p.x;
      pos.y = p.y;
    }
    render();
  }

  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(rebuild, 200);
  });

  // ---------- Start: po wczytaniu fontu i animacji wejścia ----------
  const fontReady = document.fonts && document.fonts.load ? document.fonts.load("800 100px Poppins").catch(() => {}) : Promise.resolve();
  fontReady
    .then(() => new Promise((r) => setTimeout(r, 1000)))
    .then(() => {
      rebuild();
      lens.classList.add("is-on");
      if ("IntersectionObserver" in window) {
        new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? start() : stop()))).observe(host);
      } else start();
      document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
    });
})();
