"use client";

import ChatView from "@/components/chat/ChatView";

export default function ManagerChatPage() {
  return (
    <ChatView
      storageKey="optishift_manager_user"
      title="Mesajlar"
      description="Ekibinizle ve sorumlularla mesajlaşın."
      groupLabel={g => ({ name: g.name, label: "Şube Grubu" })}
      personLabel={p => ({ label: p.label ?? "", accent: p.role === "admin" || p.role === "supervisor" })}
    />
  );
}
