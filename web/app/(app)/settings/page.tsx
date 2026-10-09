"use client";

import BranchSettings from "@/components/settings/BranchSettings";

// Şube ayarları tek bileşende (components/settings/BranchSettings); Tüm Şubeler › Ayarlar da aynı bileşeni şube seçerek açar
export default function SettingsPage() {
  return <BranchSettings />;
}
