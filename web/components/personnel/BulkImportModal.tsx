"use client";
/**
 * Excel/CSV ile toplu personel aktarımı (Ekip › Toplu Yükle, Vardiya Planı › Hızlı Kurulum).
 * 1) Şablonu indir (.xlsx / .csv)  2) Dosyayı yükle ya da Excel'den yapıştır
 * 3) Önizleme: eklenecek / atlanacak satırlar ve nedenleri  4) Tek seferde ekle, davet bağlantıları.
 * Çözümleme ve doğrulama lib/personnelImport (sunucu aynı kuralla yeniden doğrular).
 */

import { useEffect, useRef, useState } from "react";
import { Check, Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { checkRows, parseDelimited, rowsFromTable, unknownDepartments, type ImportRow } from "@/lib/personnelImport";

interface Result { name: string; username: string; temp_password: string; invite_token: string }

export default function BulkImportModal({ locationId, onClose, onDone }: {
  locationId: string;
  onClose: () => void;
  /** Eklenen kişi sayısıyla çağrılır (liste yenilensin) */
  onDone?: (added: number) => void;
}) {
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [existing, setExisting] = useState<{ name: string; phone: string | null }[]>([]);
  const [createDepts, setCreateDepts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ results: Result[]; skipped: { line: number; name: string; reason: string }[]; createdDepartments: string[]; approvalPending: boolean } | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let stale = false;
    Promise.all([
      fetch(`/api/departments?location_id=${locationId}`).then(r => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`/api/personnel?location_id=${locationId}`).then(r => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([d, p]) => {
      if (stale) return;
      setDepartments(Array.isArray(d) ? d.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })) : []);
      setExisting(Array.isArray(p) ? p.filter((x: { status?: string }) => x.status === "active").map((x: { name: string; phone?: string | null }) => ({ name: x.name, phone: x.phone ?? null })) : []);
    });
    return () => { stale = true; };
  }, [locationId]);

  const readFile = async (file: File) => {
    setError(""); setRows(null); setFileName(file.name);
    if (file.size > 5 * 1024 * 1024) { setError("Dosya 5 MB'tan büyük."); return; }
    setBusy(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const res = await fetch("/api/personnel/bulk/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, data_base64: btoa(bin) }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Dosya okunamadı."); return; }
      const parsed = rowsFromTable(d.table ?? []);
      if (!parsed.length) { setError("Dosyada personel satırı bulunamadı."); return; }
      setRows(parsed);
    } catch { setError("Dosya okunamadı."); }
    finally { setBusy(false); }
  };

  const usePaste = () => {
    setError(""); setFileName("Yapıştırılan liste");
    const parsed = rowsFromTable(parseDelimited(paste));
    if (!parsed.length) { setError("Yapıştırılan metinde personel satırı bulunamadı."); return; }
    setRows(parsed);
  };

  const checked = rows ? checkRows(rows, { departments, existing, createDepartments: createDepts }) : [];
  const okCount = checked.filter(r => r.status === "ok").length;
  const unknownDepts = rows ? unknownDepartments(rows, departments) : [];

  const submit = async () => {
    if (!rows) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/personnel/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: locationId, rows, create_departments: createDepts }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Aktarım yapılamadı."); return; }
      setDone({ results: d.results ?? [], skipped: d.skipped ?? [], createdDepartments: d.createdDepartments ?? [], approvalPending: !!d.approvalPending });
      onDone?.(d.addedCount ?? 0);
    } catch { setError("Sunucuya bağlanılamadı."); }
    finally { setBusy(false); }
  };

  // Sayfa yenilemesi pencere kapanınca: aktarım anında yenilenirse Hızlı Kurulum bandı (ve bu pencere)
  // personel eklendiği için kaybolur, davet bağlantıları kopyalanamadan gider
  const close = () => {
    if (done && done.results.length > 0) window.dispatchEvent(new Event("optishift_location_changed"));
    onClose();
  };

  const tpl = (format: "xlsx" | "csv") => `/api/personnel/bulk/template?format=${format}&location_id=${encodeURIComponent(locationId)}`;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !busy && close()}>
      <div className="bg-white w-full max-w-3xl rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()} role="dialog" aria-label="Excel ile içe aktar">
        <div className="flex items-start justify-between mb-4 gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Excel/CSV ile Toplu Aktar</h2>
            <p className="text-sm text-slate-500 mt-1">Şablonu doldurun, yükleyin; eklemeden önce kontrol edin.</p>
          </div>
          <button onClick={close} disabled={busy} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400" aria-label="Kapat"><X size={20} /></button>
        </div>

        {done ? (
          <div className="flex-1 overflow-y-auto space-y-3">
            <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl font-bold text-sm flex items-center gap-2"><Check size={18} /> {done.results.length} personel eklendi.</div>
            {done.approvalPending && done.results.length > 0 && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Hesaplar yönetici onayına düştü; onaylanınca personel giriş yapabilir.</p>
            )}
            {done.createdDepartments.length > 0 && (
              <p className="text-xs text-slate-600">Oluşturulan departmanlar: {done.createdDepartments.join(", ")}</p>
            )}
            {done.skipped.length > 0 && (
              <details className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                <summary className="font-semibold cursor-pointer">{done.skipped.length} satır atlandı</summary>
                <ul className="mt-1 space-y-0.5">{done.skipped.map(s => <li key={`${s.line}-${s.name}`}>Satır {s.line}{s.name ? ` · ${s.name}` : ""}: {s.reason}</li>)}</ul>
              </details>
            )}
            {done.results.length > 0 && (
              <>
                <p className="text-xs text-slate-500">Her kişiye giriş bağlantısını gönderin; ilk girişte şifresini kendisi belirler.</p>
                <div className="space-y-2">
                  {done.results.map((r, i) => (
                    <div key={r.invite_token} className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-sm flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="flex-1 min-w-0"><div className="font-bold text-slate-800 truncate">{r.name}</div><div className="text-xs text-slate-500">{r.username}</div></div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/setup?token=${r.invite_token}`);
                          setCopied(i);
                          setTimeout(() => setCopied(prev => (prev === i ? null : prev)), 2000);
                        }}
                        className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", copied === i ? "bg-emerald-500 text-white" : "bg-forest-50 text-forest-700 hover:bg-forest-100")}
                      >
                        {copied === i ? "Kopyalandı" : "Giriş bağlantısını kopyala"}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
            <button onClick={close} className="w-full mt-2 bg-forest-600 text-white font-bold py-3 rounded-xl hover:bg-forest-700">Kapat</button>
          </div>
        ) : !rows ? (
          <div className="space-y-4 overflow-y-auto">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-bold text-slate-600 mb-2">1. Şablonu indirin</p>
              <p className="text-xs text-slate-500 mb-3">Sütunlar: <strong>İsim</strong> (zorunlu), Departman, Yetenek (virgülle), Telefon, E-posta (isteğe bağlı).</p>
              <div className="flex flex-wrap gap-2">
                <a href={tpl("xlsx")} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-forest-50 text-forest-700 hover:bg-forest-100"><Download size={14} /> Excel şablonu</a>
                <a href={tpl("csv")} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Download size={14} /> CSV şablonu</a>
              </div>
            </div>
            <div
              className="rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center hover:border-forest-300 transition-colors"
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) readFile(f); }}
            >
              <FileSpreadsheet size={28} className="mx-auto text-slate-300 mb-2" />
              <p className="text-xs font-bold text-slate-600">2. Doldurduğunuz dosyayı yükleyin</p>
              <p className="text-xs text-slate-400 mt-1">.xlsx ya da .csv · sürükleyip bırakabilirsiniz</p>
              <input ref={fileRef} type="file" accept=".xlsx,.csv,.txt" className="hidden" aria-label="Personel dosyası"
                onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ""; }} />
              <button onClick={() => fileRef.current?.click()} disabled={busy}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl bg-forest-600 text-white hover:bg-forest-700 disabled:opacity-50">
                {busy ? "Okunuyor…" : <><Upload size={15} /> Dosya seç</>}
              </button>
            </div>
            <div>
              <button onClick={() => setShowPaste(v => !v)} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
                {showPaste ? "Yapıştırmayı gizle" : "Ya da Excel'den kopyalayıp yapıştırın"}
              </button>
              {showPaste && (
                <div className="mt-2 space-y-2">
                  <textarea value={paste} onChange={e => setPaste(e.target.value)} placeholder={"İsim\tDepartman\tYetenek\tTelefon\nAyşe Kaya\tMutfak\tAşçı\t05321112233"}
                    className="w-full min-h-[140px] border border-slate-200 rounded-xl p-3 text-xs font-mono whitespace-pre focus:outline-none focus:border-forest-400" />
                  <button onClick={usePaste} disabled={!paste.trim()} className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-800 text-white disabled:opacity-40">Önizle</button>
                </div>
              )}
            </div>
            {error && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600">{error}</div>}
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
              <span className="font-bold text-slate-800">{fileName}</span>
              <span className="text-emerald-700 font-semibold">{okCount} eklenecek</span>
              {checked.length - okCount > 0 && <span className="text-amber-700 font-semibold">{checked.length - okCount} atlanacak</span>}
              <button onClick={() => { setRows(null); setError(""); }} className="ml-auto text-xs font-semibold text-slate-500 hover:text-slate-700">Başka dosya</button>
            </div>
            {unknownDepts.length > 0 && (
              <label className="flex items-start gap-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-3 cursor-pointer">
                <input type="checkbox" checked={createDepts} onChange={e => setCreateDepts(e.target.checked)} className="mt-0.5 accent-forest-600" />
                <span>
                  <strong>Şubede olmayan departmanları oluştur:</strong> {unknownDepts.join(", ")}.{" "}
                  <span className="text-slate-500">Departman eklenince Personel İhtiyacı tablosu departman bazına geçer. İşaretlemezseniz bu kişiler departmansız eklenir.</span>
                </span>
              </label>
            )}
            <div className="flex-1 overflow-auto border border-slate-100 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-left text-slate-500">
                    <th className="px-2 py-2 font-semibold">Satır</th><th className="px-2 py-2 font-semibold">İsim</th>
                    <th className="px-2 py-2 font-semibold hidden sm:table-cell">Departman</th><th className="px-2 py-2 font-semibold hidden sm:table-cell">Yetenek</th>
                    <th className="px-2 py-2 font-semibold hidden md:table-cell">Telefon</th><th className="px-2 py-2 font-semibold">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {checked.map(r => (
                    <tr key={r.line} className={cn("border-t border-slate-100", r.status === "skip" && "bg-amber-50/50 text-slate-400")}>
                      <td className="px-2 py-1.5">{r.line}</td>
                      <td className="px-2 py-1.5 font-semibold text-slate-800">{r.name || "—"}</td>
                      <td className="px-2 py-1.5 hidden sm:table-cell">{r.department || "—"}</td>
                      <td className="px-2 py-1.5 hidden sm:table-cell">{r.skills.join(", ") || "—"}</td>
                      <td className="px-2 py-1.5 hidden md:table-cell">{r.phone || "—"}</td>
                      <td className="px-2 py-1.5">
                        {r.status === "ok"
                          ? <span className="text-emerald-700 font-semibold">{r.notes.length ? `✓ ${r.notes[0]}` : "✓ Eklenecek"}</span>
                          : <span className="text-amber-700 font-semibold">{r.notes[0]}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error && <div className="mt-3 bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600">{error}</div>}
            <div className="flex gap-3 mt-4">
              <button onClick={onClose} disabled={busy} className="flex-1 border border-slate-200 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-50">İptal</button>
              <button onClick={submit} disabled={busy || okCount === 0}
                className="flex-[2] bg-forest-600 disabled:bg-forest-400 text-white font-bold py-3 rounded-xl hover:bg-forest-700 flex items-center justify-center gap-2">
                {busy ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Upload size={16} /> {okCount} kişiyi ekle</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
