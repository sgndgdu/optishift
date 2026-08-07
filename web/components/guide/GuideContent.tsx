"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ArrowLeft, Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { ROLE_GUIDES, FAQ_ITEMS, type RoleKey } from "./guideData";

function roleFromParam(value: string | null): RoleKey {
  if (value === "employee" || value === "supervisor") return value;
  return "manager";
}

export default function GuideContent() {
  const [activeRole, setActiveRole] = useState<RoleKey>(() => {
    if (typeof window === "undefined") return "manager";
    const params = new URLSearchParams(window.location.search);
    return roleFromParam(params.get("role"));
  });
  const [tocOpen, setTocOpen] = useState(false);

  const guide = ROLE_GUIDES.find(g => g.key === activeRole) ?? ROLE_GUIDES[0];

  const handleRoleChange = (role: RoleKey) => {
    setActiveRole(role);
    setTocOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set("role", role);
    window.history.replaceState({}, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-cream text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <Logo size="sm" className="group-hover:scale-105 transition-transform" />
            <span className="text-lg font-black text-slate-900 tracking-tight">OptiShift</span>
          </Link>
          <Link href="/" className="hidden sm:flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-primary transition-colors">
            <ArrowLeft size={15} /> Ana Sayfa
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 pb-6">
        <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight mb-3 text-slate-900">
          Kullanım Kılavuzu
        </h1>
        <p className="text-slate-600 text-base sm:text-lg font-medium max-w-2xl">
          OptiShift&apos;i günlük işinizde nasıl kullanacağınızı anlatan basit bir rehber. Rolünüzü seçin, ilgili bölümleri okuyun.
        </p>

        {/* Role tabs */}
        <div className="flex flex-wrap gap-2 mt-6">
          {ROLE_GUIDES.map(g => (
            <button
              key={g.key}
              onClick={() => handleRoleChange(g.key)}
              className={cn(
                "px-4 sm:px-5 py-2.5 rounded-xl text-sm font-bold transition-colors border",
                activeRole === g.key
                  ? "bg-primary text-white border-primary shadow-[0_4px_14px_0_rgba(20,69,61,0.25)]"
                  : "bg-white text-slate-600 border-slate-200 hover:border-primary/40 hover:text-primary"
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-slate-500 font-medium mt-3">{guide.description}</p>
      </section>

      {/* Mobile TOC toggle */}
      <div className="md:hidden max-w-6xl mx-auto px-4 sm:px-6">
        <button
          onClick={() => setTocOpen(v => !v)}
          className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700"
        >
          <span className="flex items-center gap-2">
            {tocOpen ? <X size={16} /> : <Menu size={16} />} İçindekiler
          </span>
          <ChevronDown size={16} className={cn("transition-transform", tocOpen && "rotate-180")} />
        </button>
        {tocOpen && (
          <nav className="bg-white border border-t-0 border-slate-200 rounded-b-xl px-2 py-2 mb-2">
            {guide.sections.map(s => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setTocOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-primary"
              >
                {s.title}
              </a>
            ))}
            <a
              href="#sss"
              onClick={() => setTocOpen(false)}
              className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-primary"
            >
              Sık Sorulan Sorular
            </a>
          </nav>
        )}
      </div>

      {/* Body */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-24 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8 md:gap-12">
        {/* Desktop TOC */}
        <nav className="hidden md:block sticky top-24 self-start space-y-0.5">
          {guide.sections.map(s => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="block px-3 py-2 rounded-lg text-sm font-semibold text-slate-500 hover:bg-white hover:text-primary transition-colors"
            >
              {s.title}
            </a>
          ))}
          <a
            href="#sss"
            className="block px-3 py-2 mt-2 pt-3 border-t border-slate-200 rounded-lg text-sm font-semibold text-slate-500 hover:bg-white hover:text-primary transition-colors"
          >
            Sık Sorulan Sorular
          </a>
        </nav>

        {/* Content */}
        <div className="space-y-10 sm:space-y-14 min-w-0">
          {guide.sections.map(section => {
            const Icon = section.icon;
            return (
              <section key={section.id} id={section.id} className="scroll-mt-24">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon size={20} />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900">{section.title}</h2>
                </div>
                <div className="space-y-4 text-slate-600 leading-relaxed font-medium text-[15px] sm:text-base">
                  {section.paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                  {section.steps && (
                    <ol className="space-y-3 mt-2">
                      {section.steps.map((step, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="shrink-0 w-6 h-6 rounded-full bg-forest-100 text-forest-700 text-xs font-black flex items-center justify-center mt-0.5">
                            {i + 1}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {section.tip && (
                    <div className="bg-ember-50 border border-ember-100 rounded-xl px-4 py-3 text-sm text-ember-800 font-semibold mt-2">
                      {section.tip}
                    </div>
                  )}
                </div>
              </section>
            );
          })}

          {/* FAQ */}
          <section id="sss" className="scroll-mt-24">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 mb-5">Sık Sorulan Sorular</h2>
            <div className="space-y-3">
              {FAQ_ITEMS.map((item, i) => (
                <details key={i} className="bg-white border border-slate-200 rounded-xl px-4 sm:px-5 py-1 group">
                  <summary className="cursor-pointer list-none flex items-center justify-between py-3.5 sm:py-4 font-bold text-slate-800 text-sm sm:text-base">
                    {item.question}
                    <ChevronDown size={16} className="text-slate-400 shrink-0 ml-3 transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="text-slate-600 text-sm sm:text-[15px] leading-relaxed font-medium pb-4 sm:pb-5">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
