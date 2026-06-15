"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState, useCallback } from "react";
import { MessageSquare, Send, Users, Check, CheckCheck, ArrowDown, Trash2, Search } from "lucide-react";

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
  role: "group" | "manager" | "employee";
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

export default function EmployeeChatPage() {
  const [user,         setUser]         = useState<any>(null);
  const [contacts,     setContacts]     = useState<Contact[]>([]);
  const [selected,     setSelected]     = useState<Contact | null>(null);
  const [messages,     setMessages]     = useState<Message[]>([]);
  const [text,         setText]         = useState("");
  const [sending,      setSending]      = useState(false);
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
      const stored = localStorage.getItem("optishift_portal_user");
      if (stored) setUser(JSON.parse(stored));
    } catch {}
  }, []);

  const buildContacts = useCallback(async () => {
    const u = userRef.current;
    if (!u) return;
    const list: Contact[] = [];
    const locId = u.location_id;

    if (locId) {
      list.push({
        id: `group-${locId}`, name: "Ekip Sohbeti", role: "group", type: "group",
        groupId: `loc-${locId}`, label: "Tüm Ekip",
      });
    }

    try {
      const url = locId ? `/api/personnel?location_id=${locId}` : `/api/personnel?org_id=${u.org_id}`;
      const ppl = await fetch(url).then(r => r.json());
      if (Array.isArray(ppl)) {
        for (const p of ppl) {
          if (!p.user_id || p.user_id === u.id) continue;
          const isManager = p.user_access_level === "manager" || p.user_access_level === "admin" || p.user_access_level === "supervisor";
          list.push({
            id: p.user_id, name: p.name,
            role: isManager ? "manager" : "employee",
            type: "individual",
            label: isManager ? "Müdür" : (p.title || "Personel"),
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

  const handleSelect = (c: Contact) => {
    setSelected(c);
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

  // ── Mobile: chat area visible when selected, directory otherwise
  return (
    <div className="flex flex-col bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 m-5"
      style={{ height: "calc(100vh - 120px)" }}>
      <div className="flex flex-col md:flex-row h-full">

        {/* ── Directory panel ───────────────────────────────────────────── */}
        <div className={`md:w-72 md:border-r md:border-slate-100 shrink-0 flex flex-col ${selected ? "hidden md:flex" : "flex"}`}>
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-100 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black text-slate-700">Sohbet</h2>
              {totalUnread > 0 && (
                <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{totalUnread}</span>
              )}
            </div>
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Kişi ara…"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-primary transition-colors placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Mobile horizontal avatars strip */}
          <div className="flex md:hidden gap-2 p-3 overflow-x-auto shrink-0 border-b border-slate-50">
            {contacts.map(c => {
              const isSelected = selected?.id === c.id;
              return (
                <button key={c.id} onClick={() => handleSelect(c)}
                  className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl shrink-0 transition-colors relative ${isSelected ? "bg-primary/10" : "hover:bg-slate-50"}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold relative ${
                    c.type === "group" ? "bg-emerald-100 text-emerald-700" :
                    c.role === "manager" ? "bg-violet-100 text-violet-700" : "bg-indigo-100 text-indigo-700"
                  }`}>
                    {c.type === "group" ? <Users size={14} /> : c.name.charAt(0).toUpperCase()}
                    {(c.unread ?? 0) > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{c.unread}</span>
                    )}
                  </div>
                  <span className={`text-[9px] font-semibold truncate max-w-[52px] ${isSelected ? "text-primary" : "text-slate-500"}`}>
                    {c.name.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Desktop directory list */}
          <div className="hidden md:flex flex-col flex-1 overflow-y-auto">
            {contacts.length === 0 ? (
              <p className="text-xs text-slate-400 p-4">Kişi bulunamadı.</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-slate-400 p-4">"{search}" için sonuç yok.</p>
            ) : (
              <>
                {groupContacts.length > 0 && (
                  <>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-4 pt-3 pb-1">Kanallar</p>
                    {groupContacts.map(c => {
                      const isSelected = selected?.id === c.id;
                      return (
                        <button key={c.id} onClick={() => handleSelect(c)}
                          className={`flex items-center gap-3 w-full px-4 py-3 transition-colors text-left border-b border-slate-50 ${
                            isSelected ? "bg-primary/5 border-r-2 border-primary" : "hover:bg-slate-50"
                          }`}>
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 relative bg-emerald-100 text-emerald-700`}>
                            <Users size={14} />
                            {(c.unread ?? 0) > 0 && (
                              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{c.unread}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <p className={`text-sm truncate ${isSelected ? "font-bold text-primary" : "font-semibold text-slate-700"}`}>{c.name}</p>
                              {c.lastAt && <span className="text-[9px] text-slate-400 shrink-0">{formatRelative(c.lastAt)}</span>}
                            </div>
                            {c.lastMessage ? (
                              <p className={`text-[11px] truncate ${(c.unread ?? 0) > 0 ? "font-semibold text-slate-700" : "text-slate-400 font-medium"}`}>{c.lastMessage}</p>
                            ) : (
                              <p className="text-[11px] text-slate-300 font-medium">{c.label}</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}
                {individualContacts.length > 0 && (
                  <>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-4 pt-3 pb-1">Kişiler</p>
                    {individualContacts.map(c => {
                      const isSelected = selected?.id === c.id;
                      return (
                        <button key={c.id} onClick={() => handleSelect(c)}
                          className={`flex items-center gap-3 w-full px-4 py-3 transition-colors text-left border-b border-slate-50 ${
                            isSelected ? "bg-primary/5 border-r-2 border-primary" : "hover:bg-slate-50"
                          }`}>
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 relative ${
                            c.role === "manager" ? "bg-violet-100 text-violet-700" : "bg-indigo-100 text-indigo-700"
                          }`}>
                            {c.name.charAt(0).toUpperCase()}
                            {(c.unread ?? 0) > 0 && (
                              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{c.unread}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <p className={`text-sm truncate ${isSelected ? "font-bold text-primary" : "font-semibold text-slate-700"}`}>{c.name}</p>
                              {c.lastAt && <span className="text-[9px] text-slate-400 shrink-0">{formatRelative(c.lastAt)}</span>}
                            </div>
                            {c.lastMessage ? (
                              <p className={`text-[11px] truncate ${(c.unread ?? 0) > 0 ? "font-semibold text-slate-700" : "text-slate-400 font-medium"}`}>{c.lastMessage}</p>
                            ) : (
                              <p className="text-[11px] text-slate-300 font-medium">{c.label}</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </div>

          {/* Mobile: empty directory state */}
          {!selected && (
            <div className="flex md:hidden flex-1 flex-col items-center justify-center gap-2 text-slate-300 p-8 text-center">
              <MessageSquare size={36} strokeWidth={1.5} />
              <p className="text-xs font-medium">Kime yazmak istiyorsunuz?</p>
              <p className="text-[11px] text-slate-400">Yukarıdan bir kişi seçin.</p>
            </div>
          )}
        </div>

        {/* ── Chat area ────────────────────────────────────────────────── */}
        <div className={`flex-1 flex flex-col min-w-0 min-h-0 relative ${!selected ? "hidden md:flex" : "flex"}`}>
          {selected ? (
            <>
              {/* Header */}
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2.5 shrink-0 bg-white">
                <button onClick={() => setSelected(null)}
                  className="md:hidden p-2 -ml-1 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors text-lg font-medium">
                  ←
                </button>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  selected.type === "group" ? "bg-emerald-100 text-emerald-700" :
                  selected.role === "manager" ? "bg-violet-100 text-violet-700" : "bg-indigo-100 text-indigo-700"
                }`}>
                  {selected.type === "group" ? <Users size={14} /> : selected.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-900 truncate">{selected.name}</p>
                  <p className="text-[10px] text-slate-400">{selected.label}</p>
                </div>
                {clearConfirm ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] text-slate-500">Sil?</span>
                    <button onClick={clearConversation} className="text-[11px] font-bold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded-lg transition-colors">Evet</button>
                    <button onClick={() => setClearConfirm(false)} className="text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg transition-colors">İptal</button>
                  </div>
                ) : (
                  <button onClick={() => setClearConfirm(true)} title="Sohbeti Temizle"
                    className="p-1.5 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {/* Messages */}
              <div ref={scrollRef} onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-4 py-3 space-y-1 bg-slate-50/50">
                {grouped.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-300 py-12">
                    <MessageSquare size={36} strokeWidth={1.5} />
                    <p className="text-xs font-medium">İlk mesajı sen gönder!</p>
                  </div>
                )}
                {grouped.map(({ date, msgs }) => (
                  <div key={date}>
                    <div className="flex items-center gap-2 my-3">
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{date}</span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>
                    {msgs.map(m => {
                      const isMe = m.from_user_id === user?.id;
                      const name = m.from_name ?? m.sender_name;
                      const isRead = m.is_read === true || m.is_read === 1;
                      return (
                        <div key={m.id} className={`flex gap-2 mb-1.5 ${isMe ? "justify-end" : "justify-start"}`}>
                          {!isMe && (
                            <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600 shrink-0 mt-0.5">
                              {name?.charAt(0)?.toUpperCase() ?? "?"}
                            </div>
                          )}
                          <div className={`max-w-[80%] sm:max-w-[72%] flex flex-col gap-0.5 ${isMe ? "items-end" : "items-start"}`}>
                            {!isMe && selected.type === "group" && (
                              <span className="text-[10px] font-bold text-slate-400 px-1">{name}</span>
                            )}
                            <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
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

              <div className="px-3 py-3 border-t border-slate-100 shrink-0 bg-white">
                <div className="flex items-end gap-2">
                  <textarea value={text} onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }}}
                    placeholder="Mesaj yaz…" rows={1}
                    className="flex-1 resize-none border-2 border-slate-200 rounded-2xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors text-slate-800 placeholder:text-slate-400 max-h-28 bg-slate-50"
                    onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = `${Math.min(t.scrollHeight, 112)}px`; }}
                  />
                  <button onClick={send} disabled={!text.trim() || sending}
                    className="w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-40 shrink-0">
                    {sending ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Send size={15} />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-300 p-8 text-center">
              <MessageSquare size={36} strokeWidth={1.5} />
              <p className="text-xs font-semibold">Kime yazmak istiyorsunuz?</p>
              <p className="text-[11px] text-slate-400">Soldan bir kişi veya kanal seçin.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
