import type { Personnel, WeekSchedule } from "./types";

export const PERSONNEL: Personnel[] = [
  { id: "P001", name: "Ahmet Yılmaz",   skills: ["Kasa", "Reyon"],              prev_score: 32,
    availability: { 0: "available", 1: "available", 2: "preferred_not", 3: "available", 4: "available", 5: "preferred_not", 6: "unavailable" } },
  { id: "P002", name: "Fatma Şahin",    skills: ["Kasa", "Mutfak"],             prev_score: 28,
    availability: { 0: "available", 1: "unavailable", 2: "available", 3: "available", 4: "preferred_not", 5: "available", 6: "available" } },
  { id: "P003", name: "Mehmet Demir",   skills: ["Teras", "Reyon"],             prev_score: 35,
    availability: { 0: "preferred_not", 1: "available", 2: "available", 3: "unavailable", 4: "available", 5: "available", 6: "preferred_not" } },
  { id: "P004", name: "Ayşe Kaya",      skills: ["Kasa", "Teras"],              prev_score: 30,
    availability: { 0: "available", 1: "available", 2: "unavailable", 3: "available", 4: "available", 5: "unavailable", 6: "available" } },
  { id: "P005", name: "Ali Çelik",      skills: ["Mutfak", "Reyon"],            prev_score: 25,
    availability: { 0: "unavailable", 1: "available", 2: "available", 3: "available", 4: "preferred_not", 5: "available", 6: "available" } },
  { id: "P006", name: "Zeynep Arslan",  skills: ["Kasa", "Mutfak", "Teras"],   prev_score: 40,
    availability: { 0: "available", 1: "preferred_not", 2: "available", 3: "available", 4: "available", 5: "available", 6: "unavailable" } },
];

// OR-Tools çıktısını simüle eden mock haftalık plan
export const MOCK_SCHEDULE: WeekSchedule = {
  fairnessGap: 0,
  scores: { P001: 56, P002: 56, P003: 56, P004: 56, P005: 56, P006: 56 },
  assignments: [
    // Ahmet
    { personnelId: "P001", day: 0, shiftId: 0, points: 3 },
    { personnelId: "P001", day: 1, shiftId: 1, points: 5 },
    { personnelId: "P001", day: 4, shiftId: 1, points: 8 },
    { personnelId: "P001", day: 5, shiftId: 1, points: 8 },
    // Fatma
    { personnelId: "P002", day: 2, shiftId: 1, points: 5 },
    { personnelId: "P002", day: 3, shiftId: 1, points: 5 },
    { personnelId: "P002", day: 5, shiftId: 1, points: 8 },
    { personnelId: "P002", day: 6, shiftId: 1, points: 10 },
    // Mehmet
    { personnelId: "P003", day: 1, shiftId: 1, points: 5 },
    { personnelId: "P003", day: 4, shiftId: 0, points: 8 },
    { personnelId: "P003", day: 5, shiftId: 0, points: 8 },
    // Ayşe
    { personnelId: "P004", day: 1, shiftId: 0, points: 3 },
    { personnelId: "P004", day: 3, shiftId: 1, points: 5 },
    { personnelId: "P004", day: 4, shiftId: 1, points: 8 },
    { personnelId: "P004", day: 6, shiftId: 1, points: 10 },
    // Ali
    { personnelId: "P005", day: 1, shiftId: 0, points: 3 },
    { personnelId: "P005", day: 2, shiftId: 1, points: 5 },
    { personnelId: "P005", day: 3, shiftId: 1, points: 5 },
    { personnelId: "P005", day: 5, shiftId: 0, points: 8 },
    { personnelId: "P005", day: 6, shiftId: 1, points: 10 },
    // Zeynep
    { personnelId: "P006", day: 0, shiftId: 0, points: 3 },
    { personnelId: "P006", day: 2, shiftId: 1, points: 5 },
    { personnelId: "P006", day: 4, shiftId: 1, points: 8 },
  ],
};
