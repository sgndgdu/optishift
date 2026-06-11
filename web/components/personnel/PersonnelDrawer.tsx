"use client";

import { useEffect, useRef, useState } from "react";

import { X } from "lucide-react";
import type { Personnel, PersonnelStatus, LeaveType } from "@/lib/types";
import { STATUS_CFG, TABS, initials } from "./shared";
import type { Tab } from "./hooks/usePersonnel";
import { GeneralTab } from "./tabs/GeneralTab";
import { SkillsTab } from "./tabs/SkillsTab";
import { AvailabilityTab } from "./tabs/AvailabilityTab";
import { LeaveTab } from "./tabs/LeaveTab";
import { PerformanceTab } from "./tabs/PerformanceTab";

interface PersonnelDrawerProps {
  selected: Personnel | null;
  personnel: Personnel[];
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  isDirty: boolean;
  gen: Personnel | null;
  unlockedSections: Set<string>;
  allRoles: string[];
  freeRoles: string[];
  teamAvg: number;
  skillDropOpen: boolean;
  setSkillDropOpen: (open: boolean) => void;
  customSkill: string;
  setCustomSkill: (v: string) => void;
  skillRef: React.RefObject<HTMLDivElement | null>;
  showLeaveForm: boolean;
  setShowLeaveForm: (v: boolean | ((prev: boolean) => boolean)) => void;
  leaveForm: { type: LeaveType; start_date: string; end_date: string; note: string };
  setLeaveForm: (v: { type: LeaveType; start_date: string; end_date: string; note: string } | ((prev: { type: LeaveType; start_date: string; end_date: string; note: string }) => { type: LeaveType; start_date: string; end_date: string; note: string })) => void;
  requestSentFor: string | null;
  setRequestSentFor: (id: string) => void;
  patch: (id: string, updates: Partial<Personnel>) => void;
  addRole: (role: string) => void;
  removeRole: (role: string) => void;
  updateDraft: (updates: Partial<Personnel>) => void;
  saveGeneral: () => void;
  cancelDraft: () => void;
  toggleSection: (section: string) => void;
  addLeave: () => void;
  deleteLeave: (id: string) => void;
  deletePersonnel: (id: string) => void;
  closeDrawer: () => void;
}

export function PersonnelDrawer({
  selected,
  personnel,
  activeTab,
  setActiveTab,
  isDirty,
  gen,
  unlockedSections,
  allRoles,
  freeRoles,
  teamAvg,
  skillDropOpen,
  setSkillDropOpen,
  customSkill,
  setCustomSkill,
  skillRef,
  showLeaveForm,
  setShowLeaveForm,
  leaveForm,
  setLeaveForm,
  requestSentFor,
  setRequestSentFor,
  patch,
  addRole,
  removeRole,
  updateDraft,
  saveGeneral,
  cancelDraft,
  toggleSection,
  addLeave,
  deleteLeave,
  deletePersonnel,
  closeDrawer,
}: PersonnelDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [pendingStatus, setPendingStatus] = useState<PersonnelStatus | null>(null);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);

  useEffect(() => {
    if (!selected) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isDirty) {
          setShowUnsavedWarning(true);
        } else {
          closeDrawer();
        }
        return;
      }

      if (e.key === "Tab" && drawerRef.current) {
        const focusableElements = drawerRef.current.querySelectorAll(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (e.shiftKey) {
          if (document.activeElement === firstElement || document.activeElement === document.body) {
            lastElement?.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement?.focus();
            e.preventDefault();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selected, isDirty, closeDrawer]);

  // Drawer açıldığında ilk elemana focuslanmak için
  useEffect(() => {
    if (selected && drawerRef.current && !pendingStatus && !showUnsavedWarning) {
      // Bir miktar gecikme verelim ki DOM render olsun
      const timer = setTimeout(() => {
        const firstInput = drawerRef.current?.querySelector('button, input, select, textarea') as HTMLElement;
        if (firstInput) firstInput.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selected, pendingStatus, showUnsavedWarning]);

  const handleBackdropClick = () => {
    if (isDirty) {
      setShowUnsavedWarning(true);
    } else {
      closeDrawer();
    }
  };

  const handleStatusChange = (newStatus: string) => {
    const status = newStatus as PersonnelStatus;
    if (status === "inactive" || status === "on_leave") {
      setPendingStatus(status);
    } else {
      patch(selected!.id, { status });
    }
  };

  const confirmStatusChange = () => {
    if (pendingStatus && selected) {
      patch(selected.id, { status: pendingStatus });
      setPendingStatus(null);
    }
  };

  return (
    <>
      {selected && (
        <div className="fixed inset-0 bg-black/20 z-40" onClick={handleBackdropClick} />
      )}

      <div
        ref={drawerRef}
        aria-modal="true"
        role="dialog"
        className={`fixed inset-y-0 right-0 w-full sm:w-[480px] max-w-full bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${
          selected ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {selected && gen && (
          <>
            <div className="px-6 pt-6 pb-0 border-b border-slate-100 shrink-0">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold shrink-0 ${
                      selected.status === "inactive" ? "bg-slate-400" : "bg-indigo-600"
                    }`}
                  >
                    {initials(selected.name)}
                  </div>
                  <div>
                    <div className="font-bold text-slate-800 text-lg leading-tight">{selected.name}</div>
                    <div className="text-slate-500 text-sm">{selected.title}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={selected.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full border-0 cursor-pointer outline-none ${STATUS_CFG[selected.status].cls}`}
                  >
                    <option value="active">Aktif</option>
                    <option value="on_leave">İzinde</option>
                    <option value="inactive">Pasif</option>
                  </select>
                  <button onClick={handleBackdropClick} aria-label="Personel kartını kapat" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="flex gap-1 pb-0 overflow-x-auto" role="tablist">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={activeTab === t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2 whitespace-nowrap ${
                      activeTab === t.id
                        ? "text-indigo-600 border-indigo-600 bg-indigo-50/50"
                        : "text-slate-500 border-transparent hover:text-slate-700"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {activeTab === "general" ? (
              <div role="tabpanel" className="flex-1 flex flex-col overflow-hidden">
                <GeneralTab
                  gen={gen}
                  selected={selected}
                  isDirty={isDirty}
                  unlockedSections={unlockedSections}
                  toggleSection={toggleSection}
                  updateDraft={updateDraft}
                  saveGeneral={saveGeneral}
                  cancelDraft={cancelDraft}
                  deletePersonnel={deletePersonnel}
                />
              </div>
            ) : (
              <div role="tabpanel" className="flex-1 overflow-y-auto px-6 py-5 pb-2">
                {activeTab === "skills" && (
                  <SkillsTab
                    selected={selected}
                    personnel={personnel}
                    allRoles={allRoles}
                    freeRoles={freeRoles}
                    skillDropOpen={skillDropOpen}
                    setSkillDropOpen={setSkillDropOpen}
                    customSkill={customSkill}
                    setCustomSkill={setCustomSkill}
                    skillRef={skillRef}
                    addZone={addRole}
                    removeZone={removeRole}
                    patch={patch}
                  />
                )}
                {activeTab === "availability" && (
                  <AvailabilityTab
                    selected={selected}
                    requestSentFor={requestSentFor}
                    setRequestSentFor={setRequestSentFor}
                  />
                )}
                {activeTab === "leave" && (
                  <LeaveTab
                    selected={selected}
                    showLeaveForm={showLeaveForm}
                    setShowLeaveForm={setShowLeaveForm}
                    leaveForm={leaveForm}
                    setLeaveForm={setLeaveForm}
                    addLeave={addLeave}
                    deleteLeave={deleteLeave}
                  />
                )}
                {activeTab === "performance" && (
                  <PerformanceTab
                    selected={selected}
                    personnel={personnel}
                    teamAvg={teamAvg}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Durum Değişikliği Onay Modalı */}
      {pendingStatus && (
        <div className="fixed inset-0 bg-slate-900/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5" role="dialog" aria-modal="true">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Durum Değişikliği</h3>
            <p className="text-sm text-slate-600 mb-5">
              Bu personelin durumunu <strong className="text-slate-800">{pendingStatus === 'inactive' ? 'Pasif' : 'İzinde'}</strong> olarak değiştirmek istediğinize emin misiniz?
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setPendingStatus(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Vazgeç
              </button>
              <button 
                onClick={confirmStatusChange}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
              >
                Evet, Değiştir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kaydedilmemiş Değişiklikler Modalı */}
      {showUnsavedWarning && (
        <div className="fixed inset-0 bg-slate-900/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5" role="dialog" aria-modal="true">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Kaydedilmemiş Değişiklikler Var</h3>
            <p className="text-sm text-slate-600 mb-5">
              Yaptığınız değişiklikleri henüz kaydetmediniz. Çıkmak istediğinize emin misiniz? Kaydedilmeyen veriler silinecek.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowUnsavedWarning(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                İptal ve Geri Dön
              </button>
              <button 
                onClick={() => {
                  setShowUnsavedWarning(false);
                  closeDrawer();
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
              >
                Çık ve Değişiklikleri At
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
