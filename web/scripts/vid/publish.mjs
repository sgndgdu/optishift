/** Çekilen sahneleri tanıtım sayfası için kodlar: masaüstü (1920), dar ekran (1280) ve açılış karesi (webp) */
import { execFileSync } from "child_process";
const OUT = "public/marketing/tour";
const ff = (args) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args]);
for (const name of ["plan", "approvals", "cover", "assistant"]) {
  const src = `scripts/vid/out/${name}.mp4`;
  ff(["-i", src, "-vf", "scale=1600:-2:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-movflags", "+faststart", "-an", `${OUT}/${name}.mp4`]);
  ff(["-i", src, "-vf", "scale=1024:-2:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-movflags", "+faststart", "-an", `${OUT}/${name}-sm.mp4`]);
  ff(["-i", src, "-frames:v", "1", "-vf", "scale=1600:-2", "-quality", "78", `${OUT}/${name}.webp`]);
}
ff(["-i", "scripts/vid/out/phone.mp4", "-vf", "scale=600:-2:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-movflags", "+faststart", "-an", `${OUT}/phone.mp4`]);
ff(["-i", "scripts/vid/out/phone.mp4", "-frames:v", "1", "-vf", "scale=600:-2", "-quality", "78", `${OUT}/phone.webp`]);
