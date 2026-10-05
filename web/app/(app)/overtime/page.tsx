import { redirect } from "next/navigation";

// Fazla Mesai artık Raporlar'ın sekmesi (2026-10-05): eski bağlantılar oraya gider
export default function OvertimePage() {
  redirect("/reports?tab=mesai");
}
