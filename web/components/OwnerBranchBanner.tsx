"use client";
/**
 * Patron / bölge müdürü bir şubenin panelindeyken: hangi şubede çalıştığını ve
 * "Tüm Şubeler"e dönüşü gösteren ince şerit (birden çok şube varsa). Müdür ve tek şubeli patron görmez.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";

export default function OwnerBranchBanner() {
  const router = useRouter();
  const [info, setInfo] = useState<{ name: string; count: number } | null>(null);

  useEffect(() => {
    const read = () => {
      let u: { role?: string; location_id?: string } | null = null;
      try { u = JSON.parse(localStorage.getItem("optishift_manager_user") || "null"); } catch { u = null; }
      if (!u || (u.role !== "admin" && u.role !== "supervisor")) { setInfo(null); return; }
      const locId = localStorage.getItem("optishift_selected_location") || u.location_id;
      fetch("/api/locations").then(r => r.json()).then((locs: { id: string; name: string }[]) => {
        if (!Array.isArray(locs) || locs.length < 2) { setInfo(null); return; }
        setInfo({ name: locs.find(l => l.id === locId)?.name ?? "", count: locs.length });
      }).catch(() => setInfo(null));
    };
    read();
    window.addEventListener("optishift_location_changed", read);
    return () => window.removeEventListener("optishift_location_changed", read);
  }, []);

  if (!info?.name) return null;
  return (
    <div className="flex items-center justify-between gap-3 bg-ember-50 border-b border-ember-100 px-4 py-2 text-xs">
      <span className="text-ember-800 font-semibold truncate">
        <span className="font-black">{info.name}</span> şubesinde çalışıyorsunuz
      </span>
      <button
        onClick={() => {
          try {
            if (!localStorage.getItem("optishift_supervisor_user")) {
              const u = JSON.parse(localStorage.getItem("optishift_manager_user") || "{}");
              localStorage.setItem("optishift_supervisor_user", JSON.stringify({ ...u, location_id: null }));
            }
          } catch { /* yok say */ }
          router.push("/supervisor");
        }}
        className="shrink-0 inline-flex items-center gap-1 font-bold text-ember-700 hover:underline"
      >
        <Building2 size={13} /> Tüm Şubeler ({info.count})
      </button>
    </div>
  );
}
