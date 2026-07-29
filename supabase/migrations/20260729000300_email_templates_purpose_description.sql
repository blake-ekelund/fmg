-- Template creation wizard: capture a template's marketing intent up front.
-- SAFE TO APPLY ANY TIME (purely additive, both nullable).
--
--   purpose     — why the email exists (newsletter, win-back, promotion, …).
--                 Multi-select: an array of short slugs. The allowed set is
--                 validated in the app (TEMPLATE_PURPOSES) rather than a DB
--                 check, so adding a new purpose later needs no migration.
--   description — a free-text note about the template, shown in the library.

alter table email_templates
  add column if not exists purpose     text[],
  add column if not exists description text;
