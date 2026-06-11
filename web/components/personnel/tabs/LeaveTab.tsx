"use client";

import { Plus, X } from "lucide-react";
import type { Personnel, LeaveType } from "@/lib/types";
import { calcLeaveEntitlement, tenureStr, formatDate, LEAVE_LABELS, LEAVE_COLORS } from "../shared";

interface LeaveTabProps {
  selected: Personnel;
  showLeaveForm: boolean;
  setShowLeaveForm: (v: boolean | ((prev: boolean) => boolean)) => void;
  leaveForm: { type: LeaveType; start_date: string; end_date: string; note: string };
  setLeaveForm: (v: { type: LeaveType; start_date: string; end_date: string; note: string } | ((prev: { type: LeaveType; start_date: string; end_date: string; note: string }) => { type: LeaveType; start_date: string; end_date: string; note: string })) => void;
  addLeave: () => void;
  deleteLeave: (id: string) => void;
}

export function LeaveTab({
  selected,
  showLeaveForm,
  setShowLeaveForm,
  leaveForm,
  setLeaveForm,
  addLeave,
  deleteLeave,
}: LeaveTabProps) {
  const entitlement = selected.annual_leave_days_total || calcLeaveEntitlement(selected.hire_date);
  const annualUsed = selected.leave_records
    .filter((r) => r.type === "annual")
    .reduce((s, r) => s + r.days, 0);
  const remaining = Math.max(0, entitlement - annualUsed);
  const pct = entitlement > 0 ? Math.min(100, Math.round((annualUsed / entitlement) * 100)) : 0;
  const isExhausted = remaining === 0 && entitlement > 0;
  const isLow = remaining > 0 && remaining <= 3;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-slate-800 p-5 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs text-slate-400 mb-0.5">Yıllık İzin Bakiyesi</div>
            <div className="text-xs text-slate-400">Kıdem: {tenureStr(selected.hire_date)} — {entitlement} iş günü hak</div>
          </div>
          <div className={`text-4xl font-bold ${isExhausted ? "text-red-400" : isLow ? "text-orange-300" : "text-emerald-400"}`}>
            {remaining}
            <span className="text-base font-normal text-slate-400 ml-1">gün</span>
          </div>
        </div>
        <div className="bg-slate-700 rounded-full h-1.5 mb-3">
          <div
            className={`h-1.5 rounded-full transition-all ${isExhausted ? "bg-red-400" : isLow ? "bg-orange-400" : "bg-emerald-400"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="grid grid-cols-3 text-center">
          <div>
            <div className="text-lg font-semibold">{entitlement}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Toplam Hak</div>
          </div>
          <div className="border-x border-slate-700">
            <div className="text-lg font-semibold text-amber-300">{annualUsed}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Kullanılan</div>
          </div>
          <div>
            <div className={`text-lg font-semibold ${isExhausted ? "text-red-400" : isLow ? "text-orange-300" : "text-emerald-400"}`}>
              {remaining}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Kalan</div>
          </div>
        </div>
        {isExhausted && <div className="mt-3 text-xs text-red-300 text-center">Yıllık izin hakkı tükendi.</div>}
        {isLow && <div className="mt-3 text-xs text-orange-300 text-center">Sadece {remaining} gün kaldı.</div>}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">İzin Geçmişi</p>
          <button
            onClick={() => setShowLeaveForm((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
          >
            <Plus size={13} /> İzin Ekle
          </button>
        </div>

        {showLeaveForm && (
          <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
            <div className="flex gap-2">
              {(["annual", "sick", "excuse"] as LeaveType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setLeaveForm((f) => ({ ...f, type: t }))}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    leaveForm.type === t
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-slate-600 border border-slate-200 hover:border-indigo-300"
                  }`}
                >
                  {LEAVE_LABELS[t].replace(" İzni", "")}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="field-label">Başlangıç</label>
                <input
                  type="date"
                  value={leaveForm.start_date}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, start_date: e.target.value }))}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">Bitiş</label>
                <input
                  type="date"
                  value={leaveForm.end_date}
                  min={leaveForm.start_date}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, end_date: e.target.value }))}
                  className="field-input"
                />
              </div>
            </div>
            <div>
              <label className="field-label">Not (isteğe bağlı)</label>
              <input
                value={leaveForm.note}
                onChange={(e) => setLeaveForm((f) => ({ ...f, note: e.target.value }))}
                className="field-input"
                placeholder="Açıklama..."
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowLeaveForm(false)}
                className="flex-1 py-2 text-xs border border-slate-200 rounded-lg hover:bg-white text-slate-600"
              >
                İptal
              </button>
              <button
                onClick={addLeave}
                disabled={!leaveForm.start_date || !leaveForm.end_date}
                className="flex-1 py-2 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg font-medium"
              >
                Kaydet
              </button>
            </div>
          </div>
        )}

        {selected.leave_records.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
            Kayıtlı izin yok.
          </div>
        ) : (
          <div className="space-y-2">
            {[...selected.leave_records]
              .sort((a, b) => b.start_date.localeCompare(a.start_date))
              .map((rec) => (
                <div key={rec.id} className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-slate-100">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${LEAVE_COLORS[rec.type]}`}>
                    {LEAVE_LABELS[rec.type]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-700">
                      {formatDate(rec.start_date)}
                      {rec.start_date !== rec.end_date && <> — {formatDate(rec.end_date)}</>}
                    </div>
                    {rec.note && <div className="text-xs text-slate-400 truncate">{rec.note}</div>}
                  </div>
                  <div className="text-sm font-semibold text-slate-600 shrink-0">{rec.days}g</div>
                  <button
                    onClick={() => deleteLeave(rec.id)}
                    className="p-1 rounded-lg hover:bg-red-100 text-slate-300 hover:text-red-400 transition-colors shrink-0"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
