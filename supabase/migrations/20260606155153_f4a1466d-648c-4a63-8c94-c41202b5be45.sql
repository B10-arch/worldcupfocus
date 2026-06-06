
-- Add time_tbc column for matches without confirmed kickoff time
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS time_tbc BOOLEAN NOT NULL DEFAULT false;

-- Wipe dependent data (old wrong teams/matches/bets)
DELETE FROM public.quiz_progress;
DELETE FROM public.bets;
DELETE FROM public.matches;
DELETE FROM public.teams;

-- Insert 48 confirmed teams in 12 groups (A-L)
INSERT INTO public.teams (code, name, flag_emoji, group_name, fifa_rank, coach, wc_form, squad) VALUES
('MEX','Mexico','🇲🇽','A',18,'Javier Aguirre','Co-host. 17 WC appearances; best finish QF (1970, 1986).','{}'),
('KOR','South Korea','🇰🇷','A',23,'Hong Myung-bo','11 WCs; semi-final 2002.','{}'),
('RSA','South Africa','🇿🇦','A',56,'TBC','3rd WC; hosted 2010.','{}'),
('CZE','Czechia','🇨🇿','A',42,'Ivan Hašek','Returning to the WC.','{}'),
('CAN','Canada','🇨🇦','B',47,'Jesse Marsch','Co-host. 3rd WC.','{}'),
('SUI','Switzerland','🇨🇭','B',20,'Murat Yakin','12 WCs; R16 in 2014, 2018, 2022.','{}'),
('QAT','Qatar','🇶🇦','B',54,'TBC','2nd WC; hosted 2022.','{}'),
('BIH','Bosnia and Herzegovina','🇧🇦','B',74,'Sergej Barbarez','2nd WC (debut 2014).','{}'),
('BRA','Brazil','🇧🇷','C',5,'Carlo Ancelotti','5× champions (1958, 62, 70, 94, 02). Only nation at every WC.','{}'),
('MAR','Morocco','🇲🇦','C',14,'Walid Regragui','Semi-final 2022 — first African nation.','{}'),
('SCO','Scotland','🏴󠁧󠁢󠁳󠁣󠁴󠁿','C',39,'Steve Clarke','First WC since 1998.','{}'),
('HAI','Haiti','🇭🇹','C',83,'TBC','2nd WC; first since 1974.','{}'),
('USA','United States','🇺🇸','D',16,'Mauricio Pochettino','Co-host. 11 WCs; semi-final 1930.','{}'),
('PAR','Paraguay','🇵🇾','D',37,'Gustavo Alfaro','9th WC; QF in 2010.','{}'),
('AUS','Australia','🇦🇺','D',26,'Tony Popovic','7th WC; R16 in 2006 & 2022.','{}'),
('TUR','Türkiye','🇹🇷','D',26,'Vincenzo Montella','Returning to the WC; 3rd place 2002.','{}'),
('GER','Germany','🇩🇪','E',9,'Julian Nagelsmann','4× champions (1954, 74, 90, 2014).','{}'),
('ECU','Ecuador','🇪🇨','E',32,'Sebastián Beccacece','5th WC.','{}'),
('CIV','Ivory Coast','🇨🇮','E',41,'Emerse Faé','4th WC.','{}'),
('CUW','Curaçao','🇨🇼','E',82,'Dick Advocaat','WC debut.','{}'),
('NED','Netherlands','🇳🇱','F',7,'Ronald Koeman','11 WCs; 3× runners-up.','{}'),
('JPN','Japan','🇯🇵','F',17,'Hajime Moriyasu','8th WC; R16 in 2002, 10, 18, 22.','{}'),
('TUN','Tunisia','🇹🇳','F',45,'Sami Trabelsi','7th WC.','{}'),
('SWE','Sweden','🇸🇪','F',43,'TBC','13 WCs; runners-up 1958.','{}'),
('BEL','Belgium','🇧🇪','G',8,'Rudi Garcia','14 WCs; 3rd place 2018.','{}'),
('EGY','Egypt','🇪🇬','G',36,'Hossam Hassan','4th WC.','{}'),
('IRN','Iran','🇮🇷','G',23,'Amir Ghalenoei','7th WC.','{}'),
('NZL','New Zealand','🇳🇿','G',86,'Darren Bazeley','3rd WC.','{}'),
('ESP','Spain','🇪🇸','H',3,'Luis de la Fuente','Champions 2010. 16 WCs.','{}'),
('URU','Uruguay','🇺🇾','H',13,'Marcelo Bielsa','2× champions (1930, 1950). 15 WCs.','{}'),
('KSA','Saudi Arabia','🇸🇦','H',58,'Hervé Renard','7th WC.','{}'),
('CPV','Cape Verde','🇨🇻','H',70,'Bubista','WC debut.','{}'),
('FRA','France','🇫🇷','I',2,'Didier Deschamps','2× champions (1998, 2018). 16 WCs.','{}'),
('SEN','Senegal','🇸🇳','I',19,'Pape Thiaw','4th WC; R16 in 2002 & 2022.','{}'),
('NOR','Norway','🇳🇴','I',38,'Ståle Solbakken','First WC since 1998.','{}'),
('IRQ','Iraq','🇮🇶','I',57,'Graham Arnold','First WC since 1986.','{}'),
('ARG','Argentina','🇦🇷','J',1,'Lionel Scaloni','Defending champions (2022). 3× champions (1978, 86, 2022).','{}'),
('AUT','Austria','🇦🇹','J',24,'Ralf Rangnick','8th WC.','{}'),
('ALG','Algeria','🇩🇿','J',34,'Vladimir Petković','5th WC.','{}'),
('JOR','Jordan','🇯🇴','J',64,'Jamal Sellami','WC debut.','{}'),
('POR','Portugal','🇵🇹','K',6,'Roberto Martínez','8th WC; semi-final 1966 & 2006.','{}'),
('COL','Colombia','🇨🇴','K',12,'Néstor Lorenzo','7th WC.','{}'),
('UZB','Uzbekistan','🇺🇿','K',57,'Timur Kapadze','WC debut.','{}'),
('COD','DR Congo','🇨🇩','K',55,'Sébastien Desabre','3rd WC.','{}'),
('ENG','England','🏴󠁧󠁢󠁥󠁮󠁧󠁿','L',4,'Thomas Tuchel','Champions 1966. 16 WCs.','{}'),
('CRO','Croatia','🇭🇷','L',11,'Zlatko Dalić','Runners-up 2018; 3rd 2022.','{}'),
('GHA','Ghana','🇬🇭','L',73,'Otto Addo','5th WC; QF 2010.','{}'),
('PAN','Panama','🇵🇦','L',46,'Thomas Christiansen','2nd WC.','{}');

-- Generate 72 group-stage match slots (round-robin per group, all marked TBC except 4 confirmed below)
DO $$
DECLARE
  g TEXT;
  groups TEXT[] := ARRAY['A','B','C','D','E','F','G','H','I','J','K','L'];
  team_ids UUID[];
  pairs INT[][] := ARRAY[[1,2],[3,4],[1,3],[2,4],[1,4],[2,3]];
  p INT[];
  default_kick TIMESTAMPTZ := '2026-06-20 12:00:00+00';
BEGIN
  FOREACH g IN ARRAY groups LOOP
    SELECT array_agg(id ORDER BY code) INTO team_ids FROM public.teams WHERE group_name = g;
    FOREACH p SLICE 1 IN ARRAY pairs LOOP
      INSERT INTO public.matches (team_a_id, team_b_id, group_name, stage, kickoff_utc, status, time_tbc, venue)
      VALUES (team_ids[p[1]], team_ids[p[2]], g, 'group', default_kick, 'scheduled', true, NULL);
    END LOOP;
  END LOOP;
END $$;

-- Confirmed opening fixtures (NPT = UTC + 5:45)
UPDATE public.matches SET kickoff_utc='2026-06-11 19:00:00+00', time_tbc=false, venue='Estadio Azteca, Mexico City'
WHERE stage='group' AND group_name='A'
  AND ((team_a_id=(SELECT id FROM teams WHERE code='MEX') AND team_b_id=(SELECT id FROM teams WHERE code='RSA'))
    OR (team_a_id=(SELECT id FROM teams WHERE code='RSA') AND team_b_id=(SELECT id FROM teams WHERE code='MEX')));

UPDATE public.matches SET kickoff_utc='2026-06-12 02:00:00+00', time_tbc=false, venue='Estadio Akron, Guadalajara'
WHERE stage='group' AND group_name='A'
  AND ((team_a_id=(SELECT id FROM teams WHERE code='KOR') AND team_b_id=(SELECT id FROM teams WHERE code='CZE'))
    OR (team_a_id=(SELECT id FROM teams WHERE code='CZE') AND team_b_id=(SELECT id FROM teams WHERE code='KOR')));

UPDATE public.matches SET kickoff_utc='2026-06-12 19:00:00+00', time_tbc=false, venue='BMO Field, Toronto'
WHERE stage='group' AND group_name='B'
  AND ((team_a_id=(SELECT id FROM teams WHERE code='CAN') AND team_b_id=(SELECT id FROM teams WHERE code='BIH'))
    OR (team_a_id=(SELECT id FROM teams WHERE code='BIH') AND team_b_id=(SELECT id FROM teams WHERE code='CAN')));

UPDATE public.matches SET kickoff_utc='2026-06-13 01:00:00+00', time_tbc=false, venue='SoFi Stadium, Los Angeles'
WHERE stage='group' AND group_name='D'
  AND ((team_a_id=(SELECT id FROM teams WHERE code='USA') AND team_b_id=(SELECT id FROM teams WHERE code='PAR'))
    OR (team_a_id=(SELECT id FROM teams WHERE code='PAR') AND team_b_id=(SELECT id FROM teams WHERE code='USA')));

-- Knockout placeholder slots (TBD teams, time TBC) = 32 matches → total 104
INSERT INTO public.matches (stage, kickoff_utc, status, time_tbc, venue)
SELECT 'r32', '2026-06-29 18:00:00+00', 'scheduled', true, NULL FROM generate_series(1,16);
INSERT INTO public.matches (stage, kickoff_utc, status, time_tbc, venue)
SELECT 'r16', '2026-07-05 18:00:00+00', 'scheduled', true, NULL FROM generate_series(1,8);
INSERT INTO public.matches (stage, kickoff_utc, status, time_tbc, venue)
SELECT 'qf', '2026-07-10 18:00:00+00', 'scheduled', true, NULL FROM generate_series(1,4);
INSERT INTO public.matches (stage, kickoff_utc, status, time_tbc, venue)
SELECT 'sf', '2026-07-14 18:00:00+00', 'scheduled', true, NULL FROM generate_series(1,2);
INSERT INTO public.matches (stage, kickoff_utc, status, time_tbc, venue)
VALUES ('third', '2026-07-18 18:00:00+00', 'scheduled', true, NULL);
INSERT INTO public.matches (stage, kickoff_utc, status, time_tbc, venue)
VALUES ('final', '2026-07-19 19:00:00+00', 'scheduled', true, 'MetLife Stadium, New York/New Jersey');
