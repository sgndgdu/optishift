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
      const r = await call(`/api/leave-requests/review?id=${a.leave_id}`, "PATCH", { status: a.status, conflict_action: "open", replacements: a.replacements ?? {} });
      if (!r.ok) return { ok: false, message: err(r.data, "Talep güncellenemedi.") };
      if (a.status !== "approved") return { ok: true, message: "İzin reddedildi." };
      const replaced = Number(r.data.replaced ?? 0);
      const skipped = Array.isArray(r.data.skipped) ? (r.data.skipped as string[]) : [];
      return { ok: true, message: `İzin onaylandı.${replaced ? ` ${replaced} vardiya yedeğe yazıldı.` : ""}${skipped.length ? ` ${skipped.join(". ")}.` : ""}` };
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
    case "assign_open_shift": {
      const r = await call("/api/open-shifts", "PATCH", { id: a.open_shift_id, claimed_by: a.personnel_id, claimed_by_name: a.name, assigned_by_manager: true });
      if (!r.ok) return { ok: false, message: `${a.name} atanamadı: ${violationText(r.data, "işlem yapılamadı")} Açık Vardiyalar'dan başka birini seçin.` };
      if (r.data?.pending) return { ok: true, message: `${a.name} yazıldı. Başka şubeden olduğu için kendi sorumlusu onaylayınca kesinleşir.` };
      return { ok: true, message: `Vardiya ${a.name} adına yazıldı, kendisine bildirim gitti.` };
    }
    case "fill_gap": {
      // Eksik vardiya: sessiz ilan açılır (kimseye duyurulmaz) ve kişiye verilir; kural ve ödünç kontrolleri ilan yolundakiyle aynı
      const os = await call("/api/open-shifts", "POST", {
        location_id: a.location_id, date: a.date, start_time: a.start_time, end_time: a.end_time, note: "Eksik vardiya", notify: "none",
      });
      if (!os.ok || !os.data?.id) return { ok: false, message: err(os.data, "Vardiya açılamadı.") };
      const r = await call("/api/open-shifts", "PATCH", { id: os.data.id, claimed_by: a.personnel_id, claimed_by_name: a.name, assigned_by_manager: true });
      if (!r.ok) {
        await call(`/api/open-shifts?id=${os.data.id}`, "DELETE", undefined);
        return { ok: false, message: `${a.name} yazılamadı: ${violationText(r.data, "işlem yapılamadı")} Vardiya Planı'ndan başka birini seçin.` };
      }
      if (r.data?.pending) return { ok: true, message: `${a.name} yazıldı. Başka şubeden olduğu için kendi sorumlusu onaylayınca kesinleşir.` };
      return { ok: true, message: `${a.name} vardiyaya yazıldı, kendisine bildirim gitti.` };
    }
    case "request_leave": {
      const r = await call("/api/leave-requests", "POST", {
        personnel_id: a.personnel_id, type: a.type, start_date: a.start_date, end_date: a.end_date, days: a.days, note: a.note,
      });
      if (!r.ok) return { ok: false, message: err(r.data, "İzin talebi gönderilemedi.") };
      return { ok: true, message: "İzin talebiniz sorumlunuza gönderildi. Karar verilince bildirim alırsınız." };
    }
    case "release_shift": {
      const r = await call("/api/open-shifts", "POST", { convert_assignment_id: a.assignment_id });
      if (!r.ok) return { ok: false, message: err(r.data, "Vardiya bırakılamadı.") };
      return { ok: true, message: "Vardiya ekibe duyuruldu. Biri alana kadar vardiya sizde kalır." };
    }
    case "claim_open_shift": {
      const r = await call("/api/open-shifts", "PATCH", { id: a.open_shift_id, claimed_by: a.personnel_id, claimed_by_name: a.name });
      if (!r.ok) return { ok: false, message: violationText(r.data, "Vardiya alınamadı.") };
      return { ok: true, message: "Vardiya sizin oldu, planınıza eklendi." };
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
