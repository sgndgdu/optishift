"use client";

import { X } from "lucide-react";
import type { EmploymentType } from "@/lib/types";
import { TITLE_SUGGESTIONS } from "./shared";

interface NewForm {
  name: string;
  title: string;
  phone: string;
  email: string;
  employment_type: EmploymentType;
}

interface AddModalProps {
  isOpen: boolean;
  newForm: NewForm;
  setNewForm: (v: NewForm | ((prev: NewForm) => NewForm)) => void;
  handleAdd: () => void;
  onClose: () => void;
}

export function AddModal({ isOpen, newForm, setNewForm, handleAdd, onClose }: AddModalProps) {
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 pointer-events-auto">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-slate-800">Yeni Personel</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
              <X size={18} className="text-slate-400" />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="field-label">Ad Soyad *</label>
              <input
                value={newForm.name}
                onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className="field-input"
                placeholder="Örn: Mehmet Kaya"
                autoFocus
              />
            </div>
            <div>
              <label className="field-label">Ünvan</label>
              <input
                value={newForm.title}
                onChange={(e) => setNewForm((f) => ({ ...f, title: e.target.value }))}
                className="field-input"
                placeholder="Kasiyer, Barista..."
                list="modal-title-list"
              />
              <datalist id="modal-title-list">
                {TITLE_SUGGESTIONS.map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Telefon</label>
                <input
                  value={newForm.phone}
                  onChange={(e) => setNewForm((f) => ({ ...f, phone: e.target.value }))}
                  className="field-input"
                  placeholder="+90 5xx"
                />
              </div>
              <div>
                <label className="field-label">E-posta</label>
                <input
                  value={newForm.email}
                  onChange={(e) => setNewForm((f) => ({ ...f, email: e.target.value }))}
                  className="field-input"
                  placeholder="ad@email.com"
                />
              </div>
            </div>
            <div>
              <label className="field-label">Çalışma Türü</label>
              <select
                value={newForm.employment_type}
                onChange={(e) => setNewForm((f) => ({ ...f, employment_type: e.target.value as EmploymentType }))}
                className="field-input"
              >
                <option value="full_time">Tam Zamanlı</option>
                <option value="part_time">Yarı Zamanlı</option>
                <option value="intern">Stajyer</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"
            >
              İptal
            </button>
            <button
              onClick={handleAdd}
              disabled={!newForm.name.trim()}
              className="flex-1 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg font-medium transition-colors"
            >
              Kaydet & Aç
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
