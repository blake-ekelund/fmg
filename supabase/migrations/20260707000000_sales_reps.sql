-- Sales rep directory backing the /sales-team page.
-- Seeded from the master rep roster. Edits + new reps from the UI persist here
-- (writes go through /api/sales-reps with the service-role key, so RLS below
-- only governs any direct client reads).

create table if not exists sales_reps (
  id           uuid primary key default gen_random_uuid(),
  agency_code  integer,
  agency       text not null default '',
  name         text not null,
  email        text not null default '',
  phone        text not null default '',
  city         text not null default '',
  state        text not null default '',
  zip          text not null default '',
  territory    text not null default '',
  samples      text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists sales_reps_agency_idx on sales_reps (agency);

-- Seed the roster, but only on a fresh table so re-running never duplicates.
insert into sales_reps (agency_code, agency, name, email, phone, city, state, zip, territory, samples)
select * from (values
  (101, 'Blonde Comet', 'Tana Erickson', 'blondecomet@gmail.com', '612-281-7921', 'Chanhassen', 'MN', '55317', 'Principal', 'A'),
  (101, 'Blonde Comet', 'Karri Kearin', 'karri.vanliermann@gmail.com', '763-226-6359', 'Maple Grove', 'MN', '55311', 'Northern MN', 'A'),
  (101, 'Blonde Comet', 'Jill Rowley', 'rowleyjill@gmail.com', '605-770-0045', 'Mitchell', 'SD', '57301', 'South Dakota', 'A'),
  (101, 'Blonde Comet', 'Meg Brownson', 'megbrownson@msnc.om', '651-324-4502', 'Stillwater', 'MN', '55082', 'Wisconsin and Eastern MN', 'A'),
  (101, 'Blonde Comet', 'Sue Ferlita', 'ferlita@comcast.net', '', 'Eagan', 'MN', '55123', 'LFHI', 'A'),
  (101, 'Blonde Comet', 'Angela Schumacher', 'schumangie@gmail.com', '', 'Minnetonka', 'MN', '55345', 'LFHI', 'A'),
  (101, 'Blonde Comet', 'Jeanne Kenney', 'kenneysalesllc@gmail.com', '', 'St. Paul', 'MN', '55104', 'LFHI', 'A'),
  (101, 'Blonde Comet', 'Jill Hauch', 'jhauchllc@gmail.com', '', 'Maple Grove', 'MN', '55369', 'LFHI', 'B'),
  (101, 'Blonde Comet', 'Judy Schierman', 'jschierman@gmail.com', '', 'Shoreview', 'MN', '55126', 'LFHI', 'A'),
  (101, 'Blonde Comet', 'Molly Swenson', 'msmarketing2021@gmail.com', '', 'Chanhassen', 'MN', '55317', 'LFHI', 'B'),
  (101, 'Blonde Comet', 'Karen VanMeter', 'klvanmeter@gmail.com', '', 'Venice', 'FL', '34293', 'LFHI', 'B'),
  (101, 'Blonde Comet', 'Jennifer Calhoun', 'olive.opal0@gmail.com', '715.612.2949', 'Menasha', 'WI', '54952', 'WI', 'A'),
  (111, 'Hofstedt', 'Julie Hofstedt', 'julieh@fragrancemarketinggroup.com', '612.201.3140', 'Longville', 'MN', '56655', 'Inside Sales Key Account', 'Cat'),
  (178, 'GMA', 'Gretchen Mathey', 'gmatheny4@gmail.com', '419.367.9035', 'Plain City', 'OH', '43064', 'Columbus OH', 'A'),
  (178, 'GMA', 'Jenni Dahlinghaus', 'jdahlinghaus@yahoo.com', '419.305.8061', 'Minster', 'OH', '45865', 'Dayton OH', 'A'),
  (178, 'GMA', 'Corey Fowles', 'ctfowles@gmail.com', '440.665.4768', 'Strongsville', 'OH', '44149', 'Toledo, OH', 'A'),
  (178, 'GMA', 'Ted Fowles', 'ctfowles@gmail.com', '440.665.4781', 'Strongsville', 'OH', '44149', 'OH', 'A'),
  (178, 'GMA', 'Stephanie Lark', 'stephanielark@hotmail.com', '', 'Blacklick', 'OH', '43004', 'OH', 'A'),
  (183, 'Jim Dedricks Assoc', 'Jim Dedricks', 'jrdedricks@gmail.com', '920-285-3636', 'Appleton', 'WI', '54913', 'Michigan', 'A'),
  (183, 'Jim Dedricks Assoc', 'Bryce Alvarado', 'brycealvarado15@gmail.com', '920-252-2289', 'Neenah', 'WI', '54956', 'Michigan', 'A'),
  (183, 'Jim Dedricks Assoc', 'Josh Broek', 'cbbroek@comcast.net', '', 'Hudsonville', 'WI', '49426', 'Michigan', 'B'),
  (190, 'Keith Smith', 'KERRY SMITH', 'kerry@keithsmithltd.com', '214.809.8774', 'Dallas', 'TX', '75207', 'Principal', 'NA'),
  (190, 'Keith Smith', 'JANET SMITH', 'janet@keithsmithltd.com', '972.977.3879', 'Dallas', 'TX', '75207', 'Principal', 'NA'),
  (190, 'Keith Smith', 'KELLY BURNS', 'kelly@keithsmithltd.com', '214.741.4392', 'Dallas', 'TX', '75207', 'Admin/Showroom', 'NA'),
  (190, 'Keith Smith', 'Tanya Day', 'tanya@keithsmithltd.com', '870.377.1246', 'Hot Springs', 'AR', '71913', 'Arkansas', 'A'),
  (190, 'Keith Smith', 'Deborah Vinson', 'deborah@keithsmithltd.com', '312.315.1565', 'New Orleans', 'LA', '70115', 'Louisiana', 'B'),
  (190, 'Keith Smith', 'Lora Frazier', '', '', 'Stillwater', 'OK', '74074', '', 'B'),
  (190, 'Keith Smith', 'Cipres Guillermo', 'guillermo@keithsmithltd.com', '214-994-4827', 'Frisco', 'TX', '75035', 'Mexico', 'B'),
  (190, 'Keith Smith', 'Dina Shaw', 'dinashaw02@gmail.com', '214.708.5064', 'Ringgold', 'TX', '76261', 'West Texas', ''),
  (190, 'Keith Smith', 'Marsha Waugh', 'marsha@keithsmithltd.com', '817.999.0881', 'Fort Worth', 'TX', '76133', 'Fort Worth', 'A'),
  (190, 'Keith Smith', 'Mary Lazauskas', 'marylaz@keithsmithltd.com', '281.650.1227', 'The Woodlands', 'TX', '77380', 'Houston', 'A'),
  (195, 'Street Brands', 'Dennis Schrupp', 'dennis@thestreetbrands.com', '612.802.9892', '', '', '', 'Branches only', 'Cat'),
  (200, 'Seward Associates', 'Carol Seward Paltsios', 'carolseward@sewardassoc.com', '978-670-9870', 'Westford', 'MA', '01886', 'Principal', 'A'),
  (200, 'Seward Associates', 'Craig Seward', 'craigseward@sewardassoc.com', '978-764-2264', 'Newbury', 'MA', '01951', 'Principal', 'B'),
  (200, 'Seward Associates', 'Christine Kurmaskie', 'christinekurmaskie@sewardassoc.com', '860-539-7487', 'Manchester', 'CT', '06040', 'Connecticut', 'B'),
  (200, 'Seward Associates', 'Dawn Kirlin', 'dawnkirlin@sewardassoc.com', '540-272-1508', 'Francestown', 'NH', '03043', 'Maine', 'A'),
  (200, 'Seward Associates', 'Caitlyn Paltsios', 'caitlynpaltsios@sewardassoc.com', '', 'Westford', 'MA', '01886', '', 'A'),
  (200, 'Seward Associates', 'Mariann Miceli', 'mariannmiceli@sewardassoc.com', '401-952-4615', 'North Kingstown', 'RI', '02852', 'Rhode Island', 'A'),
  (200, 'Seward Associates', 'Shirley J. Gratkowski', 'shirleygratkowski@sewardassoc.com', '508-561-6790', 'Wareham', 'MA', '02571', 'Massachussets', 'A'),
  (210, 'Sales Producers', 'Paula Anderson', 'paulad@salesproducertsinc.com', '520-603-4551', 'Tucson', 'AZ', '85710', 'Southern Arizona - Tucson', 'B'),
  (210, 'Sales Producers', 'Annie Ledford', 'anniel@salesproducersinc.com', '951-326-0616', 'Aguanga', 'CA', '92536', 'Riverside/San Bernardino', 'B'),
  (210, 'Sales Producers', 'April Dohm', 'aprild@salesproducertsinc.com', '213-747-8133 ext. 117', 'Los Angeles', 'CA', '90043', 'LA and Showroom MGR', 'B'),
  (210, 'Sales Producers', 'Diane Jose', 'dianed@salesproducertsinc.com', '510-499-4928', 'Fremont', 'CA', '94539', 'Northern CA', 'B'),
  (210, 'Sales Producers', 'Gigi Grande', 'gigid@salesproducertsinc.com', '818-399-8919', 'Woodland Hills', 'CA', '91364', 'San Fernando/San Gabriel Valley', 'A'),
  (210, 'Sales Producers', 'Judy Chesley', 'judyd@salesproducertsinc.com', '562-810-6054', 'Long Beach', 'CA', '90808', 'LA -South Bay', 'B'),
  (210, 'Sales Producers', 'Karen Hogenauer', 'karend@salesproducertsinc.com', '949-244-0550', 'Laguna Beach', 'CA', '92651', 'Orange County', 'B'),
  (210, 'Sales Producers', 'Laura Solano', 'laurad@salesproducertsinc.com', '530-913-6854', 'Grass Valley', 'CA', '95945', 'Sacramento/Lake Tahoe/Reno', 'B'),
  (210, 'Sales Producers', 'Patrick Council', '', '', 'Sherman Oaks', 'CA', '91423', 'Key Accounts', 'Cat+'),
  (210, 'Sales Producers', 'Karen Hughes', '', '', 'Springfield', 'MO', '65803', 'Inside Sales/Open Territories', 'Cat+'),
  (210, 'Sales Producers', 'Marianne Welch', 'marianned@salesproducertsinc.com', '208-670-1814', 'Burley', 'ID', '83318', 'S Idaho/Utah/Wyoming', 'A'),
  (210, 'Sales Producers', 'Kelly Oaks', 'kellyd@salesproducertsinc.com', '505-818-0380', 'Severn', 'MD', '21144', 'Key Accounts, Fresno, Hawaii 1 catalog only', 'Cat+'),
  (210, 'Sales Producers', 'Clark Gulliford', 'clarkd@salesproducertsinc.com', '405-388-9530', 'Las Vegas', 'NV', '89129', 'LV, NM, N. Arizona', 'A'),
  (210, 'Sales Producers', 'Michelle Cox', 'michelled@salesproducertsinc.com', '503-995-9002', 'Portland', 'OR', '97214', 'Oregon/SW Washington', 'A'),
  (210, 'Sales Producers', 'Sally McGee', 'sallym@salesproducersin.com', '', 'El Granada', 'CA', '94018', 'San Francisco/North Bay', 'B'),
  (210, 'Sales Producers', 'Stella Lynch', 'stellalynchservice@gmail.com', '', 'Encinitas', 'CA', '92024', 'San Diego Trading', 'Cat+'),
  (210, 'Sales Producers', 'Jamee Brandt', 'jameeb@salesproducersinc.com', '', 'Valencia', 'CA', '91354', 'Santa Barbara/San Luis Obispo', 'B'),
  (210, 'Sales Producers', 'Mady Bradley', 'madyb@salesproducersinc.com', '', 'Gilbert', 'AZ', '85295', 'Arizona', 'A'),
  (210, 'Sales Producers', 'Lindsay De Oliverira', 'lindsayd@salesproducersinc.com', '', 'Shelby', '', '28152', 'Inside Sales/Open Territories', 'Cat+'),
  (210, 'Sales Producers', 'Marissa Chapman Kopke', 'marissak@salesproducersinc.com', '303-960-6901', '', '', '', '', 'A'),
  (210, 'Sales Producers', 'Christy Suhler', 'christys@salesproducersinc.com', '970-481-9178', 'Grand Junction', 'CO', '85107', 'Northern CO/WY', 'A'),
  (215, 'Just Got 2 Have It', 'Abby Bell', 'abby@justgot2haveit.com', '828-231-7471', 'Fletcher', 'NC', '28732', 'West NC, North SC, East TN', 'A'),
  (215, 'Just Got 2 Have It', 'Jan Barrick', 'jan@justgot2haveit.com', '615-397-8110', 'Peachtree Corners', 'GA', '30096', 'East TN, North AL, KY', 'A'),
  (215, 'Just Got 2 Have It', 'Joy Daughtry', 'joy@justgot2haveit.com', '919-619-1344', 'Brentwood', 'TN', '37027', 'East NC', 'A'),
  (215, 'Just Got 2 Have It', 'Julie Ann Maszy', 'julieann@justgot2haveit.com', '904-728-7620', 'Miami', 'FL', '33156', 'South GA, North FL', 'A'),
  (215, 'Just Got 2 Have It', 'Irina Burns', 'irina@justgot2haveit.com', '404-285-2576', 'Durham', 'NC', '27705', 'North GA', 'A'),
  (215, 'Just Got 2 Have It', 'Jocelyn MacNair', 'jocelyn@justgot2haveit.com', '305-984-5857', 'Jacksonville', 'FL', '32202', 'South FL', 'A'),
  (215, 'Just Got 2 Have It', 'Rebecca Zamora', 'rebecca@justgot2haveit.com', '626-353-9081', 'Winter Garden', 'FL', '34787', 'Central and SW FL', 'A'),
  (215, 'Just Got 2 Have It', 'Kim Shikle', 'kshikle@justgot2haveit.com', '901-647-5220', 'Fairhope', 'AL', '36532', 'MS. West TN', 'A'),
  (215, 'Just Got 2 Have It', 'Tim Gross', 'tim@justgot2haveit.com', '843-276-2971', 'Charleston', 'SC', '29405', 'South SC, SE GA', 'A'),
  (215, 'Just Got 2 Have It', 'Trish Ahrendt', 'trish@justgot2haveit.com', '334-462-4780', 'Deatsville', 'AL', '36022', 'Central AL, Panhandle FL', 'A'),
  (215, 'Just Got 2 Have It', 'Katie Gale', 'katie@justgot2haveit.com', '205-504-6826 (p)', 'Orange Beach', 'AL', '36561', 'GIFT SALES MANAGER', 'Cat+'),
  (215, 'Just Got 2 Have It', 'Michael Claussen', 'mclaussen@justgot2haveit.com', '314-459-2659', 'Barnhart', 'MO', '63012', 'Missouri', 'Cat'),
  (215, 'Just Got 2 Have It', 'Jackie Miller', 'jackie@justgot2haveit.com', '816-550-6652 (c)', 'Fairway', 'KS', '66205', 'Nebraska Western Iowa', 'A'),
  (215, 'Just Got 2 Have It', 'Jan Sage', 'jsage@justgot2haveit.com', '515-238-4092 (c)', 'Des Moines', 'IA', '50320', 'Iowa', 'A'),
  (215, 'Just Got 2 Have It', 'Mark Coulter', 'mcoulter@justgot2haveit.com', '314-368-2398', 'Barnhart', 'MO', '63012', 'Kansas', 'A'),
  (215, 'Just Got 2 Have It', 'Tim Boyd', 'timboyd@justgot2haveit.com', '404-493-3195 (p)', 'Atlanta', 'GA', '30308', 'KEY ACCOUNT', '2 catalogs'),
  (215, 'Just Got 2 Have It', 'Carla Frost', 'carla@justgot2haveit.com', '404-291-8370 (p)', 'Marietta', 'GA', '30068', 'KEY ACCOUNT', '2 catalogs'),
  (215, 'Just Got 2 Have It', 'Roger Bunn', 'rogerwbunn@gmail.com', '718-564-4653 (p)', 'Brooklyn', 'NY', '11201', 'KEY ACCOUNT', '2catalogs'),
  (215, 'Just Got 2 Have It', 'Lysa Buckner', 'lysa@justgot2haveit.com', '754-234-4748 (p)', 'Raleigh', 'NC', '27615', 'International', '2 catalogs'),
  (215, 'Just Got 2 Have It', 'Al Hattendorf', 'al@justgot2haveit.com', '703-599-7549 (P)', 'Oceanside', 'CA', '92056', 'KEY ACCOUNT', '2 catalogs'),
  (215, 'Just Got 2 Have It', 'Michelle Morgan', 'michelle@justgot2haveit.com', '678-522-4968 (p)', 'Pensacola', 'FL', '32507', 'Principal', '2 catalogs'),
  (215, 'Just Got 2 Have It', 'Alison Blackmore', 'alison@justgot2haveit.com', '281-684-1771 (p)', 'Avon', 'CT', '06001', 'VP Sales Operations', '2 catalogs'),
  (215, 'Just Got 2 Have It', 'Marla Boyd', 'maria@justgot2haveit.com', '904-874-5819 (p)', 'Jacksonville', 'FL', '32225', 'SE/MINK Sales Manager', 'catalog')
) as v(agency_code, agency, name, email, phone, city, state, zip, territory, samples)
where not exists (select 1 from sales_reps);

alter table sales_reps enable row level security;

drop policy if exists "read sales_reps"  on sales_reps;
drop policy if exists "write sales_reps" on sales_reps;

create policy "read sales_reps" on sales_reps
  for select to authenticated
  using (true);

create policy "write sales_reps" on sales_reps
  for all to authenticated
  using (true)
  with check (true);
