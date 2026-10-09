import { redirect } from "next/navigation";

// Ayrı Açık Vardiyalar sayfası kalktı (2026-10-09, kullanıcı kararı): ilanlar Vardiya Planı tablosunda görünür
// ve oradan yönetilir (components/schedule/OpenShiftSheet). Eski bağlantılar plana gider.
export default function OpenShiftsPage() {
  redirect("/schedule?week=this");
}
