/**
 * The builder columns (blocks, audience, purpose, description) arrive with
 * migration 20260923010000_blog_builder.sql. Until it's applied, writes that
 * mention them fail; the blog routes retry without them so posts can still
 * be created and saved (as rendered HTML) in the meantime.
 */

export const BUILDER_MIGRATION_HINT =
  "Blog builder columns are missing — apply supabase/migrations/20260923010000_blog_builder.sql (supabase db push). Until then posts save as HTML only and can't be reopened in the builder.";

export function builderColumnMissing(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const m = error.message ?? "";
  return (
    /(blocks|audience|purpose|description)/i.test(m) &&
    (error.code === "PGRST204" || error.code === "42703" || /column|schema cache/i.test(m))
  );
}
