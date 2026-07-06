"""
OR-Tools motoru için senaryo/regresyon testleri.

Her test motoru bağımsız bir alt süreçte çalıştırır (bkz. conftest.run_engine)
ve CLAUDE.md'de belgelenmiş kritik hard constraint'leri doğrular: kapasite
matrisi (exact_coverage), departman izolasyonu, gece koruması, ekip rotasyonu,
zorunlu yetkinlik ve INFEASIBLE teşhisi.
"""
from conftest import run_engine, make_person, base_payload

FULL_WEEK_AVAILABLE = {str(d): "available" for d in range(7)}


def test_smoke_basic_schedule_runs():
    """Temel bir haftalık plan hatasız üretilir ve assignments alanı doludur."""
    payload = base_payload(
        personnel=[
            make_person("P1", "Ayşe"),
            make_person("P2", "Burak"),
        ],
        availability={"P1": FULL_WEEK_AVAILABLE, "P2": FULL_WEEK_AVAILABLE},
    )
    result = run_engine(payload)
    assert "error" not in result
    assert "assignments" in result
    assert "scores" in result


def test_exact_coverage_hard_constraint():
    """demand_matrix'te tanımlı hücre tam istenen sayıda kişiyle doldurulur —
    ne fazla ne eksik — coverage-max eğilimine rağmen (3 kişi müsaitken demand=2)."""
    payload = base_payload(
        personnel=[
            make_person("P1", "Ayşe"),
            make_person("P2", "Burak"),
            make_person("P3", "Cem"),
        ],
        availability={
            "P1": FULL_WEEK_AVAILABLE,
            "P2": FULL_WEEK_AVAILABLE,
            "P3": FULL_WEEK_AVAILABLE,
        },
        demand_matrix={"morning": {"0": 2}},
    )
    result = run_engine(payload)
    assert "error" not in result, result

    monday_morning = [
        a for a in result["assignments"]
        if a["day"] == 0 and a["shiftId"] == 0
    ]
    assert len(monday_morning) == 2, (
        f"Pazartesi sabah demand=2 idi ama {len(monday_morning)} kişi atandı: {monday_morning}"
    )


def test_department_demand_matrix_isolation():
    """Departman bazlı talep sadece o departmandaki personel alt kümesinden
    karşılanır — başka departmandan biri o hücreye kaymaz (2026-07-03 fix)."""
    payload = base_payload(
        personnel=[
            make_person("P1", "Ayşe", department_id="dept-a"),
            make_person("P2", "Burak", department_id="dept-a"),
            make_person("P3", "Cem", department_id="dept-b"),
        ],
        availability={pid: FULL_WEEK_AVAILABLE for pid in ("P1", "P2", "P3")},
        department_demand_matrix={"dept-a": {"morning": {"0": 1}}},
    )
    result = run_engine(payload)
    assert "error" not in result, result

    monday_morning = [
        a for a in result["assignments"] if a["day"] == 0 and a["shiftId"] == 0
    ]
    assert len(monday_morning) == 1
    assigned_id = monday_morning[0]["personnelId"]
    assert assigned_id in ("P1", "P2"), (
        f"dept-b personeli (P3) dept-a talebine atanmamalıydı: {assigned_id}"
    )


def test_night_restricted_personnel_never_assigned_night_shift():
    """Gebe/emziren/18 yaş altı/sağlık raporlu personel hiçbir gece vardiyasına
    atanamaz — hard constraint (Postalar Yönetmeliği)."""
    payload = base_payload(
        personnel=[
            make_person("P1", "Gebe Ayşe", max_weekly_hours=60),
            make_person("P2", "Burak", max_weekly_hours=60),
        ],
        availability={"P1": FULL_WEEK_AVAILABLE, "P2": FULL_WEEK_AVAILABLE},
        shifts=[
            {"id": "morning", "name": "Sabah", "start": "08:00", "end": "16:00", "base_points": 3},
            {"id": "night", "name": "Gece", "start": "22:00", "end": "05:30", "base_points": 5, "is_night": True},
        ],
        demand_matrix={"night": {str(d): 1 for d in range(7)}},
        night_restricted_ids=["P1"],
        rules={"max_weekly_hours": 60, "min_rest_hours": 11},
        max_consecutive_days=7,
    )
    result = run_engine(payload)
    assert "error" not in result, result

    night_assignments = [a for a in result["assignments"] if a["shiftId"] == 1]
    assert all(a["personnelId"] != "P1" for a in night_assignments), (
        f"Gece kısıtlı personel (P1) gece vardiyasına atanmış: {night_assignments}"
    )
    # Tek uygun kişi P2 olduğu için her gece P2'ye düşmeli
    assert len(night_assignments) == 7
    assert all(a["personnelId"] == "P2" for a in night_assignments)


def test_consecutive_night_weeks_restriction():
    """rules toggle açıkken geçen hafta gece çalışan personel bu hafta gece
    vardiyasına atanamaz (arka arkaya iki hafta gece yasağı)."""
    payload = base_payload(
        personnel=[
            make_person("P1", "Geçen Hafta Gececi", max_weekly_hours=60),
            make_person("P2", "Burak", max_weekly_hours=60),
        ],
        availability={"P1": FULL_WEEK_AVAILABLE, "P2": FULL_WEEK_AVAILABLE},
        shifts=[
            {"id": "morning", "name": "Sabah", "start": "08:00", "end": "16:00", "base_points": 3},
            {"id": "night", "name": "Gece", "start": "22:00", "end": "05:30", "base_points": 5, "is_night": True},
        ],
        demand_matrix={"night": {str(d): 1 for d in range(7)}},
        prev_week_night_ids=["P1"],
        consecutive_night_weeks_enabled=True,
        rules={"max_weekly_hours": 60, "min_rest_hours": 11},
        max_consecutive_days=7,
    )
    result = run_engine(payload)
    assert "error" not in result, result

    night_assignments = [a for a in result["assignments"] if a["shiftId"] == 1]
    assert all(a["personnelId"] != "P1" for a in night_assignments), (
        f"Geçen hafta gececi personel (P1) bu hafta yine geceye atanmış: {night_assignments}"
    )


def test_crew_rotation_hard_constraint():
    """crew_same_shift_hard=True iken ekip üyesi sadece rotasyonda atanan
    vardiyaya girer, asla başka vardiyaya atanmaz."""
    payload = base_payload(
        personnel=[
            make_person("P1", "Ekip Üyesi"),
            make_person("P2", "Serbest"),
        ],
        availability={"P1": FULL_WEEK_AVAILABLE, "P2": FULL_WEEK_AVAILABLE},
        crew_rotation={"crew-a": "morning"},
        personnel_crews={"P1": "crew-a"},
        crew_same_shift_hard=True,
    )
    result = run_engine(payload)
    assert "error" not in result, result

    p1_assignments = [a for a in result["assignments"] if a["personnelId"] == "P1"]
    assert all(a["shiftId"] == 0 for a in p1_assignments), (
        f"Ekip üyesi (P1) rotasyon dışı vardiyaya atanmış: {p1_assignments}"
    )


def test_required_skills_infeasible_gives_clear_diagnosis():
    """Vardiya için zorunlu yetkinlik talep edilmiş ama kimsede o yetkinlik
    yoksa ve demand_matrix o hücreyi zorunlu kılıyorsa motor INFEASIBLE olur
    ve diagnose_infeasibility Türkçe, somut bir mesaj üretir."""
    payload = base_payload(
        personnel=[
            make_person("P1", "Ayşe", skills=["Kasa"]),
            make_person("P2", "Burak", skills=["Kasa"]),
        ],
        availability={"P1": FULL_WEEK_AVAILABLE, "P2": FULL_WEEK_AVAILABLE},
        shifts=[
            {
                "id": "morning", "name": "Sabah", "start": "08:00", "end": "16:00",
                "base_points": 3,
                "required_skills": [{"skill": "bakımcı", "count": 1}],
            },
        ],
        demand_matrix={"morning": {"0": 1}},
    )
    result = run_engine(payload)
    assert "error" in result, f"INFEASIBLE bekleniyordu ama motor plan üretti: {result}"
    assert "bakımcı" in result["error"]


def test_demand_exceeding_total_personnel_gives_clear_diagnosis():
    """Talep, toplam personel sayısından fazlaysa (matematiksel olarak
    imkansız) motor INFEASIBLE olur ve mesajda ilgili gün + sayılar geçer."""
    payload = base_payload(
        personnel=[
            make_person("P1", "Ayşe"),
            make_person("P2", "Burak"),
        ],
        availability={"P1": FULL_WEEK_AVAILABLE, "P2": FULL_WEEK_AVAILABLE},
        demand_matrix={"morning": {"0": 5}, "evening": {"0": 5}},
    )
    result = run_engine(payload)
    assert "error" in result, f"INFEASIBLE bekleniyordu ama motor plan üretti: {result}"
    assert "Pazartesi" in result["error"]


def test_no_personnel_returns_friendly_error():
    """Şubede hiç personel yoksa motor exception atmaz, anlamlı bir hata döner."""
    payload = base_payload(personnel=[], availability={})
    result = run_engine(payload)
    assert "error" in result
    assert "personel bulunamadı" in result["error"]
