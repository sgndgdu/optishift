"""
Motor senaryo testleri için ortak yardımcılar.

Motor modülü (optishift_engine.py) api_mode() çağrıları arasında bazı global
değişkenleri tam sıfırlamaz (RULES.update() birleştirir, ZONE_DEMAND_PER_DAY
mevcut global üzerinden daraltılır). Bu yüzden her senaryoyu ayrı bir alt
süreçte (subprocess) çalıştırıyoruz — production'daki gerçek invocation'ı
(main.py: stdin JSON → api_mode → stdout JSON) birebir taklit eder ve
testler arası state sızıntısı riskini tamamen ortadan kaldırır.
"""
import json
import subprocess
import sys
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent.parent
ENGINE_SCRIPT = ENGINE_DIR / "optishift_engine.py"


def run_engine(payload: dict, timeout: int = 60) -> dict:
    """Payload'ı motora --api modunda stdin üzerinden gönderir, JSON sonucu döner."""
    proc = subprocess.run(
        [sys.executable, str(ENGINE_SCRIPT), "--api"],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        cwd=str(ENGINE_DIR),
        timeout=timeout,
    )
    assert proc.returncode == 0, f"Engine crashed: {proc.stderr}"
    stdout = proc.stdout.strip()
    assert stdout, f"Engine boş çıktı döndürdü. stderr: {proc.stderr}"
    return json.loads(stdout)


def make_person(pid: str, name: str, skills=None, **overrides) -> dict:
    person = {
        "id": pid,
        "name": name,
        "skills": skills or [],
        "prev_score": 0,
        "employment_type": "full_time",
        "max_weekly_hours": 45,
    }
    person.update(overrides)
    return person


def base_payload(**overrides) -> dict:
    payload = {
        "personnel": [],
        "availability": {},
        "shifts": [
            {"id": "morning", "name": "Sabah", "start": "08:00", "end": "16:00", "base_points": 3},
            {"id": "evening", "name": "Akşam", "start": "16:00", "end": "24:00", "base_points": 5},
        ],
        "rules": {"max_weekly_hours": 45, "min_rest_hours": 11},
        "zone_quotas": {},
        "branchId": "L-TEST",
    }
    payload.update(overrides)
    return payload
