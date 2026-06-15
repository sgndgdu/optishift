"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState, useCallback } from "react";
import { MessageSquare, Send, Users, ChevronRight, Check, CheckCheck, ArrowDown, Trash2, Search } from "lucide-react";

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
  role: string;
  type: "individual" | "group";
  groupId?: string;
  label?: string;
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
      className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${
        isSelected ? "bg-primary/5 border-r-2 border-primary" : "hover:bg-slate-50"
      }`}>
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 relative ${
        c.type === "group" ? "bg-violet-100 text-violet-700" :
        c.role === "supervisor" ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"
      }`}>
        {c.type === "group" ? <Users size={14} /> : c.name.charAt(0).toUpperCase()}
        {(c.unread ?? 0) > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
            {c.unread}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <p className={`text-sm truncate ${isSelected ? "font-bold text-primary" : "font-semibold text-slate-700"}`}>{c.name}</p>
          {c.lastAt && <span className="text-[9px] text-slate-400 shrink-0">{formatRelative(c.lastAt)}</span>}
        </div>
        {c.lastMessage ? (
          <p className={`text-[11px] truncate ${(c.unread ?? 0) > 0 ? "font-semibold text-slate-700" : "text-slate-400 font-medium"}`}>
            {c.lastMessage}
          </p>
        ) : (
          <p className="text-[11px] text-slate-300 font-medium">{c.label ?? c.role}</p>
        )}
      </div>
    </button>
  );
}

export default function ManagerChatPage() {
  const [user,         setUser]         = useState<any>(null);
  const [contacts,     setContacts]     = useState<Contact[]>([]);
  const [selected,     setSelected]     = useState<Contact | null>(null);
  const [messages,     setMessages]     = useState<Message[]>([]);
  const [text,         setText]         = useState("");
  const [sending,      setSending]      = useState(false);
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [newMsgCount,  setNewMsgCount]  = useState(0);
  const [isAtBottom,   setIsAtBottom]   = useState(true);
  const [search,       setSearch]       = useState("");
  const [clearConfirm, setClearConfirm] = useState(false);

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
      const stored = localStorage.getItem("optishift_manager_user");
      if (stored) setUser(JSON.parse(stored));
    } catch {}
  }, []);

  const buildContacts = useCallback(async () => {
    const u = userRef.current;
    if (!u) return;
    const list: Contact[] = [];

    try {
      const locs = await fetch(`/api/locations?org_id=${u.org_id}`).then(r => r.json());
      if (Array.isArray(locs)) {
        for (const loc of locs) {
          list.push({
            id: `group-${loc.id}`, name: loc.name, role: "location",
            type: "group", groupId: `loc-${loc.id}`, label: "Şube Grubu",
          });
        }
      }
    } catch {}

    try {
      const ppl = await fetch(`/api/personnel?org_id=${u.org_id}`).then(r => r.json());
      if (Array.isArray(ppl)) {
        for (const p of ppl) {
          if (!p.user_id || p.user_id === u.id) continue;
          const isSupervisor = p.user_access_level === "admin" || p.user_access_level === "supervisor";
          list.push({
            id: p.user_id, name: p.name,
            role: isSupervisor ? "supervisor" : "employee",
            type: "individual",
            label: isSupervisor ? "Süpervizör" : (p.title || "Personel"),
          });
        }
      }
    } catch {}

    setContacts(list);
    // No auto-select — user must choose from the directory
  }, []);

  useEffect(() => { if (user) buildContacts(); }, [user, buildContacts]);

  // ── Conversations poll — update unread + lastMessage (no recency sort in directory mode)
  const pollConversations = useCallback(async () => {
    const u = userRef.current;
    if (!u) return;
    try {
      const data = await fetch("/api/messages/conversations").then(r => r.json());
      const dmMap: Record<string, any>  = {};
      const grpMap: Record<string, any> = {};
      for (const c of (data.dm ?? []))     dmMap[c.partner_id]  = c;
      for (const g of (data.groups ?? [])) grpMap[g.group_id]   = g;

      setContacts(prev => prev.map(c => {
        if (c.type === "group" && c.groupId && grpMap[c.groupId]) {
          const g = grpMap[c.groupId];
          return { ...c, lastMessage: g.last_message, lastAt: g.last_at, unread: g.unread };
        }
        if (c.type === "individual" && dmMap[c.id]) {
          const d = dmMap[c.id];
          return { ...c, lastMessage: d.last_message, lastAt: d.last_at, unread: d.unread };
        }
        return c;
      }));
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
    setClearConfirm(false);
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

  const handleSelectContact = (c: Contact) => {
    setSelected(c);
    setSidebarOpen(false);
    setContacts(prev => prev.map(x => x.id === c.id ? { ...x, unread: 0 } : x));
  };

  const clearConversation = async () => {
    if (!selected) return;
    const url = selected.type === "group"
      ? `/api/messages?group_id=${selected.groupId}`
      : `/api/messages?to_user_id=${selected.id}`;
    setMessages([]);
    setClearConfirm(false);
    await fetch(url, { method: "DELETE" });
    pollConversations();
  };

  async function send() {
    const u = userRef.current;
    if (!text.trim() || !selected || !u || sending) return;
    const content = text.trim();
    setText("");

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
      setText(content);
    } finally { setSending(false); }
  }

  const grouped: { date: string; msgs: Message[] }[] = [];
  for (const m of messages) {
    const d = formatDate(m.created_at);
    const last = grouped[grouped.length - 1];
    if (last?.date === d) last.msgs.push(m);
    else grouped.push({ date: d, msgs: [m] });
  }

  const totalUnread = contacts.reduce((s, c) => s + (c.unread ?? 0), 0);
  const q = search.toLowerCase();
  const filtered = q ? contacts.filter(c => c.name.toLowerCase().includes(q)) : contacts;
  const groupContacts = filtered.filter(c => c.type === "group");
  const individualContacts = filtered.filter(c => c.type === "individual");

  return (
    <div className="h-[calc(100vh-4rem)] md:h-screen flex overflow-hidden bg-slate-50 relative">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar / Directory ───────────────────────────────────────────── */}
      <div className={`absolute md:relative inset-y-0 left-0 z-30 w-72 shrink-0 bg-white border-r border-slate-100 flex flex-col transition-transform duration-200 md:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="p-4 md:p-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <MessageSquare size={16} className="text-primary" />
              </div>
              <h2 className="text-base font-black text-slate-900">Rehber</h2>
            </div>
            <div className="flex items-center gap-2">
              {totalUnread > 0 && (
                <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{totalUnread}</span>
              )}
              <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Kişi ara…"
              className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-primary transition-colors placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {contacts.length === 0 ? (
            <p className="text-xs text-slate-400 text-center mt-8 px-4">Kişi bulunamadı.</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-slate-400 text-center mt-8 px-4">"{search}" için sonuç yok.</p>
          ) : (
            <>
              {groupContacts.length > 0 && (
                <>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-4 pt-3 pb-1">Kanallar</p>
                  {groupContacts.map(c => (
                    <ContactRow key={c.id} c={c} selected={selected} onSelect={handleSelectContact} />
                  ))}
                </>
              )}
              {individualContacts.length > 0 && (
                <>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-4 pt-3 pb-1">Kişiler</p>
                  {individualContacts.map(c => (
                    <ContactRow key={c.id} c={c} selected={selected} onSelect={handleSelectContact} />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Chat area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {selected ? (
          <>
            {/* Header */}
            <div className="bg-white border-b border-slate-100 px-4 md:px-6 py-3 md:py-4 flex items-center gap-3 shrink-0">
              <button onClick={() => setSidebarOpen(true)} className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 shrink-0">
                <ChevronRight size={16} className="rotate-180" />
              </button>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                selected.type === "group" ? "bg-violet-100 text-violet-700" : "bg-indigo-100 text-indigo-700"
              }`}>
                {selected.type === "group" ? <Users size={16} /> : selected.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-slate-900 truncate">{selected.name}</p>
                <p className="text-[10px] text-slate-400 font-medium">{selected.label ?? selected.role}</p>
              </div>
              {clearConfirm ? (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-500">Sohbet silinsin mi?</span>
                  <button onClick={clearConversation} className="text-xs font-bold text-white bg-red-500 hover:bg-red-600 px-2.5 py-1 rounded-lg transition-colors">Sil</button>
                  <button onClick={() => setClearConfirm(false)} className="text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors">İptal</button>
                </div>
              ) : (
                <button onClick={() => setClearConfirm(true)} title="Sohbeti Temizle"
                  className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                  <Trash2 size={15} />
                </button>
              )}
            </div>

            {/* Messages */}
            <div ref={scrollRef} onScroll={handleScroll}
              className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-2 bg-slate-50/50">
              {grouped.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-300">
                  <MessageSquare size={40} strokeWidth={1.5} />
                  <p className="text-sm font-medium">İlk mesajı gönder!</p>
                </div>
              )}
              {grouped.map(({ date, msgs }) => (
                <div key={date}>
                  <div className="flex items-center gap-3 my-3">
                    <div className="flex-1 h-px bg-slate-200" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{date}</span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                  <div className="space-y-1.5">
                    {msgs.map(m => {
                      const isMe = m.from_user_id === user?.id;
                      const name = m.from_name ?? m.sender_name;
                      const isRead = m.is_read === true || m.is_read === 1;
                      return (
                        <div key={m.id} className={`flex gap-2 ${isMe ? "justify-end" : "justify-start"}`}>
                          {!isMe && (
                            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 shrink-0 mt-0.5">
                              {name?.charAt(0)?.toUpperCase() ?? "?"}
                            </div>
                          )}
                          <div className={`max-w-[70%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                            {!isMe && selected.type === "group" && (
                              <span className="text-[10px] font-bold text-slate-500 px-1">{name}</span>
                            )}
                            <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                              isMe
                                ? `bg-primary text-white rounded-tr-sm${m._optimistic ? " opacity-60" : ""}`
                                : "bg-white border border-slate-100 text-slate-800 rounded-tl-sm shadow-sm"
                            }`}>
                              {m.content}
                            </div>
                            <div className={`flex items-center gap-1 px-1 ${isMe ? "flex-row-reverse" : ""}`}>
                              <span className="text-[10px] text-slate-400">{formatTime(m.created_at)}</span>
                              {isMe && !m._optimistic && selected.type === "individual" && (
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
                className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-primary text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg hover:bg-primary/90 transition-colors z-10">
                <ArrowDown size={12} />
                {newMsgCount} yeni mesaj
              </button>
            )}

            <div className="bg-white border-t border-slate-100 px-3 md:px-5 py-3 md:py-4 shrink-0">
              <div className="flex items-end gap-3">
                <textarea value={text} onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }}}
                  placeholder="Mesaj yaz…" rows={1}
                  className="flex-1 resize-none border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors text-slate-800 placeholder:text-slate-400 max-h-32 bg-slate-50"
                  onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = `${Math.min(t.scrollHeight, 128)}px`; }}
                />
                <button onClick={send} disabled={!text.trim() || sending}
                  className="w-11 h-11 rounded-2xl bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-40 shrink-0">
                  {sending ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-300">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-xl text-sm font-bold">
              <ChevronRight size={16} className="rotate-180" /> Rehberi Aç
            </button>
            <div className="hidden md:flex flex-col items-center gap-3 text-center">
              <MessageSquare size={48} strokeWidth={1.5} />
              <p className="text-sm font-semibold text-slate-400">Kime yazmak istiyorsunuz?</p>
              <p className="text-xs text-slate-300">Soldan bir kişi veya kanal seçin.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
