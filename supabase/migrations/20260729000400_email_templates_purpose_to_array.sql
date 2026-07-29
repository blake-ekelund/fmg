-- `purpose` first shipped as a single-value `text` column; the creation wizard
-- makes it multi-select. Convert it to text[] in place, wrapping any existing
-- single value into a one-element array. Guarded so it's a no-op when the column
-- is already text[] (e.g. a fresh DB that applied the array version directly).

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'email_templates'
      and column_name = 'purpose'
      and data_type <> 'ARRAY'
  ) then
    alter table email_templates
      alter column purpose type text[]
      using case
        when purpose is null then null
        when btrim(purpose) = '' then '{}'::text[]
        else array[purpose]
      end;
  end if;
end $$;
