/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { requireAuth } from "@/lib/auth";

const DB_PATH = path.join(process.cwd(), "optishift.db");

const PRICE_IDS: Record<string, string> = {
  pro:        process.env.STRIPE_PRICE_PRO ?? "",
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE ?? "",
};

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  // Sadece admin ve supervisor plan değiştirebilir
  if (auth.role === "employee" || auth.role === "manager") {
    return NextResponse.json({ error: "Yetersiz yetki" }, { status: 403 });
  }

  const db = new Database(DB_PATH);
  try {
    const { plan, success_url, cancel_url } = await req.json();
    const org_id = auth.org_id; // JWT'den al, body'den değil

    if (!plan) {
      db.close();
      return NextResponse.json({ error: "plan zorunlu" }, { status: 400 });
    }

    // ── Real Stripe path ───────────────────────────────────────────────────
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (stripeKey && PRICE_IDS[plan]) {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeKey, { apiVersion: "2026-05-27.dahlia" });

      // Var olan Stripe müşteri ID'sini kullan (daha önce abone olduysa)
      const orgRow = db.prepare("SELECT stripe_customer_id FROM organizations WHERE id = ?").get(org_id) as any;
      const customer = orgRow?.stripe_customer_id ?? undefined;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer,
        line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
        metadata: { org_id, plan },
        success_url: success_url ?? `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/billing?success=1`,
        cancel_url:  cancel_url  ?? `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/billing?cancelled=1`,
      });

      db.close();
      return NextResponse.json({ checkout_url: session.url });
    }

    // ── Demo / no-Stripe fallback ──────────────────────────────────────────
    db.prepare(
      `UPDATE organizations SET plan = ?, subscription_status = 'active' WHERE id = ?`
    ).run(plan, org_id);

    db.close();
    return NextResponse.json({ success: true, demo: true, message: `${plan} planına geçildi (demo mod).` });
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
