"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Send, Users, Building2, ChevronRight, Check, CheckCheck, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: number;
  from_user_id: string;
  from_name?: string;
  sender_name?: string;
  content: string;
  created_at: number;
  is_read: number | boolean;
  _optimistic?: boolean;
}

interface Contact {
  id: string;
  name: string;
  type: "individual" | "group";
  groupId?: string;
  subtitle?: string;
  lastMessage?: string;
  lastAt?: number;
  unread?: number;
}

function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}
function formatDate(ts: number) {
  const d = new Date(ts * 1000);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Bugün";
  if (d.toDateString() === yesterday.toDateString()) return "Dün";
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}
function formatRelative(ts: number) {
  const diff = Date.now() - ts * 1000;
  if (diff < 60_000)   return "şimdi";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}dk`;
  const d = new Date(ts * 1000);
  if (d.toDateString() === new Date().toDateString())
    return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

function ContactRow({ c, selected, onSelect }: { c: Contact; selected: Contact | null; onSelect: (c: Contact) => void }) {
  const isSelected = selected?.id === c.id;
  return (
    <button onClick={() => onSelect(c)}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors",
        isSelected && "bg-violet-50 hover:bg-violet-50"
      )}>
      <div className={cn(
        "w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 relative",
        isSelected
          ? "bg-violet-600 text-white"
          : c.type === "group" ? "bg-violet-100 text-violet-600" : "bg-violet-100 text-violet-600"
      )}>
        {c.type === "group" ? <Users size={15} /> : c.name.charAt(0)}
        {(c.unread ?? 0) > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
            {c.unread}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <p className={cn("text-sm truncate", isSelected ? "font-bold text-violet-700" : "font-semibold text-slate-700")}>{c.name}</p>
          {c.lastAt && <span className="text-[9px] text-slate-400 shrink-0">{formatRelative(c.lastAt)}</span>}
        </div>
        {c.lastMessage ? (
          <p className={cn("text-[11px] truncate", (c.unread ?? 0) > 0 ? "font-semibold text-slate-700" : "text-slate-400 font-medium")}>
            {c.lastMessage}
          </p>
        ) : (
          <p className="text-xs text-slate-400 truncate">{c.subtitle}</p>
        )}
      </div>
    </button>
  );
}

export default function SupervisorChatPage() {
  const router = useRouter();
  const [user,            setUser]            = useState<any>(null);
  const [mounted,         setMounted]         = useState(false);
  const [contacts,        setContacts]        = useState<Contact[]>([]);
  const [selected,        setSelected]        = useState<Contact | null>(null);
  const [messages,        setMessages]        = useState<Message[]>([]);
  const [draft,           setDraft]           = useState("");
  const [sending,         setSending]         = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [sidebarOpen,     setSidebarOpen]     = useState(false);
  const [newMsgCount,     setNewMsgCount]     = useState(0);
  const [isAtBottom,      setIsAtBottom]      = useState(true);

  const bottomRef      = useRef<HTMLDivElement>(null);
  const scrollRef      = useRef<HTMLDivElement>(null);
  const esRef          = useRef<EventSource | null>(null);
  const convPollRef    = useRef<NodeJS.Timeout | null>(null);
  const selectedRef    = useRef<Contact | null>(null);
  const userRef        = useRef<any>(null);
  const isAtBottomRef  = useRef(true);
  selectedRef.current  = selected;
  userRef.current      = user;
  isAtBottomRef.current = isAtBottom;

  useEffect(() => {
    try {
      const stored = localStorage.getItem("optishift_supervisor_user");
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed) setUser(parsed);
      setMounted(true);
    } catch {}
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!user) { router.push("/login"); return; }
    if (user.role !== "supervisor" && user.role !== "admin") { router.push("/login"); return; }
  }, [mounted, user, router]);

  const buildContacts = useCallback(async () => {
    const u = userRef.current;
    if (!u) return;
    setLoadingContacts(true);
    const list: Contact[] = [];

    try {
      const locs = await fetch(`/api/locations?org_id=${u.org_id}`).then(r => r.json());
      if (Array.isArray(locs)) {
        for (const loc of locs) {
          list.push({
            id: `group-${loc.id}`, name: loc.name, type: "group",
            groupId: `loc-${loc.id}`, subtitle: "Şube Grubu",
          });
        }
      }
    } catch {}

    try {
      const [pplData, locsData] = await Promise.all([
        fetch(`/api/personnel?org_id=${u.org_id}`).then(r => r.json()),
        fetch(`/api/locations?org_id=${u.org_id}`).then(r => r.json()),
      ]);
      const locMap: Record<string, string> = {};
      if (Array.isArray(locsData)) for (const l of locsData) locMap[l.id] = l.name;

      if (Array.isArray(pplData)) {
        for (const p of pplData) {
          if (!p.user_id || p.user_id === u.id) continue;
          if (p.user_access_level !== "manager" && p.user_access_level !== "admin") continue;
          const locName = locMap[p.location_id] ?? "";
          list.push({
            id: p.user_id, name: p.name, type: "individual",
            subtitle: locName ? `Müdür · ${locName}` : "Müdür",
          });
        }
      }
    } catch {}

    setContacts(list);
    if (list.length > 0 && !selectedRef.current) setSelected(list[0]);
    setLoadingContacts(false);
  }, []);

  useEffect(() => { if (user) buildContacts(); }, [user, buildContacts]);

  // ── Conversations poll — sorted by recency ────────────────────────────────
  const pollConversations = useCallback(async () => {
    const u = userRef.current;
    if (!u) return;
    try {
      const data = await fetch("/api/messages/conversations").then(r => r.json());
      const dmMap: Record<string, any>  = {};
      const grpMap: Record<string, any> = {};
      for (const c of (data.dm ?? []))     dmMap[c.partner_id]  = c;
      for (const g of (data.groups ?? [])) grpMap[g.group_id]   = g;

      setContacts(prev => {
        const updated = prev.map(c => {
          if (c.type === "group" && c.groupId && grpMap[c.groupId]) {
            const g = grpMap[c.groupId];
            return { ...c, lastMessage: g.last_message, lastAt: g.last_at, unread: g.unread };
          }
          if (c.type === "individual" && dmMap[c.id]) {
            const d = dmMap[c.id];
            return { ...c, lastMessage: d.last_message, lastAt: d.last_at, unread: d.unread };
          }
          return c;
        });
        return [...updated].sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0));
      });
    } catch {}
  }, []);

  useEffect(() => {
    if (!user) return;
    pollConversations();
    convPollRef.current = setInterval(pollConversations, 5_000);
    return () => { if (convPollRef.current) clearInterval(convPollRef.current); };
  }, [user, pollConversations]);

  // ── SSE real-time messages ────────────────────────────────────────────────
  useEffect(() => {
    const u = userRef.current;
    if (!selected || !u) return;

    setMessages([]);
    setNewMsgCount(0);
    setIsAtBottom(true);
    if (esRef.current) { esRef.current.close(); esRef.current = null; }

    const initUrl = selected.type === "group"
      ? `/api/messages?org_id=${u.org_id}&group_id=${selected.groupId}`
      : `/api/messages?org_id=${u.org_id}&to_user_id=${selected.id}`;

    fetch(initUrl).then(r => r.json()).then((data: Message[]) => {
      if (!Array.isArray(data)) return;
      setMessages(data);
      const lastId = data.length > 0 ? Math.max(...data.map(m => m.id)) : 0;
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "auto" }), 50);

      const sseUrl = selected.type === "group"
        ? `/api/messages/stream?group_id=${selected.groupId}&since_id=${lastId}`
        : `/api/messages/stream?to_user_id=${selected.id}&since_id=${lastId}`;

      const es = new EventSource(sseUrl);
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const msg: Message = JSON.parse(e.data);
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            const filtered = prev.filter(m =>
              !(m._optimistic && m.content === msg.content && m.from_user_id === msg.from_user_id)
            );
            if (isAtBottomRef.current) {
              setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
            } else if (msg.from_user_id !== userRef.current?.id) {
              setNewMsgCount(c => c + 1);
            }
            return [...filtered, msg];
          });
          pollConversations();
        } catch {}
      };
    }).catch(() => {});

    return () => {
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.groupId]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setIsAtBottom(atBottom);
    if (atBottom) setNewMsgCount(0);
  }, []);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setNewMsgCount(0);
  };

  const handleSelect = (c: Contact) => {
    setSelected(c);
    setSidebarOpen(false);
    setContacts(prev => prev.map(x => x.id === c.id ? { ...x, unread: 0 } : x));
  };

  const sendMessage = async () => {
    const u = userRef.current;
    if (!draft.trim() || !selected || !u || sending) return;
    const content = draft.trim();
    setDraft("");

    const optimisticId = -Date.now();
    const optimistic: Message = {
      id: optimisticId, from_user_id: u.id, from_name: u.name,
      sender_name: u.name, content,
      created_at: Math.floor(Date.now() / 1000),
      is_read: false, _optimistic: true,
    };
    setMessages(prev => [...prev, optimistic]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 30);

    setSending(true);
    try {
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: u.org_id, from_user_id: u.id,
          to_user_id: selected.type === "individual" ? selected.id : undefined,
          group_id:   selected.type === "group" ? selected.groupId : undefined,
          content,
        }),
      });
      pollConversations();
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      setDraft(content);
    }
    setSending(false);
  };

  const grouped: { date: string; msgs: Message[] }[] = [];
  for (const m of messages) {
    const d = formatDate(m.created_at);
    const last = grouped[grouped.length - 1];
    if (last?.date === d) last.msgs.push(m);
    else grouped.push({ date: d, msgs: [m] });
  }

  const totalUnread = contacts.reduce((s, c) => s + (c.unread ?? 0), 0);

  if (!mounted) return <div className="flex h-full" />;

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Mesajlaşma</h1>
        <p className="text-muted-foreground mt-1 text-sm">Şube grupları ve müdürlerle mesajlaşın.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 h-auto md:h-[calc(100vh-240px)] relative">
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/30 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* ── Contacts ─────────────────────────────────────────────────── */}
        <div className={cn(
          "absolute md:relative inset-y-0 left-0 z-30 md:z-auto w-72 md:w-64 md:shrink-0 bg-white rounded-2xl border border-slate-200/60 flex flex-col overflow-hidden transition-transform duration-200 md:translate-x-0",
          sidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0"
        )}>
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <MessageSquare size={15} className="text-violet-500" />
              Konuşmalar
            </h2>
            <div className="flex items-center gap-2">
              {totalUnread > 0 && (
                <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{totalUnread}</span>
              )}
              <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingContacts ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}
              </div>
            ) : contacts.length === 0 ? (
              <div className="p-6 text-center text-slate-400">
                <Building2 size={28} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-semibold">Kişi bulunamadı.</p>
              </div>
            ) : (
              contacts.map(c => <ContactRow key={c.id} c={c} selected={selected} onSelect={handleSelect} />)
            )}
          </div>
        </div>

        {/* ── Chat area ────────────────────────────────────────────────── */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200/60 flex flex-col overflow-hidden min-h-[400px] md:min-h-0 relative">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
              <button onClick={() => setSidebarOpen(true)} className="md:hidden mb-4 flex items-center gap-2 px-4 py-2 bg-violet-50 text-violet-700 rounded-xl text-sm font-bold">
                <ChevronRight size={16} className="rotate-180" /> Konuşmaları Göster
              </button>
              <MessageSquare size={40} className="mb-3 text-slate-300" />
              <p className="font-semibold text-slate-500">Mesajlaşmak için bir konuşma seçin.</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
                <button onClick={() => setSidebarOpen(true)} className="md:hidden p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors shrink-0">←</button>
                <div className={cn(
                  "w-9 h-9 rounded-full font-bold text-sm flex items-center justify-center shrink-0",
                  selected.type === "group" ? "bg-violet-100 text-violet-600" : "bg-violet-600 text-white"
                )}>
                  {selected.type === "group" ? <Users size={16} /> : selected.name.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-sm">{selected.name}</p>
                  <p className="text-xs text-slate-400">{selected.subtitle}</p>
                </div>
              </div>

              <div ref={scrollRef} onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 py-12">
                    <MessageSquare size={32} className="mb-2 text-slate-300" />
                    <p className="text-sm font-semibold">Henüz mesaj yok.</p>
                  </div>
                )}
                {grouped.map(({ date, msgs }) => (
                  <div key={date}>
                    <div className="flex items-center gap-3 my-3">
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{date}</span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>
                    <div className="space-y-2">
                      {msgs.map(msg => {
                        const isMe = msg.from_user_id === user?.id;
                        const name = msg.from_name ?? msg.sender_name;
                        const isRead = msg.is_read === true || msg.is_read === 1;
                        return (
                          <div key={msg.id} className={cn("flex gap-2", isMe ? "justify-end" : "justify-start")}>
                            {!isMe && (
                              <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0 mt-0.5">
                                {name?.charAt(0)?.toUpperCase() ?? "?"}
                              </div>
                            )}
                            <div className={cn("max-w-[75%] flex flex-col gap-0.5", isMe ? "items-end" : "items-start")}>
                              {!isMe && selected.type === "group" && (
                                <span className="text-[10px] font-bold text-slate-400 px-1">{name}</span>
                              )}
                              <div className={cn(
                                "px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
                                isMe
                                  ? `bg-violet-600 text-white rounded-tr-sm${msg._optimistic ? " opacity-60" : ""}`
                                  : "bg-white border border-slate-100 text-slate-800 rounded-tl-sm shadow-sm"
                              )}>
                                {msg.content}
                              </div>
                              <div className={cn("flex items-center gap-1 px-1", isMe && "flex-row-reverse")}>
                                <span className="text-[10px] text-slate-400">{formatTime(msg.created_at)}</span>
                                {isMe && !msg._optimistic && selected.type === "individual" && (
                                  isRead
                                    ? <CheckCheck size={12} className="text-blue-400" />
                                    : <Check size={12} className="text-slate-400" />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {newMsgCount > 0 && (
                <button onClick={scrollToBottom}
                  className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-violet-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg hover:bg-violet-700 transition-colors z-10">
                  <ArrowDown size={12} />
                  {newMsgCount} yeni mesaj
                </button>
              )}

              <div className="px-3 py-3 border-t border-slate-100 flex items-end gap-2">
                <textarea value={draft} onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }}}
                  placeholder="Mesajınızı yazın..." rows={1}
                  className="flex-1 px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm font-medium resize-none focus:outline-none focus:border-violet-500 transition-colors max-h-32"
                  style={{ minHeight: "44px" }}
                  onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = `${Math.min(t.scrollHeight, 128)}px`; }}
                />
                <button onClick={sendMessage} disabled={!draft.trim() || sending}
                  className="w-11 h-11 rounded-2xl bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 text-white flex items-center justify-center transition-colors shrink-0">
                  {sending ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
