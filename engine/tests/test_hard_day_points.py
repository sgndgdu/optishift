"""Zor gün puanı: web'in gönderdiği günlük puanlar (day_extra_points) ve tercih etmem puanı.
Birden fazlası geçerliyse en yükseği yazılır."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import optishift_engine as eng  # noqa: E402


def test_day_extra_points_max_of_day_and_pref_not(monkeypatch):
    monkeypatch.setattr(eng, "SHIFTS", [{"name": "S", "start": "08:00", "end": "16:00", "base_points": 5}])
    monkeypatch.setattr(eng, "AVAILABILITY", {"p1": {"4": "preferred_not", "6": "preferred_not"}})
    monkeypatch.setattr(eng, "RULES", {**eng.RULES, "day_extra_points": [0, 0, 0, 0, 3, 4, 8], "pref_not_points": 5})
    assert eng.effective_points("p1", 0, 0) == 8        # sadece taban
    assert eng.effective_points("p2", 4, 0) == 8 + 3    # cuma
    assert eng.effective_points("p1", 4, 0) == 8 + 5    # cuma ama tercih etmem daha yüksek
    assert eng.effective_points("p1", 6, 0) == 8 + 8    # pazar 8 > tercih etmem 5, toplanmaz
    assert eng._max_hard_points() == 8
