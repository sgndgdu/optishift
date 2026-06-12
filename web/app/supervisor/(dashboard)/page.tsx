"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2, Users, CalendarClock, ChevronRight,
  Plus, MapPin, Layers, AlertCircle, Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type Location = {
  id: string;
  name: string;
  dept_count: number;
  personnel_count: number;
  publish_lead: number | null; // programın hafta başından ort. kaç gün önce yayınlandığı
};

export default function SupervisorDashboard() {
  const router = useRouter();
  const [user, setUser]         = useState<any>(null);
  const [mounted, setMounted]   = useState(false);
  const [org, setOrg]           = useState<any>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading]   = useState(true);

  // ── Auth ────────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem("optishift_supervisor_user");
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed) setUser(parsed);
    } catch {}
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!user) { router.push("/login"); return; }
    if (user.role !== "supervisor" && user.role !== "admin") { router.push("/login"); return; }
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, user]);

  // ── Veri yükleme ────────────────────────────────────────────────────────
  const loadData = async () => {
    if (!user?.org_id) return;
    setLoading(true);
    try {
      // Organizasyon bilgisi
      const orgRes = await fetch(`/api/admin/organizations?id=${user.org_id}`);
      const orgData = await orgRes.json();
      if (Array.isArray(orgData) && orgData[0]) setOrg(orgData[0]);

      // Şubeler
      const locRes = await fetch(`/api/locations?org_id=${user.org_id}`);
      const locs: any[] = await locRes.json();
      if (!Array.isArray(locs)) { setLoading(false); return; }

      // Her şube için departman + personel sayısını paralel çek
      const enriched = await Promise.all(
        locs.map(async (loc) => {
          const [depts, pers, pubStats] = await Promise.all([
            fetch(`/api/departments?location_id=${loc.id}`).then(r => r.json()).catch(() => []),
            fetch(`/api/personnel?location_id=${loc.id}`).then(r => r.json()).catch(() => []),
            fetch(`/api/schedule/publish-stats?location_id=${loc.id}`).then(r => r.json()).catch(() => null),
          ]);
          return {
            id: loc.id,
            name: loc.name,
            dept_count: Array.isArray(depts) ? depts.length : 0,
            personnel_count: Array.isArray(pers) ? pers.filter((p: any) => p.status === "active").length : 0,
            publish_lead: typeof pubStats?.avg_lead_days === "number" ? pubStats.avg_lead_days : null,
          };
        })
      );
      setLocations(enriched);
    } catch {}
    setLoading(false);
  };

  if (!mounted) return <div className="space-y-8" />;

  const totalDepts      = locations.reduce((s, l) => s + l.dept_count, 0);
  const totalPersonnel  = locations.reduce((s, l) => s + l.personnel_count, 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* Başlık */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {org?.name ?? "Genel Bakış"}
          </h1>
          <p className="text-slate-500 mt-1 text-sm sm:text-base">
            Hoş geldiniz, <strong>{user?.name}</strong>. Tüm şubelerinizin özeti aşağıda.
          </p>
        </div>
        <Link href="/supervisor/settings" className="shrink-0">
          <Button variant="outline" className="gap-2 w-full sm:w-auto">
            <Plus size={16} />
            Şube Ekle
          </Button>
        </Link>
      </div>

      {/* Özet sayılar */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: "Şube",       value: locations.length, icon: Building2, color: "text-violet-600", bg: "bg-violet-100" },
          { label: "Departman",  value: totalDepts,        icon: Layers,    color: "text-indigo-600", bg: "bg-indigo-100" },
          { label: "Personel",   value: totalPersonnel,    icon: Users,     color: "text-emerald-600", bg: "bg-emerald-100" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="border-0 shadow-sm">
            <CardContent className="p-3 sm:p-5 flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-4">
              <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
                <Icon size={18} className={color} />
              </div>
              <div className="text-center sm:text-left">
                <div className={`text-xl sm:text-2xl font-black ${loading ? "text-slate-300" : color}`}>
                  {loading ? "—" : value}
                </div>
                <div className="text-xs sm:text-sm font-semibold text-slate-500">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Şube kartları */}
      <div>
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Şubeler</h2>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-40 bg-slate-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : locations.length === 0 ? (
          <Card className="border-dashed border-2 border-slate-200">
            <CardContent className="py-16 text-center">
              <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Zap size={28} className="text-violet-400" />
              </div>
              <p className="font-bold text-slate-600 mb-1">Henüz şube eklenmedi</p>
              <p className="text-sm text-slate-400 mb-5">
                Onboarding'i tamamladıysanız şubeleriniz burada görünecek.<br />
                Yoksa Ayarlar sayfasından ekleyebilirsiniz.
              </p>
              <Link href="/supervisor/settings">
                <Button className="gap-2">
                  <Plus size={15} /> Şube Ekle
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {locations.map(loc => (
              <Card key={loc.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-6 space-y-4">
                  {/* Üst satır */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
                        <MapPin size={18} className="text-violet-600" />
                      </div>
                      <div>
                        <p className="font-black text-slate-800 text-base">{loc.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {loc.dept_count} departman · {loc.personnel_count} aktif personel
                        </p>
                      </div>
                    </div>
                    {loc.dept_count === 0 && (
                      <div className="flex items-center gap-1 text-[11px] text-amber-500 font-bold bg-amber-50 px-2 py-1 rounded-lg">
                        <AlertCircle size={11} />
                        Departman yok
                      </div>
                    )}
                  </div>

                  {/* Sayaçlar */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 rounded-xl p-3 text-center">
                      <p className="text-lg font-black text-indigo-600">{loc.dept_count}</p>
                      <p className="text-[11px] font-semibold text-slate-500">Departman</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 text-center">
                      <p className="text-lg font-black text-emerald-600">{loc.personnel_count}</p>
                      <p className="text-[11px] font-semibold text-slate-500">Personel</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 text-center">
                      <p className={`text-lg font-black ${
                        loc.publish_lead === null ? "text-slate-300"
                        : loc.publish_lead >= 7 ? "text-emerald-600"
                        : loc.publish_lead >= 3 ? "text-amber-600"
                        : "text-red-600"
                      }`}>
                        {loc.publish_lead === null ? "—" : `${loc.publish_lead.toLocaleString("tr-TR")}g`}
                      </p>
                      <p className="text-[11px] font-semibold text-slate-500">Yayın Öncülüğü</p>
                    </div>
                  </div>

                  {/* Aksiyonlar */}
                  <div className="flex gap-2 pt-1">
                    <Link href={`/supervisor/schedule?location_id=${loc.id}`} className="flex-1">
                      <button className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-xl transition-colors">
                        <CalendarClock size={13} />
                        Vardiya Planı
                      </button>
                    </Link>
                    <Link href={`/supervisor/personnel?location_id=${loc.id}`} className="flex-1">
                      <button className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
                        <Users size={13} />
                        Personel
                        <ChevronRight size={12} />
                      </button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
