-- Seed daily trivia facts and quiz questions.
-- This content lived only in the original project's database (not in earlier
-- migrations), so a freshly-provisioned project had empty trivia_facts /
-- quiz_questions — leaving the dashboard trivia card stuck on "Loading…" and
-- quiz progress at 0/0. Idempotent: safe to re-run.

-- ---------- Daily trivia facts ----------
INSERT INTO public.trivia_facts (title, body)
SELECT v.title, v.body
FROM (VALUES
  ('Biggest World Cup ever', '2026 is the first World Cup with 48 teams — up from 32 — and the first co-hosted by three nations: Canada, Mexico, and the USA.'),
  ('A record 104 matches', 'The expanded 48-team format produces 104 matches, well up from the 64 played in recent tournaments.'),
  ('Mexico makes history', 'Mexico becomes the first country to host (or co-host) the men''s World Cup three times — after 1970 and 1986.'),
  ('The final at MetLife', 'The 2026 final is scheduled for MetLife Stadium in East Rutherford, New Jersey, on July 19, 2026.'),
  ('It opens in Mexico City', 'The opening match is set for the iconic Estadio Azteca in Mexico City — itself a multi-time World Cup venue.'),
  ('16 host cities', 'Matches span 16 host cities: 11 in the USA, 3 in Mexico, and 2 in Canada.'),
  ('Canada''s first', 'It is the first time Canada hosts men''s World Cup matches, with games in Toronto and Vancouver.'),
  ('Brazil''s record', 'Brazil are the most successful nation in World Cup history with five titles: 1958, 1962, 1970, 1994 and 2002.'),
  ('12 groups of 4', 'The 48 teams are drawn into 12 groups of four; the top two from each group plus the eight best third-placed teams advance.'),
  ('Defending champions', 'Argentina enter as defending champions after winning the 2022 final against France on penalties.'),
  ('Ever-present Brazil', 'Brazil is the only nation to have played at every World Cup since the first tournament in 1930.'),
  ('Across the continent', 'With venues from Vancouver to Mexico City to the US East Coast, 2026 spans multiple time zones across North America.')
) AS v(title, body)
WHERE NOT EXISTS (SELECT 1 FROM public.trivia_facts t WHERE t.title = v.title);

-- ---------- Quiz questions ----------
INSERT INTO public.quiz_questions (tier, question, options, correct_index, explanation)
SELECT v.tier::public.quiz_tier, v.question, v.options::jsonb, v.correct_index, v.explanation
FROM (VALUES
  -- Beginner
  ('beginner', 'How many teams play in the 2026 World Cup?', '["32","40","48","64"]', 2, '2026 is the first 48-team World Cup.'),
  ('beginner', 'Which trio of nations co-hosts the 2026 World Cup?', '["USA, Mexico, Canada","USA, Canada, Brazil","Mexico, USA, Argentina","Canada, USA, Jamaica"]', 0, 'Canada, Mexico and the USA share hosting duties.'),
  ('beginner', 'How many players from each team are on the pitch at kickoff?', '["9","10","11","12"]', 2, 'Eleven players per side, including the goalkeeper.'),
  ('beginner', 'How is play restarted after the ball fully crosses the touchline?', '["Corner kick","Throw-in","Goal kick","Penalty"]', 1, 'A throw-in restarts play from the touchline.'),
  -- Professional
  ('professional', 'Which country has won the most World Cups?', '["Germany","Brazil","Italy","Argentina"]', 1, 'Brazil have five titles, more than any other nation.'),
  ('professional', 'Where is the 2026 World Cup final scheduled?', '["MetLife Stadium","Rose Bowl","Estadio Azteca","SoFi Stadium"]', 0, 'The final is at MetLife Stadium in New Jersey.'),
  ('professional', 'How many matches will be played at the 2026 World Cup?', '["64","80","104","128"]', 2, 'The 48-team format produces 104 matches.'),
  ('professional', 'Who won the 2022 World Cup?', '["France","Argentina","Croatia","Brazil"]', 1, 'Argentina beat France on penalties in the 2022 final.'),
  -- Expertise
  ('expertise', 'Mexico becomes the first nation to host the men''s World Cup how many times?', '["Two","Three","Four","Five"]', 1, 'After 1970 and 1986, 2026 is Mexico''s third.'),
  ('expertise', 'Which stadium is set to host the 2026 opening match?', '["Estadio Azteca","MetLife Stadium","BC Place","AT&T Stadium"]', 0, 'The opener is at Estadio Azteca in Mexico City.'),
  ('expertise', 'Which nation has appeared at every World Cup since 1930?', '["Germany","Italy","Brazil","Argentina"]', 2, 'Brazil is the only ever-present nation.'),
  ('expertise', 'In the 2026 group stage, how many groups are there?', '["8","10","12","16"]', 2, 'Twelve groups of four teams each.')
) AS v(tier, question, options, correct_index, explanation)
WHERE NOT EXISTS (SELECT 1 FROM public.quiz_questions q WHERE q.question = v.question);
