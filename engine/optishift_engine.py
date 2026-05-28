#!/usr/bin/env python3
"""
OptiShift - Vardiya Optimizasyon Motoru
Google OR-Tools CP-SAT ile Adil Vardiya Planlama

Kurulum:
    pip install ortools openpyxl

Çalıştırma:
    python optishift_engine.py
"""

from ortools.sat.python import cp_model
import json

# ─── VERİ MODELİ ─────────────────────────────────────────────────────────────

STORE = {
    "store_id": "M-402",
    "store_name": "İzmir Merkez Mağazası",
    "connected_erp": "SAP_SuccessFactors",
    "erp_mapped_fields": {
        "employee_name": "Emp_Name",
        "employee_id": "Sicil_No",
    },
}

PERSONNEL = [
    {"id": "P001", "name": "Ahmet Yılmaz",   "skills": ["Kasa", "Reyon"],              "prev_score": 32},
    {"id": "P002", "name": "Fatma Şahin",    "skills": ["Kasa", "Mutfak"],             "prev_score": 28},
    {"id": "P003", "name": "Mehmet Demir",   "skills": ["Teras", "Reyon"],             "prev_score": 35},
    {"id": "P004", "name": "Ayşe Kaya",      "skills": ["Kasa", "Teras"],              "prev_score": 30},
    {"id": "P005", "name": "Ali Çelik",      "skills": ["Mutfak", "Reyon"],            "prev_score": 25},
    {"id": "P006", "name": "Zeynep Arslan",  "skills": ["Kasa", "Mutfak", "Teras"],   "prev_score": 40},
]

# 0=Pazartesi … 6=Pazar
DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
NUM_DAYS = 7

SHIFTS = [
    {"id": 0, "name": "Sabah Açılış",  "start": 8,  "end": 16},
    {"id": 1, "name": "Akşam Kapanış", "start": 16, "end": 24},
]
NUM_SHIFTS = len(SHIFTS)
SHIFT_HOURS = 8

# Müsaitlik: available / preferred_not / unavailable
AVAILABILITY = {
    "P001": {0: "available",     1: "available",     2: "preferred_not", 3: "available",     4: "available",     5: "preferred_not", 6: "unavailable"},
    "P002": {0: "available",     1: "unavailable",   2: "available",     3: "available",     4: "preferred_not", 5: "available",     6: "available"},
    "P003": {0: "preferred_not", 1: "available",     2: "available",     3: "unavailable",   4: "available",     5: "available",     6: "preferred_not"},
    "P004": {0: "available",     1: "available",     2: "unavailable",   3: "available",     4: "available",     5: "unavailable",   6: "available"},
    "P005": {0: "unavailable",   1: "available",     2: "available",     3: "available",     4: "preferred_not", 5: "available",     6: "available"},
    "P006": {0: "available",     1: "preferred_not", 2: "available",     3: "available",     4: "available",     5: "available",     6: "unavailable"},
}

# Her bölgede günlük minimum çalışan kişi (min_per_day — tüm vardiyalar toplamı)
ZONE_DEMAND_PER_DAY = {
    "Kasa":   2,   # gün boyunca en az 2 kasiyerin vardiyası olmalı
    "Reyon":  1,
    "Teras":  1,
    "Mutfak": 1,
}

RULES = {
    "max_weekly_hours": 45,
    "min_rest_hours":   11,   # iki vardiya arası minimum
}


# ─── PUAN HESAPLAMA ──────────────────────────────────────────────────────────

def shift_points(day: int, shift_id: int) -> int:
    """CLAUDE.md Bölüm 3-E'deki puan tablosu."""
    is_friday_saturday = day in (4, 5)
    is_sunday          = day == 6
    is_morning         = shift_id == 0

    if is_sunday and not is_morning:
        return 10   # Pazar akşam kapanış
    if is_friday_saturday:
        return 8    # Cuma/Cumartesi yoğun saatler
    if is_morning:
        return 3    # Hafta içi sabah açılış
    return 5        # Hafta içi akşam kapanış (temizlik dahil)


# ─── MODEL KURULUMU ───────────────────────────────────────────────────────────

def build_model():
    model = cp_model.CpModel()
    num_p = len(PERSONNEL)

    # shifts[(p, d, s)] == 1 → personel p, gün d, vardiya s'de çalışıyor
    shifts = {
        (p, d, s): model.new_bool_var(f"shift_p{p}_d{d}_s{s}")
        for p in range(num_p)
        for d in range(NUM_DAYS)
        for s in range(NUM_SHIFTS)
    }

    # ── HARD CONSTRAINTS ─────────────────────────────────────────────────────

    # Aynı gün en fazla 1 vardiya
    for p in range(num_p):
        for d in range(NUM_DAYS):
            model.add_at_most_one(shifts[(p, d, s)] for s in range(NUM_SHIFTS))

    # Müsaitlik: "unavailable" günlerde kesinlikle çalışamaz (Kırmızı)
    for p_idx, person in enumerate(PERSONNEL):
        avail = AVAILABILITY[person["id"]]
        for d in range(NUM_DAYS):
            if avail.get(d) == "unavailable":
                for s in range(NUM_SHIFTS):
                    model.add(shifts[(p_idx, d, s)] == 0)

    # Minimum dinlenme: akşam vardiyası (16-24) → ertesi sabah (08-16) YASAK
    # 24:00 kapanış + 11s dinlenme = 11:00 → sabah 08:00 başlangıcı yetersiz (sadece 8s)
    for p in range(num_p):
        for d in range(NUM_DAYS - 1):
            model.add(shifts[(p, d, 1)] + shifts[(p, d + 1, 0)] <= 1)

    # Haftalık maksimum saat limiti (45s → max 5 vardiya × 8s = 40s güvenli, 45/8=5)
    max_shifts_per_week = RULES["max_weekly_hours"] // SHIFT_HOURS
    for p in range(num_p):
        model.add(
            sum(shifts[(p, d, s)] for d in range(NUM_DAYS) for s in range(NUM_SHIFTS))
            <= max_shifts_per_week
        )

    # Bölge kotası: her gün yetkin kişi toplamı minimumu (min_per_day)
    # Sabah+akşam vardiyalarının toplamında o gün en az min_count kişi çalışmış olmalı
    for zone, min_count in ZONE_DEMAND_PER_DAY.items():
        skilled = [
            p_idx for p_idx, person in enumerate(PERSONNEL)
            if zone in person["skills"]
        ]
        for d in range(NUM_DAYS):
            if skilled:
                model.add(
                    sum(shifts[(p_idx, d, s)] for p_idx in skilled for s in range(NUM_SHIFTS))
                    >= min_count
                )

    # ── SOFT CONSTRAINTS (Ceza Değişkenleri) ─────────────────────────────────

    # preferred_not günlerde çalışmak istenmeyen ama zorunlu olabilir
    preferred_not_penalties = [
        shifts[(p_idx, d, s)]
        for p_idx, person in enumerate(PERSONNEL)
        for d in range(NUM_DAYS)
        for s in range(NUM_SHIFTS)
        if AVAILABILITY[person["id"]].get(d) == "preferred_not"
    ]

    # ── ADİL PUAN OPTİMİZASYONU ──────────────────────────────────────────────

    # Bu haftanın toplam adil puanı (önceki ay puanı + bu hafta)
    person_scores = []
    for p_idx, person in enumerate(PERSONNEL):
        weekly_pts = sum(
            shifts[(p_idx, d, s)] * shift_points(d, s)
            for d in range(NUM_DAYS)
            for s in range(NUM_SHIFTS)
        )
        total = model.new_int_var(0, 600, f"total_score_p{p_idx}")
        model.add(total == person["prev_score"] + weekly_pts)
        person_scores.append(total)

    # Adalet farkı: max_score - min_score → minimize
    max_score = model.new_int_var(0, 600, "max_score")
    min_score = model.new_int_var(0, 600, "min_score")
    model.add_max_equality(max_score, person_scores)
    model.add_min_equality(min_score, person_scores)
    fairness_gap = model.new_int_var(0, 600, "fairness_gap")
    model.add(fairness_gap == max_score - min_score)

    # Amaç fonksiyonu: adalet farkını öncelikle minimize et, sonra preferred_not cezalarını
    model.minimize(fairness_gap * 100 + sum(preferred_not_penalties))

    return model, shifts, person_scores, fairness_gap


# ─── ÇÖZÜCÜ ──────────────────────────────────────────────────────────────────

def solve(silent: bool = False):
    model, shifts, person_scores, fairness_gap = build_model()

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 15.0
    solver.parameters.num_search_workers = 4
    solver.parameters.log_search_progress = False

    if not silent:
        print("OR-Tools CP-SAT çözücüsü çalışıyor...")
    status = solver.solve(model)

    status_map = {
        cp_model.OPTIMAL:   "OPTIMAL",
        cp_model.FEASIBLE:  "FEASIBLE (zaman sınırında en iyi bulunan)",
        cp_model.INFEASIBLE: "INFEASIBLE",
        cp_model.UNKNOWN:   "UNKNOWN",
    }
    if not silent:
        print(f"Çözücü durumu: {status_map.get(status, status)}")
        print(f"Çözüm süresi : {solver.wall_time:.3f}s")

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        print("\nHATA: Geçerli bir çözüm bulunamadı. Kısıtları gözden geçirin.")
        return None

    return solver, shifts, person_scores, fairness_gap


# ─── KONSOL ÇIKTISI ──────────────────────────────────────────────────────────

def print_schedule(solver, shifts, person_scores, fairness_gap):
    num_p = len(PERSONNEL)
    sep = "─" * 95

    print("\n" + "=" * 95)
    print(f"  {STORE['store_name']}  |  Haftalık Vardiya Planı")
    print("=" * 95)

    header = f"{'Personel / Yetenekler':<26}" + "".join(f"{d[:3]:^11}" for d in DAYS) + f"  {'Puan':>6}"
    print(header)
    print(sep)

    for p_idx, person in enumerate(PERSONNEL):
        skills_str = ",".join(person["skills"])
        label = f"{person['name']} [{skills_str}]"
        row = f"{label:<26}"
        weekly_pts = 0

        for d in range(NUM_DAYS):
            avail = AVAILABILITY[person["id"]].get(d, "available")
            cell = "—"
            for s in range(NUM_SHIFTS):
                if solver.value(shifts[(p_idx, d, s)]):
                    pts = shift_points(d, s)
                    weekly_pts += pts
                    tag = "S" if s == 0 else "A"
                    cell = f"{tag}·{pts}p"
                    if avail == "preferred_not":
                        cell += "!"   # tercih edilmeyen gün uyarısı
                    break
            if cell == "—" and avail == "unavailable":
                cell = "İZİN"
            row += f"{cell:^11}"

        total = solver.value(person_scores[p_idx])
        prev  = person["prev_score"]
        row  += f"  {total:>3}p (+{weekly_pts})"
        print(row)

    print(sep)
    gap = solver.value(fairness_gap)
    print(f"\nAdalet Farkı (max − min toplam puan): {gap} puan")
    print("Efsane: S=Sabah  A=Akşam  !=tercih edilmeyen gün  İZİN=unavailable\n")

    # Kural ihlali raporu
    print("── Haftalık Saat Kontrolleri " + "─" * 67)
    for p_idx, person in enumerate(PERSONNEL):
        n_shifts = sum(
            solver.value(shifts[(p_idx, d, s)])
            for d in range(NUM_DAYS) for s in range(NUM_SHIFTS)
        )
        hours = n_shifts * SHIFT_HOURS
        flag  = "✓" if hours <= RULES["max_weekly_hours"] else "⚠ FAZLA MESAİ!"
        print(f"  {person['name']:<22} {n_shifts} vardiya × {SHIFT_HOURS}s = {hours:>3}s   {flag}")

    print("\n── Bölge Kota Kontrolleri (min_per_day) " + "─" * 55)
    all_ok = True
    for zone, min_count in ZONE_DEMAND_PER_DAY.items():
        skilled = [
            p_idx for p_idx, person in enumerate(PERSONNEL)
            if zone in person["skills"]
        ]
        violations = []
        for d in range(NUM_DAYS):
            count = sum(
                solver.value(shifts[(p_idx, d, s)])
                for p_idx in skilled for s in range(NUM_SHIFTS)
            )
            if count < min_count:
                violations.append(f"{DAYS[d][:3]}({count}/{min_count})")
        if violations:
            all_ok = False
            print(f"  {zone:<10} ⚠ İhlal: {', '.join(violations)}")
        else:
            print(f"  {zone:<10} ✓ Kota sağlandı (günde min {min_count} kişi)")
    if all_ok:
        print("\n  Tüm bölge kotaları karşılandı.")
    print()


# ─── JSON EXPORT ─────────────────────────────────────────────────────────────

def export_json(solver, shifts, person_scores) -> dict:
    result = {
        "store_metadata": STORE,
        "generated_at": "2026-05-29",
        "week_schedule": [],
        "fairness_summary": [],
        "rules_applied": RULES,
    }

    for p_idx, person in enumerate(PERSONNEL):
        schedule = {"id": person["id"], "name": person["name"], "skills": person["skills"], "days": {}}
        for d in range(NUM_DAYS):
            assigned = None
            for s in range(NUM_SHIFTS):
                if solver.value(shifts[(p_idx, d, s)]):
                    assigned = {
                        "shift": SHIFTS[s]["name"],
                        "start": SHIFTS[s]["start"],
                        "end": SHIFTS[s]["end"],
                        "points": shift_points(d, s),
                        "availability_status": AVAILABILITY[person["id"]].get(d, "available"),
                    }
                    break
            schedule["days"][DAYS[d]] = assigned or {"status": "off", "availability_status": AVAILABILITY[person["id"]].get(d, "available")}
        result["week_schedule"].append(schedule)

        result["fairness_summary"].append({
            "id": person["id"],
            "name": person["name"],
            "previous_score": person["prev_score"],
            "total_score": solver.value(person_scores[p_idx]),
        })

    path = "/Users/sefagundogdu/Desktop/OptiShift/optishift_result.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"  JSON → {path}")
    return result


# ─── EXCEL EXPORT ────────────────────────────────────────────────────────────

def export_excel(solver, shifts, person_scores):
    try:
        import openpyxl
        from openpyxl.styles import PatternFill, Font, Alignment
        from openpyxl.utils import get_column_letter
    except ImportError:
        print("  Excel export atlandı (pip install openpyxl)")
        return

    wb = openpyxl.Workbook()

    # Renk paletleri
    C_HEADER   = PatternFill("solid", fgColor="1F3864")
    C_MORNING  = PatternFill("solid", fgColor="DAEEF3")   # açık mavi
    C_EVENING  = PatternFill("solid", fgColor="FDE9D9")   # açık turuncu
    C_OFF      = PatternFill("solid", fgColor="F2F2F2")   # gri
    C_UNAVAIL  = PatternFill("solid", fgColor="FFD7D7")   # açık kırmızı
    C_PREF_NOT = PatternFill("solid", fgColor="FFFFE0")   # sarı uyarı
    C_OK       = PatternFill("solid", fgColor="C6EFCE")
    C_WARN     = PatternFill("solid", fgColor="FFC7CE")

    HDR_FONT   = Font(bold=True, color="FFFFFF", size=11)
    CENTER     = Alignment(horizontal="center", vertical="center", wrap_text=True)
    LEFT       = Alignment(horizontal="left", vertical="center")

    # ── SEKMİ 1: Yönetici Özeti & KPI ────────────────────────────────────
    ws1 = wb.active
    ws1.title = "Yönetici Özeti & KPI"
    ws1.row_dimensions[1].height = 30
    ws1.row_dimensions[3].height = 22

    ws1.merge_cells("A1:F1")
    title_cell = ws1["A1"]
    title_cell.value = f"{STORE['store_name']}  |  Haftalık KPI Raporu"
    title_cell.font  = Font(bold=True, size=16, color="1F3864")
    title_cell.alignment = CENTER

    headers1 = ["Personel", "Yetenekler", "Vardiya Sayısı", "Toplam Saat", "Yasal Durum (≤45s)", "Adil Puan (Kümülatif)"]
    for col, h in enumerate(headers1, 1):
        c = ws1.cell(row=3, column=col, value=h)
        c.fill = C_HEADER
        c.font = HDR_FONT
        c.alignment = CENTER

    for p_idx, person in enumerate(PERSONNEL):
        row = 4 + p_idx
        n_shifts = sum(solver.value(shifts[(p_idx, d, s)]) for d in range(NUM_DAYS) for s in range(NUM_SHIFTS))
        hours    = n_shifts * SHIFT_HOURS
        score    = solver.value(person_scores[p_idx])
        ok       = hours <= RULES["max_weekly_hours"]

        ws1.cell(row=row, column=1, value=person["name"]).alignment = LEFT
        ws1.cell(row=row, column=2, value=", ".join(person["skills"])).alignment = LEFT
        ws1.cell(row=row, column=3, value=n_shifts).alignment = CENTER
        ws1.cell(row=row, column=4, value=hours).alignment = CENTER

        legal_cell = ws1.cell(row=row, column=5, value="✓ Uyumlu" if ok else "⚠ FAZLA MESAİ")
        legal_cell.fill      = C_OK if ok else C_WARN
        legal_cell.alignment = CENTER

        ws1.cell(row=row, column=6, value=score).alignment = CENTER

    ws1.column_dimensions["A"].width = 22
    ws1.column_dimensions["B"].width = 24
    for col in ["C", "D", "E", "F"]:
        ws1.column_dimensions[col].width = 22

    # Özet kutu
    summary_row = 4 + len(PERSONNEL) + 2
    ws1.cell(row=summary_row, column=1, value="Toplam Çalışan:").font = Font(bold=True)
    ws1.cell(row=summary_row, column=2, value=len(PERSONNEL))
    ws1.cell(row=summary_row + 1, column=1, value="Maks Haftalık Saat:").font = Font(bold=True)
    ws1.cell(row=summary_row + 1, column=2, value=RULES["max_weekly_hours"])
    ws1.cell(row=summary_row + 2, column=1, value="Min Dinlenme Süresi:").font = Font(bold=True)
    ws1.cell(row=summary_row + 2, column=2, value=f"{RULES['min_rest_hours']} saat")

    # ── SEKMİ 2: Haftalık Vardiya Planı ──────────────────────────────────
    ws2 = wb.create_sheet("Haftalık Vardiya Planı")
    ws2.row_dimensions[1].height = 24

    ws2.cell(row=1, column=1, value="Personel / Yetenekler").fill      = C_HEADER
    ws2.cell(row=1, column=1).font      = HDR_FONT
    ws2.cell(row=1, column=1).alignment = CENTER

    for d, day in enumerate(DAYS):
        c = ws2.cell(row=1, column=2 + d, value=day)
        c.fill      = C_HEADER
        c.font      = HDR_FONT
        c.alignment = CENTER

    total_col = 2 + NUM_DAYS
    c = ws2.cell(row=1, column=total_col, value="Haftalık Puan")
    c.fill      = C_HEADER
    c.font      = HDR_FONT
    c.alignment = CENTER

    for p_idx, person in enumerate(PERSONNEL):
        row = 2 + p_idx
        ws2.row_dimensions[row].height = 20

        name_label = f"{person['name']}\n[{', '.join(person['skills'])}]"
        nc = ws2.cell(row=row, column=1, value=name_label)
        nc.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)

        weekly_pts = 0
        for d in range(NUM_DAYS):
            avail  = AVAILABILITY[person["id"]].get(d, "available")
            cell   = ws2.cell(row=row, column=2 + d)
            cell.alignment = CENTER
            placed = False

            for s in range(NUM_SHIFTS):
                if solver.value(shifts[(p_idx, d, s)]):
                    pts = shift_points(d, s)
                    weekly_pts += pts
                    shift_name = "Sabah" if s == 0 else "Akşam"
                    warn = " !" if avail == "preferred_not" else ""
                    cell.value = f"{shift_name}\n({pts}p){warn}"
                    cell.fill  = C_MORNING if s == 0 else C_EVENING
                    placed = True
                    break

            if not placed:
                if avail == "unavailable":
                    cell.value = "İZİNLİ"
                    cell.fill  = C_UNAVAIL
                else:
                    cell.value = "—"
                    cell.fill  = C_OFF

        score_cell = ws2.cell(row=row, column=total_col)
        score_cell.value     = solver.value(person_scores[p_idx])
        score_cell.alignment = CENTER
        score_cell.font      = Font(bold=True)

    ws2.column_dimensions["A"].width = 26
    for i in range(NUM_DAYS):
        ws2.column_dimensions[get_column_letter(2 + i)].width = 14
    ws2.column_dimensions[get_column_letter(total_col)].width = 15

    # Renk lejantı
    legend_row = 2 + len(PERSONNEL) + 2
    ws2.cell(row=legend_row, column=1, value="Renk Lejantı:").font = Font(bold=True)
    legends = [
        (C_MORNING, "Sabah Açılış"),
        (C_EVENING, "Akşam Kapanış"),
        (C_UNAVAIL, "İzinli (Kırmızı)"),
        (C_PREF_NOT, "! = Tercih edilmeyen gün"),
    ]
    for i, (fill, label) in enumerate(legends):
        c = ws2.cell(row=legend_row + 1 + i, column=2, value=label)
        c.fill = fill

    path = "/Users/sefagundogdu/Desktop/OptiShift/optishift_schedule.xlsx"
    wb.save(path)
    print(f"  Excel → {path}")


# ─── ANA FONKSİYON ───────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  OptiShift - Vardiya Optimizasyon Motoru")
    print(f"  Mağaza   : {STORE['store_name']}")
    print(f"  Personel : {len(PERSONNEL)} kişi")
    print(f"  Dönem    : {NUM_DAYS} gün  |  {NUM_SHIFTS} vardiya tipi")
    print("=" * 60)

    result = solve()
    if result is None:
        return

    solver, shifts, person_scores, fairness_gap = result

    print_schedule(solver, shifts, person_scores, fairness_gap)

    print("── Dosya Çıktıları " + "─" * 77)
    export_json(solver, shifts, person_scores)
    export_excel(solver, shifts, person_scores)
    print()


def api_mode(prev_scores: dict):
    """Next.js API route tarafından çağrılır. prev_scores ile önceki puanları override eder."""
    import sys
    for p in PERSONNEL:
        if p["id"] in prev_scores:
            p["prev_score"] = prev_scores[p["id"]]

    result = solve(silent=True)
    if result is None:
        print(json.dumps({"error": "Çözüm bulunamadı"}))
        return

    solver, shifts, person_scores, fairness_gap = result

    output = {
        "fairness_gap": solver.value(fairness_gap),
        "assignments": [],
        "scores": {},
        "personnel": [],
    }

    for p_idx, person in enumerate(PERSONNEL):
        output["scores"][person["id"]] = solver.value(person_scores[p_idx])
        output["personnel"].append({
            "id": person["id"],
            "name": person["name"],
            "skills": person["skills"],
            "prev_score": person["prev_score"],
            "availability": {str(k): v for k, v in AVAILABILITY[person["id"]].items()},
        })
        for d in range(NUM_DAYS):
            for s in range(NUM_SHIFTS):
                if solver.value(shifts[(p_idx, d, s)]):
                    output["assignments"].append({
                        "personnelId": person["id"],
                        "day": d,
                        "shiftId": s,
                        "points": shift_points(d, s),
                    })

    sys.stdout.write(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--api":
        import json as _json
        prev_scores = _json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
        api_mode(prev_scores)
    else:
        main()
