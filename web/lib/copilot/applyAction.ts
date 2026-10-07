/**
 * Asistanın önerdiği işlemi (lib/ai/actions) sorumlu onaylayınca uygular: uygulamanın MEVCUT uçlarını
 * çağırır, böylece yetki (proxy), kural ve bildirim akışları ekrandan yapılan işlemle aynıdır.
 * Tarayıcıda çalışır. Başarıda ekranların tazelenmesi için "optishift_data_changed" olayı atılır.
 */
import type { ProposedAction } from "@/lib/ai/actions";
import { violationText } from "@/lib/ruleViolations";

export type ApplyResult = { ok: boolean; message: string };

async function call(url: string, method: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}
const err = (d: Record<string, unknown>, fallback: string) => (typeof d.error === "string" && d.error) || fallback;

async function run(a: ProposedAction): Promise<ApplyResult> {
  switch (a.kind) {
    case "add_leave": {
      const created = await call("/api/leave-requests", "POST", {
        personnel_id: a.personnel_id, type: a.type, start_date: a.start_date, end_date: a.end_date, days: a.days, note: a.note,
      });
      if (!created.ok || !created.data.id) return { ok: false, message: err(created.data, "İzin kaydedilemedi.") };
      const review = await call(`/api/leave-requests/review?id=${created.data.id}`, "PATCH", { status: "approved", conflict_action: "open" });
      if (!review.ok) return { ok: false, message: `İzin talebi açıldı ama onaylanamadı (${err(review.data, "hata")}). Onaylar sayfasından onaylayın.` };
      const removed = Number(review.data.removed ?? 0);
      return { ok: true, message: `İzin kaydedildi.${removed ? ` ${removed} vardiya plandan çıktı.` : ""}` };
    }
    case "review_leave": {
      const r = await call(`/api/leave-requests/review?id=${a.leave_id}`, "PATCH", { status: a.status, conflict_action: "open" });
      if (!r.ok) return { ok: false, message: err(r.data, "Talep güncellenemedi.") };
      return { ok: true, message: a.status === "approved" ? "İzin onaylandı." : "İzin reddedildi." };
    }
    case "review_swap": {
      const r = await call("/api/swap-requests", "PATCH", { id: a.swap_id, status: a.status });
      if (!r.ok) return { ok: false, message: err(r.data, "Talep güncellenemedi.") };
      return { ok: true, message: a.status === "manager_approved" ? "Vardiya değişikliği onaylandı." : "Vardiya değişikliği reddedildi." };
    }
    case "absence": {
      const opened = await call("/api/open-shifts", "POST", {
        convert_assignment_id: a.assignment_id, note: a.note, notify: a.replacement ? "none" : "top",
      });
      if (!opened.ok) return { ok: false, message: err(opened.data, "Vardiya ilana çıkarılamadı.") };
      if (!a.replacement) {
        const names = Array.isArray(opened.data.notified) ? (opened.data.notified as string[]) : [];
        return { ok: true, message: names.length ? `${names.join(", ")} kişilerine teklif gönderildi. Vardiyayı ilk kabul eden alır.` : "Uygun kimse bulunamadı, vardiya açık vardiya olarak ekibe duyuruldu." };
      }
      const assigned = await call("/api/open-shifts", "PATCH", {
        id: opened.data.id, claimed_by: a.replacement.personnel_id, claimed_by_name: a.replacement.name, assigned_by_manager: true,
      });
      if (!assigned.ok) {
        return { ok: false, message: `Vardiya ilana çıktı ama ${a.replacement.name} atanamadı: ${violationText(assigned.data, "kural engeli")} Açık Vardiyalar'dan başka birini seçin.` };
      }
      return { ok: true, message: `${a.replacement.name} vardiyaya atandı ve bilgilendirildi.` };
    }
    case "open_shift": {
      const r = await call("/api/open-shifts", "POST", {
        location_id: a.location_id, date: a.date, start_time: a.start_time, end_time: a.end_time, note: a.note || null,
      });
      if (!r.ok) return { ok: false, message: err(r.data, "İlan verilemedi.") };
      return { ok: true, message: "Açık vardiya ilanı verildi, ekibe duyuruldu." };
    }
  }
}

export async function applyAction(a: ProposedAction): Promise<ApplyResult> {
  try {
    const res = await run(a);
    if (res.ok && typeof window !== "undefined") window.dispatchEvent(new Event("optishift_data_changed"));
    return res;
  } catch {
    return { ok: false, message: "Bağlantı hatası, tekrar deneyin." };
  }
}
