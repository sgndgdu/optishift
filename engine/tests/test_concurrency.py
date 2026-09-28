"""Eşzamanlı /generate çağrıları birbirinin verisini karıştırmamalı (canlıda iki işletme aynı anda)."""
import os
import sys
import threading

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import main  # noqa: E402
from conftest import make_person, base_payload  # noqa: E402

AVAIL = {str(d): "available" for d in range(7)}


def _payload(prefix: str, n: int):
    people = [make_person(f"{prefix}{i}", f"{prefix} {i}") for i in range(n)]
    return base_payload(personnel=people, availability={p["id"]: AVAIL for p in people})


def test_parallel_generate_requests_do_not_mix():
    results: dict = {}
    errors: list = []

    def run(key, payload):
        try:
            results[key] = main.generate(main.GenerateRequest(**payload))
        except Exception as e:  # noqa: BLE001
            errors.append(e)

    threads = [threading.Thread(target=run, args=(k, _payload(k, n))) for k, n in (("A", 3), ("B", 4), ("C", 5))]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors, errors
    for key in ("A", "B", "C"):
        ids = {a["personnelId"] for a in results[key]["assignments"]}
        assert ids and all(i.startswith(key) for i in ids), (key, ids)
