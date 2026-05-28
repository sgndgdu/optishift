const INTEGRATIONS = [
  { name: "SAP SuccessFactors", logo: "SAP",  connected: true,  color: "bg-blue-600"   },
  { name: "Logo Tiger / Netsis", logo: "LGO", connected: false, color: "bg-orange-600" },
  { name: "Mikro ERP",           logo: "MKR", connected: false, color: "bg-slate-600"  },
  { name: "Akınsoft",            logo: "AKN", connected: false, color: "bg-green-600"  },
  { name: "Kolay İK",            logo: "KİK", connected: false, color: "bg-purple-600" },
  { name: "Microsoft Dynamics",  logo: "365", connected: false, color: "bg-red-600"    },
  { name: "Oracle NetSuite",     logo: "ORA", connected: false, color: "bg-rose-600"   },
  { name: "Workday",             logo: "WKD", connected: false, color: "bg-cyan-600"   },
];

export default function IntegrationsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Entegrasyon Merkezi</h1>
        <p className="text-slate-500 text-sm mt-1">
          ERP ve İK sistemlerinize tek tıkla bağlanın — sıfır kodlama
        </p>
      </div>

      <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-4 text-sm text-indigo-700">
        <strong>Tak-Çalıştır Mimari:</strong> API anahtarınızı girin, alan eşleştirmeyi yapın, bitti.
        Teknik ekip gerekmez.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {INTEGRATIONS.map(({ name, logo, connected, color }) => (
          <div key={name} className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
              {logo}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-800 text-sm">{name}</div>
              <div className={`text-xs mt-0.5 ${connected ? "text-green-600" : "text-slate-400"}`}>
                {connected ? "✓ Bağlı" : "Bağlı değil"}
              </div>
            </div>
            <button className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0 ${
              connected
                ? "border border-slate-200 text-slate-600 hover:bg-slate-50"
                : "bg-indigo-600 hover:bg-indigo-700 text-white"
            }`}>
              {connected ? "Yönet" : "Bağlan"}
            </button>
          </div>
        ))}
      </div>

      {/* Alan Eşleştirme */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <h2 className="font-semibold text-slate-700 mb-1">Akıllı Alan Eşleştirme</h2>
        <p className="text-xs text-slate-400 mb-4">SAP'tan gelen sütun adlarını OptiShift alanlarıyla eşleştirin</p>
        <div className="space-y-3">
          {[
            { erp: "Emp_Name",  sys: "personnel_name" },
            { erp: "Sicil_No",  sys: "employee_id" },
            { erp: "Dept_Code", sys: "zone" },
          ].map(({ erp, sys }) => (
            <div key={erp} className="flex items-center gap-3 text-sm">
              <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-600 font-mono text-xs">
                {erp}
              </div>
              <span className="text-slate-400">→</span>
              <div className="flex-1 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-indigo-700 font-mono text-xs">
                {sys}
              </div>
            </div>
          ))}
        </div>
        <button className="mt-4 text-xs font-medium text-indigo-600 hover:text-indigo-700">
          + Yeni alan eşleştirme ekle
        </button>
      </div>
    </div>
  );
}
