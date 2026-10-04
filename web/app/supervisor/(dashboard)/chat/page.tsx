"use client";

import ChatView from "@/components/chat/ChatView";

// Tüm Şubeler: şube grupları ve yöneticiler (personel listede yok)
export default function SupervisorChatPage() {
  return (
    <ChatView
      storageKey="optishift_supervisor_user"
      title="Mesajlar"
      description="Şube grupları ve müdürlerle mesajlaşın."
      allowedRoles={["supervisor", "admin"]}
      groupLabel={g => ({ name: g.name, label: "Şube Grubu" })}
      personLabel={p => p.role === "employee" ? null : ({ label: p.location ? `${p.label ?? ""} · ${p.location}` : (p.label ?? ""), accent: true })}
    />
  );
}
