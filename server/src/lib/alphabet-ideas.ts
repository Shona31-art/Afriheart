// Alphabet date ideas: the styles a couple can choose, the ideas for every
// letter in each style, and the album looks. Pure data, safe anywhere.

export type DateStyle = "out" | "home" | "free" | "food" | "adventure";
export type AlbumLook = "cream" | "floral" | "midnight" | "sunny";

export const STYLES: { id: DateStyle; name: string; blurb: string }[] = [
  { id: "out", name: "Out and about", blurb: "The classic mix: places to go together." },
  { id: "home", name: "At home", blurb: "Cosy dates without leaving the house." },
  { id: "free", name: "Free and cheap", blurb: "Great dates for next to nothing." },
  { id: "food", name: "Foodie", blurb: "Something to eat or cook for every letter." },
  { id: "adventure", name: "Adventure", blurb: "Get your heart rate up." },
];

export const LOOKS: { id: AlbumLook; name: string }[] = [
  { id: "cream", name: "Cream scrapbook" },
  { id: "floral", name: "Blush florals" },
  { id: "midnight", name: "Midnight & gold" },
  { id: "sunny", name: "Sunshine" },
];

export const isStyle = (v: unknown): v is DateStyle => STYLES.some((s) => s.id === v);
export const isLook = (v: unknown): v is AlbumLook => LOOKS.some((l) => l.id === v);

// letter: out | home | free | food | adventure, ideas separated by ";"
const RAW: Record<string, string> = {
  A: "Aquarium; Art gallery; Arcade | Art night with paint and snacks; Animated movie marathon | Amble along the promenade; Afternoon in the botanical gardens | Afternoon tea; All-you-can-eat sushi | Axe throwing; Abseiling",
  B: "Bowling; Board game café; Boat ride | Bake-off at home; Blanket fort and a movie | Braai at the beach; Beach walk at sunset | Brunch; Bunny chow | Bungee jumping; Bike ride",
  C: "Cooking class; Comedy show; Coffee crawl | Cook a new recipe together; Candlelit dinner at home | Cloud watching in the park; Car karaoke | Cheese tasting; Chocolate making | Camping; Canoeing",
  D: "Drive-in movie; Dancing lesson; Dessert crawl | DIY project; Documentary night | Day trip to a small town; Draw each other | Dinner somewhere new; Dim sum | Dune boarding; Deep-sea fishing",
  E: "Escape room; Exhibition; Evening market | Eighties night: music and outfits; Egg hunt for each other | Explore a new suburb; Early sunrise walk | Early breakfast at a diner; Ethiopian food | E-bike tour; Escape the city for a hike",
  F: "Farmers market; Festival; Flea market | Fondue night; Film photos night | Frisbee in the park; Fly a kite at the beach | Frozen yoghurt; Fish and chips on the beach | Fishing trip; Forest canopy walk",
  G: "Go-karting; Golf driving range; Gallery hop | Game night; Gardening together | Geocaching; Garden picnic | Gelato; Gatsby sandwich | Gorge swing; Gliding",
  H: "Hike; Horse riding; Hidden bar hunt | Home spa night; Hot chocolate and old photos | Hammock in the park; Harbour walk | Hot chocolate crawl; Hake and chips | Hot air balloon; Hidden waterfall hunt",
  I: "Ice skating; Improv show; Indoor climbing | Indoor picnic; Instant camera photo shoot | Inner-city walking tour; I-spy road trip | Ice cream; Indian feast | Indoor skydiving; Island boat trip",
  J: "Jazz night; Jewellery making; Jumping castle park | Jigsaw puzzle; Jam session | Jog together; Journal swap | Jollof cook-off; Japanese food | Jet ski; Jungle obstacle course",
  K: "Karaoke; Knitting café; Kids' science museum | Kitchen disco; Kindness letters to each other | Kite flying; Kloof walk | Kota tasting; Korean barbecue | Kayaking; Kloofing",
  L: "Lighthouse walk; Laser tag; Live band | Lego build-off; Love letters to read later | Library date; Lookout point at sunset | Lunch at a farm stall; Late-night pizza | Learn to surf; Long trail run",
  M: "Mini golf; Museum; Murder mystery dinner | Movie marathon; Massage night | Market stroll; Make each other a playlist | Milkshake crawl; Mexican night | Mountain biking; Microlight flight",
  N: "Night market; Nature reserve; Neon bowling | Netflix and snacks; Nineties night | Night drive with the windows down; Nature walk | Noodle bar; Nachos and a game | Night hike; Nature trail run",
  O: "Open mic night; Outdoor cinema; Observatory visit | Origami evening; Old photos night | Ocean swim; Open-air concert in the park | Oysters; Omelette breakfast in bed | Orienteering; Off-road drive",
  P: "Picnic; Pottery; Photo booth; Putt-putt | Pyjama day; Pizza from scratch | People watching; Pier walk | Pancake breakfast; Pizza crawl | Paragliding; Paddleboarding",
  Q: "Quiz night; Quirky museum | Quiz each other; Quilt fort and a movie | Quiet morning walk; Question game in the park | Quick-fire food tour; Quesadilla night | Quad biking; Quest: treasure hunt across the city",
  R: "Roller skating; Rooftop drinks; Record shop browse | Recreate your first date; Read to each other | Road trip; Rock pooling | Ramen; Rooibos tasting | Rock climbing; River rafting",
  S: "Sunrise on the beach; Spa day; Salsa class | Spa night; Scrapbook night | Stargazing; Sunset spot hunt | Sushi; Sunday roast | Scavenger hunt; Shark cage diving",
  T: "Thrift shopping; Theatre; Trampoline park | Takeaway and a TV series; Tea tasting | Tidal pool swim; Tour your own city | Tapas; Taco night | Tree-top canopy tour; Trail run",
  U: "Unplugged day, no phones; Uber to somewhere random; Underground cave tour | Ukulele lesson online; Upside-down day: dessert first | Uphill walk to a view; Unplanned day | Ultimate burger hunt; Udon noodles | Underwater snorkelling; Ultimate frisbee",
  V: "Volunteer together; Vineyard picnic; Virtual reality arcade | Vision board night; Video game night | Volleyball on the beach; Viewpoint picnic | Vegan cook-off; Vietnamese food | Via ferrata climb; Vertical rope course",
  W: "Waterfall walk; Walking tour; Wildlife park | Write a song together; Wellness day | Window shopping; Walk somewhere new | Waffles; Wine tasting | Wakeboarding; Whale watching",
  X: "X marks the spot treasure hunt; eXhibition opening | Xbox tournament; Xmas in any month | eXplore somewhere new; X marks the spot photo walk | eXotic fruit tasting; XL pizza challenge | Xtreme sports day; X-country cycle",
  Y: "Yoga class; Yacht cruise; Yesteryear vintage market | Yes day; YouTube tutorial challenge | Yoga in the park; Yard sale browsing | Yoghurt parfait breakfast; Yakitori | Yacht sailing lesson; Yellowwood forest hike",
  Z: "Zoo; Zumba class; Zen garden visit | Zero-screen evening; Zen night: candles and calm | Zero-waste picnic; Zigzag walk: flip a coin at every corner | Za'atar flatbread cook-off; Zesty lemon dessert bake | Zip-line; Zorbing",
};

const ORDER: DateStyle[] = ["out", "home", "free", "food", "adventure"];

export const IDEAS: Record<string, Record<DateStyle, string[]>> = Object.fromEntries(
  Object.entries(RAW).map(([letter, row]) => {
    const groups = row.split("|").map((g) => g.split(";").map((x) => x.trim()).filter(Boolean));
    return [letter, Object.fromEntries(ORDER.map((s, i) => [s, groups[i]])) as Record<DateStyle, string[]>];
  }),
);

export const firstIdea = (letter: string, style: DateStyle) => IDEAS[letter][style][0];
export const allIdeas = (letter: string) => ORDER.flatMap((s) => IDEAS[letter][s]);
