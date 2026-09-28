import { describe, it, expect } from "vitest";
import { checkRows, parseDelimited, rowsFromTable, unknownDepartments } from "@/lib/personnelImport";

describe("toplu personel aktarımı: çözümleme", () => {
  it("Türkçe Excel CSV'si (; ayırıcı, BOM, tırnaklı virgül)", () => {
    const csv = '﻿İsim;Departman;Yetenek;Telefon\r\nAyşe Kaya;Mutfak;"Aşçı, Hijyen";0532 111 22 33\r\nCan Er;;Kasa;\r\n';
    const rows = rowsFromTable(parseDelimited(csv));
    expect(rows).toEqual([
      { line: 2, name: "Ayşe Kaya", department: "Mutfak", skills: ["Aşçı", "Hijyen"], phone: "05321112233", email: "" },
      { line: 3, name: "Can Er", department: "", skills: ["Kasa"], phone: "", email: "" },
    ]);
  });

  it("Excel'den yapıştırılan sekmeli metin, başlıksız → sütun sırası", () => {
    const rows = rowsFromTable(parseDelimited("Ali Veli\tKasa\tBarista/Kasa\t5551112233\tali@x.com"));
    expect(rows[0]).toMatchObject({ name: "Ali Veli", department: "Kasa", skills: ["Barista", "Kasa"], email: "ali@x.com", line: 1 });
  });

  it("farklı sıradaki ve eş anlamlı başlıklar", () => {
    const rows = rowsFromTable([["Telefon", "Ad Soyad", "Bölüm", "E-posta", "Roller"], ["5550000000", "Deniz Ak", "Salon", "DENIZ@X.COM", "Garson; Kasa"]]);
    expect(rows[0]).toMatchObject({ name: "Deniz Ak", department: "Salon", phone: "5550000000", email: "deniz@x.com", skills: ["Garson", "Kasa"] });
  });
});

describe("toplu personel aktarımı: doğrulama", () => {
  const ctx = { departments: [{ id: "D1", name: "Mutfak" }], existing: [{ name: "Eski Kişi", phone: "0555 000 00 00" }] };
  it("isimsiz, tekrar, şubede kayıtlı ve geçersiz e-posta atlanır; bilinmeyen departman uyarıdır", () => {
    const rows = rowsFromTable([
      ["İsim", "Departman", "Yetenek", "Telefon", "E-posta"],
      ["Ayşe", "mutfak", "", "5551112233", ""],
      ["Ayşe", "", "", "5551112233", ""],
      ["", "Mutfak", "", "", ""],
      ["Eski Kişi", "", "", "5550000000", ""],
      ["Bora", "Depo", "", "", "yanlis@"],
      ["Cem", "Depo", "", "", ""],
    ]);
    const out = checkRows(rows, ctx);
    expect(out.map(r => [r.name, r.status, r.notes[0] ?? ""])).toEqual([
      ["Ayşe", "ok", ""],
      ["Ayşe", "skip", "Dosyada tekrar ediyor"],
      ["", "skip", "İsim yok"],
      ["Eski Kişi", "skip", "Bu şubede zaten kayıtlı"],
      ["Bora", "skip", "E-posta geçersiz"],
      ["Cem", "ok", "\"Depo\" departmanı şubede yok, departmansız eklenir"],
    ]);
    expect(out[0].departmentId).toBe("D1");
    expect(unknownDepartments(rows, ctx.departments)).toEqual(["Depo"]);
  });
});
