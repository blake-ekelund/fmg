import { supabaseServer } from "@/lib/supabaseServer";

/**
 * Resolve which customer an email address belongs to, using who we've
 * actually mailed at that address: bulk send-job recipients first, then
 * automation enrollments. Used to attribute webhook bounces/complaints
 * (which carry only an address) to a Wholesale or D2C account, so the
 * customer pages can flag them.
 */
export async function resolveCustomerByEmail(email: string): Promise<{
  customerType: "wholesale" | "d2c";
  customerRef: string;
} | null> {
  const clean = email.trim();
  if (!clean) return null;

  // .ilike with no wildcards = case-insensitive equality.
  const { data: sent } = await supabaseServer
    .from("email_send_job_recipients")
    .select("customer_type, customer_ref")
    .ilike("customer_email", clean)
    .limit(1)
    .maybeSingle();
  const fromSent = sent as { customer_type: string; customer_ref: string } | null;
  if (fromSent?.customer_ref && (fromSent.customer_type === "wholesale" || fromSent.customer_type === "d2c")) {
    return { customerType: fromSent.customer_type, customerRef: fromSent.customer_ref };
  }

  const { data: enrolled } = await supabaseServer
    .from("automation_enrollments")
    .select("customer_type, customer_ref")
    .ilike("customer_email", clean)
    .limit(1)
    .maybeSingle();
  const fromEnrolled = enrolled as { customer_type: string; customer_ref: string } | null;
  if (fromEnrolled?.customer_ref && (fromEnrolled.customer_type === "wholesale" || fromEnrolled.customer_type === "d2c")) {
    return { customerType: fromEnrolled.customer_type, customerRef: fromEnrolled.customer_ref };
  }

  return null;
}
