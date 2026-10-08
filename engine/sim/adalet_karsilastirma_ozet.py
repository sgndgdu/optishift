import json, sys
sys.argv=["x"]
exec(open(__file__.replace("_ozet","")).read().split('if __name__')[0])
raw = json.load(open("raw.json"))
names = dict(PEOPLE)
summary = {}
for mode, weeks in raw.items():
    cum = {p:0.0 for p in names}; st = {p:{"hs":0,"kap":0,"pref":0,"hours":0,"shifts":0} for p in names}
    hist = []; gaps = []; empty = 0
    for w, res in enumerate(weeks):
        av = avail(w)
        filled = {}
        for a in res["assignments"]:
            if a.get("kind","regular")!="regular": continue
            p, d, s = a["personnelId"], a["day"], SHIFTS[a["shiftId"]]["id"]
            pr = av[p][str(d)]=="preferred_not"
            cum[p] += pts(d,s) + (max(0, PREF_NOT-DAY_EXTRA[d]) if pr else 0)
            st[p]["shifts"]+=1; st[p]["hours"]+=8
            if d>=5: st[p]["hs"]+=1
            if s=="kapanis": st[p]["kap"]+=1
            if pr: st[p]["pref"]+=1
            filled[(d,s)] = filled.get((d,s),0)+1
        empty += sum(max(0, DEMAND[s][str(d)]-filled.get((d,s),0)) for s in DEMAND for d in range(7))
        hist.append({p: round(v,1) for p,v in cum.items()})
        gaps.append(round(max(cum.values())-min(cum.values()),1))
    summary[mode] = {"final": hist[-1], "stats": st, "gaps": gaps, "hist": hist, "empty": empty}
    print(f"\n=== {mode} === boş kalan vardiya: {empty}")
    for p in sorted(names, key=lambda x:-cum[x]):
        s=st[p]; print(f"{names[p]:6} puan {cum[p]:6.1f}  vardiya {s['shifts']:2}  hafta sonu {s['hs']:2}  kapanış {s['kap']:2}  tercih etmem {s['pref']}")
    print("haftalık puan farkı (en yüksek - en düşük):", gaps)
json.dump(summary, open("summary.json","w"), ensure_ascii=False)
