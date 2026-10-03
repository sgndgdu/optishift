"use client";

import ChatView from "@/components/chat/ChatView";

export default function EmployeeChatPage() {
  return (
    <ChatView
      storageKey="optishift_portal_user"
      title="Mesajlar"
      groupLabel={g => ({ name: "Ekip Sohbeti", label: g.name })}
      personLabel={p => ({ label: p.label ?? "", accent: p.role !== "employee" })}
      heightClass="h-[calc(100vh-17rem)] md:h-[calc(100vh-15rem)] min-h-[380px]"
    />
  );
}
