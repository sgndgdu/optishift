// E-posta gönderici — Resend API kullanır (key yoksa silent fail)
// Kurulum gerekmez; sadece env var: RESEND_API_KEY

interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail(opts: MailOptions): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.MAIL_FROM ?? "noreply@optishift.app";

  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY yapılandırılmamış" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: body };
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Mail gönderilemedi" };
  }
}

export function resetPasswordEmailHtml(name: string, resetUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
        <tr><td style="background:#4f46e5;padding:28px 32px;">
          <p style="margin:0;font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;">⚡ OptiShift</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#0f172a;">Şifre Sıfırlama</h1>
          <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">Merhaba ${name}, şifre sıfırlama talebinizi aldık. Aşağıdaki butona tıklayarak yeni şifrenizi belirleyebilirsiniz.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:12px;">Şifremi Sıfırla</a>
          <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;">Bu link <strong>1 saat</strong> geçerlidir. Talebi siz oluşturmadıysanız bu e-postayı yok sayabilirsiniz.</p>
          <hr style="margin:24px 0;border:none;border-top:1px solid #f1f5f9;">
          <p style="margin:0;color:#cbd5e1;font-size:12px;">OptiShift · Vardiya Yönetim Platformu</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
