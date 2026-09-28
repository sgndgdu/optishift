import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const ids = (await sql`SELECT id FROM organizations WHERE name LIKE 'TMP Kafe %' AND id IN (SELECT org_id FROM users WHERE email LIKE 'tmp.sahip.%@optishift.test')`).map(o => o.id);
if (ids.length) {
  const locs = (await sql`SELECT id FROM locations WHERE org_id = ANY(${ids})`).map(r => r.id);
  const pers = (await sql`SELECT id FROM personnel WHERE org_id = ANY(${ids})`).map(r => r.id);
  await sql`DELETE FROM shift_assignments WHERE location_id = ANY(${locs}) OR personnel_id = ANY(${pers})`;
  const cols = await sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('org_id','location_id','personnel_id') AND table_name NOT IN ('organizations','users','personnel','locations','shift_assignments')`;
  for (const { table_name: t, column_name: c } of cols) {
    const arr = c === "org_id" ? ids : c === "location_id" ? locs : pers;
    if (arr.length) await sql(`DELETE FROM "${t}" WHERE "${c}" = ANY($1)`, [arr]);
  }
  await sql`DELETE FROM users WHERE org_id = ANY(${ids})`;
  await sql`DELETE FROM personnel WHERE org_id = ANY(${ids})`;
  await sql`DELETE FROM locations WHERE org_id = ANY(${ids})`;
  await sql`DELETE FROM organizations WHERE id = ANY(${ids})`;
}
console.log("silinen org:", ids.length, "kalan:", (await sql`SELECT count(*)::int n FROM organizations WHERE name LIKE 'TMP Kafe %'`)[0].n);
