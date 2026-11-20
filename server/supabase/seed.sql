-- Durban starter guide (sample data: verify and curate before launch).
insert into public.guide_items (id, city, name, category, area, description, best_slots, est_cost) values
  ('g-giba', 'Durban', 'Giba Gorge trail run or ride', 'outdoors', 'Pinetown', 'Marked MTB and trail-running routes through the gorge. Go early before the heat.', array['sat-am', 'sun-am']::text[], 100),
  ('g-promenade', 'Durban', 'Golden Mile promenade walk and coffee', 'outdoors', 'Beachfront', 'Sunrise walk or cycle along the beachfront promenade, coffee at the end.', array['sat-am', 'sun-am']::text[], 60),
  ('g-umhlanga', 'Durban', 'Umhlanga lighthouse and pier walk', 'outdoors', 'Umhlanga', 'Easy promenade walk past the lighthouse and Whalebone Pier.', array['sat-am', 'sun-pm']::text[], 0),
  ('g-botanic', 'Durban', 'Picnic at the Durban Botanic Gardens', 'outdoors', 'Berea', 'Shaded lawns for a long picnic; bring a blanket and a game.', array['sat-pm', 'sun-pm']::text[], 80),
  ('g-mosesm', 'Durban', 'Moses Mabhida Stadium SkyCar or Big Swing', 'events', 'Stamford Hill', 'City views from the arch; the swing is for the brave.', array['sat-pm', 'sun-pm']::text[], 150),
  ('g-florida', 'Durban', 'Dinner on Florida Road', 'food', 'Morningside', 'Strip of restaurants and bars; book ahead for groups of 6+.', array['fri-pm', 'sat-pm']::text[], 250),
  ('g-bunny', 'Durban', 'Bunny chow crawl', 'food', 'City centre', 'Split quarter bunnies across two or three spots and vote on the best.', array['sat-pm', 'sun-pm', 'fri-pm']::text[], 120),
  ('g-brunch', 'Durban', 'Sunday brunch in Glenwood', 'food', 'Glenwood', 'Relaxed cafés that handle small groups well.', array['sun-am', 'sat-am']::text[], 180),
  ('g-braai', 'Durban', 'Braai at someone''s place', 'celebrate', 'Anywhere', 'Everyone brings something; the companion tracks who brings what.', array['sat-pm', 'sun-pm']::text[], 100),
  ('g-5aside', 'Durban', '5-a-side football', 'sport', 'Varies', 'Book an indoor or outdoor pitch for an hour; split the court fee.', array['weeknight', 'sat-am']::text[], 60),
  ('g-parkrun', 'Durban', 'Saturday parkrun', 'sport', 'Various parks', 'Free timed 5 km, every Saturday morning. Coffee after.', array['sat-am']::text[], 0),
  ('g-padel', 'Durban', 'Padel doubles', 'sport', 'Umhlanga / Ballito', 'Courts book by the hour; four players per court.', array['weeknight', 'sat-am', 'sun-am']::text[], 150),
  ('g-ushaka', 'Durban', 'uShaka Marine World day', 'events', 'Point', 'Aquarium and water park; best for a full-day group outing.', array['sat-am', 'sun-am']::text[], 300),
  ('g-market', 'Durban', 'Weekend food market', 'events', 'Various', 'Street food, music and stalls. Check this week''s market before going.', array['sat-am', 'sun-am', 'fri-pm']::text[], 150),
  ('g-comedy', 'Durban', 'Comedy or live music night', 'events', 'Various', 'Check this week''s listings; buy tickets together.', array['fri-pm', 'sat-pm']::text[], 200),
  ('g-bday', 'Durban', 'Birthday dinner with a booked table', 'celebrate', 'Your pick', 'Lock the date first, then the venue; the companion collects RSVPs.', array['fri-pm', 'sat-pm']::text[], 300)
on conflict (id) do update set name = excluded.name, description = excluded.description, best_slots = excluded.best_slots, est_cost = excluded.est_cost;
