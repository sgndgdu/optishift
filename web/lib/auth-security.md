# Auth Security — Uygulanan Değişiklikler

## Mimari

Login → JWT (HS256, 7 gün) → HTTP-only cookie (`optishift_session`)
→ middleware.ts → x-auth-* headers → route handler `requireAuth()`

## Korunan route'lar

Middleware (`/api/*` hariç: login, register, webhook, invites GET):
- Geçersiz/eksik cookie → 401

Route seviyesi org izolasyonu:
- personnel: CRUD tam korumalı, `org_id` token'dan
- shifts GET: employee yalnız kendi personnel_id'sine, location org doğrulaması
- shifts POST: manager+ zorunlu
- messages: `org_id` ve `from_user_id` token'dan
- locations: org doğrulama, POST admin/supervisor zorunlu
- generate (OR-Tools): location org doğrulama
- leave-requests: employee yalnız kendi taleplerini görür
- notifications: employee yalnız kendi bildirimleri
- open-shifts: `org_id` token'dan
- breaks: `org_id` token'dan
- admin/organizations: admin rolü zorunlu

## Hâlâ eksik

- availability/route.ts — requireAuth eklenebilir
- swap-requests, shift-edit-requests — requireAuth eklenebilir
- export/schedule, schedule/publish, invites POST — requireAuth eklenebilir
- departments — requireAuth eklenebilir
- Frontend logout butonu (clearCookie için POST /api/auth/logout çağrısı)
