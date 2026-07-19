import type { Metadata } from "next";
import LegalShell from "@/components/LegalShell";

export const metadata: Metadata = {
  title: "Gizlilik Politikası & KVKK Aydınlatma Metni – OptiShift",
  description: "OptiShift kişisel verilerin korunması ve gizlilik politikası",
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Gizlilik Politikası ve KVKK Aydınlatma Metni" updatedAt="19 Temmuz 2026">
      <p>
        Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;) kapsamında,
        OptiShift vardiya yönetim platformunu (&quot;Platform&quot;) kullanan kişilerin kişisel
        verilerinin nasıl işlendiğini açıklar.
      </p>

      <h2>1. Roller: Veri Sorumlusu ve Veri İşleyen</h2>
      <p>
        Platform, işletmelerin (kafe, restoran, otel, mağaza, fabrika vb.) personel vardiya
        planlamasını yönetmesi için sunulan bir hizmettir. Bu yapıda iki ayrı rol vardır:
      </p>
      <ul>
        <li>
          <strong>İşletme hesabı verileri</strong> (kayıt olan yöneticinin adı, e-postası,
          kullanıcı adı, işletme bilgileri) bakımından veri sorumlusu <strong>OptiShift</strong>&apos;tir.
        </li>
        <li>
          <strong>Personel verileri</strong> (çalışanların adı, iletişim bilgisi, vardiya, müsaitlik,
          izin, fazla mesai ve ücret bilgileri) Platform&apos;a ilgili <strong>işletme (işveren)</strong>
          tarafından girilir. Bu veriler bakımından veri sorumlusu işverendir; OptiShift bu verileri
          işverenin talimatıyla barındıran <strong>veri işleyen</strong> konumundadır. Çalışanlar, bu
          verilerle ilgili taleplerini öncelikle işverenlerine iletmelidir.
        </li>
      </ul>

      <h2>2. İşlenen Kişisel Veriler</h2>
      <ul>
        <li><strong>Hesap bilgileri:</strong> ad soyad, kullanıcı adı, e-posta, telefon, şifre (geri döndürülemez şekilde karma/hash olarak).</li>
        <li><strong>Personel yönetim verileri:</strong> vardiya atamaları, müsaitlik tercihleri, izin talepleri ve bakiyeleri, fazla mesai kayıtları, işe giriş tarihi, pozisyon, çalışma saatleri, işverenin girmesi hâlinde saatlik ücret.</li>
        <li><strong>Kullanım ve güvenlik verileri:</strong> oturum kayıtları, IP adresi, işlem logları.</li>
      </ul>

      <h2>3. İşleme Amaçları ve Hukuki Sebepler</h2>
      <ul>
        <li>Hizmetin sunulması: vardiya planlama, bildirimler, raporlama — <em>sözleşmenin kurulması ve ifası</em> (KVKK m.5/2-c).</li>
        <li>Hesap güvenliği, kötüye kullanımın önlenmesi, hata ayıklama — <em>meşru menfaat</em> (KVKK m.5/2-f).</li>
        <li>Yasal yükümlülüklerin yerine getirilmesi (KVKK m.5/2-ç).</li>
      </ul>
      <p>Veriler, bu amaçlar dışında pazarlama amacıyla üçüncü kişilerle paylaşılmaz ve satılmaz.</p>

      <h2>4. Verilerin Aktarıldığı Taraflar</h2>
      <p>
        Platform, hizmetin teknik olarak sunulabilmesi için aşağıdaki alt yüklenici hizmet
        sağlayıcılarını kullanır. Bu sağlayıcıların sunucuları yurt dışında bulunabilir; bu
        kapsamda veriler KVKK m.9 uyarınca yurt dışına aktarılabilir:
      </p>
      <ul>
        <li><strong>Vercel</strong> — uygulama barındırma</li>
        <li><strong>Neon</strong> — veritabanı barındırma</li>
        <li><strong>Render</strong> — vardiya planlama hesaplama servisi</li>
        <li><strong>Resend</strong> — işlemsel e-posta gönderimi (ör. şifre sıfırlama)</li>
      </ul>

      <h2>5. Çerezler</h2>
      <p>
        Platform yalnızca oturumun sürdürülmesi için <strong>zorunlu</strong> bir oturum çerezi
        (<code>optishift_session</code>) kullanır. Reklam, izleme veya üçüncü taraf analitik
        çerezi kullanılmaz. Bu nedenle ayrıca çerez onayı istenmez.
      </p>

      <h2>6. Saklama Süresi</h2>
      <p>
        Veriler, hesap aktif olduğu sürece ve ilgili mevzuattaki asgari saklama süreleri boyunca
        saklanır. Hesabın silinmesi talebiyle, yasal saklama yükümlülüğü bulunmayan veriler makul
        süre içinde silinir veya anonim hâle getirilir.
      </p>

      <h2>7. Veri Güvenliği</h2>
      <p>
        Veriler aktarım sırasında TLS ile şifrelenir; şifreler geri döndürülemez şekilde karma
        (bcrypt) olarak saklanır; erişim, rol tabanlı yetkilendirme ve organizasyon bazlı veri
        izolasyonu ile sınırlandırılır.
      </p>

      <h2>8. KVKK m.11 Kapsamındaki Haklarınız</h2>
      <p>
        Kişisel verilerinizin işlenip işlenmediğini öğrenme, düzeltilmesini veya silinmesini talep
        etme, işlemenin sınırlandırılmasını isteme ve zarara uğramanız hâlinde giderilmesini talep
        etme haklarına sahipsiniz. Başvurularınızı <strong>sgndgdu@gmail.com</strong> adresine
        iletebilirsiniz. Personel verileriyle ilgili talepler için öncelikli muhatap işvereninizdir.
      </p>
    </LegalShell>
  );
}
