// Giriş sonrası panel seçimi: şifreli giriş, biyometrik giriş ve Google girişi aynı kuralı kullanır.
// Sahip (admin, şubeye bağlı değil) için şube sayısı belirler:
//   0 şube → ilk kurulum (/onboarding), kurulumu yarıda bırakan da buraya döner
//   1 şube → doğrudan o şubenin müdür paneli (tek şubeli işletme amir paneline düşmez)
//   2+ şube → amir paneli (şube kartındaki "Planı Yönet" müdür paneline geçirir)
// Admin'de amir ve müdür oturum anahtarları birlikte tutulur; iki panel arasında geçiş serbesttir.

export type LoginData = {
  role: string;
  location_id: string | null;
  is_temp_password?: boolean;
  [key: string]: unknown;
};

const PORTAL = "optishift_portal_user";
const MANAGER = "optishift_manager_user";
const SUPERVISOR = "optishift_supervisor_user";

// Admin'i verilen şubenin müdür paneline bağlar (Sidebar aynı anahtarları okur)
export function openBranchPanel(user: LoginData, locationId: string) {
  localStorage.setItem(MANAGER, JSON.stringify({ ...user, location_id: locationId }));
  localStorage.setItem("optishift_selected_location", locationId);
}

async function fetchLocationIds(): Promise<string[] | null> {
  try {
    const res = await fetch("/api/locations");
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data.map((l: { id: string }) => l.id) : null;
  } catch {
    return null;
  }
}

export async function routeAfterLogin(data: LoginData, push: (href: string) => void) {
  if (data.is_temp_password) {
    localStorage.setItem("optishift_setup_user", JSON.stringify(data));
    push("/setup");
    return;
  }

  if (data.role === "supervisor") {
    localStorage.removeItem(PORTAL);
    localStorage.removeItem(MANAGER);
    localStorage.setItem(SUPERVISOR, JSON.stringify(data));
    push("/supervisor");
    return;
  }

  // İşletme sahibi: şube sayısına göre (hesabın bir şubeye bağlı olması fark etmez). 2+ şubede önce
  // Tüm Şubeler (Genel Bakış) açılır; eskiden şubeye bağlı patron doğrudan o şubenin paneline düşüyordu.
  if (data.role === "admin") {
    localStorage.removeItem(PORTAL);
    localStorage.removeItem(MANAGER);
    localStorage.setItem(SUPERVISOR, JSON.stringify(data));
    const ids = await fetchLocationIds();
    if (ids?.length === 0) { push("/onboarding"); return; }
    if (ids?.length === 1) { openBranchPanel(data, ids[0]); push("/dashboard"); return; }
    push("/supervisor");
    return;
  }

  if (data.role === "manager" || data.role === "admin") {
    localStorage.removeItem(PORTAL);
    // Şubeye bağlı admin amir paneline de geçebilir
    if (data.role === "admin") localStorage.setItem(SUPERVISOR, JSON.stringify(data));
    else localStorage.removeItem(SUPERVISOR);
    localStorage.setItem(MANAGER, JSON.stringify(data));
    push("/dashboard");
    return;
  }

  localStorage.removeItem(MANAGER);
  localStorage.removeItem(SUPERVISOR);
  localStorage.setItem(PORTAL, JSON.stringify(data));
  push("/portal");
}
