# Adalet motoru açık / kapalı karşılaştırması (2026-10-08). Aynı kafe, 6 kişi, 8 hafta.
# Çalıştır: ../.venv/bin/python adalet_karsilastirma.py && python3 adalet_karsilastirma_ozet.py

import json, random, subprocess, sys
ENG = "/Users/sefagundogdu/Desktop/OptiShift/engine"
PY = ENG + "/.venv/bin/python"
PEOPLE = [("P1","Ayşe"),("P2","Burak"),("P3","Cem"),("P4","Deniz"),("P5","Elif"),("P6","Fatih")]
SHIFTS = [
  {"id":"acilis","name":"Açılış","start":"07:00","end":"15:00","base_points":4,"is_night":False},
  {"id":"kapanis","name":"Kapanış","start":"15:00","end":"23:00","base_points":6,"is_night":False},
]
DEMAND = {"acilis":{str(d):2 for d in range(7)}, "kapanis":{**{str(d):2 for d in range(5)},"5":3,"6":3}}
DAY_EXTRA = [0,0,0,0,0,4,4]
PREF_NOT = 4
WEEKS = 8

def avail(week):
    rng = random.Random(1000+week)
    a = {pid:{str(d):"available" for d in range(7)} for pid,_ in PEOPLE}
    a["P5"]["6"] = "unavailable"        # Elif Pazar çalışamaz (sabit)
    a["P3"]["5"] = "preferred_not"      # Cem Cumartesi tercih etmez
    a["P2"]["4"] = "preferred_not"      # Burak Cuma tercih etmez
    pid = rng.choice(PEOPLE)[0]; a[pid][str(rng.randint(0,4))] = "unavailable"  # haftalık bir izin günü
    return a

def pts(day, sid):
    sh = SHIFTS[[s["id"] for s in SHIFTS].index(sid)]
    return 8*sh["base_points"]/5 + DAY_EXTRA[day]

def run(mode):
    cum = {pid:0.0 for pid,_ in PEOPLE}
    stats = {pid:{"hs":0,"kap":0,"pref":0,"hours":0} for pid,_ in PEOPLE}
    weekly = []
    for w in range(WEEKS):
        av = avail(w)
        payload = {
          "personnel":[{"id":pid,"name":n,"skills":[],"employment_type":"full_time","max_weekly_hours":45,
                        "prev_score": int(round(cum[pid])) if mode=="adil" else 0} for pid,n in PEOPLE],
          "availability": av, "shifts": SHIFTS, "demand_matrix": DEMAND,
          "rules":{"max_weekly_hours":45,"min_rest_hours":11,"day_extra_points":DAY_EXTRA,"pref_not_points":PREF_NOT,
                   "fairness_weight": 100 if mode=="adil" else 0},
          "branchId":"SIM","week_start":f"2026-{11+w//4:02d}-{1+7*(w%4):02d}",
        }
        r = subprocess.run([PY, ENG+"/optishift_engine.py","--api"], input=json.dumps(payload), capture_output=True, text=True, cwd=ENG, timeout=120)
        res = json.loads(r.stdout)
        if w==0 and mode=="adil": json.dump(res, open("sample.json","w"), ensure_ascii=False, indent=1)
        weekly.append(res)
        for a in res["assignments"]:
            if a.get("kind","regular")!="regular": continue
            d=a["day"]; sid=SHIFTS[a["shiftId"]]["id"]
            pr = av[a["personnelId"]][str(d)]=="preferred_not"
            cum[a["personnelId"]] += pts(d,sid) + (max(0, PREF_NOT-DAY_EXTRA[d]) if pr else 0)
    return weekly

if __name__=="__main__":
    out = {m: run(m) for m in ("adil","adaletsiz")}
    json.dump(out, open("raw.json","w"), ensure_ascii=False)
