"""Adalet Puanı planlama yaklaşımı (web lib/fairness ile aynı, 2026-10-10):
puan = saat × (1 + zorluk% + gün% + tercih etmem%); gün eki günün ve vardiyaya özel günün en yükseği,
tercih etmem kişiye özel olduğu için ayrıca eklenir."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import optishift_engine as eng  # noqa: E402


def test_percent_points_day_and_pref_not_add_up(monkeypatch):
    monkeypatch.setattr(eng, "SHIFTS", [{"id": "s", "name": "S", "start": "08:00", "end": "16:00", "difficulty_pct": 0}])
    monkeypatch.setattr(eng, "NUM_SHIFTS", 1)
    monkeypatch.setattr(eng, "AVAILABILITY", {"p1": {"4": "preferred_not", "6": "preferred_not"}})
    monkeypatch.setattr(eng, "RULES", {**eng.RULES, "day_extra_pct": [0, 0, 0, 0, 25, 50, 100], "pref_not_pct": 50})
    assert eng.effective_points("p1", 0, 0) == 8         # sadece saat
    assert eng.effective_points("p2", 4, 0) == 10        # cuma %25
    assert eng.effective_points("p1", 4, 0) == 14        # cuma %25 + tercih etmem %50
    assert eng.effective_points("p1", 6, 0) == 20        # pazar %100 + tercih etmem %50
    assert eng._max_hard_points() == 12                  # 8 saat × (%100 + %50)


def test_difficulty_pct_and_legacy_base_points(monkeypatch):
    monkeypatch.setattr(eng, "SHIFTS", [
        {"id": "g", "name": "Gece", "start": "22:00", "end": "06:00", "difficulty_pct": 50},
        {"id": "z", "name": "Eski zor", "start": "08:00", "end": "16:00", "base_points": 8},
        {"id": "k", "name": "Eski kolay", "start": "08:00", "end": "16:00", "base_points": 3},
    ])
    monkeypatch.setattr(eng, "NUM_SHIFTS", 3)
    monkeypatch.setattr(eng, "AVAILABILITY", {})
    monkeypatch.setattr(eng, "RULES", {**eng.RULES, "day_extra_pct": [0] * 7, "pref_not_pct": 50})
    assert eng.effective_points("p", 0, 0) == 12         # 8 × 1,5
    assert eng.effective_points("p", 0, 1) == 12         # eski 8 → zor %50
    assert eng.effective_points("p", 0, 2) == 8          # eski 3 → sıradan


def test_shift_specific_special_day(monkeypatch):
    monkeypatch.setattr(eng, "SHIFTS", [
        {"id": "a", "name": "Akşam", "start": "16:00", "end": "00:00", "difficulty_pct": 0},
        {"id": "s", "name": "Sabah", "start": "08:00", "end": "16:00", "difficulty_pct": 0},
    ])
    monkeypatch.setattr(eng, "NUM_SHIFTS", 2)
    monkeypatch.setattr(eng, "AVAILABILITY", {})
    monkeypatch.setattr(eng, "RULES", {**eng.RULES, "day_extra_pct": [0] * 7, "shift_day_extra_pct": {"a": [0, 0, 0, 0, 0, 100, 0]}, "pref_not_pct": 0})
    assert eng.effective_points("p", 5, 0) == 16
    assert eng.effective_points("p", 5, 1) == 8
