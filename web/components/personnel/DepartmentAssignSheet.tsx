"use client";
/**
 * Kişileri departmanlara dağıt: departmanlı şubede departmanı olmayan kişi otomatik plana alınmaz
 * (lib/generatePlan excluded_no_department). Departman eklendikten sonra herkesi tek ekranda atamak için.
 * Açıkken bağlanır (seçimler her açılışta sıfırdan başlar).
 */
import { useState } from "react";
import { Sheet, sheetPrimaryClass, sheetSecondaryClass } from "@/components/ui/Sheet";
import { departmentLabel, leafDepartments, sortDepartments } from "@/lib/departments";

type Dept = { id: string; name: string; parent_id?: string | null };
type Person = { personnelId: string; name: string; title?: string | null };

export default function DepartmentAssignSheet({ open, onClose, people, depts, onSaved }: {
  open: boolean;
  onClose: () => void;
  /** Departmanı olmayan, plana giren kişiler */
  people: Person[];
  depts: Dept[];
  onSaved: (count: number) => void;
}) {
  const leaves = leafDepartments(sortDepartments(depts));
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const chosen = Object.entries(choice).filter(([, d]) => d);
  const save = async () => {
    setSaving(true); setError("");
    let ok = 0;
    for (const [pid, dept] of chosen) {
      const r = await fetch(`/api/personnel?id=${pid}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ department_id: dept }),
      }).catch(() => null);
      if (r?.ok) ok++;
    }
    setSaving(false);
    if (ok < chosen.length) { setError(`${chosen.length - ok} kişi kaydedilemedi, tekrar deneyin.`); if (ok) onSaved(ok); return; }
    onSaved(ok);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Kişileri departmanlara dağıt"
      description="Departmanı seçilmeyen kişi otomatik plana alınmaz."
      footer={<>
        <button onClick={onClose} className={sheetSecondaryClass}>Vazgeç</button>
        <button onClick={save} disabled={saving || chosen.length === 0} className={sheetPrimaryClass}>
          {saving ? "Kaydediliyor…" : chosen.length ? `${chosen.length} kişiyi kaydet` : "Kaydet"}
        </button>
      </>}>
      <div className="space-y-2">
        {leaves.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 pb-2 text-xs text-slate-500">
            <span>Hepsini:</span>
            {leaves.map(d => (
              <button key={d.id} type="button" onClick={() => setChoice(Object.fromEntries(people.map(p => [p.personnelId, d.id])))}
                className="px-2.5 py-1 rounded-lg border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50">{departmentLabel(depts, d)}</button>
            ))}
          </div>
        )}
        {people.map(p => (
          <label key={p.personnelId} className="flex items-center gap-3 py-1.5">
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-slate-800 truncate">{p.name}</span>
              {p.title && <span className="block text-xs text-slate-500 truncate">{p.title}</span>}
            </span>
            <select value={choice[p.personnelId] ?? ""} onChange={e => setChoice(c => ({ ...c, [p.personnelId]: e.target.value }))}
              aria-label={`${p.name} departmanı`}
              className="w-40 shrink-0 border border-slate-200 rounded-xl px-2.5 py-2 text-sm bg-slate-50 focus:outline-none focus:border-forest-400">
              <option value="">Seçin</option>
              {leaves.map(d => <option key={d.id} value={d.id}>{departmentLabel(depts, d)}</option>)}
            </select>
          </label>
        ))}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Sheet>
  );
}
