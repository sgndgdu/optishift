import type { Metadata } from "next";
import LegalShell from "@/components/LegalShell";

export const metadata: Metadata = {
  title: "Kullanım Şartları – OptiShift",
  description: "OptiShift vardiya yönetim platformu kullanım şartları",
};

export default function TermsPage() {
  return (
    <LegalShell title="Kullanım Şartları" updatedAt="19 Temmuz 2026">
      <p>
        Bu şartlar, OptiShift vardiya yönetim platformunun (&quot;Platform&quot;) kullanımını düzenler.
        Platform&apos;a kayıt olarak veya Platform&apos;u kullanarak bu şartları kabul etmiş sayılırsınız.
      </p>

      <h2>1. Hizmetin Tanımı</h2>
      <p>
        OptiShift; işletmelerin vardiya planlaması, personel müsaitliği, izin ve fazla mesai
        takibi yapmasına yardımcı olan bir yazılım hizmetidir (SaaS). Platform, matematiksel
        optimizasyon ile vardiya önerileri üretir; nihai planlama kararları her zaman işletme
        yöneticisine aittir.
      </p>

      <h2>2. Hesap ve Sorumluluk</h2>
      <ul>
        <li>Hesap bilgilerinizin (kullanıcı adı, şifre) gizliliğinden siz sorumlusunuz.</li>
        <li>İşletme hesabını açan kullanıcı, personel verilerini Platform&apos;a girme konusunda gerekli yasal yetkiye sahip olduğunu beyan eder.</li>
        <li>Hesabınız üzerinden yapılan tüm işlemler sizin sorumluluğunuzdadır.</li>
      </ul>

      <h2>3. Yasal Uyumluluk</h2>
      <p>
        Platform; çalışma süreleri, dinlenme araları, fazla mesai ve yıllık izin gibi konularda
        4857 sayılı İş Kanunu&apos;ndaki genel kurallara dayalı <strong>bilgilendirme amaçlı</strong> uyarılar
        üretir. Bu uyarılar hukuki danışmanlık değildir; iş mevzuatına uyum yükümlülüğü tamamen
        işverene aittir. Üretilen planların yürürlükteki mevzuata, toplu iş sözleşmelerine ve
        işyeri uygulamalarına uygunluğunu doğrulamak işverenin sorumluluğundadır.
      </p>

      <h2>4. Kabul Edilebilir Kullanım</h2>
      <ul>
        <li>Platform&apos;u hukuka aykırı amaçlarla kullanamazsınız.</li>
        <li>Başka kullanıcıların verilerine yetkisiz erişim girişiminde bulunamazsınız.</li>
        <li>Platform&apos;un işleyişini bozmaya yönelik (aşırı otomatik istek, güvenlik testi vb.) faaliyetlerde bulunamazsınız.</li>
      </ul>

      <h2>5. Ücretlendirme</h2>
      <p>
        Güncel plan ve fiyat bilgileri fiyatlandırma sayfasında yayınlanır. Ücretli planlara
        geçiş, ilgili planın koşullarının ayrıca kabulüyle gerçekleşir. Fiyat değişiklikleri
        mevcut fatura dönemine geriye dönük uygulanmaz.
      </p>

      <h2>6. Fikri Mülkiyet</h2>
      <p>
        Platform&apos;un yazılımı, tasarımı ve markası OptiShift&apos;e aittir. Platform&apos;a girdiğiniz
        veriler size (veya ilgili işverene) aittir; OptiShift bu veriler üzerinde yalnızca hizmeti
        sunmak için gereken sınırlı kullanım hakkına sahiptir.
      </p>

      <h2>7. Hizmet Seviyesi ve Sorumluluğun Sınırlandırılması</h2>
      <p>
        Platform &quot;olduğu gibi&quot; sunulur; kesintisiz veya hatasız çalışacağı garanti edilmez.
        OptiShift; dolaylı zararlardan, veri kaybından veya kâr kaybından, ilgili mevzuatın izin
        verdiği azami ölçüde sorumlu tutulamaz. Her durumda toplam sorumluluk, son 12 ayda
        Platform için ödenen ücretle sınırlıdır.
      </p>

      <h2>8. Fesih</h2>
      <p>
        Hesabınızı dilediğiniz zaman kapatabilirsiniz. OptiShift, bu şartların ihlali hâlinde
        hesabı askıya alma veya sonlandırma hakkını saklı tutar.
      </p>

      <h2>9. Değişiklikler ve Uygulanacak Hukuk</h2>
      <p>
        Bu şartlar güncellenebilir; önemli değişiklikler Platform üzerinden duyurulur. Bu şartlar
        Türkiye Cumhuriyeti hukukuna tabidir; uyuşmazlıklarda İzmir mahkemeleri ve icra daireleri
        yetkilidir.
      </p>

      <p>Sorularınız için: <strong>sgndgdu@gmail.com</strong></p>
    </LegalShell>
  );
}
