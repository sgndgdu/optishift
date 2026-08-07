import type { Metadata } from "next";
import GuideContent from "@/components/guide/GuideContent";

export const metadata: Metadata = {
  title: "Kullanım Kılavuzu – OptiShift",
  description: "OptiShift vardiya yönetim platformunu müdür, personel ve süpervizör rolleri için nasıl kullanacağınızı anlatan kapsamlı kılavuz.",
};

export default function GuidePage() {
  return <GuideContent />;
}
