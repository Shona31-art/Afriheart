import type { GuideItem } from "./types";

// Starter city guide for Durban. Sample data for the beta: descriptions and
// cost estimates are approximate and should be checked and curated weekly
// before launch (see README, "City guide").
export const GUIDE_ITEMS: GuideItem[] = [
  { id: "g-giba", city: "Durban", name: "Giba Gorge trail run or ride", category: "outdoors", area: "Pinetown",
    description: "Marked MTB and trail-running routes through the gorge. Go early before the heat.", best_slots: ["sat-am", "sun-am"], est_cost: 100 },
  { id: "g-promenade", city: "Durban", name: "Golden Mile promenade walk and coffee", category: "outdoors", area: "Beachfront",
    description: "Sunrise walk or cycle along the beachfront promenade, coffee at the end.", best_slots: ["sat-am", "sun-am"], est_cost: 60 },
  { id: "g-umhlanga", city: "Durban", name: "Umhlanga lighthouse and pier walk", category: "outdoors", area: "Umhlanga",
    description: "Easy promenade walk past the lighthouse and Whalebone Pier.", best_slots: ["sat-am", "sun-pm"], est_cost: 0 },
  { id: "g-botanic", city: "Durban", name: "Picnic at the Durban Botanic Gardens", category: "outdoors", area: "Berea",
    description: "Shaded lawns for a long picnic; bring a blanket and a game.", best_slots: ["sat-pm", "sun-pm"], est_cost: 80 },
  { id: "g-mosesm", city: "Durban", name: "Moses Mabhida Stadium SkyCar or Big Swing", category: "events", area: "Stamford Hill",
    description: "City views from the arch; the swing is for the brave.", best_slots: ["sat-pm", "sun-pm"], est_cost: 150 },
  { id: "g-florida", city: "Durban", name: "Dinner on Florida Road", category: "food", area: "Morningside",
    description: "Strip of restaurants and bars; book ahead for groups of 6+.", best_slots: ["fri-pm", "sat-pm"], est_cost: 250 },
  { id: "g-bunny", city: "Durban", name: "Bunny chow crawl", category: "food", area: "City centre",
    description: "Split quarter bunnies across two or three spots and vote on the best.", best_slots: ["sat-pm", "sun-pm", "fri-pm"], est_cost: 120 },
  { id: "g-brunch", city: "Durban", name: "Sunday brunch in Glenwood", category: "food", area: "Glenwood",
    description: "Relaxed cafés that handle small groups well.", best_slots: ["sun-am", "sat-am"], est_cost: 180 },
  { id: "g-braai", city: "Durban", name: "Braai at someone's place", category: "celebrate", area: "Anywhere",
    description: "Everyone brings something; the companion tracks who brings what.", best_slots: ["sat-pm", "sun-pm"], est_cost: 100 },
  { id: "g-5aside", city: "Durban", name: "5-a-side football", category: "sport", area: "Varies",
    description: "Book an indoor or outdoor pitch for an hour; split the court fee.", best_slots: ["weeknight", "sat-am"], est_cost: 60 },
  { id: "g-parkrun", city: "Durban", name: "Saturday parkrun", category: "sport", area: "Various parks",
    description: "Free timed 5 km, every Saturday morning. Coffee after.", best_slots: ["sat-am"], est_cost: 0 },
  { id: "g-padel", city: "Durban", name: "Padel doubles", category: "sport", area: "Umhlanga / Ballito",
    description: "Courts book by the hour; four players per court.", best_slots: ["weeknight", "sat-am", "sun-am"], est_cost: 150 },
  { id: "g-ushaka", city: "Durban", name: "uShaka Marine World day", category: "events", area: "Point",
    description: "Aquarium and water park; best for a full-day group outing.", best_slots: ["sat-am", "sun-am"], est_cost: 300 },
  { id: "g-market", city: "Durban", name: "Weekend food market", category: "events", area: "Various",
    description: "Street food, music and stalls. Check this week's market before going.", best_slots: ["sat-am", "sun-am", "fri-pm"], est_cost: 150 },
  { id: "g-comedy", city: "Durban", name: "Comedy or live music night", category: "events", area: "Various",
    description: "Check this week's listings; buy tickets together.", best_slots: ["fri-pm", "sat-pm"], est_cost: 200 },
  { id: "g-bday", city: "Durban", name: "Birthday dinner with a booked table", category: "celebrate", area: "Your pick",
    description: "Lock the date first, then the venue; the companion collects RSVPs.", best_slots: ["fri-pm", "sat-pm"], est_cost: 300 },
];

export const SLOT_HOURS: Record<string, { weekday: number; hour: number; label: string }> = {
  "fri-pm": { weekday: 5, hour: 19, label: "Friday evening" },
  "sat-am": { weekday: 6, hour: 7, label: "Saturday morning" },
  "sat-pm": { weekday: 6, hour: 15, label: "Saturday afternoon" },
  "sun-am": { weekday: 0, hour: 9, label: "Sunday morning" },
  "sun-pm": { weekday: 0, hour: 14, label: "Sunday afternoon" },
  weeknight: { weekday: 3, hour: 18, label: "Weeknight" },
};
