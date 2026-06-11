import type { Personnel, WeekSchedule, Organization, Location, Department, Role, ShiftDefinition, ScheduleRules, UserRole } from "./types";

export const MOCK_ORGANIZATIONS: Organization[] = [
  {
    id: "ORG-001",
    name: "Gratis Perakende A.Ş.",
    connected_erp: "SAP_SuccessFactors",
    erp_mapped_fields: { employee_name: "Emp_Name", employee_id: "Sicil_No" },
  },
  {
    id: "ORG-002",
    name: "Hilton Premium Hotel",
    connected_erp: "SAP_ERP",
    erp_mapped_fields: { employee_name: "Name", employee_id: "Emp_ID" },
  },
  {
    id: "ORG-003",
    name: "Cup & Go Cafe",
    connected_erp: "Luca",
  }
];

const defaultHours = {
  0: { isOpen: true, open: "09:00", close: "22:00" },
  1: { isOpen: true, open: "09:00", close: "22:00" },
  2: { isOpen: true, open: "09:00", close: "22:00" },
  3: { isOpen: true, open: "09:00", close: "22:00" },
  4: { isOpen: true, open: "09:00", close: "22:00" },
  5: { isOpen: true, open: "09:00", close: "22:00" },
  6: { isOpen: true, open: "09:00", close: "22:00" },
};

const defaultShifts: ShiftDefinition[] = [
  { id: "s1", name: "Açılış",  start: "09:00", end: "17:00", base_points: 3, coverage: { "Kasa": 1, "Reyon": 2, "Mutfak": 1 } },
  { id: "s2", name: "Kapanış", start: "14:00", end: "22:00", base_points: 5, coverage: { "Kasa": 1, "Reyon": 1, "Mutfak": 1 } },
];

export const MOCK_LOCATIONS: Location[] = [
  // Gratis Şubeleri
  { id: "L-001", org_id: "ORG-001", name: "Gratis İzmir Merkez Mağazası", operating_hours: defaultHours, shift_definitions: defaultShifts, zone_quotas: { "Kasa": 2, "Reyon": 1 } },
  { id: "L-002", org_id: "ORG-001", name: "Gratis İstanbul Kadıköy Şubesi", operating_hours: defaultHours, shift_definitions: defaultShifts, zone_quotas: {} },
  // Otel Şubeleri
  { id: "L-003", org_id: "ORG-002", name: "Hilton Bodrum Resort", operating_hours: defaultHours, shift_definitions: defaultShifts, zone_quotas: { "Resepsiyon": 1, "Kat Hizmetleri": 1 } },
  // Kafe Şubeleri
  { id: "L-004", org_id: "ORG-003", name: "Cup & Go Alsancak Şubesi", operating_hours: defaultHours, shift_definitions: defaultShifts, zone_quotas: { "Barista & Servis": 1 } },
];

export const MOCK_DEPARTMENTS: Department[] = [
  // Gratis İzmir Merkez
  { id: "D-001", location_id: "L-001", name: "Mağaza İçi Servis" },
  { id: "D-002", location_id: "L-001", name: "Kasa & Ödeme" },
  // Hilton Bodrum Resort
  { id: "D-003", location_id: "L-003", name: "Resepsiyon" },
  { id: "D-004", location_id: "L-003", name: "Kat Hizmetleri" },
  { id: "D-005", location_id: "L-003", name: "Mutfak & Restoran" },
  // Kafe (Cup & Go)
  { id: "D-006", location_id: "L-004", name: "Barista & Servis" }
];

export const MOCK_ROLES: Role[] = [
  // Gratis Kasa Departmanı
  { 
    id: "R-001", department_id: "D-002", name: "Kasiyer", difficulty_bonus: 0, 
    min_per_shift: { s1: 2, s2: 2 },
    daily_coverage: {
      0: { s1: 2, s2: 2 }, 1: { s1: 2, s2: 2 }, 2: { s1: 2, s2: 2 }, 3: { s1: 2, s2: 2 }, 4: { s1: 2, s2: 2 },
      5: { s1: 3, s2: 3 }, 6: { s1: 3, s2: 3 } // Hafta sonu yoğun
    }
  },
  // Gratis Mağaza İçi Departmanı
  { 
    id: "R-002", department_id: "D-001", name: "Reyon Görevlisi", difficulty_bonus: 0, 
    min_per_shift: { s1: 1, s2: 0 },
    daily_coverage: {
      0: { s1: 1, s2: 0 }, 1: { s1: 1, s2: 0 }, 2: { s1: 1, s2: 0 }, 3: { s1: 1, s2: 0 }, 4: { s1: 1, s2: 0 },
      5: { s1: 2, s2: 1 }, 6: { s1: 2, s2: 1 }
    }
  },
  { 
    id: "R-003", department_id: "D-001", name: "Mağaza Sorumlusu", difficulty_bonus: 1, 
    min_per_shift: { s1: 1, s2: 1 },
    daily_coverage: {
      0: { s1: 1, s2: 1 }, 1: { s1: 1, s2: 1 }, 2: { s1: 1, s2: 1 }, 3: { s1: 1, s2: 1 }, 4: { s1: 1, s2: 1 },
      5: { s1: 1, s2: 1 }, 6: { s1: 1, s2: 1 }
    }
  },
  // Hilton
  { 
    id: "R-004", department_id: "D-003", name: "Resepsiyonist", difficulty_bonus: 0, 
    min_per_shift: { s1: 2, s2: 2 },
    daily_coverage: {
      0: { s1: 2, s2: 2 }, 1: { s1: 2, s2: 2 }, 2: { s1: 2, s2: 2 }, 3: { s1: 2, s2: 2 }, 4: { s1: 2, s2: 2 },
      5: { s1: 2, s2: 2 }, 6: { s1: 2, s2: 2 }
    }
  },
  { 
    id: "R-005", department_id: "D-004", name: "Kat Görevlisi", difficulty_bonus: 0, 
    min_per_shift: { s1: 3, s2: 1 },
    daily_coverage: {
      0: { s1: 3, s2: 1 }, 1: { s1: 3, s2: 1 }, 2: { s1: 3, s2: 1 }, 3: { s1: 3, s2: 1 }, 4: { s1: 3, s2: 1 },
      5: { s1: 4, s2: 2 }, 6: { s1: 4, s2: 2 }
    }
  },
];

export const MOCK_CURRENT_USER = {
  id: "U-001",
  name: "Sefa Gündoğdu",
  role: "supervisor" as UserRole,
  org_id: "ORG-001",
  assigned_location_ids: ["L-001", "L-002"],
};

export const PERSONNEL: Personnel[] = [
  {
    id: "P001",
    org_id: "ORG-001",
    assigned_location_ids: ["L-001"],
    primary_location_id: "L-001",
    department_id: "D-002",
    user_access_level: "employee",
    name: "Ahmet Yılmaz",
    employee_id: "100001",
    phone: "+90 532 111 22 33",
    email: "ahmet.yilmaz@izmir-merkez.com",
    hire_date: "2022-03-15",
    contract_end_date: "",
    title: "Kasiyer",
    employment_type: "full_time",
    status: "active",
    erp_id: "SAP-00001",
    notes: "",
    roles: ["R-001", "R-002"],
    role_levels: { "R-001": "primary", "R-002": "secondary" },
    availability: { 0: "available", 1: "available", 2: "preferred_not", 3: "available", 4: "available", 5: "preferred_not", 6: "unavailable" },
    preferred_shift_ids: ["s1"],
    preferred_days: [0, 1, 3, 4],
    preferred_roles: ["R-001"],
    max_weekly_hours: 45,
    overtime_approved: false,
    prev_score: 32,
    hero_count: 1,
    no_show_count: 0,
    late_count: 2,
    annual_leave_days_total: 14,
    leave_records: [
      { id: "L001", type: "annual", start_date: "2026-04-01", end_date: "2026-04-07", days: 5, note: "" },
    ],
  },
  {
    id: "P002",
    org_id: "ORG-001",
    assigned_location_ids: ["L-001"],
    primary_location_id: "L-001",
    department_id: "D-002",
    user_access_level: "employee",
    name: "Fatma Şahin",
    employee_id: "100002",
    phone: "+90 543 222 33 44",
    email: "fatma.sahin@izmir-merkez.com",
    hire_date: "2021-07-01",
    contract_end_date: "",
    title: "Kasa Sorumlusu",
    employment_type: "full_time",
    status: "active",
    erp_id: "SAP-00002",
    notes: "Cumartesi sabah tercih ediyor.",
    roles: ["R-001", "R-003"],
    role_levels: { "R-001": "primary", "R-003": "secondary" },
    availability: { 0: "available", 1: "unavailable", 2: "available", 3: "available", 4: "preferred_not", 5: "available", 6: "available" },
    preferred_shift_ids: [],
    preferred_days: [5, 6],
    preferred_roles: ["R-003"],
    max_weekly_hours: 45,
    overtime_approved: true,
    prev_score: 28,
    hero_count: 3,
    no_show_count: 0,
    late_count: 0,
    annual_leave_days_total: 20,
    leave_records: [
      { id: "L002", type: "annual", start_date: "2026-02-16", end_date: "2026-02-21", days: 5, note: "Aile ziyareti" },
      { id: "L003", type: "annual", start_date: "2026-03-24", end_date: "2026-03-28", days: 3, note: "" },
    ],
  },
  {
    id: "P003",
    org_id: "ORG-001",
    assigned_location_ids: ["L-001", "L-002"], // Joker eleman, 2 mağazada çalışabilir
    primary_location_id: "L-001",
    department_id: "D-001",
    user_access_level: "employee",
    name: "Mehmet Demir",
    employee_id: "100003",
    phone: "+90 505 333 44 55",
    email: "mehmet.demir@izmir-merkez.com",
    hire_date: "2023-01-10",
    contract_end_date: "2026-12-31",
    title: "Reyon Görevlisi",
    employment_type: "part_time",
    status: "active",
    erp_id: "SAP-00003",
    notes: "Part-time — haftada max 30 saat.",
    roles: ["R-002"],
    role_levels: { "R-002": "primary" },
    availability: { 0: "preferred_not", 1: "available", 2: "available", 3: "unavailable", 4: "available", 5: "available", 6: "preferred_not" },
    preferred_shift_ids: ["s2"],
    preferred_days: [1, 2, 4, 5],
    preferred_roles: ["R-002"],
    max_weekly_hours: 30,
    overtime_approved: false,
    prev_score: 35,
    hero_count: 0,
    no_show_count: 1,
    late_count: 3,
    annual_leave_days_total: 14,
    leave_records: [
      { id: "L004", type: "excuse", start_date: "2026-01-13", end_date: "2026-01-14", days: 2, note: "Randevu" },
    ],
  },
  {
    id: "P006",
    org_id: "ORG-001",
    assigned_location_ids: ["L-001"],
    primary_location_id: "L-001",
    department_id: undefined,
    user_access_level: "manager",
    name: "Zeynep Arslan",
    employee_id: "100006",
    phone: "+90 505 666 77 88",
    email: "zeynep.arslan@izmir-merkez.com",
    hire_date: "2019-11-05",
    contract_end_date: "",
    title: "Mağaza Müdürü",
    employment_type: "full_time",
    status: "active",
    erp_id: "SAP-00006",
    notes: "Tüm mağaza yetkisi.",
    roles: ["R-001", "R-002", "R-003"],
    role_levels: { "R-001": "primary", "R-002": "primary", "R-003": "primary" },
    availability: { 0: "available", 1: "preferred_not", 2: "available", 3: "available", 4: "available", 5: "available", 6: "unavailable" },
    preferred_shift_ids: [],
    preferred_days: [0, 2, 3, 4],
    preferred_roles: ["R-003"],
    max_weekly_hours: 45,
    overtime_approved: true,
    prev_score: 40,
    hero_count: 5,
    no_show_count: 0,
    late_count: 0,
    annual_leave_days_total: 26,
    leave_records: [
      { id: "L009", type: "annual", start_date: "2026-02-02", end_date: "2026-02-13", days: 10, note: "Yurt dışı" },
    ],
  }
];

export const DEFAULT_RULES: ScheduleRules = {
  max_weekly_hours: 45,
  min_rest_hours: 11,
  skills_match: "warn",
};

export const MOCK_SCHEDULE: WeekSchedule = {
  fairnessGap: 1,
  scores: { P001: 35, P002: 38, P003: 38, P004: 38, P005: 33, P006: 43 },
  assignments: [
    { personnelId: "P001", day: 0, shiftId: 0, role_id: "R-001", points: 3  },
    { personnelId: "P001", day: 1, shiftId: 1, role_id: "R-001", points: 5  },
    { personnelId: "P001", day: 4, shiftId: 1, role_id: "R-001", points: 8  },
    { personnelId: "P001", day: 5, shiftId: 1, role_id: "R-002", points: 8  },
    { personnelId: "P002", day: 2, shiftId: 1, role_id: "R-001", points: 5  },
    { personnelId: "P002", day: 3, shiftId: 1, role_id: "R-003", points: 5  },
    { personnelId: "P002", day: 5, shiftId: 1, role_id: "R-001", points: 8  },
    { personnelId: "P002", day: 6, shiftId: 1, role_id: "R-001", points: 10 },
    { personnelId: "P003", day: 1, shiftId: 1, role_id: "R-002", points: 5  },
    { personnelId: "P003", day: 4, shiftId: 0, role_id: "R-002", points: 8  },
    { personnelId: "P003", day: 5, shiftId: 0, role_id: "R-002", points: 8  },
  ],
};
