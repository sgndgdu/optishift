/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAuth } from "@/lib/auth";
import { managerOutsideBranch } from "@/lib/access";
import { getDB } from "@/lib/db/client";
import { industryFromRules } from "@/lib/templates";
import { IMPORT_COLUMNS } from "@/lib/personnelImport";

// GET ?location_id=&format=xlsx|csv → boş personel aktarım şablonu.
// Excel'de "Açıklama" sayfası: şubenin departmanları ve sektörün rol önerileri (yazım birliği için).
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const location_id = searchParams.get("location_id");

  if (format === "csv") {
    // Türkçe Excel CSV'yi ; ile açar; BOM Türkçe karakterleri korur
    const body = "﻿" + IMPORT_COLUMNS.join(";") + "\r\n";
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="personel-sablonu.csv"`,
      },
    });
  }

  let departments: string[] = [];
  let roles: string[] = [];
  if (location_id) {
    const db = getDB();
    const loc = await db.prepare(`SELECT id, rules FROM locations WHERE id = ? AND org_id = ?`).get(location_id, auth.org_id) as any;
    if (managerOutsideBranch(auth, location_id)) return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
    if (loc) {
      departments = ((await db.prepare(`SELECT name FROM departments WHERE location_id = ? ORDER BY name`).all(location_id)) as any[]).map(d => d.name);
      roles = (industryFromRules(loc.rules)?.roles ?? []).map(r => r.label);
    }
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Personel");
  ws.columns = [
    { header: "İsim", key: "name", width: 26 },
    { header: "Departman", key: "department", width: 20 },
    { header: "Yetenek", key: "skills", width: 30 },
    { header: "Telefon", key: "phone", width: 18 },
    { header: "E-posta", key: "email", width: 28 },
  ];
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4D3A" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.getColumn("phone").numFmt = "@"; // baştaki 0 kaybolmasın
  ws.getCell("A1").note = "Zorunlu. Ad ve soyad.";
  ws.getCell("C1").note = "Birden fazlaysa virgülle ayırın: Barista, Kasa";
  ws.getCell("E1").note = "İsteğe bağlı. Boşsa kişiye kullanıcı adıyla giriş hesabı açılır.";
  if (departments.length) {
    for (let r = 2; r <= 501; r++) {
      ws.getCell(`B${r}`).dataValidation = {
        type: "list", allowBlank: true, showErrorMessage: false,
        formulae: [`"${departments.join(",").slice(0, 250)}"`],
      };
    }
  }

  const info = wb.addWorksheet("Açıklama");
  info.getColumn(1).width = 90;
  const lines = [
    "Nasıl doldurulur?",
    "• Her satır bir kişi. Sadece İsim zorunlu; Departman, Yetenek, Telefon ve E-posta isteğe bağlı.",
    "• Yetenek birden fazlaysa virgülle ayırın (örn. Barista, Kasa). Vardiyaların zorunlu rolleriyle aynı yazılmalı.",
    "• Aynı isim ve telefonla şubede zaten kayıtlı kişi tekrar eklenmez.",
    "• Dosyayı OptiShift › Ekip › Toplu Yükle ekranına yükleyin; eklemeden önce önizleme görürsünüz.",
    "",
    departments.length ? `Bu şubenin departmanları: ${departments.join(", ")}` : "Bu şubede departman tanımlı değil; Departman sütununu boş bırakabilirsiniz.",
    roles.length ? `İşletme türünüze önerilen roller: ${roles.join(", ")}` : "",
  ];
  lines.forEach((t, i) => { const c = info.getCell(`A${i + 1}`); c.value = t; if (i === 0) c.font = { bold: true, size: 13 }; });

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="personel-sablonu.xlsx"`,
    },
  });
}
