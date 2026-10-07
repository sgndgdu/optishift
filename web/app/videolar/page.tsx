import { redirect } from "next/navigation";

/** Eski özellik videoları sayfası: videolar kaldırıldı, ürün turuna yönlendirir */
export default function VideosPage() {
  redirect("/#tur");
}
