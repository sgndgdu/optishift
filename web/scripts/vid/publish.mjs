/**
 * Çekilen sahneleri web için kodlar (scripts/vid/out → public/marketing/tour):
 * masaüstü <ad>.mp4 1600 px, telefon <ad>-m.mp4 600 px, açılış kareleri .webp,
 * telefon kayıtlarının adım başlıkları → components/marketing/tourCaptions.ts (sayfada eşzamanlı gösterilir).
 */
import { execFileSync } from "child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
const IN = "scripts/vid/out", OUT = "public/marketing/tour";
const ff = (args) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args]);
const enc = (src, dst, w) => ff(["-i", src, "-vf", `scale=${w}:-2:flags=lanczos`, "-r", "60", "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", dst]);
const poster = (src, dst, w) => ff(["-ss", "0.3", "-i", src, "-frames:v", "1", "-vf", `scale=${w}:-2`, "-quality", "80", dst]);
const only = process.argv.slice(2);
const caps = {};
for (const f of readdirSync(IN).filter((f) => f.endsWith(".mp4")).sort()) {
  const name = f.replace(/\.mp4$/, "");
  const key = name.replace(/-m$/, "");
  const phoneLike = name.endsWith("-m") || name === "phone";
  const json = `${IN}/${name}.json`;
  if (phoneLike && existsSync(json)) caps[key] = JSON.parse(readFileSync(json, "utf-8"));
  if (only.length && !only.includes(key)) continue;
  const w = phoneLike ? 600 : 1600;
  enc(`${IN}/${f}`, `${OUT}/${name}.mp4`, w);
  poster(`${IN}/${f}`, `${OUT}/${name}.webp`, w);
  console.log("✓", name);
}
writeFileSync("components/marketing/tourCaptions.ts",
  "// scripts/vid/publish.mjs üretir: telefon kayıtlarındaki adım başlıkları (t: saniye)\n" +
  `export const TOUR_CAPTIONS: Record<string, { t: number; text: string; n: number }[]> = ${JSON.stringify(caps, null, 2)};\n`);
