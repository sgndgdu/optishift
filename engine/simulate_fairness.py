"""
optishift_engine.py motorunu dışarıdan (subprocess ile) çağırarak 12 haftalık
adalet puanı birikimini simüle eder.

Neden subprocess (main.py'nin yaptığı in-process import DEĞİL): motor,
api_mode() çağrıları arasında bazı globalleri tam sıfırlamıyor (RULES.update()
birleştirir, ZONE_DEMAND_PER_DAY mevcut global üzerinden daraltılır — bkz.
tests/conftest.py). 12 haftayı art arda aynı process'te çağırmak state
sızıntısına yol açar; her hafta ayrı bir alt süreçte --api modunda çalıştırmak
production'daki gerçek invocation'ı birebir taklit eder ve haftalar arası
sızıntı riskini ortadan kaldırır.

prev_score zinciri: motorun döndürdüğü "scores" alanı ZATEN kümülatif puandır
(build_model L536: total == prev_score + bu_haftaki_puan). Yani bir sonraki
haftanın prev_score girdisi, bu haftanın "scores" çıktısıdır — ayrıca toplama
yapmaya gerek yok.

Kullanım: python3 simulate_fairness.py [--seed 42] [--weeks 12] [--people 10]
"""
import argparse
import json
import random
import statistics
import subprocess
import sys
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent
ENGINE_SCRIPT = ENGINE_DIR / "optishift_engine.py"

FICTIONAL_NAMES = [
    "Ayşe Kaya", "Burak Demir", "Cem Yıldız", "Deniz Şahin", "Elif Çelik",
    "Fatih Aydın", "Gizem Arslan", "Hakan Doğan", "İrem Kılıç", "Jale Öztürk",
]

SHIFTS = [
    {"id": "sabah", "name": "Sabah", "start": "08:00", "end": "16:00", "base_points": 3, "is_night": False},
    {"id": "aksam", "name": "Akşam", "start": "16:00", "end": "24:00", "base_points": 5, "is_night": False},
    {"id": "gece",  "name": "Gece",  "start": "00:00", "end": "08:00", "base_points": 7, "is_night": True},
]

AVAILABILITY_WEIGHTS = [("available", 0.80), ("preferred_not", 0.13), ("unavailable", 0.07)]


def run_engine(payload: dict, timeout: int = 60) -> dict:
    """Payload'ı motora --api modunda stdin üzerinden gönderir, JSON sonucu döner.
    (tests/conftest.py:run_engine ile aynı çağrı deseni — gerçek production
    invocation'ını taklit eder.)"""
    proc = subprocess.run(
        [sys.executable, str(ENGINE_SCRIPT), "--api"],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        cwd=str(ENGINE_DIR),
        timeout=timeout,
    )
    if proc.returncode != 0:
        return {"error": f"Motor çöktü (returncode={proc.returncode}): {proc.stderr.strip()[-500:]}"}
    stdout = proc.stdout.strip()
    if not stdout:
        return {"error": f"Motor boş çıktı döndürdü. stderr: {proc.stderr.strip()[-500:]}"}
    return json.loads(stdout)


def make_personnel(num_people: int, rng: random.Random) -> list:
    personnel = []
    for i in range(num_people):
        pid = f"P{i + 1}"
        name = FICTIONAL_NAMES[i % len(FICTIONAL_NAMES)]
        employment_type = "part_time" if rng.random() < 0.2 else "full_time"
        personnel.append({
            "id": pid,
            "name": name,
            "skills": [],
            "prev_score": 0,
            "employment_type": employment_type,
        })
    return personnel


def random_availability(personnel: list, rng: random.Random) -> dict:
    availability = {}
    for person in personnel:
        day_status = {}
        for day in range(7):
            r = rng.random()
            cum = 0.0
            status = "available"
            for status_name, weight in AVAILABILITY_WEIGHTS:
                cum += weight
                if r <= cum:
                    status = status_name
                    break
            day_status[str(day)] = status
        availability[person["id"]] = day_status
    return availability


def random_demand_matrix(num_people: int, rng: random.Random) -> dict:
    """Her (vardiya, gün) hücresi için rastgele tam kapasite ihtiyacı üretir.
    Kişi sayısına göre üst sınır tutularak INFEASIBLE riski düşük tutulur
    (bir kişi günde yalnızca bir vardiyaya atanabildiği için gün başına
    3 vardiyanın toplam talebi kişi sayısının belirgin altında tutulur)."""
    max_per_cell = max(1, min(4, num_people // 3))
    matrix = {}
    for shift in SHIFTS:
        matrix[shift["id"]] = {str(day): rng.randint(1, max_per_cell) for day in range(7)}
    return matrix


def print_week_scores(week: int, personnel: list, cumulative: dict) -> None:
    print(f"\n── {week}. hafta sonu kümülatif adalet puanları " + "─" * 40)
    ranked = sorted(personnel, key=lambda p: cumulative.get(p["id"], 0), reverse=True)
    for p in ranked:
        print(f"  {p['name']:<16} ({p['id']}): {cumulative.get(p['id'], 0):>5}")


def print_convergence_summary(personnel: list, history: list, final_cumulative: dict) -> None:
    print("\n" + "=" * 70)
    print("  12 HAFTA SONU YAKINSAMA ÖZETİ")
    print("=" * 70)

    final_scores = [final_cumulative.get(p["id"], 0) for p in personnel]
    mean = statistics.mean(final_scores)
    variance = statistics.pvariance(final_scores)
    stdev = statistics.pstdev(final_scores)
    spread = max(final_scores) - min(final_scores)

    print(f"\nSon hafta puanları (ortalamaya göre sıralı):")
    ranked = sorted(personnel, key=lambda p: final_cumulative.get(p["id"], 0), reverse=True)
    for p in ranked:
        score = final_cumulative.get(p["id"], 0)
        delta = score - mean
        bar = "█" * int(abs(delta) / max(1, spread) * 30) if spread else ""
        sign = "+" if delta >= 0 else "-"
        print(f"  {p['name']:<16} {score:>5}  (ort. fark {sign}{abs(delta):>5.1f})  {bar}")

    print(f"\nOrtalama       : {mean:.2f}")
    print(f"Varyans        : {variance:.2f}")
    print(f"Std. sapma     : {stdev:.2f}")
    print(f"Min-Max aralık : {min(final_scores)} - {max(final_scores)} (fark: {spread})")

    print("\nHaftalık yakınsama seyri (varyans ve puan aralığı, hafta bazında):")
    print(f"  {'Hafta':<6}{'Varyans':>10}{'Aralık':>10}")
    for week_idx, snapshot in enumerate(history, start=1):
        scores = [snapshot.get(p["id"], 0) for p in personnel]
        week_var = statistics.pvariance(scores) if len(scores) > 1 else 0.0
        week_spread = max(scores) - min(scores)
        print(f"  {week_idx:<6}{week_var:>10.1f}{week_spread:>10}")

    first_week_scores = [history[0].get(p["id"], 0) for p in personnel] if history else final_scores
    first_spread = max(first_week_scores) - min(first_week_scores)
    if spread < first_spread:
        print(f"\nSonuç: puanlar zamanla yakınsadı (1. hafta aralığı {first_spread} → son hafta aralığı {spread}).")
    elif spread > first_spread:
        print(f"\nSonuç: puanlar zamanla ıraksadı (1. hafta aralığı {first_spread} → son hafta aralığı {spread}).")
    else:
        print(f"\nSonuç: aralık değişmedi ({spread}).")

    try_plot(personnel, history)


def try_plot(personnel: list, history: list) -> None:
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("\n(matplotlib kurulu değil — grafik atlandı, yukarıdaki konsol çıktısı yakınsamayı gösteriyor.")
        print(" Kurmak için: pip3 install matplotlib)")
        return

    weeks = list(range(1, len(history) + 1))
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 5))

    for p in personnel:
        scores = [snapshot.get(p["id"], 0) for snapshot in history]
        ax1.plot(weeks, scores, marker="o", label=p["name"], linewidth=1.5)
    ax1.set_title("Kişi başı kümülatif adalet puanı")
    ax1.set_xlabel("Hafta")
    ax1.set_ylabel("Kümülatif puan")
    ax1.legend(fontsize=7, loc="upper left")
    ax1.grid(alpha=0.3)

    variances = [
        statistics.pvariance([snapshot.get(p["id"], 0) for p in personnel])
        for snapshot in history
    ]
    ax2.plot(weeks, variances, marker="o", color="crimson")
    ax2.set_title("Haftalık varyans (yakınsama seyri)")
    ax2.set_xlabel("Hafta")
    ax2.set_ylabel("Varyans")
    ax2.grid(alpha=0.3)

    fig.tight_layout()
    out_path = ENGINE_DIR / "fairness_simulation_result.png"
    fig.savefig(out_path, dpi=130)
    print(f"\nGrafik kaydedildi: {out_path}")


def main():
    parser = argparse.ArgumentParser(description="OptiShift motoru 12 haftalık adalet simülasyonu")
    parser.add_argument("--seed", type=int, default=42, help="Rastgelelik tohumu (tekrarlanabilirlik için)")
    parser.add_argument("--weeks", type=int, default=12, help="Simüle edilecek hafta sayısı")
    parser.add_argument("--people", type=int, default=10, help="Hayali personel sayısı")
    args = parser.parse_args()

    rng = random.Random(args.seed)
    personnel = make_personnel(args.people, rng)
    cumulative = {p["id"]: 0 for p in personnel}
    history = []

    print(f"OptiShift adalet simülasyonu: {args.people} kişi, {args.weeks} hafta (seed={args.seed})")
    print(f"Motor: {ENGINE_SCRIPT}")

    for week in range(1, args.weeks + 1):
        week_personnel = [
            {**p, "prev_score": cumulative[p["id"]]}
            for p in personnel
        ]
        payload = {
            "personnel": week_personnel,
            "availability": random_availability(personnel, rng),
            "shifts": SHIFTS,
            "rules": {"max_weekly_hours": 45, "min_rest_hours": 11},
            "demand_matrix": random_demand_matrix(args.people, rng),
            "branchId": "SIM-001",
            "week_start": f"2026-W{week:02d}",
        }

        result = run_engine(payload)

        if "error" in result:
            print(f"\n[{week}. hafta] Motor hata döndürdü, bu haftanın puanları önceki haftayla aynı kalıyor: {result['error']}")
            history.append(dict(cumulative))
            continue

        cumulative = {pid: int(score) for pid, score in result.get("scores", {}).items()}
        history.append(dict(cumulative))
        print_week_scores(week, personnel, cumulative)

    print_convergence_summary(personnel, history, cumulative)


if __name__ == "__main__":
    main()
