"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { trNum } from "@/lib/format";
import type { ShiftDefinition } from "@/lib/types";

/**
 * Vardiya Planı "Vardiyalara göre" görünümü (kullanıcı kararı 2026-10-07, varsayılan görünüm):
 * kâğıttaki çizelge gibi solda vardiyalar, üstte günler, kutularda o vardiyada çalışan kişilerin adları.
 * Veri ve düzenleme kişi satırlı tabloyla aynıdır (cellMap); bu bileşen sadece başka bir düzende çizer.
 * - Ada tıklama: onNameClick (düzenlenebilir haftada vardiya penceresi, yayınlı haftada "gelemiyor" penceresi)
 * - Boş yere tıklama: o departmandan kişi seçme listesi açılır, seçilen kişi onAssign ile o vardiyaya yazılır
 * - Hiçbir vardiya tanımına uymayan saatler "Diğer saatler" satırında
 * - Nöbet tanımları ayrı satır (onCallMap; normal vardiyayla aynı gün olabilir)
 * - Aynı gün ikinci vardiya (extras) kırmızı uyarılı ad olarak kendi vardiya satırında
 * - flash: Plan Kontrolü'nden "oraya git" ile gelen kişi/gün vurgulanır
 * - Kişi sayısı (2026-10-09, kullanıcı isteği): kutunun köşesindeki "2/3" sayısına dokununca − / + ile ihtiyaç değişir
 *   (onDemandChange; ayrı "Kaç kişi gerekli?" tablosu kalktı). countsEditing açıkken bütün kutularda − / + görünür.
 *   Sayı şubeye/departmana kaydedilir, sonraki haftalar da aynı sayıyla açılır.
 * - Çıkarma: adın üstüne gelince × (telefonda hep görünür), onRemove
 * - Sürükle bırak (@dnd-kit, sayfanın DndContext'i): ad başka güne/vardiyaya taşınır.
 *   Sürüklenen: { kind: "board-chip", personId, day }, bırakılan yer: { kind: "board-cell", groupId, def, day }
 */

export type ShiftTone = { box: string; name: string; time: string; dot: string };
type Cell = { startMin: number; endMin: number; deptId?: string; id?: number };
type Person = { id: string; name: string; department_id?: string | null; department_ids?: string[] | null; weekly_off_day?: number | string | null };
export type BoardGroup = { id: string; name: string | null; members: Person[] };
type Status = "available" | "pref_not" | "unavailable" | "leave" | "weekly_off" | "away" | "unknown";

const STATUS_LABEL: Record<Status, string> = {
  available: "Uygun",
  unknown: "",
  pref_not: "Tercih etmem",
  unavailable: "Gelemem",
  leave: "İzinli",
  weekly_off: "Haftalık izin",
  away: "Başka şubede",
};
const STATUS_ORDER: Record<Status, number> = { available: 0, unknown: 1, pref_not: 2, weekly_off: 3, unavailable: 4, leave: 5, away: 6 };

function shortName(n: string) {
  const parts = n.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

export default function ShiftBoard({
  groups, tones, days, mobileDay, cellMap, matchDef, demandOf, statusOf, cellGroupId, weekHours, editable,
  onNameClick, onAssign, timeLabel, customTone, onCallDefs, onCallMap, onOnCallClick, extras, onExtraClick, flash, chipMark,
  onDemandChange, countsEditing = false, onRemove, hintOf,
}: {
  groups: BoardGroup[];
  tones: { def: ShiftDefinition; tone: ShiftTone }[];
  days: { label: string; date: string; weekend: boolean; extra?: React.ReactNode }[];
  mobileDay: number;
  cellMap: Record<string, Cell>;
  matchDef: (c: Cell) => ShiftDefinition | null;
  demandOf: (groupId: string, defId: string, day: number) => number;
  statusOf: (personId: string, day: number) => Status;
  cellGroupId: (p: Person, c: Cell) => string;
  weekHours: (personId: string) => number;
  editable: boolean;
  onNameClick: (e: React.MouseEvent, personId: string, day: number) => void;
  onAssign: (personId: string, day: number, def: ShiftDefinition, groupId: string) => void;
  timeLabel: (c: Cell) => string;
  customTone: ShiftTone;
  onCallDefs: ShiftDefinition[];
  onCallMap: Record<string, { defId: string }>;
  onOnCallClick: (e: React.MouseEvent, personId: string, day: number) => void;
  extras: Record<string, Cell[]>;
  onExtraClick: (personId: string, day: number, c: Cell) => void;
  flash: { personId?: string; day?: number } | null;
  /** Ad kutusunun sonuna küçük işaret (zorunlu atama durumu, yorgunluk uyarısı) */
  chipMark?: (personId: string, day: number) => { text: string; title: string } | null;
  /** Kişi sayısını değiştirme; verilmezse ya da grup için null dönerse sayı salt okunur */
  onDemandChange?: ((groupId: string, defId: string, day: number, next: number) => void) | null;
  countsEditing?: boolean;
  onRemove?: (personId: string, day: number) => void;
  /** Yoğunluk tahmini (geçmiş haftalar): sayı düzenlenirken ipucu */
  hintOf?: (groupId: string, defId: string, day: number) => number | null;
}) {
  const [countOpen, setCountOpen] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ groupId: string; def: ShiftDefinition; day: number; x: number; y: number } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!picker) return;
    const close = (e: MouseEvent) => { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPicker(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setPicker(null); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [picker]);

  // Kişi → gün → hücre ve bulunduğu grup
  const people = new Map<string, Person>();
  for (const g of groups) for (const p of g.members) people.set(p.id, p);
  type Placed = { person: Person; day: number; cell: Cell; def: ShiftDefinition | null; groupId: string };
  const placed: Placed[] = [];
  for (const [key, cell] of Object.entries(cellMap)) {
    const i = key.lastIndexOf("-");
    const person = people.get(key.slice(0, i));
    if (!person) continue;
    placed.push({ person, day: Number(key.slice(i + 1)), cell, def: matchDef(cell), groupId: cellGroupId(person, cell) });
  }

  const placedExtras: Placed[] = [];
  for (const [key, list] of Object.entries(extras)) {
    const i = key.lastIndexOf("-");
    const person = people.get(key.slice(0, i));
    if (!person) continue;
    for (const cell of list) placedExtras.push({ person, day: Number(key.slice(i + 1)), cell, def: matchDef(cell), groupId: cellGroupId(person, cell) });
  }
  const placedOnCall: { person: Person; day: number; defId: string; groupId: string }[] = [];
  for (const [key, v] of Object.entries(onCallMap)) {
    const i = key.lastIndexOf("-");
    const person = people.get(key.slice(0, i));
    if (!person) continue;
    placedOnCall.push({ person, day: Number(key.slice(i + 1)), defId: v.defId, groupId: cellGroupId(person, { startMin: 0, endMin: 0 }) });
  }
  const isFlash = (pid: string, day: number) => !!flash && flash.personId === pid && (flash.day === undefined || flash.day === day);

  const openPicker = (e: React.MouseEvent, groupId: string, def: ShiftDefinition, day: number) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const w = 280, h = 340;
    let x = r.left, y = r.bottom + 6;
    if (x + w > window.innerWidth - 12) x = Math.max(8, window.innerWidth - w - 12);
    if (y + h > window.innerHeight - 12) y = Math.max(8, r.top - h - 6);
    setPicker({ groupId, def, day, x, y });
  };

  const dayCell = (i: number) => cn("align-top border-l border-slate-100 p-1.5", days[i].weekend && "bg-forest-50/40", mobileDay !== i && "hidden sm:table-cell");

  return (
    <>
      <table className="w-full sm:min-w-[760px] border-collapse">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="sticky left-0 z-10 w-[132px] bg-white px-3 py-2 text-left text-[11px] font-bold text-slate-400">Vardiya</th>
            {days.map((d, i) => (
              <th key={i} className={cn("px-1 py-2 text-center", d.weekend && "bg-forest-50/50", mobileDay !== i && "hidden sm:table-cell")}>
                <div className={cn("text-[12px] font-bold", d.weekend ? "text-forest-600" : "text-slate-700")}>{d.label}</div>
                <div className={cn("text-[11px] font-semibold", d.weekend ? "text-forest-400" : "text-slate-400")}>{d.date}</div>
                {d.extra}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map(g => {
            const inGroup = placed.filter(x => x.groupId === g.id);
            const other = [...inGroup.filter(x => !x.def), ...placedExtras.filter(x => x.groupId === g.id && !x.def)];
            return [
              g.name && (
                <tr key={`h-${g.id}`} className="border-t-2 border-slate-200">
                  <td colSpan={8} className="bg-slate-50 px-3 py-2">
                    <span className="sticky left-3 text-xs font-semibold text-slate-700">{g.name}</span>
                    <span className="ml-2 text-[11px] font-semibold text-slate-400">{g.members.length} kişi</span>
                  </td>
                </tr>
              ),
              ...tones.map(({ def, tone }) => (
                <tr key={`${g.id}-${def.id}`} className="border-t border-slate-100">
                  <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2 text-left align-top">
                    <div className="flex items-start gap-2">
                      <span className={cn("mt-1 h-8 w-1.5 shrink-0 rounded-full", tone.dot)} />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-bold leading-tight text-slate-800">{def.name}</span>
                        <span className="block text-[11px] text-slate-400">{def.start}–{def.end}</span>
                      </span>
                    </div>
                  </th>
                  {days.map((_, day) => {
                    const here = inGroup.filter(x => x.def?.id === def.id && x.day === day);
                    const need = demandOf(g.id, def.id, day);
                    const missing = Math.max(0, need - here.length);
                    return (
                      <td key={day} className={dayCell(day)}>
                        <CountBar groupId={g.id} defId={def.id} day={day} here={here.length} need={need}
                          canEdit={!!onDemandChange && editable && g.id !== "__none__"}
                          open={countsEditing || countOpen === `${g.id}|${def.id}|${day}`}
                          onToggle={() => setCountOpen(o => (o === `${g.id}|${def.id}|${day}` ? null : `${g.id}|${def.id}|${day}`))}
                          hint={hintOf?.(g.id, def.id, day) ?? null}
                          onChange={n => onDemandChange?.(g.id, def.id, day, n)} />
                        <DropCell id={`cell:${g.id}:${def.id}:${day}`} data={{ kind: "board-cell", groupId: g.id, def, day }} enabled={editable}>
                          {here.map(x => (
                            <NameChip key={x.person.id} personId={x.person.id} day={day} draggable={editable}
                              className={cn(tone.box, tone.name, isFlash(x.person.id, day) && "ring-2 ring-amber-400 ring-offset-1")}
                              title={`${x.person.name} · ${timeLabel(x.cell)}`}
                              label={<>{shortName(x.person.name)}
                                {(() => { const m = chipMark?.(x.person.id, day); return m ? <span className="ml-1 font-normal" title={m.title}>{m.text}</span> : null; })()}</>}
                              onClick={e => onNameClick(e, x.person.id, day)}
                              onRemove={editable && onRemove ? () => onRemove(x.person.id, day) : undefined}
                              removeLabel={`${x.person.name} kişisini ${days[day].label} ${def.name} vardiyasından çıkar`} />
                          ))}
                          {placedExtras.filter(x => x.groupId === g.id && x.def?.id === def.id && x.day === day).map(x => (
                            <button key={`x-${x.person.id}`} type="button" onClick={() => onExtraClick(x.person.id, day, x.cell)}
                              title="Bu kişinin aynı gün ikinci vardiyası var. Dinlenme ve haftalık sınır kurallarına uymayabilir."
                              className="w-full truncate rounded-md border border-red-300 bg-red-50 px-2 py-1 text-left text-[12px] font-semibold text-red-700">
                              ⚠ {shortName(x.person.name)}
                            </button>
                          ))}
                          {editable && Array.from({ length: Math.min(missing, 4) }, (_, k) => (
                            <button key={`m-${k}`} type="button" onClick={e => openPicker(e, g.id, def, day)}
                              className="flex h-[26px] w-full items-center justify-center rounded-md border border-dashed border-red-200 text-red-300 transition-colors hover:border-red-400 hover:bg-red-50/60 hover:text-red-500"
                              title="Eksik: kişi eklemek için tıklayın">
                              <Plus size={12} />
                            </button>
                          ))}
                          {editable && missing === 0 && (
                            <button type="button" onClick={e => openPicker(e, g.id, def, day)}
                              className="flex h-[22px] w-full items-center justify-center rounded-md text-slate-200 transition-colors hover:bg-slate-50 hover:text-forest-500"
                              title="Kişi ekle">
                              <Plus size={12} />
                            </button>
                          )}
                        </DropCell>
                      </td>
                    );
                  })}
                </tr>
              )),
              ...onCallDefs.map(def => {
                const rows = placedOnCall.filter(x => x.groupId === g.id && x.defId === def.id);
                if (rows.length === 0 && !editable) return null;
                return (
                  <tr key={`${g.id}-oc-${def.id}`} className="border-t border-slate-100">
                    <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2 text-left align-top">
                      <div className="flex items-start gap-2">
                        <span className="mt-1 h-8 w-1.5 shrink-0 rounded-full border-2 border-dashed border-violet-400" />
                        <span>
                          <span className="block text-[13px] font-bold leading-tight text-slate-800">{def.name}</span>
                          <span className="block text-[11px] text-slate-400">Nöbet · {def.start}–{def.end}</span>
                        </span>
                      </div>
                    </th>
                    {days.map((_, day) => (
                      <td key={day} className={dayCell(day)}>
                        <div className="flex flex-col gap-1">
                          {rows.filter(x => x.day === day).map(x => (
                            <button key={x.person.id} type="button" onClick={e => onOnCallClick(e, x.person.id, day)}
                              title={`${x.person.name} · nöbet: evde bekler, çağrılırsa gelir`}
                              className="w-full truncate rounded-md border border-dashed border-violet-300 bg-white px-2 py-1 text-left text-[12px] font-semibold text-violet-800">
                              {shortName(x.person.name)}
                            </button>
                          ))}
                          {editable && (
                            <button type="button" onClick={e => openPicker(e, g.id, def, day)}
                              className="flex h-[22px] w-full items-center justify-center rounded-md text-slate-200 transition-colors hover:bg-slate-50 hover:text-violet-500"
                              title="Nöbetçi ekle">
                              <Plus size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                );
              }),
              other.length > 0 && (
                <tr key={`${g.id}-other`} className="border-t border-slate-100">
                  <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2 text-left align-top">
                    <div className="flex items-start gap-2">
                      <span className={cn("mt-1 h-8 w-1.5 shrink-0 rounded-full", customTone.dot)} />
                      <span>
                        <span className="block text-[13px] font-bold leading-tight text-slate-800">Diğer saatler</span>
                        <span className="block text-[11px] text-slate-400">Tanımlı vardiyaya uymayan</span>
                      </span>
                    </div>
                  </th>
                  {days.map((_, day) => (
                    <td key={day} className={dayCell(day)}>
                      <div className="flex flex-col gap-1">
                        {other.filter(x => x.day === day).map((x, k) => (
                          <button key={`${x.person.id}-${k}`} type="button" data-board-person={`${x.person.id}-${day}`} onClick={e => onNameClick(e, x.person.id, day)}
                            className={cn("w-full rounded-md border px-2 py-1 text-left transition-colors", customTone.box)}>
                            <span className={cn("block truncate text-[12px] font-semibold", customTone.name)}>{shortName(x.person.name)}</span>
                            <span className={cn("block text-[10.5px]", customTone.time)}>{timeLabel(x.cell)}</span>
                          </button>
                        ))}
                      </div>
                    </td>
                  ))}
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>

      {/* Kişi seçme listesi */}
      {picker && (() => {
        const g = groups.find(x => x.id === picker.groupId);
        // Nöbet satırında meşgul = o gün zaten nöbetçi; normal vardiyada = o gün vardiyası var
        const busy = picker.def.on_call
          ? new Map(placedOnCall.filter(x => x.day === picker.day).map(x => [x.person.id, { def: picker.def as ShiftDefinition | null, cell: { startMin: 0, endMin: 0 } as Cell }]))
          : new Map(placed.filter(x => x.day === picker.day).map(x => [x.person.id, x]));
        const list = (g?.members ?? [])
          .map(p => ({ p, st: statusOf(p.id, picker.day), busy: busy.get(p.id) }))
          .sort((a, b) => Number(!!a.busy || a.st === "away") - Number(!!b.busy || b.st === "away") || STATUS_ORDER[a.st] - STATUS_ORDER[b.st] || weekHours(a.p.id) - weekHours(b.p.id));
        // En uygun kişi: o gün boşta, "gelemem"/izin/tercih etmem demeyen ve bu hafta en az çalışan (liste zaten böyle sıralı)
        const bestId = list.find(x => !x.busy && !["unavailable", "leave", "weekly_off", "away", "preferred_not"].includes(x.st))?.p.id;
        return (
          <div ref={pickerRef} className="fixed z-50 w-[280px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl" style={{ left: picker.x, top: picker.y }}>
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-slate-800">{picker.def.name} · {days[picker.day].label} {days[picker.day].date}</p>
                <p className="text-[12px] text-slate-500">Kimi yazmak istiyorsunuz?</p>
              </div>
              <button type="button" onClick={() => setPicker(null)} className="p-1 text-slate-400 hover:text-slate-600" aria-label="Kapat"><X size={15} /></button>
            </div>
            <ul className="max-h-[270px] overflow-y-auto py-1">
              {list.length === 0 && <li className="px-4 py-3 text-[13px] text-slate-400">Bu departmanda kimse yok.</li>}
              {list.map(({ p, st, busy: b }) => {
                const warn = st === "unavailable" || st === "leave" || st === "weekly_off" || st === "away";
                return (
                  <li key={p.id}>
                    <button type="button" disabled={!!b || st === "away"}
                      onClick={() => { onAssign(p.id, picker.day, picker.def, picker.groupId); setPicker(null); }}
                      className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45">
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-slate-800">{p.name}
                          {p.id === bestId && <span className="shrink-0 rounded-full bg-forest-50 px-1.5 py-px text-[11px] font-semibold text-forest-700">Önerilen</span>}
                        </span>
                        <span className="block text-[11px] text-slate-400">{b ? picker.def.on_call ? "Bu gün zaten nöbetçi" : `Bu gün ${b.def?.name ?? timeLabel(b.cell)} vardiyasında` : `Bu hafta ${trNum(weekHours(p.id))} saat`}</span>
                      </span>
                      {!b && STATUS_LABEL[st] && (
                        <span className={cn("shrink-0 text-[11px] font-semibold", st === "available" ? "text-emerald-600" : warn ? "text-red-500" : "text-amber-600")}>{STATUS_LABEL[st]}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })()}
    </>
  );
}

/** Kutunun üstündeki "yazılan/gereken" sayısı; dokununca − / + ile kaç kişi gerektiği değişir */
function CountBar({ groupId, defId, day, here, need, canEdit, open, onToggle, onChange, hint }: {
  groupId: string; defId: string; day: number; here: number; need: number; hint: number | null;
  canEdit: boolean; open: boolean; onToggle: () => void; onChange: (n: number) => void;
}) {
  const missing = need > here;
  if (canEdit && open) {
    return (
      <div className="mb-1 flex items-center justify-between gap-1 rounded-md bg-slate-50 px-1 py-0.5" data-count={`${groupId}|${defId}|${day}`}>
        <button type="button" onClick={() => onChange(Math.max(0, need - 1))} disabled={need === 0}
          className="flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-white hover:text-slate-800 disabled:opacity-30" aria-label="Bir kişi azalt">
          <Minus size={13} />
        </button>
        <span className="text-center leading-tight">
          <span className="block text-[12px] font-bold tabular-nums text-slate-800" title="Bu vardiyaya kaç kişi gerekli">{need} kişi</span>
          {hint != null && hint !== need && <span className="block text-[10.5px] font-semibold text-sky-500" title="Geçmiş haftalara göre tahmin">tahmin {hint}</span>}
        </span>
        <button type="button" onClick={() => onChange(Math.min(50, need + 1))}
          className="flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-white hover:text-slate-800" aria-label="Bir kişi artır">
          <Plus size={13} />
        </button>
      </div>
    );
  }
  if (!canEdit) {
    if (need === 0) return null;
    return (
      <div className={cn("mb-1 text-right text-[10.5px] font-bold tabular-nums", missing ? "text-red-500" : "text-slate-300")}
        title={`${here} kişi yazıldı, ${need} kişi gerekiyor`}>{here}/{need}</div>
    );
  }
  return (
    <div className="mb-1 flex justify-end">
      <button type="button" onClick={onToggle}
        title={need ? `${here} kişi yazıldı, ${need} kişi gerekiyor. Sayıyı değiştirmek için dokunun.` : "Bu vardiyaya kaç kişi gerektiğini girmek için dokunun"}
        className={cn("rounded px-1 text-[10.5px] font-bold tabular-nums transition-colors hover:bg-slate-100",
          need === 0 ? "text-slate-300 hover:text-slate-600" : missing ? "text-red-500" : "text-slate-400 hover:text-slate-700")}>
        {need === 0 ? (here ? `${here}/?` : "kişi?") : `${here}/${need}`}
      </button>
    </div>
  );
}

/** Ad bırakılabilen kutu (sürükle bırak) */
function DropCell({ id, data, enabled, children }: { id: string; data: Record<string, unknown>; enabled: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver, active } = useDroppable({ id, data, disabled: !enabled });
  const dragging = !!active && active.data.current?.kind === "board-chip";
  return (
    <div ref={setNodeRef} data-drop={id} className={cn("flex min-h-[26px] flex-col gap-1 rounded-md transition-colors",
      dragging && enabled && "outline-dashed outline-1 outline-slate-200", isOver && "bg-forest-50 outline-forest-400")}>
      {children}
    </div>
  );
}

/** Kişinin adı: tıklayınca pencere, × ile çıkarma, tutup sürükleyince taşıma */
function NameChip({ personId, day, draggable, className, title, label, onClick, onRemove, removeLabel }: {
  personId: string; day: number; draggable: boolean; className: string; title: string; label: React.ReactNode;
  onClick: (e: React.MouseEvent) => void; onRemove?: () => void; removeLabel: string;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `chip:${personId}:${day}`, data: { kind: "board-chip", personId, day }, disabled: !draggable,
  });
  return (
    <div ref={setNodeRef} className={cn("group/chip relative flex items-stretch rounded-md border transition-colors", className, isDragging && "opacity-40",
      draggable && "cursor-grab active:cursor-grabbing touch-manipulation")} {...attributes} {...listeners} role="group">
      <button type="button" onClick={onClick} data-board-person={`${personId}-${day}`} title={title}
        className="min-w-0 flex-1 truncate px-2 py-1 text-left text-[12px] font-semibold">
        {label}
      </button>
      {onRemove && (
        <button type="button" onClick={e => { e.stopPropagation(); onRemove(); }} onPointerDown={e => e.stopPropagation()}
          aria-label={removeLabel} title="Plandan çıkar"
          className="flex w-6 shrink-0 items-center justify-center rounded-r-md opacity-60 hover:bg-black/5 hover:opacity-100 sm:opacity-0 sm:group-hover/chip:opacity-70 sm:focus:opacity-100">
          <X size={12} />
        </button>
      )}
    </div>
  );
}
