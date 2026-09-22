"use client";

import { useState, useEffect, useCallback, use } from "react";
import { Delete, LogIn, LogOut, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { LogoMark } from "@/components/Logo";

type Action = "checkin" | "checkout";
type Result = { ok: boolean; message: string } | null;

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

export default function KioskPage({ params }: { params: Promise<{ locationId: string }> }) {
  const { locationId } = use(params);

  const [pageLoading, setPageLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [pageError, setPageError] = useState("");

  const [action, setAction] = useState<Action>("checkin");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result>(null);

  useEffect(() => {
    fetch(`/api/kiosk/${locationId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setPageError(data.error); return; }
        setEnabled(!!data.enabled);
        setLocationName(data.location_name ?? "");
      })
      .catch(() => setPageError("Sunucuya bağlanılamadı"))
      .finally(() => setPageLoading(false));
  }, [locationId]);

  const submit = useCallback(async (fullPin: string, act: Action) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/kiosk/${locationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: fullPin, action: act }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: data.error ?? "Bir hata oluştu" });
      } else {
        setResult({
          ok: true,
          message: act === "checkin" ? `${data.personnel_name} · Giriş kaydedildi` : `${data.personnel_name} · Çıkış kaydedildi`,
        });
      }
    } catch {
      setResult({ ok: false, message: "Sunucuya bağlanılamadı" });
    } finally {
      setSubmitting(false);
      setPin("");
    }
  }, [locationId]);

  // Sonuç ekranı bir süre gösterilip otomatik kapanır
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), 3000);
    return () => clearTimeout(t);
  }, [result]);

  const pressKey = (key: string) => {
    if (submitting || result) return;
    if (key === "back") { setPin(p => p.slice(0, -1)); return; }
    if (key === "clear") { setPin(""); return; }
    setPin(p => {
      const next = p.length < 4 ? p + key : p;
      if (next.length === 4) submit(next, action);
      return next;
    });
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 size={32} className="text-white/40 animate-spin" />
      </div>
    );
  }

  if (pageError || !enabled) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <XCircle size={40} className="text-white/30 mx-auto mb-4" />
          <p className="text-white/70 font-bold">
            {pageError || "Kiosk modu bu şubede kapalı"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 select-none">
      <div className="flex items-center gap-2 mb-8">
        <LogoMark size="md" />
        <span className="font-black text-white text-lg">{locationName || "OptiShift"}</span>
      </div>

      {result ? (
        <div className="w-full max-w-sm text-center py-12">
          {result.ok ? (
            <CheckCircle2 size={64} className="text-emerald-400 mx-auto mb-5" />
          ) : (
            <XCircle size={64} className="text-red-400 mx-auto mb-5" />
          )}
          <p className={`text-xl font-black ${result.ok ? "text-emerald-300" : "text-red-300"}`}>{result.message}</p>
        </div>
      ) : (
        <div className="w-full max-w-sm">
          <div className="grid grid-cols-2 gap-3 mb-8">
            <button
              onClick={() => setAction("checkin")}
              className={`flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-sm transition-colors ${
                action === "checkin" ? "bg-emerald-500 text-white" : "bg-white/5 text-white/50"
              }`}
            >
              <LogIn size={18} /> GİRİŞ YAP
            </button>
            <button
              onClick={() => setAction("checkout")}
              className={`flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-sm transition-colors ${
                action === "checkout" ? "bg-amber-500 text-white" : "bg-white/5 text-white/50"
              }`}
            >
              <LogOut size={18} /> ÇIKIŞ YAP
            </button>
          </div>

          <div className="flex items-center justify-center gap-4 mb-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full border-2 transition-colors ${
                  i < pin.length ? "bg-white border-white" : "border-white/30"
                }`}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {KEYS.map(key => {
              if (key === "clear") {
                return (
                  <button
                    key={key}
                    onClick={() => pressKey(key)}
                    disabled={submitting}
                    className="text-white/40 text-xs font-bold rounded-2xl bg-white/5 hover:bg-white/10 py-6 disabled:opacity-40"
                  >
                    TEMİZLE
                  </button>
                );
              }
              if (key === "back") {
                return (
                  <button
                    key={key}
                    onClick={() => pressKey(key)}
                    disabled={submitting}
                    className="flex items-center justify-center text-white/70 rounded-2xl bg-white/5 hover:bg-white/10 py-6 disabled:opacity-40"
                  >
                    <Delete size={22} />
                  </button>
                );
              }
              return (
                <button
                  key={key}
                  onClick={() => pressKey(key)}
                  disabled={submitting}
                  className="text-white text-2xl font-black rounded-2xl bg-white/10 hover:bg-white/20 py-6 disabled:opacity-40 active:scale-95 transition-transform"
                >
                  {key}
                </button>
              );
            })}
          </div>

          {submitting && (
            <p className="text-center text-white/40 text-sm font-bold mt-6 flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Kontrol ediliyor…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
