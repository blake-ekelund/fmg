-- Designed Templates can now come from an uploaded HTML file, not only the
-- block builder. A template's `source` decides which one drives it:
--
--   'blocks' — the drag-and-drop builder; `blocks` holds the layout, and
--              lib/email/renderBlocks.ts turns it into email HTML at send time.
--   'html'   — a user-uploaded .html file; `raw_html` holds the document
--              verbatim and lib/email/rawHtml.ts sanitises + serves it as-is.
--
-- Existing rows are all builder templates, so `source` defaults to 'blocks'
-- and `raw_html` stays null. Nothing about the block path changes.

alter table email_templates
  add column if not exists source   text not null default 'blocks',
  add column if not exists raw_html text;

-- Guard the discriminator so a bad write can't leave a row the renderers
-- don't know how to serve.
alter table email_templates
  drop constraint if exists email_templates_source_check;
alter table email_templates
  add constraint email_templates_source_check
  check (source in ('blocks', 'html'));
