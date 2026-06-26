// Kök admin layout — auth koruması yok, sadece koyu arkaplan
// Auth koruması (protected) route grubunun layout'unda
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100">
      {children}
    </div>
  );
}
