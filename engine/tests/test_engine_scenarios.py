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
    # dept-b'nin (P3) kendi talebi yok — coverage-max ile bağımsız olarak aynı
    # gün/vardiyaya düşebilir, bu departman izolasyonunu ihlal etmez. Asıl test
    # edilen şey: dept-a talebi (demand=1) tam olarak dept-a alt kümesinden
    # (P1 veya P2) karşılanır, ne fazla ne eksik.
    dept_a_assigned = [a for a in monday_morning if a["personnelId"] in ("P1", "P2")]
    assert len(dept_a_assigned) == 1, (
        f"dept-a talebi (demand=1) tam karşılanmalıydı: {monday_morning}"
    )


def test_multi_department_person_counts_once():
    """Birden çok departmanı olan kişi (department_ids) iki departmanın ihtiyacını da karşılayabilir ama
    bir vardiyası sadece BİR departmana sayılır ve çıktıda o departman yazılır."""
    payload = base_payload(
        personnel=[
            make_person("P1", "Ayşe", department_id="dept-a"),
            make_person("P2", "Burak", department_id="dept-b"),
            make_person("P3", "Joker", department_id="dept-a", department_ids=["dept-a", "dept-b"]),
        ],
        availability={pid: FULL_WEEK_AVAILABLE for pid in ("P1", "P2", "P3")},
        # Pazartesi sabah: A'ya 1, B'ye 2 kişi. B'nin tek üyesi var, ikincisi joker olmalı.
        department_demand_matrix={"dept-a": {"morning": {"0": 1}}, "dept-b": {"morning": {"0": 2}}},
    )
    result = run_engine(payload)
    assert "error" not in result, result
    mon = [a for a in result["assignments"] if a["day"] == 0 and a["shiftId"] == 0]
    ids = {a["personnelId"] for a in mon}
    assert ids == {"P1", "P2", "P3"}, mon
    joker = next(a for a in mon if a["personnelId"] == "P3")
    assert joker.get("department_id") == "dept-b", joker


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
        # Talep 6 gün: tek uygun kişinin 7 gün çalışması hafta tatili (m.46) nedeniyle yasak
        demand_matrix={"night": {str(d): 1 for d in range(6)}},
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
    # Tek uygun kişi P2 olduğu için talep edilen 6 gecenin hepsi P2'ye düşmeli
    assert len(night_assignments) == 6
    assert all(a["personnelId"] == "P2" for a in night_assignments)


def test_conflict_pair_never_assigned_same_shift():
    """Sosyal kurallar: personnel_conflicts'teki bir çift (P1, P2) hiçbir gün/vardiyada
    birlikte atanmaz — hard constraint. Üçüncü kişi (P3) varsa kapsama yine de dolar."""
    payload = base_payload(
        personnel=[
            make_person("P1", "Ayşe", max_weekly_hours=60),
            make_person("P2", "Burak", max_weekly_hours=60),
            make_person("P3", "Cem", max_weekly_hours=60),
        ],
        availability={
            "P1": FULL_WEEK_AVAILABLE, "P2": FULL_WEEK_AVAILABLE, "P3": FULL_WEEK_AVAILABLE,
        },
        # Talep 6 gün: P3 çiftin arasında her gün gerekiyor, 7. gün hafta tatili (m.46)
        demand_matrix={"morning": {str(d): 2 for d in range(6)}},
        conflict_pairs=[["P1", "P2"]],
        rules={"max_weekly_hours": 60, "min_rest_hours": 11},
        max_consecutive_days=7,
    )
    result = run_engine(payload)
    assert "error" not in result, result

    morning_assignments = [a for a in result["assignments"] if a["shiftId"] == 0]
    by_day: dict[int, set[str]] = {}
    for a in morning_assignments:
        by_day.setdefault(a["day"], set()).add(a["personnelId"])

    for day, people in by_day.items():
        assert not {"P1", "P2"}.issubset(people), (
            f"Çakışan çift (P1, P2) {day} gününde aynı vardiyada atanmış: {people}"
        )
    # Kapasite (günde 2 kişi) yine de doldurulmalı — P3 devreye girer
    assert all(len(people) == 2 for people in by_day.values())


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
        # Talep 6 gün: tek uygun kişinin 7 gün çalışması hafta tatili (m.46) nedeniyle yasak
        demand_matrix={"night": {str(d): 1 for d in range(6)}},
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


CAFE_SHIFTS = [
    {"id": "acilis", "name": "Açılış", "start": "07:00", "end": "15:00", "base_points": 4},
    {"id": "yogun", "name": "Yoğun Saat", "start": "11:00", "end": "19:00", "base_points": 2},
    {"id": "kapanis", "name": "Kapanış", "start": "15:00", "end": "23:00", "base_points": 5},
]


def test_empty_demand_opens_every_shift():
    """İhtiyaç tablosu boşken motor herkesi en düşük puanlı vardiyaya yazmaz:
    açık her gün × her vardiyaya en az 1 kişi düşer (2026-09-28 denetimi, kafe)."""
    people = [make_person(f"P{i}", f"Kişi {i}") for i in range(1, 5)]
    payload = base_payload(
        personnel=people,
        availability={p["id"]: FULL_WEEK_AVAILABLE for p in people},
        shifts=CAFE_SHIFTS,
        closed_days=[6],
    )
    result = run_engine(payload)
    assert "error" not in result, result

    for d in range(6):
        for s in range(3):
            staffed = [a for a in result["assignments"] if a["day"] == d and a["shiftId"] == s]
            assert staffed, f"gün {d} vardiya {CAFE_SHIFTS[s]['name']} boş kaldı"


def test_empty_demand_closed_day_stays_empty():
    """Çalışma saatlerinde kapalı gün, talep tablosu boşken hiç kimseye yazılmaz."""
    people = [make_person(f"P{i}", f"Kişi {i}") for i in range(1, 5)]
    payload = base_payload(
        personnel=people,
        availability={p["id"]: FULL_WEEK_AVAILABLE for p in people},
        shifts=CAFE_SHIFTS,
        closed_days=[6],
    )
    result = run_engine(payload)
    assert "error" not in result, result
    assert not [a for a in result["assignments"] if a["day"] == 6]


def test_fixed_assignments_are_kept_and_rest_is_solved():
    """Müdürün elle koyduğu (korunan) hücreler aynen kalır, "gelemem" dediği gün olsa bile;
    özel saatli korunan hücrede kişi o gün başka vardiyaya yazılmaz."""
    people = [make_person(f"P{i}", f"Kişi {i}") for i in range(1, 5)]
    avail = {p["id"]: FULL_WEEK_AVAILABLE for p in people}
    avail["P1"] = {**FULL_WEEK_AVAILABLE, "2": "unavailable"}
    payload = base_payload(
        personnel=people,
        availability=avail,
        shifts=CAFE_SHIFTS,
        fixed_assignments=[
            {"personnel_id": "P1", "day": 2, "shift_id": "kapanis"},          # gelemem gününe bilerek
            {"personnel_id": "P2", "day": 0, "shift_id": "acilis"},
            {"personnel_id": "P3", "day": 4, "shift_id": "custom", "start_time": "10:00", "end_time": "14:00"},
        ],
        closed_days=[6],
    )
    result = run_engine(payload)
    assert "error" not in result, result
    got = {(a["personnelId"], a["day"]): a["shiftId"] for a in result["assignments"]}
    assert got.get(("P1", 2)) == 2
    assert got.get(("P2", 0)) == 0
    assert ("P3", 4) not in got  # özel saat motor çıktısında yok, istemci korur
    # Gerisi yine çözüldü: açık her gün × vardiya dolu (tablo boş)
    for d in range(6):
        for s in range(3):
            assert any(a["day"] == d and a["shiftId"] == s for a in result["assignments"]), (d, s)


def test_weekly_rest_day_even_without_consecutive_limit():
    """İş K. m.46: "üst üste gün" sınırı kapalı (7) olsa da kimse 7 gün yazılmaz."""
    people = [make_person(f"P{i}", f"Kişi {i}") for i in range(1, 3)]
    payload = base_payload(
        personnel=people,
        availability={p["id"]: FULL_WEEK_AVAILABLE for p in people},
        max_consecutive_days=7,
        rules={"max_weekly_hours": 80, "min_rest_hours": 11},
    )
    result = run_engine(payload)
    assert "error" not in result, result
    for p in people:
        days = {a["day"] for a in result["assignments"] if a["personnelId"] == p["id"]}
        assert len(days) <= 6, (p["id"], sorted(days))


HOSPITAL_SHIFTS = [
    {"id": "gunduz", "name": "Gündüz", "start": "08:00", "end": "16:00", "base_points": 3},
    {"id": "aksam", "name": "Akşam", "start": "16:00", "end": "24:00", "base_points": 4},
    {"id": "icap", "name": "Gece İcabı", "start": "17:00", "end": "08:00", "base_points": 2, "on_call": True},
]


def test_on_call_same_day_as_day_shift_without_overlap():
    """İcap: aynı gün gündüz vardiyasıyla birlikte olabilir, akşam vardiyasıyla (saat çakışması) olamaz;
    her gece 1 icap talebi karşılanır, çıktıda kind=on_call."""
    people = [make_person(f"P{i}", f"Kişi {i}") for i in range(1, 5)]
    payload = base_payload(
        personnel=people,
        availability={p["id"]: FULL_WEEK_AVAILABLE for p in people},
        shifts=HOSPITAL_SHIFTS,
        demand_matrix={"gunduz": {str(d): 1 for d in range(6)}, "icap": {str(d): 1 for d in range(7)}},
    )
    result = run_engine(payload)
    assert "error" not in result, result
    on_call = [a for a in result["assignments"] if a["shiftId"] == 2]
    assert len(on_call) == 7 and all(a["kind"] == "on_call" for a in on_call)
    regular = {(a["personnelId"], a["day"]): a["shiftId"] for a in result["assignments"] if a["kind"] == "regular"}
    for a in on_call:
        assert regular.get((a["personnelId"], a["day"])) != 1, "icap akşam vardiyasıyla çakıştı"
        # Gece icabı ertesi sabah 08:00'de biter: ertesi gün gündüz (08:00) başlayabilir, çakışma yok


def test_on_call_hours_not_counted_and_weekly_cap():
    """İcap bekleme süresi haftalık saate sayılmaz (15 saatlik icap 45 saati doldurmaz);
    kişi başı haftalık icap sınırı uygulanır."""
    people = [make_person("P1", "Tek Kişi"), make_person("P2", "İkinci")]
    payload = base_payload(
        personnel=people,
        availability={p["id"]: FULL_WEEK_AVAILABLE for p in people},
        shifts=HOSPITAL_SHIFTS,
        demand_matrix={"gunduz": {str(d): 1 for d in range(5)}, "icap": {str(d): 1 for d in range(4)}},
        rules={"max_weekly_hours": 45, "min_rest_hours": 11, "max_on_call_per_week": 2},
    )
    result = run_engine(payload)
    assert "error" not in result, result
    for p in people:
        n = sum(1 for a in result["assignments"] if a["personnelId"] == p["id"] and a["kind"] == "on_call")
        assert n <= 2
    # 5 gündüz (40 s) + icaplar: icap sayılsaydı 45 saati aşardı
    assert sum(1 for a in result["assignments"] if a["kind"] == "on_call") == 4


def test_on_call_occupies_weekly_rest_day():
    """Hafta tatili günü tamamen serbest: icap da o günü doldurur (7 gün icap+vardiya yok)."""
    people = [make_person("P1", "Tek")]
    payload = base_payload(
        personnel=people,
        availability={"P1": FULL_WEEK_AVAILABLE},
        shifts=HOSPITAL_SHIFTS,
        demand_matrix={"gunduz": {str(d): 1 for d in range(5)}, "icap": {"5": 1, "6": 1}},
        rules={"max_weekly_hours": 45, "min_rest_hours": 11, "max_on_call_per_week": 3},
    )
    result = run_engine(payload)
    assert "error" in result  # 5 gündüz + 2 icap günü = 7 dolu gün: yasal değil


DRIVING_SHIFTS = [
    {"id": "uzun", "name": "Uzun Hat", "start": "05:00", "end": "17:00", "base_points": 6, "driving_hours": 9.5},
    {"id": "sehir", "name": "Şehir İçi", "start": "08:00", "end": "17:00", "base_points": 4, "driving_hours": 7},
]


def test_driving_limits_daily_extension_and_weekly():
    """AETR: 9-10 saat sürüş haftada en fazla 2 kez; haftalık 56 saat."""
    people = [make_person("P1", "Şoför", max_weekly_hours=66)]
    payload = base_payload(
        personnel=people,
        availability={"P1": FULL_WEEK_AVAILABLE},
        shifts=DRIVING_SHIFTS,
        rules={"max_weekly_hours": 66, "min_rest_hours": 11},
        demand_matrix={"uzun": {str(d): 1 for d in range(4)}},
    )
    result = run_engine(payload)
    # 4 gün Uzun Hat (9,5 s) istendi: 2'den fazlası yasak → plan bulunamaz
    assert "error" in result

    payload["demand_matrix"] = {"uzun": {"0": 1, "1": 1}, "sehir": {str(d): 1 for d in range(2, 6)}}
    result = run_engine(payload)
    assert "error" not in result, result
    driving = sum(9.5 if a["shiftId"] == 0 else 7 for a in result["assignments"])
    assert driving <= 56


def test_driving_two_week_limit_uses_previous_week():
    """İki haftalık 90 saat: geçen hafta 50 saat süren şoför bu hafta en fazla 40 saat sürer."""
    people = [make_person("P1", "Şoför", max_weekly_hours=66), make_person("P2", "Yedek", max_weekly_hours=66)]
    payload = base_payload(
        personnel=people,
        availability={p["id"]: FULL_WEEK_AVAILABLE for p in people},
        shifts=DRIVING_SHIFTS[1:],
        rules={"max_weekly_hours": 66, "min_rest_hours": 11},
        demand_matrix={"sehir": {str(d): 1 for d in range(6)}},
        prev_week_driving_hours={"P1": 50},
    )
    result = run_engine(payload)
    assert "error" not in result, result
    p1 = sum(7 for a in result["assignments"] if a["personnelId"] == "P1")
    assert p1 <= 40


def test_day_patterns_off_days_and_day_night():
    """Çalışma döngüsü: O günü vardiya yok; D sadece gündüz, N sadece gece; çalışma günü doldurulur."""
    shifts = [
        {"id": "gunduz", "name": "Gündüz", "start": "08:00", "end": "20:00", "base_points": 5},
        {"id": "gece", "name": "Gece", "start": "20:00", "end": "08:00", "base_points": 8, "is_night": True},
    ]
    people = [make_person(f"P{i}", f"Kişi {i}", max_weekly_hours=60) for i in range(1, 5)]
    patterns = {
        "P1": ["D", "N", "O", "O", "D", "N", "O"],
        "P2": ["O", "D", "N", "O", "O", "D", "N"],
        "P3": ["O", "O", "D", "N", "O", "O", "D"],
        "P4": ["N", "O", "O", "D", "N", "O", "O"],
    }
    payload = base_payload(
        personnel=people,
        availability={p["id"]: FULL_WEEK_AVAILABLE for p in people},
        shifts=shifts,
        rules={"max_weekly_hours": 60, "min_rest_hours": 11},
        max_consecutive_days=7,
        day_patterns=patterns,
    )
    result = run_engine(payload)
    assert "error" not in result, result
    got = {(a["personnelId"], a["day"]): a["shiftId"] for a in result["assignments"]}
    for pid, states in patterns.items():
        for d, st in enumerate(states):
            if st == "O":
                assert (pid, d) not in got, (pid, d)
            else:
                assert got.get((pid, d)) == (0 if st == "D" else 1), (pid, d, st, got.get((pid, d)))


def test_implicit_avoid_steers_but_does_not_block():
    """Örtük tercih: eşdeğer iki kişiden Cuma'yı istemeyen Cuma'ya yazılmaz; tek seçenekse yine yazılır."""
    people = [make_person("P1", "Cumayı sevmez"), make_person("P2", "Farketmez")]
    payload = base_payload(
        personnel=people,
        availability={p["id"]: FULL_WEEK_AVAILABLE for p in people},
        demand_matrix={"morning": {"4": 1}},
        implicit_avoid={"P1": [[4, -1, 3]]},
    )
    result = run_engine(payload)
    assert "error" not in result, result
    fri = [a["personnelId"] for a in result["assignments"] if a["day"] == 4 and a["shiftId"] == 0]
    assert fri == ["P2"], fri

    payload["personnel"] = [people[0]]
    payload["availability"] = {"P1": FULL_WEEK_AVAILABLE}
    result = run_engine(payload)
    assert "error" not in result, result
    assert any(a["day"] == 4 for a in result["assignments"])  # kesin kural değil


def test_labor_budget_prefers_cheaper_within_budget():
    """Bütçe motorda: bütçe dar iken aynı işi ucuz personel yapar; bütçe yokken adalet işi böler."""
    cheap = make_person("P1", "Ucuz")
    cheap["hourly_wage"] = 100
    pricey = make_person("P2", "Pahalı")
    pricey["hourly_wage"] = 300
    payload = base_payload(
        personnel=[cheap, pricey],
        availability={"P1": FULL_WEEK_AVAILABLE, "P2": FULL_WEEK_AVAILABLE},
        demand_matrix={"morning": {str(d): 1 for d in range(5)}},
    )
    free = run_engine(payload)
    assert "error" not in free, free
    free_pricey = sum(1 for a in free["assignments"] if a["personnelId"] == "P2")
    assert free_pricey >= 2  # bütçesizken iş bölünür

    payload["labor_budget_try"] = 4000  # 5 × 8 s × 100 ₺
    tight = run_engine(payload)
    assert "error" not in tight, tight
    tight_pricey = sum(1 for a in tight["assignments"] if a["personnelId"] == "P2")
    assert tight_pricey < free_pricey


def test_minimize_changes_keeps_existing_plan():
    """En az değişiklik: biri tüm hafta gelemeyince sadece onun vardiyaları başkasına geçer;
    mevcut planın geri kalanı aynen kalır. Bu seçenek olmadan plan baştan karışabilir."""
    people = [make_person(f"P{i}", f"Kişi {i}") for i in range(1, 7)]
    base = base_payload(
        personnel=people,
        availability={p["id"]: FULL_WEEK_AVAILABLE for p in people},
        shifts=CAFE_SHIFTS,
        demand_matrix={"acilis": {str(d): 1 for d in range(7)}, "yogun": {str(d): 1 for d in range(7)}, "kapanis": {str(d): 1 for d in range(7)}},
    )
    first = run_engine(base)
    assert "error" not in first, first
    current = [{"personnel_id": a["personnelId"], "day": a["day"], "shift_id": CAFE_SHIFTS[a["shiftId"]]["id"]} for a in first["assignments"]]
    leaver_shifts = [c for c in current if c["personnel_id"] == "P1"]
    assert leaver_shifts

    changed = dict(base)
    changed["availability"] = {**base["availability"], "P1": {str(d): "unavailable" for d in range(7)}}
    changed["current_assignments"] = current
    second = run_engine(changed)
    assert "error" not in second, second
    before = {(c["personnel_id"], c["day"], c["shift_id"]) for c in current}
    after = {(a["personnelId"], a["day"], CAFE_SHIFTS[a["shiftId"]]["id"]) for a in second["assignments"]}
    kept = before & after
    # P1 dışındaki herkesin mevcut vardiyası korunur
    assert kept == {b for b in before if b[0] != "P1"}, (before - after, after - before)


def test_availability_window_hard_on_available_day():
    """'Uygun' günde girilen saat aralığı kesin: aralığa sığmayan vardiya yazılmaz
    (P1 sadece 16:00-24:00 uygun → hiç Sabah almaz), aralığa sığan yazılabilir."""
    evening_only = {str(d): {"status": "available", "start": "16:00", "end": "24:00"} for d in range(7)}
    payload = base_payload(
        personnel=[make_person("P1", "Ayşe"), make_person("P2", "Burak"), make_person("P3", "Cem")],
        availability={"P1": evening_only, "P2": FULL_WEEK_AVAILABLE, "P3": FULL_WEEK_AVAILABLE},
        demand_matrix={"morning": {str(d): 1 for d in range(5)}, "evening": {str(d): 1 for d in range(5)}},
    )
    result = run_engine(payload)
    assert "error" not in result, result
    p1 = [a for a in result["assignments"] if a["personnelId"] == "P1"]
    assert p1, "P1 akşam vardiyalarına yazılabilmeliydi"
    assert all(a["shiftId"] == 1 for a in p1), f"P1 aralık dışına yazıldı: {p1}"


def test_availability_window_soft_on_flexible_day():
    """'Esnek' günde aralık yumuşak: başka kimse yoksa aralık dışına da yazılır."""
    flexible = {str(d): {"status": "preferred_not", "start": "16:00", "end": "24:00"} for d in range(7)}
    payload = base_payload(
        personnel=[make_person("P1", "Ayşe")],
        availability={"P1": flexible},
        demand_matrix={"morning": {"0": 1}},
    )
    result = run_engine(payload)
    assert "error" not in result, result
    assert any(a["personnelId"] == "P1" and a["day"] == 0 and a["shiftId"] == 0 for a in result["assignments"])


def test_availability_window_infeasible_is_explained():
    """Talep, aralığı uyan kişi sayısını aşarsa teşhis saat aralığını söyler."""
    evening_only = {str(d): {"status": "available", "start": "16:00", "end": "24:00"} for d in range(7)}
    payload = base_payload(
        personnel=[make_person("P1", "Ayşe"), make_person("P2", "Burak")],
        availability={"P1": evening_only, "P2": evening_only},
        demand_matrix={"morning": {"0": 1}},
    )
    result = run_engine(payload)
    assert "error" in result
    assert "saat aralığı" in result["error"] or "saatlere uygun" in result["error"], result["error"]


def test_break_not_counted_in_weekly_hours():
    """Mola çalışma süresine sayılmaz: 08:00-18:00 (10 s, yasal 1 s mola) 5 gün = 45 saat çalışma.
    Molasız tanımda (break_minutes 0) aynı plan 45 saati aşar ve tek kişiyle kurulamaz."""
    people = [make_person("P1", "Tek Kişi")]
    shifts = [{"id": "gun", "name": "Gündüz", "start": "08:00", "end": "18:00", "base_points": 3}]
    demand = {"gun": {str(d): 1 for d in range(5)}}
    avail = {"P1": FULL_WEEK_AVAILABLE}
    ok = run_engine(base_payload(personnel=people, availability=avail, shifts=shifts, demand_matrix=demand))
    assert "error" not in ok, ok  # 10 s - 1 s mola = 9 s × 5 = 45 saat: sığar
    no_break = [{**shifts[0], "break_minutes": 0}]
    bad = run_engine(base_payload(personnel=people, availability=avail, shifts=no_break, demand_matrix=demand))
    assert "error" in bad or len(bad.get("assignments", [])) < 5  # 50 saat: sığmaz
