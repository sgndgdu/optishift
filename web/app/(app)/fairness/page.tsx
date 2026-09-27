import { redirect } from "next/navigation";

// Adalet Puanı, menü sadeleştirmesiyle Raporlar'ın bir sekmesi oldu.
// Eski yer imleri ve bağlantılar çalışmaya devam etsin diye bu adres yönlendirir.
export default function FairnessRedirect() {
  redirect("/reports?tab=adalet");
}
