/**
 * Tanıtım videosu kayıt düzeneği (2026-10-06, 2. sürüm).
 * Gerçek uygulamayı Playwright ile sürer; sayfaya sahte imleç + "kamera" enjekte eder ve kareleri 2x çözünürlükte yakalar.
 *
 * - Kamera html öğesine transform uygular (her yakınlıkta vektörel, net). Takip modunda imleci yumuşakça izler:
 *   yakınlaşmışken imleç ekranda gezdikçe görüntü de kayar (ekran kaydı uygulamalarındaki gibi).
 * - Ağır çekim: sahne RATE hızında oynar (CSS animasyonları Animation.setPlaybackRate ile), kareler gerçek zamanda
 *   toplanır, çıktı zamanı = gerçek zaman × RATE. Kare yakalama ~19/sn olduğu için RATE 0.2 → ~95 kare/sn, çıktı 60 fps.
 * - Sahne kodundaki tüm süreler ÇIKTI süresidir (ms); R() gerçek zamana çevirir.
 */
import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";

export const BASE = process.env.BASE || "http://localhost:3100";
export const RATE = Number(process.env.RATE || 0.2);
const R = (ms) => Math.round(ms / RATE);

const DIRECTOR = (RATE) => {
  const install = () => {
    if (document.getElementById("__cur")) return;
    const st = document.createElement("style");
    st.textContent = `
      nextjs-portal{display:none!important}
      html.__cam{transform-origin:0 0;will-change:transform;overflow:hidden}
      #__cur{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:30px;height:30px;
        transform:translate(-100px,-100px);filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))}
      #__cur svg{transition:transform .12s}
      #__cur.down svg{transform:scale(.78)}
      .__rip{position:fixed;z-index:2147483646;pointer-events:none;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;
        border:3px solid rgba(232,135,58,.95);background:rgba(232,135,58,.18);animation:__rip .7s cubic-bezier(.2,.7,.2,1) forwards}
      @keyframes __rip{from{transform:scale(.25);opacity:1}to{transform:scale(1.15);opacity:0}}
      #__hud{position:fixed;left:0;top:0;z-index:2147483645;pointer-events:none;transform-origin:0 0}
      #__cap{position:absolute;left:50%;bottom:40px;transform:translate(-50%,14px);opacity:0;transition:opacity .45s,transform .45s cubic-bezier(.2,.7,.2,1);
        background:rgba(12,34,31,.92);color:#fff;font:600 27px/1.25 Inter,system-ui,sans-serif;letter-spacing:-.01em;padding:15px 26px;border-radius:999px;
        box-shadow:0 18px 40px -12px rgba(0,0,0,.45);white-space:nowrap;display:flex;align-items:center;gap:10px}
      #__cap.on{opacity:1;transform:translate(-50%,0)}
      #__cap b{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:#e8873a;color:#0c221f;font-size:16px}
      *{scrollbar-width:none!important}
      ::-webkit-scrollbar{display:none!important}
    `;
    document.documentElement.appendChild(st);
    const c = document.createElement("div");
    c.id = "__cur";
    c.innerHTML = `<svg viewBox="0 0 26 26" width="30" height="30"><path d="M5 2.5v19.2l4.9-4.7 3.2 7.3 3.3-1.4-3.1-7.2h6.9z" fill="#0f2a26" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/></svg>`;
    document.documentElement.appendChild(c);
    // Başlık katmanı: kameranın tersine dönüştürülür, hep ekranın altında sabit görünür
    const hud = document.createElement("div");
    hud.id = "__hud";
    hud.style.width = innerWidth + "px"; hud.style.height = innerHeight + "px";
    hud.innerHTML = `<div id="__cap"></div>`;
    document.documentElement.appendChild(hud);
    document.documentElement.classList.add("__cam");
  };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const cur = { x: -100, y: -100 };
  // Kamera: merkez (cx, cy) sayfa koordinatı, s yakınlık. Hedefe üstel yumuşatmayla gider.
  const cam = { s: 1, cx: innerWidth / 2, cy: innerHeight / 2, tx: 0, ty: 0 };
  const tgt = { s: 1, cx: innerWidth / 2, cy: innerHeight / 2, follow: false, pan: 0.3, zoom: 0.42 };
  const clampC = (s, cx, cy) => {
    const hw = innerWidth / (2 * s), hh = innerHeight / (2 * s);
    return [Math.min(innerWidth - hw, Math.max(hw, cx)), Math.min(innerHeight - hh, Math.max(hh, cy))];
  };
  const apply = () => {
    const [cx, cy] = clampC(cam.s, cam.cx, cam.cy);
    cam.tx = innerWidth / 2 - cam.s * cx; cam.ty = innerHeight / 2 - cam.s * cy;
    document.documentElement.style.transform = `translate(${cam.tx}px,${cam.ty}px) scale(${cam.s})`;
    const hud = document.getElementById("__hud");
    if (hud) hud.style.transform = `scale(${1 / cam.s}) translate(${-cam.tx}px,${-cam.ty}px)`;
  };
  let last = performance.now();
  const loop = () => {
    const now = performance.now();
    const dt = ((now - last) / 1000) * RATE; // çıktı saniyesi
    last = now;
    if (tgt.follow) { tgt.cx = cur.x; tgt.cy = cur.y; }
    const a = 1 - Math.exp(-dt / tgt.pan), z = 1 - Math.exp(-dt / tgt.zoom);
    cam.s += (tgt.s - cam.s) * z;
    const [tcx, tcy] = clampC(cam.s, tgt.cx, tgt.cy);
    cam.cx += (tcx - cam.cx) * a; cam.cy += (tcy - cam.cy) * a;
    if (document.documentElement.classList.contains("__cam")) apply();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const tween = (ms, fn) => new Promise((res) => {
    const t0 = performance.now();
    const step = () => { const t = Math.min(1, (performance.now() - t0) / ms); fn(ease(t)); t < 1 ? requestAnimationFrame(step) : res(); };
    requestAnimationFrame(step);
  });
  window.__dir = {
    install,
    toPage: (x, y) => ({ x: (x - cam.tx) / cam.s, y: (y - cam.ty) / cam.s }),
    cam: () => ({ ...cam }),
    cursor: () => ({ ...cur }),
    // Kamera hedefe oturdu mu (tıklamadan önce: kayarken tıklanan yer değişir)
    settled: () => {
      const [tcx, tcy] = clampC(cam.s, tgt.follow ? cur.x : tgt.cx, tgt.follow ? cur.y : tgt.cy);
      return Math.abs(cam.s - tgt.s) < 0.01 && Math.hypot(cam.cx - tcx, cam.cy - tcy) < 2;
    },
    cursorAt: (x, y) => { install(); cur.x = x; cur.y = y; document.getElementById("__cur").style.transform = `translate(${x - 6}px,${y - 3}px)`; },
    moveTo: async (x, y, ms) => {
      install();
      const a = { ...cur }; const el = document.getElementById("__cur");
      const mx = (a.x + x) / 2 + (y - a.y) * 0.1, my = (a.y + y) / 2 - (x - a.x) * 0.1;
      await tween(ms, (t) => {
        const u = 1 - t;
        cur.x = u * u * a.x + 2 * u * t * mx + t * t * x; cur.y = u * u * a.y + 2 * u * t * my + t * t * y;
        el.style.transform = `translate(${cur.x - 6}px,${cur.y - 3}px)`;
      });
    },
    press: (down) => document.getElementById("__cur").classList.toggle("down", down),
    ripple: () => {
      const r = document.createElement("div"); r.className = "__rip";
      r.style.left = cur.x + "px"; r.style.top = cur.y + "px";
      document.documentElement.appendChild(r); setTimeout(() => r.remove(), 900 / RATE);
    },
    caption: (text, n) => {
      install();
      const c = document.getElementById("__cap");
      if (!text) { c.classList.remove("on"); return; }
      c.innerHTML = (n ? `<b>${n}</b>` : "") + `<span>${text}</span>`;
      c.classList.add("on");
    },
    follow: (s) => { tgt.follow = true; tgt.s = s; },
    focus: (s, x, y) => { tgt.follow = false; tgt.s = s; tgt.cx = x; tgt.cy = y; },
    reset: () => { tgt.follow = false; tgt.s = 1; tgt.cx = innerWidth / 2; tgt.cy = innerHeight / 2; },
  };
  if (document.readyState !== "loading") install(); else addEventListener("DOMContentLoaded", install);
};

/** mobile: telefon görünümü (390×760), imleç yerine dokunma halkası */
export async function open({ mobile = false } = {}) {
  const b = await chromium.launch({ channel: "chromium" });
  const ctx = await b.newContext(mobile
    ? { viewport: { width: 390, height: 760 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: "block",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, serviceWorkers: "block" });
  await ctx.addInitScript(DIRECTOR, RATE);
  if (mobile) await ctx.addInitScript(() => { addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = "#__cur{opacity:0!important}.__rip{width:60px;height:60px;margin:-30px 0 0 -30px;background:rgba(15,42,38,.16);border-color:rgba(15,42,38,.5)}#__hud{display:none!important}"; document.documentElement.appendChild(st); }); });
  const page = await ctx.newPage();
  page.__mobile = mobile;
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

/** Kayıt: arka arkaya 2x ekran görüntüsü (screencast başsız modda 1x veriyor) */
export async function startRec(page, dir) {
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  const vp = page.viewportSize();
  await slow(page);
  let on = true, paused = false, pausedAt = 0, offset = 0;
  const loop = (async () => {
    while (on) {
      if (paused) { await new Promise((r) => setTimeout(r, 20)); continue; }
      const t = performance.now() / 1000 - offset;
      try {
        const r = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 90, clip: { x: 0, y: 0, width: vp.width, height: vp.height, scale: 2 } });
        writeFileSync(`${dir}/${String(frames.length).padStart(5, "0")}.jpg`, Buffer.from(r.data, "base64"));
        frames.push(t);
      } catch { await new Promise((r) => setTimeout(r, 30)); }
    }
  })();
  const t0 = performance.now() / 1000;
  page.__recNow = () => +(((performance.now() / 1000 - offset) - t0) * RATE).toFixed(2);
  page.__captions = [];
  return {
    captions: () => page.__captions,
    /** Sunucu beklemesi gibi boş anları kesip atmak için */
    pause() { paused = true; pausedAt = performance.now() / 1000; },
    resume() { if (paused) { offset += performance.now() / 1000 - pausedAt; paused = false; } },
    async stop() {
      await page.waitForTimeout(300);
      on = false; await loop;
      const t = frames.map((x) => (x - frames[0]) * RATE);
      const end = t[t.length - 1] + 0.02;
      const lines = [];
      for (let i = 0; i < frames.length; i++) {
        lines.push(`file '${String(i).padStart(5, "0")}.jpg'`);
        lines.push(`duration ${((i + 1 < t.length ? t[i + 1] : end) - t[i]).toFixed(4)}`);
      }
      lines.push(`file '${String(frames.length - 1).padStart(5, "0")}.jpg'`);
      writeFileSync(`${dir}/list.txt`, lines.join("\n"));
      return { count: frames.length, seconds: +end.toFixed(1), fps: +(frames.length / end).toFixed(0) };
    },
  };
}

/** Kareleri 60 fps ham mp4'e çevir (web sürümleri publish.mjs) */
export function encode(dir, out, { width = 1920, crf = 18, captions } = {}) {
  if (captions) writeFileSync(out.replace(/\.mp4$/, ".json"), JSON.stringify(captions));
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`,
    // Not: kare harmanlamayla hareket bulanıklığı denendi; ~80 kare/sn kaynakta hızlı yakınlaşmada yazılar çift görünüyor
    "-vf", `fps=60,scale=${width}:-2:flags=lanczos,format=yuv420p`, "-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-an", out]);
}

// ─── Sahne yardımcıları (süreler çıktı ms) ────────────────────────────────────
export const wait = (page, ms) => page.waitForTimeout(R(ms));

async function rectOf(loc) {
  const r = await loc.boundingBox();
  if (!r) throw new Error("öğe görünmüyor");
  return r;
}
/** Öğenin sayfa koordinatındaki merkezi (kameradan bağımsız) */
async function pageCenter(page, loc) {
  const r = await rectOf(loc);
  return page.evaluate(([x, y]) => window.__dir.toPage(x, y), [r.x + r.width / 2, r.y + r.height / 2]);
}

export async function cursorStart(page, x, y) { await page.evaluate(([x, y]) => window.__dir.cursorAt(x, y), [x, y]); }

/** İmleci öğeye götür; süre mesafeye göre (yavaş, gözle takip edilebilir) */
export async function hover(page, loc, ms) {
  // Görünür yere kaydır (pencere içi kaydırma dahil); yakınlaşmışken html'in yana kayması sol tarafı boşaltır, onu sıfırla
  // Playwright'ın "gerekirse kaydır" hesabı kamera büyütmesinden etkilenir; tarayıcının kendi kaydırması kutu düzenine bakar
  // Ekranın kenarındaysa ortaya al (telefonda alttaki sabit menünün arkasında kalmasın)
  if (typeof loc.evaluate === "function") await loc.evaluate((el) => {
    const r = el.getBoundingClientRect(), m = 110;
    if (r.top < m || r.bottom > innerHeight - m) el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  }).catch(() => {});
  await page.evaluate(() => { document.documentElement.scrollLeft = 0; document.body.scrollLeft = 0; });
  const p = await pageCenter(page, loc);
  const c = await page.evaluate(() => window.__dir.cursor());
  const dur = ms ?? Math.min(1000, Math.max(520, 380 + Math.hypot(p.x - c.x, p.y - c.y) * 0.6));
  await page.evaluate(([x, y, ms]) => window.__dir.moveTo(x, y, ms), [p.x, p.y, R(dur)]);
  if (!page.__mobile) {
    const r = await rectOf(loc);
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2, { steps: 3 });
  }
}

/** Tıkla: öğeye git, duraksa, bas (halka), bırak, bekle */
export async function click(page, loc, { ms, dwell = 200, after = 350 } = {}) {
  await hover(page, loc, ms);
  await wait(page, dwell);
  await settle(page);
  const r = await rectOf(loc); // kamera kaymış olabilir: güncel konum
  const x = r.x + r.width / 2, y = r.y + r.height / 2;
  const p = await page.evaluate(([x, y]) => window.__dir.toPage(x, y), [x, y]);
  await page.evaluate(([x, y]) => { window.__dir.cursorAt(x, y); window.__dir.press(true); window.__dir.ripple(); }, [p.x, p.y]);
  if (page.__mobile) await page.touchscreen.tap(x, y);
  else { await page.mouse.move(x, y); await page.mouse.down(); await wait(page, 90); await page.mouse.up(); }
  await page.evaluate(() => window.__dir.press(false));
  await wait(page, after);
}

/** Kamera oturana kadar bekle (en çok ~2 sn çıktı) */
export async function settle(page) {
  await page.waitForFunction(() => window.__dir.settled(), null, { timeout: R(2500), polling: 50 }).catch(() => {});
}

/** Yazıyı tuş tuş yaz */
export async function type(page, text, perChar = 65) {
  await page.keyboard.type(text, { delay: R(perChar) });
}

/** Ekranın altında kısa başlık (boş = gizle). n: adım numarası */
export async function caption(page, text, n) {
  await page.evaluate(([t, n]) => window.__dir.caption(t, n), [text || "", n || 0]);
  // Zaman çizelgesi: telefonda başlık videonun altında, sayfada eşzamanlı gösterilir (videonun içi dar)
  if (page.__captions) page.__captions.push({ t: page.__recNow(), text: text || "", n: n || 0 });
}

/** Kamera: imleci takip eden yakınlık */
export async function follow(page, s = 1.7) { await page.evaluate((s) => window.__dir.follow(s), s); }
/** Kamera: öğeye ya da sayfa noktasına sabitlen */
export async function focus(page, target, s = 1.6) {
  const p = typeof target.boundingBox === "function" ? await pageCenter(page, target) : target;
  await page.evaluate(([s, x, y]) => window.__dir.focus(s, x, y), [s, p.x, p.y]);
}
/** Kamera: tüm ekran */
export async function reset(page) { await page.evaluate(() => window.__dir.reset()); }

/** Satır (kişi adı) × sütun (gün başlığı) kesişimindeki hücre (locator gibi davranır) */
export function cellAt(page, person, dayLabel) {
  const row = page.getByText(person, { exact: true }).first();
  const col = page.getByText(dayLabel, { exact: true }).first();
  return {
    async boundingBox() {
      const r = await row.boundingBox(), c = await col.boundingBox();
      return r && c ? { x: c.x + c.width / 2 - 20, y: r.y + r.height / 2 - 10, width: 40, height: 20 } : null;
    },
    scrollIntoViewIfNeeded: async () => {},
  };
}
