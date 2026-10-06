/**
 * Tanıtım videosu kayıt düzeneği (2026-10-06).
 * Gerçek uygulamayı Playwright ile sürer; sayfaya sahte imleç + "kamera" (yakınlaş/uzaklaş) enjekte eder,
 * CDP screencast karelerini zaman damgasıyla toplar ve ffmpeg ile sabit kare hızlı mp4'e çevirir.
 *
 * Kamera html öğesine transform uygular: tarayıcı her yakınlıkta vektörel çizdiği için görüntü net kalır.
 * İmleç sayfanın içinde olduğu için kamerayla birlikte büyür (ekran kaydı uygulamalarındaki gibi).
 */
import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";

export const BASE = process.env.BASE || "http://localhost:3100";
/** Ağır çekim: sahne bu hızda oynar, kayıt sonra normal hıza getirilir (2x kare yakalama ~19 fps) */
export const RATE = Number(process.env.RATE || 0.4);
const R = (ms) => Math.round(ms / RATE);

const DIRECTOR = () => {
  const install = () => {
    if (document.getElementById("__cur")) return;
    const st = document.createElement("style");
    st.textContent = `
      nextjs-portal{display:none!important}
      html.__cam{transform-origin:0 0;will-change:transform;overflow:hidden}
      #__cur{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:26px;height:26px;
        transform:translate(-100px,-100px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
      .__rip{position:fixed;z-index:2147483646;pointer-events:none;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;
        background:rgba(232,135,58,.35);border:2px solid rgba(232,135,58,.9);animation:__rip .55s ease-out forwards}
      @keyframes __rip{from{transform:scale(.2);opacity:1}to{transform:scale(1.25);opacity:0}}
      *{scrollbar-width:none!important}
      ::-webkit-scrollbar{display:none!important}
    `;
    document.documentElement.appendChild(st);
    const c = document.createElement("div");
    c.id = "__cur";
    c.innerHTML = `<svg viewBox="0 0 26 26" width="26" height="26"><path d="M5 2.5v19.2l4.9-4.7 3.2 7.3 3.3-1.4-3.1-7.2h6.9z" fill="#0f2a26" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    document.documentElement.appendChild(c);
    document.documentElement.classList.add("__cam");
  };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const cam = { s: 1, tx: 0, ty: 0 };
  const cur = { x: -100, y: -100 };
  const apply = () => { document.documentElement.style.transform = `translate(${cam.tx}px,${cam.ty}px) scale(${cam.s})`; };
  const tween = (ms, fn) => new Promise((res) => {
    // rAF zaman damgası ağır çekimden etkilenir; gerçek saat kullan
    const t0 = performance.now();
    const step = () => { const t = Math.min(1, (performance.now() - t0) / ms); fn(ease(t)); t < 1 ? requestAnimationFrame(step) : res(); };
    requestAnimationFrame(step);
  });
  window.__dir = {
    install,
    // Ekran (dönüştürülmüş) koordinatını sayfa koordinatına çevir
    toPage: (x, y) => ({ x: (x - cam.tx) / cam.s, y: (y - cam.ty) / cam.s }),
    cam: () => ({ ...cam }),
    cursorAt: (x, y) => { install(); cur.x = x; cur.y = y; document.getElementById("__cur").style.transform = `translate(${x - 5}px,${y - 2}px)`; },
    moveTo: async (x, y, ms = 700) => {
      install();
      const a = { ...cur }; const el = document.getElementById("__cur");
      // Hafif kavisli yol, gerçek el hareketi gibi
      const mx = (a.x + x) / 2 + (y - a.y) * 0.12, my = (a.y + y) / 2 - (x - a.x) * 0.12;
      await tween(ms, (t) => {
        const u = 1 - t;
        cur.x = u * u * a.x + 2 * u * t * mx + t * t * x; cur.y = u * u * a.y + 2 * u * t * my + t * t * y;
        el.style.transform = `translate(${cur.x - 5}px,${cur.y - 2}px)`;
      });
    },
    ripple: (rate = 1) => {
      const r = document.createElement("div"); r.className = "__rip";
      r.style.left = cur.x + "px"; r.style.top = cur.y + "px";
      document.documentElement.appendChild(r); setTimeout(() => r.remove(), 700 / rate);
      const el = document.getElementById("__cur");
      el.animate([{ scale: 1 }, { scale: 0.82 }, { scale: 1 }], { duration: 260 });
    },
    // Kamerayı sayfa koordinatındaki (cx, cy) noktasına s yakınlıkla getir; kenar dışı görünmesin
    camera: async (s, cx, cy, ms = 1100) => {
      install();
      const vw = innerWidth, vh = innerHeight;
      let tx = vw / 2 - s * cx, ty = vh / 2 - s * cy;
      tx = Math.min(0, Math.max(vw - s * vw, tx)); ty = Math.min(0, Math.max(vh - s * vh, ty));
      const a = { ...cam };
      await tween(ms, (t) => { cam.s = a.s + (s - a.s) * t; cam.tx = a.tx + (tx - a.tx) * t; cam.ty = a.ty + (ty - a.ty) * t; apply(); });
    },
  };
  if (document.readyState !== "loading") install(); else addEventListener("DOMContentLoaded", install);
};

export async function open({ mobile = false, scale = 2 } = {}) {
  const b = await chromium.launch({ channel: "chromium" });
  const ctx = await b.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: scale, serviceWorkers: "block" });
  await ctx.addInitScript(DIRECTOR);
  if (mobile) await ctx.addInitScript(() => { addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = "#__cur{opacity:0!important}.__rip{width:56px;height:56px;margin:-28px 0 0 -28px;background:rgba(15,42,38,.18);border-color:rgba(15,42,38,.35)}"; document.documentElement.appendChild(st); }); });
  const page = await ctx.newPage();
  page.__scale = mobile ? 2 : scale;
  return { b, ctx, page };
}

/** CSS animasyonlarını ve geçişlerini ağır çekime al (her sayfa yüklemesinden sonra tekrar) */
export async function slow(page) {
  const cdp = page.__cdp || (page.__cdp = await page.context().newCDPSession(page));
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: RATE });
}
export async function go(page, path) {
  await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
  await slow(page);
}

export async function login(page, user, pw, path = "/login") {
  await page.goto(BASE + path);
  await page.fill('input[placeholder="0555 123 45 67"]', user);
  await page.fill('input[placeholder="Şifreniz"]', pw);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });
}

/** Ekran kaydı: arka arkaya tam çözünürlüklü ekran görüntüsü (screencast başsız modda 1x veriyor) */
export async function startRec(page, dir) {
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  const vp = page.viewportSize();
  const SCALE = page.__scale || 2;
  await slow(page);
  let on = true, paused = false, pausedAt = 0, offset = 0;
  const loop = (async () => {
    while (on) {
      if (paused) { await new Promise((r) => setTimeout(r, 20)); continue; }
      const t = performance.now() / 1000 - offset;
      try {
        const r = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 90, clip: { x: 0, y: 0, width: vp.width, height: vp.height, scale: SCALE } });
        writeFileSync(`${dir}/${String(frames.length).padStart(5, "0")}.jpg`, Buffer.from(r.data, "base64"));
        frames.push(t);
      } catch { await new Promise((r) => setTimeout(r, 30)); }
    }
  })();
  return {
    /** Bekleme anlarını kesip atmak için (sunucu yanıtı vb.) */
    pause() { paused = true; pausedAt = performance.now() / 1000; },
    resume() { if (paused) { offset += performance.now() / 1000 - pausedAt; paused = false; } },
    async stop() {
      await page.waitForTimeout(300);
      on = false; await loop;
      const t = frames.map((x) => (x - frames[0]) * RATE);
      const end = t[t.length - 1] + 0.05;
      const lines = [];
      for (let i = 0; i < frames.length; i++) {
        lines.push(`file '${String(i).padStart(5, "0")}.jpg'`);
        lines.push(`duration ${((i + 1 < t.length ? t[i + 1] : end) - t[i]).toFixed(4)}`);
      }
      lines.push(`file '${String(frames.length - 1).padStart(5, "0")}.jpg'`);
      writeFileSync(`${dir}/list.txt`, lines.join("\n"));
      return { count: frames.length, seconds: end };
    },
  };
}

/** Kareleri sabit 30 fps mp4'e çevir. trim: [başla, bitir] saniye */
export function encode(dir, out, { width = 1600, trim, crf = 24 } = {}) {
  const vf = [`fps=30`, trim ? `trim=${trim[0]}:${trim[1]},setpts=PTS-STARTPTS` : null, `scale=${width}:-2:flags=lanczos`, "format=yuv420p"].filter(Boolean).join(",");
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`, "-vf", vf,
    "-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-movflags", "+faststart", "-an", out]);
}

// ─── Sahne yardımcıları ──────────────────────────────────────────────────────
export const wait = (page, ms) => page.waitForTimeout(R(ms));

/** Öğenin ekran üzerindeki merkezi (sayfa koordinatına çevrilmiş) */
async function centerOf(page, loc) {
  const r = await loc.boundingBox();
  if (!r) throw new Error("öğe görünmüyor");
  return page.evaluate(([x, y]) => window.__dir.toPage(x, y), [r.x + r.width / 2, r.y + r.height / 2]);
}

export async function cursorStart(page, x, y) { await page.evaluate(([x, y]) => window.__dir.cursorAt(x, y), [x, y]); }

/** İmleci öğeye götür (gerçek fare de gider, hover efektleri çalışır) */
export async function hover(page, loc, ms = 800) {
  // Yakınlaşmışken kaydırma html'i yana iter (sol taraf boş görünür): sadece normal görünümde kaydır
  if ((await page.evaluate(() => window.__dir.cam().s)) === 1) await loc.scrollIntoViewIfNeeded().catch(() => {});
  await page.evaluate(() => { document.documentElement.scrollLeft = 0; document.body.scrollLeft = 0; });
  const p = await centerOf(page, loc);
  const r = await loc.boundingBox();
  await Promise.all([
    page.evaluate(([x, y, ms]) => window.__dir.moveTo(x, y, ms), [p.x, p.y, R(ms)]),
    page.mouse.move(r.x + r.width / 2, r.y + r.height / 2, { steps: 4 }),
  ]);
}

export async function click(page, loc, ms = 800) {
  await hover(page, loc, ms);
  await page.waitForTimeout(R(150));
  await page.evaluate((rate) => window.__dir.ripple(rate), RATE);
  await page.mouse.down(); await page.waitForTimeout(R(70)); await page.mouse.up();
}

/** Yazıyı tuş tuş yaz */
export async function type(page, loc, text, delay = 55) {
  await click(page, loc);
  await page.keyboard.type(text, { delay: R(delay) });
}

/** Kamera: öğeye ya da sayfa noktasına yakınlaş */
export async function zoomTo(page, target, s = 1.6, ms = 1100, { centerX = false } = {}) {
  let p = target;
  if (typeof target.boundingBox === "function") p = await centerOf(page, target);
  if (centerX) p = { x: page.viewportSize().width / 2, y: p.y };
  await page.evaluate(([s, x, y, ms]) => window.__dir.camera(s, x, y, ms), [s, p.x, p.y, R(ms)]);
}
export async function zoomOut(page, ms = 1000) { await page.evaluate((ms) => window.__dir.camera(1, innerWidth / 2, innerHeight / 2, ms), R(ms)); }

/** Ekran koordinatına (dönüştürülmüş) tıkla: tablo hücresi gibi metinle bulunamayan yerler */
export async function clickAt(page, x, y, ms = 800) {
  const p = await page.evaluate(([x, y]) => window.__dir.toPage(x, y), [x, y]);
  await Promise.all([
    page.evaluate(([x, y, ms]) => window.__dir.moveTo(x, y, ms), [p.x, p.y, R(ms)]),
    page.mouse.move(x, y, { steps: 4 }),
  ]);
  await page.waitForTimeout(R(150));
  await page.evaluate((rate) => window.__dir.ripple(rate), RATE);
  await page.mouse.down(); await page.waitForTimeout(R(70)); await page.mouse.up();
}

/** Satır (kişi adı) × sütun (gün başlığı) kesişiminin ekran koordinatı */
export async function cellOf(page, person, dayLabel) {
  const r = await page.getByText(person, { exact: true }).first().boundingBox();
  const c = await page.getByText(dayLabel, { exact: true }).first().boundingBox();
  return { x: c.x + c.width / 2, y: r.y + r.height / 2 };
}
