-- Resend webhook feeds delivery failures back into the suppression list:
-- permanent bounces arrive as source='bounce', spam complaints need their own
-- value so reporting can tell "dead address" from "person marked us as spam".
alter table email_unsubscribes
  drop constraint if exists email_unsubscribes_source_check;
alter table email_unsubscribes
  add constraint email_unsubscribes_source_check
    check (source in ('link', 'manual', 'bounce', 'complaint'));
