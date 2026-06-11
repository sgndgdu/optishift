/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "optishift.db");

export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !webhookSecret) {
    return NextResponse.json({ error: "Stripe yapılandırılmamış" }, { status: 400 });
  }

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(stripeKey, { apiVersion: "2026-05-27.dahlia" });

  const body = await req.text();
  const sig  = req.headers.get("stripe-signature") ?? "";

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    return NextResponse.json({ error: "Webhook imzası geçersiz: " + err.message }, { status: 400 });
  }

  const db = new Database(DB_PATH);
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const { org_id, plan } = session.metadata ?? {};
      if (org_id && plan) {
        db.prepare(`
          UPDATE organizations
          SET plan = ?, subscription_status = 'active',
              stripe_customer_id = COALESCE(stripe_customer_id, ?)
          WHERE id = ?
        `).run(plan, session.customer ?? null, org_id);
      }
    }

    if (event.type === "customer.subscription.deleted" || event.type === "invoice.payment_failed") {
      const sub = event.data.object;
      const orgRow = db.prepare(`SELECT id FROM organizations WHERE stripe_customer_id = ?`).get(sub.customer) as any;
      if (orgRow) {
        db.prepare(`UPDATE organizations SET plan = 'free', subscription_status = 'inactive' WHERE id = ?`).run(orgRow.id);
      }
    }

    db.close();
    return NextResponse.json({ received: true });
  } catch (err: any) {
    db.close();
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
