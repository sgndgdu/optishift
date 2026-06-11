"use client";

import { useState } from "react";
import { X } from "lucide-react";

const INTEGRATIONS = [
  { name: "SAP SuccessFactors",  logo: "SAP", connected: true,  color: "bg-blue-600"   },
  { name: "Nebim V3",            logo: "NBM", connected: false, color: "bg-teal-600"   },
  { name: "Logo Tiger / Netsis", logo: "LGO", connected: false, color: "bg-orange-600" },
  { name: "Mikro ERP",           logo: "MKR", connected: false, color: "bg-slate-600"  },
  { name: "Akınsoft",            logo: "AKN", connected: false, color: "bg-green-600"  },
  { name: "Kolay İK",            logo: "KİK", connected: false, color: "bg-purple-600" },
  { name: "Microsoft Dynamics",  logo: "365", connected: false, color: "bg-red-600"    },
  { name: "Oracle NetSuite",     logo: "ORA", connected: false, color: "bg-rose-600"   },
  { name: "Workday",             logo: "WKD", connected: false, color: "bg-cyan-600"   },
];

export default function IntegrationsPage() {
  const [connectModal, setConnectModal] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [connectedList, setConnectedList] = useState<string[]>(
    INTEGRATIONS.filter(i => i.connected).map(i => i.name)
  );

  function openModal(name: string) {
    setApiKey("");
    setTestResult(null);
    setConnectModal(name);
  }

  function closeModal() {
    setConnectModal(null);
    setApiKey("");
    setTestResult(null);
    setTesting(false);
  }

  async function handleTest() {
    if (!apiKey.trim()) return;
    setTesting(true);
    setTestResult(null);
    await new Promise(r => setTimeout(r, 1200));
    setTestResult("success");
    setTesting(false);
  }

  function handleSave() {
    if (!connectModal) return;
    setConnectedList(prev => [...prev, connectModal]);
    closeModal();
  }

  function handleDisconnect(name: string) {
    setConnectedList(prev => prev.filter(n => n !== name));
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Entegrasyon Merkezi</h1>
        <p className="text-slate-500 text-sm mt-1">
          ERP ve İK sistemlerinize tek tıkla bağlanın — sıfır kodlama
        </p>
      </div>

      <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-4 text-sm text-indigo-700">
        <strong>Tak-Çalıştır Mimari:</strong> API anahtarınızı girin, alan eşleştirmeyi yapın, bitti.
        Teknik ekip gerekmez.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {INTEGRATIONS.map(({ name, logo, color }) => {
          const isConnected = connectedList.includes(name);
          return (
            <div key={name} className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                {logo}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-800 text-sm">{name}</div>
                <div className={`text-xs mt-0.5 ${isConnected ? "text-green-600" : "text-slate-400"}`}>
                  {isConnected ? "✓ Bağlı" : "Bağlı değil"}
                </div>
              </div>
              <button
                onClick={() => isConnected ? handleDisconnect(name) : openModal(name)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0 ${
                  isConnected
                    ? "border border-slate-200 text-slate-600 hover:bg-slate-50"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                }`}
              >
                {isConnected ? "Bağlantıyı Kes" : "Bağlan"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Alan Eşleştirme */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <h2 className="font-semibold text-slate-700 mb-1">Akıllı Alan Eşleştirme</h2>
        <p className="text-xs text-slate-400 mb-4">SAP&apos;tan gelen sütun adlarını OptiShift alanlarıyla eşleştirin</p>
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

      {/* Bağlantı Modalı */}
      {connectModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-slate-800">{connectModal} Bağlantısı</h2>
                <p className="text-xs text-slate-400 mt-0.5">API anahtarınızı girerek bağlanın</p>
              </div>
              <button onClick={closeModal} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">API Anahtarı</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 font-mono"
                />
              </div>

              {testResult === "success" && (
                <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                  <span className="text-base">✓</span>
                  <span>Bağlantı başarılı! Kaydedebilirsiniz.</span>
                </div>
              )}
              {testResult === "error" && (
                <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <span className="text-base">✗</span>
                  <span>Bağlantı başarısız. Anahtarı kontrol edin.</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={handleTest}
                disabled={!apiKey.trim() || testing}
                className="flex-1 py-2.5 text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {testing ? "Test ediliyor…" : "Bağlantıyı Test Et"}
              </button>
              <button
                onClick={handleSave}
                disabled={testResult !== "success"}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
