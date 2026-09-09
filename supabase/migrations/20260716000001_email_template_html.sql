-- Let templates hold uploaded HTML, not just plain text.
--
-- Existing rows are all plain text authored in the /email-templates textarea,
-- so 'text' is the correct default and backfill. The send path branches on this
-- column: 'text' bodies get escaped and wrapped in our own markup, 'html'
-- bodies are sent through as authored (see lib/email/tracking.ts).

alter table user_email_templates
  add column if not exists body_format text not null default 'text',
  add column if not exists source_filename text;

-- Guard the send-path branch at the DB level: an unrecognized format would
-- otherwise fall through to a default and mail the wrong thing.
alter table user_email_templates
  drop constraint if exists user_email_templates_body_format_check;
alter table user_email_templates
  add constraint user_email_templates_body_format_check
  check (body_format in ('text', 'html'));

comment on column user_email_templates.body_format is
  'text = plain text, escaped + wrapped at send time. html = authored HTML document, sent as-is with tracking rewrites.';
comment on column user_email_templates.source_filename is
  'Original filename for uploaded HTML templates. Provenance only — null for templates typed in the editor.';
