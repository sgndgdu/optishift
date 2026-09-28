/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAuth } from "@/lib/auth";
import { MAX_IMPORT_ROWS, parseDelimited } from "@/lib/personnelImport";

// POST { filename, data_base64 } → { table: string[][] }  (.xlsx ilk sayfa ya da .csv/.txt)
// Excel sunucuda okunur: tarayıcıya ağır kütüphane yüklenmez. Kayıt yapmaz.
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role === "employee") return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  try {
    const { filename, data_base64 } = await req.json();
    if (typeof data_base64 !== "string") return NextResponse.json({ error: "Dosya yok" }, { status: 400 });
    const buf = Buffer.from(data_base64, "base64");
    if (buf.length > MAX_BYTES) return NextResponse.json({ error: "Dosya 5 MB'tan büyük" }, { status: 400 });
    const name = String(filename ?? "").toLowerCase();

    if (name.endsWith(".xlsx")) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as any);
      const ws = wb.worksheets[0];
      if (!ws) return NextResponse.json({ table: [] });
      const table: string[][] = [];
      ws.eachRow({ includeEmpty: false }, row => {
        if (table.length > MAX_IMPORT_ROWS + 1) return;
        const vals = (row.values as any[]).slice(1).map(v => {
          if (v == null) return "";
          if (typeof v === "object") return String(v.text ?? v.result ?? (Array.isArray(v.richText) ? v.richText.map((t: any) => t.text).join("") : "") ?? "");
          return String(v);
        });
        table.push(vals);
      });
      return NextResponse.json({ table });
    }
    if (name.endsWith(".xls")) {
      return NextResponse.json({ error: "Eski .xls biçimi desteklenmiyor; Excel'de \"Farklı Kaydet › .xlsx\" ya da CSV olarak kaydedin." }, { status: 400 });
    }
    // CSV / TXT: UTF-8 dene, bozuksa Windows-1254 (eski Türkçe Excel CSV'si)
    let text = buf.toString("utf8");
    if (text.includes("�")) text = new TextDecoder("windows-1254").decode(buf);
    return NextResponse.json({ table: parseDelimited(text).slice(0, MAX_IMPORT_ROWS + 1) });
  } catch (err: any) {
    console.error("[personnel/bulk/parse]", err);
    return NextResponse.json({ error: "Dosya okunamadı. Şablondaki gibi .xlsx ya da .csv olduğundan emin olun." }, { status: 400 });
  }
}
