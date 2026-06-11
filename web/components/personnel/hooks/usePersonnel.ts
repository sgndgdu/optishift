"use client";

import { useState, useRef, useEffect } from "react";
import { PERSONNEL as INITIAL_PERSONNEL } from "@/lib/mock-data";
import type {
  Personnel,
  PersonnelStatus,
  EmploymentType,
  SkillLevel,
  LeaveRecord,
  LeaveType,
} from "@/lib/types";
import { MOCK_LOCATIONS, MOCK_ROLES, MOCK_DEPARTMENTS } from "@/lib/mock-data";

export type Tab = "general" | "skills" | "availability" | "leave" | "performance";

export function nextId(list: Personnel[]) {
  const nums = list.map((p) => parseInt(p.id.replace("P", ""), 10));
  return `P${String(Math.max(0, ...nums) + 1).padStart(3, "0")}`;
}

export function usePersonnel() {
  const [personnel, setPersonnel] = useState<Personnel[]>(INITIAL_PERSONNEL);
  const [activeLocationId, setActiveLocationId] = useState<string>(() => {
    if (typeof window === "undefined") return "L-001";
    return localStorage.getItem("optishift_selected_location") || "L-001";
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PersonnelStatus | "all">("all");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [skillDropOpen, setSkillDropOpen] = useState(false);
  const [customSkill, setCustomSkill] = useState("");
  const skillRef = useRef<HTMLDivElement>(null);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState<{
    type: LeaveType;
    start_date: string;
    end_date: string;
    note: string;
  }>({ type: "annual", start_date: "", end_date: "", note: "" });
  const [requestSentFor, setRequestSentFor] = useState<string | null>(null);
  const [generalDraft, setGeneralDraft] = useState<Partial<Personnel> | null>(null);
  const [unlockedSections, setUnlockedSections] = useState<Set<string>>(new Set());

  const [newForm, setNewForm] = useState({
    name: "",
    title: "",
    phone: "",
    email: "",
    employment_type: "full_time" as EmploymentType,
  });

  useEffect(() => {
    const handleLocationChange = () => {
      const current = localStorage.getItem("optishift_selected_location") || "L-001";
      setActiveLocationId(current);
      setSelectedId(null);
    };

    window.addEventListener("optishift_location_changed", handleLocationChange);
    return () => window.removeEventListener("optishift_location_changed", handleLocationChange);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (skillRef.current && !skillRef.current.contains(e.target as Node)) {
        setSkillDropOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGeneralDraft(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUnlockedSections(new Set());
  }, [selectedId]);

  const selected = personnel.find((p) => p.id === selectedId) ?? null;

  const filtered = personnel.filter((p) => {
    if (!p.assigned_location_ids.includes(activeLocationId)) return false;

    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    const q = search.toLowerCase();
    if (
      q &&
      !p.name.toLowerCase().includes(q) &&
      !p.title.toLowerCase().includes(q) &&
      !p.employee_id.includes(q)
    )
      return false;
    return true;
  });

  function patch(id: string, updates: Partial<Personnel>) {
    setPersonnel((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  }

  function openDrawer(id: string) {
    setSelectedId(id);
    setActiveTab("general");
    setSkillDropOpen(false);
  }

  function closeDrawer() {
    setSelectedId(null);
  }

  function addRole(roleId: string) {
    if (!selected || selected.roles.includes(roleId)) return;
    patch(selected.id, {
      roles: [...selected.roles, roleId],
      role_levels: { ...selected.role_levels, [roleId]: "secondary" as SkillLevel },
    });
    setSkillDropOpen(false);
    setCustomSkill("");
  }

  function removeRole(roleId: string) {
    if (!selected) return;
    const lvls = { ...selected.role_levels };
    delete lvls[roleId];
    patch(selected.id, { roles: selected.roles.filter((r) => r !== roleId), role_levels: lvls });
  }

  function handleAdd() {
    if (!newForm.name.trim()) return;
    const id = nextId(personnel);
    
    const p: Personnel = {
      id,
      org_id: "ORG-001",
      assigned_location_ids: [activeLocationId],
      primary_location_id: activeLocationId,
      user_access_level: "employee",
      name: newForm.name.trim(),
      employee_id: String(100000 + parseInt(id.replace("P", ""), 10)),
      phone: newForm.phone,
      email: newForm.email,
      hire_date: new Date().toISOString().slice(0, 10),
      contract_end_date: "",
      title: newForm.title || "Çalışan",
      employment_type: newForm.employment_type,
      status: "active",
      erp_id: "",
      notes: "",
      roles: [],
      role_levels: {},
      availability: {
        0: "available",
        1: "available",
        2: "available",
        3: "available",
        4: "available",
        6: "available",
      },
      preferred_shift_ids: [],
      preferred_days: [],
      preferred_roles: [],
      max_weekly_hours: 45,
      overtime_approved: false,
      prev_score: 0,
      hero_count: 0,
      no_show_count: 0,
      late_count: 0,
      annual_leave_days_total: 0,
      leave_records: [],
    };
    setPersonnel((prev) => [...prev, p]);
    setNewForm({ name: "", title: "", phone: "", email: "", employment_type: "full_time" });
    setIsAddOpen(false);
    openDrawer(id);
  }

  // Lokasyona ait tüm rolleri bul (Departman üzerinden)
  const locationDepartments = MOCK_DEPARTMENTS.filter(d => d.location_id === activeLocationId);
  const locationRoles = MOCK_ROLES.filter(r => locationDepartments.some(d => d.id === r.department_id));
  const locationRoleNames = locationRoles.map(r => r.name);
  const freeZones = selected ? locationRoles.filter((r) => !selected.roles.includes(r.id)).map(r => r.name) : [];
  
  const teamAvg = Math.round(
    personnel.reduce((a, p) => a + p.prev_score, 0) / (personnel.length || 1)
  );

  const gen = selected ? (generalDraft ? { ...selected, ...generalDraft } : selected) : null;
  const isDirty = generalDraft !== null && Object.keys(generalDraft).length > 0;

  function updateDraft(updates: Partial<Personnel>) {
    setGeneralDraft((prev) => ({ ...(prev ?? {}), ...updates }));
  }

  function saveGeneral() {
    if (!generalDraft || !selected) return;
    patch(selected.id, generalDraft);
    setGeneralDraft(null);
  }

  function toggleSection(section: string) {
    setUnlockedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  function addLeave() {
    if (!selected || !leaveForm.start_date || !leaveForm.end_date) return;
    let days = 0;
    const cur = new Date(leaveForm.start_date);
    const end = new Date(leaveForm.end_date);
    while (cur <= end) {
      if (cur.getDay() !== 0 && cur.getDay() !== 6) days++;
      cur.setDate(cur.getDate() + 1);
    }
    if (days <= 0) return;
    const newRec: LeaveRecord = {
      id: `L${Date.now()}`,
      type: leaveForm.type,
      start_date: leaveForm.start_date,
      end_date: leaveForm.end_date,
      days,
      note: leaveForm.note,
    };
    patch(selected.id, { leave_records: [...selected.leave_records, newRec] });
    setLeaveForm({ type: "annual", start_date: "", end_date: "", note: "" });
    setShowLeaveForm(false);
  }

  function deleteLeave(id: string) {
    if (!selected) return;
    patch(selected.id, { leave_records: selected.leave_records.filter((r) => r.id !== id) });
  }

  function deletePersonnel(id: string) {
    setPersonnel((prev) => prev.filter((p) => p.id !== id));
    closeDrawer();
  }

  function cancelDraft() {
    setGeneralDraft(null);
  }

  return {
    personnel,
    selectedId,
    selected,
    activeTab,
    setActiveTab,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    isAddOpen,
    setIsAddOpen,
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
    generalDraft,
    unlockedSections,
    newForm,
    setNewForm,
    filtered,
    allRoles: locationRoleNames, 
    freeRoles: freeZones,
    teamAvg,
    gen,
    isDirty,
    patch,
    openDrawer,
    closeDrawer,
    addRole,
    removeRole,
    handleAdd,
    updateDraft,
    saveGeneral,
    toggleSection,
    addLeave,
    deleteLeave,
    deletePersonnel,
    cancelDraft,
  };
}
