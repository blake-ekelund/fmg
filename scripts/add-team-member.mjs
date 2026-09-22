/**
 * Create an internal team member who can actually sign in.
 *
 * Settings → Team's "Invite Member" only inserts a `profiles` row with a random
 * UUID — it never creates a Supabase auth user, so the new row can never match
 * a real login (UserContext looks profiles up by auth user id). This script does
 * both halves, keyed to the same id, using the service-role key from .env.local.
 *
 * Idempotent: re-running reuses an existing auth user and upserts the profile,
 * so it is safe to re-run after a pending migration lands.
 *
 * Usage (PowerShell):
 *   $env:TM_EMAIL="name@fragrancemarketinggroup.com"; $env:TM_NAME="Name"; `
 *   $env:TM_ACCESS="operations"; $env:TM_PASSWORD="…"; node scripts/add-team-member.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")];
    })
);

const EMAIL = (process.env.TM_EMAIL ?? "").trim().toLowerCase();
const NAME = (process.env.TM_NAME ?? "").trim();
const ACCESS = (process.env.TM_ACCESS ?? "user").trim();
const PASSWORD = process.env.TM_PASSWORD ?? "";

if (!EMAIL || !NAME) {
  console.error("Set TM_EMAIL and TM_NAME (and TM_PASSWORD for a new login).");
  process.exit(1);
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// 1. Auth user — reuse if this email already has one.
const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
if (listErr) {
  console.error("listUsers failed:", listErr.message);
  process.exit(1);
}
let user = list.users.find((u) => (u.email ?? "").toLowerCase() === EMAIL);

if (user) {
  console.log(`auth user already exists → ${user.id}`);
} else {
  if (!PASSWORD) {
    console.error("No auth user for this email and no TM_PASSWORD given.");
    process.exit(1);
  }
  const { data, error } = await sb.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    // No SMTP confirmation loop for internal staff — they get the password directly.
    email_confirm: true,
  });
  if (error) {
    console.error("createUser failed:", error.message);
    process.exit(1);
  }
  user = data.user;
  console.log(`auth user created → ${user.id}`);
}

// 2. Profile row, keyed to the auth id so UserContext can find it.
const { error: upErr } = await sb
  .from("profiles")
  .upsert({ id: user.id, first_name: NAME, email: EMAIL, access: ACCESS }, { onConflict: "id" });

if (upErr) {
  console.error("profile upsert failed:", upErr.message);
  if (/profiles_access_check/.test(upErr.message)) {
    console.error(`\n'${ACCESS}' is not in the profiles.access CHECK constraint yet — run \`supabase db push\` and re-run this script.`);
  }
  process.exit(2);
}

const { data: row } = await sb
  .from("profiles")
  .select("id, first_name, email, access")
  .eq("id", user.id)
  .single();
console.log("profile ready →", JSON.stringify(row));
