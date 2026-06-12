-- Small helper: map full US state names to 2-letter codes.
-- Leaves already-2-char codes (and anything unknown) upper-cased and trimmed.

create or replace function norm_state(s text) returns text
language sql immutable
as $func$
  select case lower(trim(coalesce(s,'')))
    when 'alabama' then 'AL' when 'alaska' then 'AK'
    when 'arizona' then 'AZ' when 'arkansas' then 'AR'
    when 'california' then 'CA' when 'colorado' then 'CO'
    when 'connecticut' then 'CT' when 'delaware' then 'DE'
    when 'florida' then 'FL' when 'georgia' then 'GA'
    when 'hawaii' then 'HI' when 'idaho' then 'ID'
    when 'illinois' then 'IL' when 'indiana' then 'IN'
    when 'iowa' then 'IA' when 'kansas' then 'KS'
    when 'kentucky' then 'KY' when 'louisiana' then 'LA'
    when 'maine' then 'ME' when 'maryland' then 'MD'
    when 'massachusetts' then 'MA' when 'michigan' then 'MI'
    when 'minnesota' then 'MN' when 'mississippi' then 'MS'
    when 'missouri' then 'MO' when 'montana' then 'MT'
    when 'nebraska' then 'NE' when 'nevada' then 'NV'
    when 'new hampshire' then 'NH' when 'new jersey' then 'NJ'
    when 'new mexico' then 'NM' when 'new york' then 'NY'
    when 'north carolina' then 'NC' when 'north dakota' then 'ND'
    when 'ohio' then 'OH' when 'oklahoma' then 'OK'
    when 'oregon' then 'OR' when 'pennsylvania' then 'PA'
    when 'rhode island' then 'RI' when 'south carolina' then 'SC'
    when 'south dakota' then 'SD' when 'tennessee' then 'TN'
    when 'texas' then 'TX' when 'utah' then 'UT'
    when 'vermont' then 'VT' when 'virginia' then 'VA'
    when 'washington' then 'WA' when 'west virginia' then 'WV'
    when 'wisconsin' then 'WI' when 'wyoming' then 'WY'
    when 'district of columbia' then 'DC'
    else upper(trim(coalesce(s,'')))
  end
$func$;
