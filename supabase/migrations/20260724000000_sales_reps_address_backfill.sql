-- Backfill street addresses onto the rep roster.
--
-- 20260722005000 added the `address` column but defaulted every row to '' —
-- the actual street lines (from the master roster spreadsheet) were never
-- loaded. This fills them in.
--
-- Matched on (agency_code, name): the roster has no other stable key (emails
-- repeat, e.g. the two Fowles share ctfowles@gmail.com). Only rows whose
-- address is still blank are touched, so an address typed through the /sales-team
-- form is never overwritten, and re-running is a no-op. Rows the match misses
-- (a name edited in the UI, say) simply keep their blank address and can be
-- filled from the form.

update sales_reps s
set address = v.address,
    updated_at = now()
from (values
  -- 101 Blonde Comet
  (101, 'Tana Erickson',        '8941 Audubon Rd'),
  (101, 'Karri Kearin',         '14829 64th Place N'),
  (101, 'Jill Rowley',          '912 E 4th Ave'),
  (101, 'Meg Brownson',         '1512 Linden Street West'),
  (101, 'Sue Ferlita',          '3966 Arlene Court'),
  (101, 'Angela Schumacher',    '3520 County Road 101'),
  (101, 'Jeanne Kenney',        '139 Dunlap Street North'),
  (101, 'Jill Hauch',           '8167 Arrowwood Lane'),
  (101, 'Judy Schierman',       '4735 Kent Street'),
  (101, 'Molly Swenson',        '8581 Mission Hills Lane'),
  (101, 'Karen VanMeter',       '12445 Destin Loop'),
  (101, 'Jennifer Calhoun',     '405 South Olde Oneida'),
  -- 111 Hofstedt
  (111, 'Julie Hofstedt',       '674 Minnow Lane NE'),
  -- 178 GMA
  (178, 'Gretchen Mathey',      '7426 Cottonwood Drive'),
  (178, 'Jenni Dahlinghaus',    '224 S. Garfield Street'),
  (178, 'Corey Fowles',         '10986 Fawn Madow Lane'),
  (178, 'Ted Fowles',           '10986 Fawn Madow Lane'),
  (178, 'Stephanie Lark',       '2690 Northmont Drive'),
  -- 183 Jim Dedricks Assoc
  (183, 'Jim Dedricks',         '4624 North Haymeadow Avenue'),
  (183, 'Bryce Alvarado',       '864 Hunt Avenue'),
  (183, 'Josh Broek',           '6340 Thornhill Court'),
  -- 190 Keith Smith
  (190, 'KERRY SMITH',          'Dallas World Trade Center'),
  (190, 'JANET SMITH',          '2050 N. Stemmons Fwy Suite 200'),
  (190, 'KELLY BURNS',          '2050 N. Stemmons Fwy Suite 200'),
  (190, 'Tanya Day',            '689 Redoak Drive'),
  (190, 'Deborah Vinson',       '3446 Magazine Street'),
  (190, 'Lora Frazier',         '706 Main Street'),
  (190, 'Cipres Guillermo',     '11419 Chaucer Drive'),
  (190, 'Dina Shaw',            '1343 Doss Loop'),
  (190, 'Marsha Waugh',         '3733 Ashford Ave'),
  (190, 'Mary Lazauskas',       '11 Box Turtle Lane'),
  -- 200 Seward Associates
  (200, 'Carol Seward Paltsios','19 Shipley Circle'),
  (200, 'Craig Seward',         '8 Old Farm Way'),
  (200, 'Christine Kurmaskie',  '463 East Center Street'),
  (200, 'Dawn Kirlin',          '651 Dennison Pond Road'),
  (200, 'Caitlyn Paltsios',     '19 Shipley Circle'),
  (200, 'Mariann Miceli',       '56 Phillips Street'),
  (200, 'Shirley J. Gratkowski','6 Winterberry Lane'),
  -- 210 Sales Producers
  (210, 'Paula Anderson',       '7973 E. Snakeroot Drive'),
  (210, 'Annie Ledford',        '48431 Indian Trails Road'),
  (210, 'April Dohm',           '4516 8th Avenue'),
  (210, 'Diane Jose',           '1549 Rosemere Court'),
  (210, 'Gigi Grande',          '4726 Nomad Drive'),
  (210, 'Judy Chesley',         '3712 Hackett Ave'),
  (210, 'Karen Hogenauer',      '1007 Oro Street'),
  (210, 'Laura Solano',         '14065 Glenn Pines Road'),
  (210, 'Patrick Council',      '14404 Glorietta Drive'),
  (210, 'Karen Hughes',         '3727 N. Mill Ridge Ave'),
  (210, 'Marianne Welch',       '18 Granada Place'),
  (210, 'Kelly Oaks',           '1394 Graham Farm Circle'),
  (210, 'Clark Gulliford',      '10308 George Hart Ct'),
  (210, 'Michelle Cox',         '3244 E. Burnshide Street'),
  (210, 'Sally McGee',          '515 Coronado Street'),
  (210, 'Stella Lynch',         '107 Via Del Cerrito'),
  (210, 'Jamee Brandt',         '24265 La Montura Drive'),
  (210, 'Mady Bradley',         '2915 South Southwind Drive'),
  (210, 'Lindsay De Oliverira', '133 Spring Forest Drive'),
  (210, 'Christy Suhler',       '636 Margarita Dr'),
  -- 215 Just Got 2 Have It
  (215, 'Abby Bell',            '1 Summer Breeze Drive'),
  (215, 'Jan Barrick',          '3625 Scotts Mill Run'),
  (215, 'Joy Daughtry',         '905 East Moran Road'),
  (215, 'Julie Ann Maszy',      '12450 Pine Needle Lane'),
  (215, 'Irina Burns',          '2716 Ferrand Drive'),
  (215, 'Jocelyn MacNair',      '400 East Bay Street, #307'),
  (215, 'Rebecca Zamora',       '400 N. Main Street'),
  (215, 'Kim Shikle',           '16233 Tigris Road'),
  (215, 'Tim Gross',            '4718 Lang Ridge Drive'),
  (215, 'Trish Ahrendt',        '685 Myrick Road'),
  (215, 'Katie Gale',           '27514 Park Drive'),
  (215, 'Michael Claussen',     '2239 Dierks Lane'),
  (215, 'Jackie Miller',        '5757 Windsor Circle'),
  (215, 'Jan Sage',             '3515 Evergreen Ave'),
  (215, 'Mark Coulter',         '2239 Dierks Lane'),
  (215, 'Tim Boyd',             '631 Myrtle Street NE #7'),
  (215, 'Carla Frost',          '2387 Monterey Drive'),
  (215, 'Roger Bunn',           '100 Remsen Street 6-G'),
  (215, 'Lysa Buckner',         '8309 Mourning Dove Rd.'),
  (215, 'Al Hattendorf',        '3240 Carr Drive'),
  (215, 'Michelle Morgan',      '16306 N Shore Dr'),
  (215, 'Alison Blackmore',     '8 Churchill Place'),
  (215, 'Marla Boyd',           '12885 Dunes Lakes Terrace')
) as v(agency_code, name, address)
where s.agency_code = v.agency_code
  and s.name = v.name
  and s.address = '';
