// Tidewell game data. Everything tunable lives here as plain tables so it can be
// exported to JSON for the Unity version later (see tools/export-data.mjs).

export const VERSION = '0.1.70';
export const VERSION_LABEL = 'BETA v' + VERSION;

// Rarity tiers (decision 36). `weight` is the base chance per bite with worms.
export const RARITY = {
  common:    { label: 'Common',     color: '#8a8f98', weight: 62 },
  uncommon:  { label: 'Uncommon',   color: '#4caf50', weight: 25 },
  rare:      { label: 'Rare',       color: '#3e8fe0', weight: 10 },
  super:     { label: 'Super rare', color: '#a05bc4', weight: 1.0 },
  legendary: { label: 'Legendary',  color: '#e8a21c', weight: 0.12 },
};

// Bait (Fishel's shop). Better bait shifts the odds toward rarer fish (replaces cast power).
// `mult` multiplies each rarity's weight; `bite` is the wait range in seconds before a bite.
// The rod uses your best bait first. FISHING (try/fishing): the bare hook is gone, no bait means no cast;
// the worm bucket by Fishel's stall (BAIT_HELP) make sure nobody gets stuck.
export const BAIT = {
  worm:   { name: 'Worms',     mult: { common: 1, uncommon: 1, rare: 1, super: 1, legendary: 1 },           bite: [2, 4.5] },
  shrimp: { name: 'Shrimp',    mult: { common: 0.7, uncommon: 1.2, rare: 2.2, super: 1.8, legendary: 1.6 }, bite: [1.2, 3] },
  lure:   { name: 'Glow Lure', mult: { common: 0.4, uncommon: 0.8, rare: 1.6, super: 7, legendary: 12 },   bite: [1.5, 3.5] },
};
export const BAIT_ORDER = ['lure', 'shrimp', 'worm'];   // best first
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'super', 'legendary'];
export const BAIT_HELP = { giftWorms: 5, bucketMax: 5, bucketMinutes: 10 };   // the bucket by Fishel grows 1 worm per bucketMinutes (giftWorms: his old daily pack, gone since v0.1.61)

// Places to fish (try/fishing). `tab` groups them in the fish book.
export const PLACES = {
  beach: { name: 'Beach', tab: 'sea',   icon: 'wave' },
  dock:  { name: 'Dock',  tab: 'sea',   icon: 'dock' },
  river: { name: 'River', tab: 'river', icon: 'river' },
  lake:  { name: 'Lake',  tab: 'lake',  icon: 'pond' },
};

// Fish. `model` is a fish model name, `tint` recolors it, `len` is a typical length in meters.
// `place` is where it bites (PLACES). `times` limits when (morning / day / evening / night); empty = any time.
// Seasons are mostly soft (Mac): `season` multiplies the odds in those seasons; `only` is the rare strict case.
// `rain` multiplies the odds while it rains; no fish needs rain (decision 75).
// The first four stay common/uncommon sea-style fish: the ambient jumps use them.
export const FISH = [
  { id: 'minnow',    name: 'Silver Minnow',  rarity: 'common',    price: 8,   model: 'Fish1',     tint: '#c9d3dc', len: 0.32, place: 'beach', times: [] },
  { id: 'sunfish',   name: 'Sunfish',        rarity: 'common',    price: 10,  model: 'Fish2',     tint: '#f2c14e', len: 0.38, place: 'beach', times: [] },
  { id: 'perch',     name: 'Blue Perch',     rarity: 'uncommon',  price: 18,  model: 'Fish3',     tint: '#4f86c6', len: 0.42, place: 'river', times: [] },
  { id: 'bass',      name: 'Harbor Bass',    rarity: 'uncommon',  price: 22,  model: 'Fish1',     tint: '#6c9a4f', len: 0.5,  place: 'dock',  times: [] },
  { id: 'snapper',   name: 'Coral Snapper',  rarity: 'rare',      price: 45,  model: 'Fish2',     tint: '#e2614b', len: 0.55, place: 'beach', times: ['morning', 'day'] },
  { id: 'moontrout', name: 'Moon Trout',     rarity: 'rare',      price: 55,  model: 'Fish3',     tint: '#b8b6e8', len: 0.58, place: 'dock',  times: ['evening', 'night'], rain: 1.5 },
  { id: 'reefshark', name: 'Reef Shark',     rarity: 'super',     price: 300, model: 'Shark',     tint: null,      len: 1.3,  place: 'dock',  times: [] },
  { id: 'manta',     name: 'Manta Ray',      rarity: 'legendary', price: 800, model: 'Manta_ray', tint: null,      len: 1.5,  place: 'dock',  times: [] },
  // try/fishing: more species from the same five models, recolored (the book is built to take more later)
  { id: 'clown',     name: 'Tangerine Clown', rarity: 'uncommon', price: 20,  model: 'Fish3',     tint: '#f08a3c', len: 0.24, place: 'beach', times: [], season: { Summer: 2 } },
  { id: 'mackerel',  name: 'Blue Mackerel',  rarity: 'common',    price: 11,  model: 'Fish1',     tint: '#5d8fd6', len: 0.4,  place: 'dock',  times: [] },
  { id: 'angel',     name: 'Royal Angelfish', rarity: 'rare',     price: 60,  model: 'Fish2',     tint: '#8e6ad8', len: 0.36, place: 'dock',  times: ['morning', 'day'], season: { Spring: 2, Summer: 2 } },
  { id: 'dace',      name: 'River Dace',     rarity: 'common',    price: 9,   model: 'Fish1',     tint: '#b7a66a', len: 0.22, place: 'river', times: [] },
  { id: 'trout',     name: 'Speckled Trout', rarity: 'uncommon',  price: 24,  model: 'Fish1',     tint: '#d98f8f', len: 0.48, place: 'river', times: [], rain: 1.5, rocks: 3 },
  { id: 'salmon',    name: 'Fall Salmon',    rarity: 'rare',      price: 70,  model: 'Fish1',     tint: '#d9483b', len: 0.8,  place: 'river', times: [], only: 'Fall', rocks: 3 },
  { id: 'darter',    name: 'Golden Darter',  rarity: 'super',     price: 280, model: 'Fish3',     tint: '#f4c542', len: 0.2,  place: 'river', times: ['morning', 'day'], rocks: 3 },
  { id: 'bluegill',  name: 'Bluegill',       rarity: 'common',    price: 10,  model: 'Fish2',     tint: '#5fb7a8', len: 0.25, place: 'lake',  times: [] },
  { id: 'guppy',     name: 'Pond Guppy',     rarity: 'common',    price: 8,   model: 'Fish3',     tint: '#7cc957', len: 0.12, place: 'lake',  times: [] },
  { id: 'carp',      name: 'Mirror Carp',    rarity: 'uncommon',  price: 26,  model: 'Fish2',     tint: '#b98a4e', len: 0.7,  place: 'lake',  times: [], rain: 1.5 },
  { id: 'koi',       name: 'Lantern Koi',    rarity: 'rare',      price: 65,  model: 'Fish3',     tint: '#ff9d5c', len: 0.6,  place: 'lake',  times: ['evening', 'night'] },
  { id: 'ghostkoi',  name: 'Ghost Koi',      rarity: 'super',     price: 320, model: 'Fish3',     tint: '#f1f1f6', len: 0.75, place: 'lake',  times: [], season: { Winter: 2 } },
  { id: 'whiskers',  name: 'Old Whiskers',   rarity: 'legendary', price: 850, model: 'Fish1',     tint: '#5b5470', len: 1.6,  place: 'lake',  times: ['night'], rain: 1.5 },
];
// Rods (try/fishing round 3, mockup "Rods A"; models: Quaternius, CC0). The stick rod works everywhere; each water
// has two upgrades. Each opens at a town `level` (Mac, v0.1.61; it was fish-book progress before), then Fishel
// sells it for `buy` coins. `reel` adds seconds to the Reel! window,
// `bite` multiplies the wait for a bite. The rod for the water you're fishing comes out by itself.
export const RODS = {
  stick:  { name: 'Stick rod',  model: 'FishingRod_Lvl1', water: 'any' },
  reed:   { name: 'Reed rod',   model: 'FishingRod_Lvl2', water: 'fresh', reel: 1, level: 4, buy: 300 },
  golden: { name: 'Golden rod', model: 'FishingRod_Lvl4', water: 'fresh', reel: 1, bite: 0.75, level: 7, buy: 1200 },
  harbor: { name: 'Harbor rod', model: 'FishingRod_Lvl3', water: 'sea',   reel: 1, level: 5, buy: 400 },
  storm:  { name: 'Storm rod',  model: 'FishingRod_Lvl5', water: 'sea',   reel: 1, bite: 0.75, level: 9, buy: 1500 },
};
export const ROD_ORDER = ['stick', 'reed', 'golden', 'harbor', 'storm'];
// How a cast flies (Mac: "the ocean cast zips fast and the freshwater just plops in an arc").
// seconds = dur[0] + distance × dur[1]; height = arc[0] + distance × arc[1]; `extra` = meters further out at sea.
export const CAST = {
  plop: { dur: [0.75, 0.06], arc: [1.5, 0.15] },
  zip:  { dur: [0.14, 0.02], arc: [0.2, 0.025], extra: 1.5 },
};

// Sightings (Mac): not caught on a rod. They surface out at sea now and then and you spot them for the book.
export const SIGHTS = [
  { id: 'dolphin', name: 'Dolphin', model: 'Dolphin', len: 2.4, chance: 0.8 },
  { id: 'whale',   name: 'Whale',   model: 'Whale',   len: 7,   chance: 0.2 },
];
// Hints in the fish book (Mac: picture chips; the last two unlock). Where, when and season always show.
// The bait hint opens at a town level by rarity; the rain hint after `rainTask` catches at that fish's place.
// Either can be bought from Fishel right away for `price` coins. Catching the fish opens everything.
export const HINTS = {
  baitLevel: { common: 1, uncommon: 2, rare: 3, super: 5, legendary: 7 },
  rainTask: 3,
  price: { common: 10, uncommon: 20, rare: 40, super: 80, legendary: 150 },
};
// a catch's length: mostly near typical, now and then a big one (meters)
export function rollSize(fish, rand = Math.random) { return fish.len * (0.8 + 0.2 * rand() + 0.35 * Math.pow(rand(), 4)); }
export const inches = (m) => Math.max(1, Math.round(m * 39.37));

// Crops. Growth is real time and keeps going while you're away (decision 40).
// `stages` are the models shown as the crop grows (kit `kit`, default nature); the last one is ripe.
// `icon` is the harvested-item model the UI icon is rendered from. Smaller crops grow faster;
// per hour short crops pay a little more if you keep replanting, big ones suit overnight.
// `size` scales the plant on its plot; `clump` plants that many thin stalks per plot.
// Models: turnip from Kenney's Nature Kit, the rest from Quaternius's Nature Crops Pack (CC0).
const Q = (name) => ({ kit: 'crops', stages: [1, 2, 3, 4].map(i => `${name}_${i}`), icon: ['crops', `${name}_crop`] });
export const CROPS = {
  lettuce:    { name: 'Lettuce',    growMinutes: 8,  yield: [1, 2], ...Q('lettuce') },
  carrot:     { name: 'Carrot',     growMinutes: 10, yield: [1, 2], ...Q('carrot') },
  beet:       { name: 'Beet',       growMinutes: 12, yield: [1, 2], ...Q('beet') },
  turnip:     { name: 'Turnip',     growMinutes: 20, yield: [1, 2], stages: ['crops_leafsStageA', 'crops_leafsStageB', 'crop_turnip'], icon: ['nature', 'crop_turnip'] },
  wheat:      { name: 'Wheat',      growMinutes: 25, yield: [2, 3], ...Q('wheat'), clump: 5 },
  rice:       { name: 'Rice',       growMinutes: 30, yield: [2, 3], ...Q('rice') },
  tomato:     { name: 'Tomato',     growMinutes: 30, yield: [2, 3], ...Q('tomato') },
  corn:       { name: 'Corn',       growMinutes: 35, yield: [1, 2], ...Q('corn') },
  watermelon: { name: 'Watermelon', growMinutes: 45, yield: [1, 1], ...Q('watermelon') },
  pumpkin:    { name: 'Pumpkin',    growMinutes: 60, yield: [1, 1], ...Q('pumpkin') },
};
export const CROP_ORDER = Object.keys(CROPS);
// seed price (Higgins sells) and crop price (Higgins pays), per crop
const CROP_PRICES = {
  lettuce: [6, 12], carrot: [6, 14], beet: [7, 16], turnip: [10, 25], wheat: [10, 18],
  rice: [12, 20], tomato: [14, 22], corn: [18, 45], watermelon: [25, 75], pumpkin: [35, 110],
};

// Every item that can sit in your bag. `price` = what Higgins pays; `buy` = what he charges.
export const ITEMS = {
  worm:        { name: 'Worms',        kind: 'bait', rarity: 'common',   price: 1, buy: 2,   pack: 5, blurb: 'Everyday bait. Normal odds.', stars: 1 },
  shrimp:      { name: 'Shrimp',       kind: 'bait', rarity: 'uncommon', price: 4, buy: 8,   pack: 5, blurb: 'Rare fish bite more often. Bites come faster.', stars: 2 },
  lure:        { name: 'Glow Lure',    kind: 'bait', rarity: 'rare',     price: 35, buy: 75,  pack: 1, blurb: 'Best chance at super rare and legendary fish.', stars: 3 },
};
// Decor (decision 43). `model` = [kit, name, scale]; `size` = grid footprint [w, d] before rotating.
export const DECOR = {
  bench:   { name: 'Bench',   model: ['town', 'stall-bench', 0.8],  size: [2, 1], buy: 60 },
  lantern: { name: 'Lantern', model: ['town', 'lantern', 0.6],      size: [1, 1], buy: 40, light: true },
  fence:   { name: 'Fence',   model: ['town', 'fence', 1],          size: [1, 1], buy: 10, fence: true },
  flowers: { name: 'Flowers', model: ['nature', 'flowers', 1.2],    size: [1, 1], buy: 15 },
  barrel:  { name: 'Barrel',  model: ['pirate', 'barrel', 0.6],     size: [1, 1], buy: 25 },
  crate:   { name: 'Crate',   model: ['pirate', 'crate', 0.75],     size: [1, 1], buy: 20 },
  // STORE (try/store): sold only in the general store. `level` = the town level it comes in at.
  banner:   { name: 'Banner',   model: ['town', 'banner-red', 0.7],      size: [1, 1], buy: 30 },
  chest:    { name: 'Chest',    model: ['pirate', 'chest', 0.6],         size: [1, 1], buy: 80 },
  cart:     { name: 'Cart',     model: ['town', 'cart', 0.55],           size: [1, 2], buy: 120 },
  fountain: { name: 'Fountain', model: ['town', 'fountain-round', 0.45], size: [2, 2], buy: 400, level: 5 },
};
export const DECOR_ORDER = ['bench', 'lantern', 'fence', 'flowers', 'barrel', 'crate'];
// STORE (try/store): the walk-in general store. It opens at `level` and takes over decor and tools from Higgins.
// `shelf` = what stands on the shelves and table to walk up to; everything in `decor` and `tools` is in the keeper's list.
export const STORE = {
  level: 3, keeper: 'Nell', name: 'Nell\u2019s General Store',
  decor: ['bench', 'lantern', 'fence', 'flowers', 'barrel', 'crate', 'banner', 'chest', 'cart', 'fountain'],
  tools: ['shovel', 'saw', 'pick'],
  shelf: ['barrel', 'lantern', 'flowers', 'fence', 'chest', 'tool:shovel'], table: ['bench', 'fountain'],
};
export const STARTER_KIT = { bench: 1, lantern: 2, fence: 6, flowers: 4, barrel: 1, crate: 1 };
for (const [id, d] of Object.entries(DECOR)) ITEMS['decor_' + id] = { name: d.name, kind: 'decor', rarity: 'common', price: Math.round(d.buy / 2), buy: d.buy, decor: id };
for (const f of FISH) ITEMS[f.id] = { name: f.name, kind: 'fish', rarity: f.rarity, price: f.price };
for (const [id, c] of Object.entries(CROPS)) {
  const [seed, price] = CROP_PRICES[id];
  c.seed = 'seed_' + id; c.item = id;
  ITEMS[c.seed] = { name: `${c.name} seeds`, kind: 'seed', rarity: 'common', price: Math.max(1, Math.round(seed * 0.4)), buy: seed, crop: id };
  ITEMS[id] = { name: c.name, kind: 'crop', rarity: 'common', price };
}

// What a brand-new save starts with.
export const START = {
  coins: 100,
  inv: { seed_turnip: 5, worm: 5 },
};

// Higgins's shop (buy side).
export const SHOP = { seedPack: 5 };   // seeds are sold in packs of 5, every crop

// Order board (decision 50). Townsfolk pin requests outside Higgins's spot; filling one pays
// more than selling the same things to Higgins, plus a small extra. Orders never expire.
export const ORDER_FOLK = {
  higgins: { name: 'Higgins',  color: '#6a5a8c', asks: ['crop', 'fish'] },
  fishel:  { name: 'Fishel',   color: '#e0b020', asks: ['fish'] },
  rosa:    { name: 'Rosa',     color: '#e8846a', asks: ['crop', 'fish'], lines: 2, opens: 2 },   // runs Rosa's Flowers, the seed cart; no orders until her cart opens at town level 2 (Mac)
  pike:    { name: 'Old Pike', color: '#7a9a6a', asks: ['fish'] },
};
export const ORDERS = {
  slots: 6,                 // most orders on the board at once; it's one per townsperson now (Mac, v0.1.61), so the board fits without scrolling
  refillMinutes: 10,        // a new order is pinned this long after one is filled or tossed
  payMult: 1.6,             // coins = what Higgins would pay x this, rounded to 5
  wants: [                  // what can be asked for and how many; never super rare or legendary
    { item: 'minnow', n: [2, 5] }, { item: 'sunfish', n: [2, 5] },
    { item: 'perch', n: [1, 3] },  { item: 'bass', n: [1, 3] },
    { item: 'snapper', n: [1, 1] }, { item: 'moontrout', n: [1, 1] },
    { item: 'lettuce', n: [2, 4] }, { item: 'carrot', n: [2, 5] }, { item: 'beet', n: [2, 4] },
    { item: 'turnip', n: [2, 6] },  { item: 'wheat', n: [3, 6] },  { item: 'rice', n: [3, 6] },
    { item: 'tomato', n: [2, 5] },  { item: 'corn', n: [1, 3] },   { item: 'watermelon', n: [1, 1] },
    { item: 'pumpkin', n: [1, 1] },
  ],
  extras: [                 // the small bonus on top of coins
    { w: 5, kind: 'heart' },
    { w: 3, kind: 'item', item: 'worm', n: 5 },
    { w: 2, kind: 'item', item: 'shrimp', n: 3 },
    { w: 2, kind: 'item', item: 'decor_flowers', n: 1 },
    { w: 0.7, kind: 'item', item: 'lure', n: 1, minValue: 50 },
  ],
};
// Make one order. `rand` returns 0..1 (seedable for tests).
// `level` (town level) keeps crop asks to crops whose seeds are unlocked.
// `who` picks the townsperson (one order each, v0.1.61); left out, it's anyone who's open.
export const orderFolk = (level) => Object.keys(ORDER_FOLK).filter(k => (ORDER_FOLK[k].opens || 1) <= level);
export function makeOrder(rand, id, level = 99, who = null) {
  const folk = orderFolk(level); if (!who || !folk.includes(who)) who = folk[Math.floor(rand() * folk.length)]; const f = ORDER_FOLK[who];
  const pool = ORDERS.wants.filter(w => f.asks.includes(ITEMS[w.item].kind === 'crop' ? 'crop' : 'fish')
    && (ITEMS[w.item].kind !== 'crop' || unlockLevel('seed_' + w.item) <= level));
  const lines = f.lines || (rand() < 0.25 ? 2 : 1), items = [];
  for (let i = 0; i < lines && pool.length; i++) {
    const w = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    items.push([w.item, w.n[0] + Math.floor(rand() * (w.n[1] - w.n[0] + 1))]);
  }
  const value = items.reduce((t, [it, n]) => t + ITEMS[it].price * n, 0);
  const coins = Math.max(10, Math.round(value * ORDERS.payMult / 5) * 5);
  const ex = ORDERS.extras.filter(e => (!e.minValue || value >= e.minValue) && (e.kind !== 'item' || unlockLevel(e.item) <= level)), tw = ex.reduce((t, e) => t + e.w, 0);
  let x = rand() * tw, extra = ex[0];
  for (const e of ex) { x -= e.w; if (x <= 0) { extra = e; break; } }
  return { id, who, items, coins, extra: extra.kind === 'heart' ? { kind: 'heart' } : { kind: 'item', item: extra.item, n: extra.n } };
}

// Tools (decision 73): bought once from Higgins. Clearing a lot takes the right tool and several hits for big things
// (Mac: "I don't want it to be cleared so easily"); each hit is one tap of Clear and about 2 seconds.
export const TOOLS = {
  shovel: { name: 'Shovel', price: 120, level: 2, does: 'stumps, bushes, small rocks and dig spots' },
  saw: { name: 'Saw', price: 250, level: 3, does: 'trees and logs' },
  pick: { name: 'Pickaxe', price: 350, level: 3, does: 'big rocks' },
};
export const TOOL_ORDER = ['shovel', 'saw', 'pick'];
// what each thing on a lot needs: tool (null = bare hands) and hits
export const CLEAR_NEEDS = {
  grass_large: { tool: null, hits: 1 }, mushroom_redGroup: { tool: null, hits: 1 },
  plant_bush: { tool: 'shovel', hits: 1 }, plant_bushLarge: { tool: 'shovel', hits: 1 }, rock_smallA: { tool: 'shovel', hits: 1 },
  stump_round: { tool: 'shovel', hits: 2 }, log: { tool: 'saw', hits: 2 }, tree_default: { tool: 'saw', hits: 3 },
  rock_largeA: { tool: 'pick', hits: 4 },
};
export const HIT_SECONDS = 2;
export const DIG = { perDay: 3 };   // dig spots for the shovel, new ones each day

// Cargo ship (decision 70): crates take crops, barrels take fish, load anything up to the limit; one star crate
// asks for something in particular and brings a treasure chest. A bigger hold costs coins + a town level.
export const CARGO = {
  openLevel: 4,
  payMult: 1.5,             // the ship sells your cargo for this much more than Higgins pays
  holds: [                  // the hold you have, then each upgrade
    { crates: 2, barrels: 1, cap: 10, cost: 0,    level: 4,  tripMinutes: 60 },
    { crates: 3, barrels: 2, cap: 10, cost: 800,  level: 6,  tripMinutes: 60 },
    { crates: 3, barrels: 2, cap: 20, cost: 2000, level: 9,  tripMinutes: 90 },
    { crates: 4, barrels: 4, cap: 20, cost: 5000, level: 12, tripMinutes: 120 },
  ],
  debugTripSeconds: 20,
};

// Town level (decision 60). XP from orders, catches, new species and harvests; each level
// opens new seeds and gear. 'later' entries show on the roadmap but aren't in the game yet.
export const XP = { order: 40, newFish: 15, catch: 5, crop: 2 };
export const xpToNext = (lv) => 100 + 60 * (lv - 1);
export function levelFor(xp) { let lv = 1; while (xp >= xpToNext(lv)) { xp -= xpToNext(lv); lv++; } return lv; }
export function xpInto(xp) { let lv = 1; while (xp >= xpToNext(lv)) { xp -= xpToNext(lv); lv++; } return { lv, have: xp, need: xpToNext(lv) }; }
export const RANKS = [[1, 'Dock'], [5, 'Village'], [10, 'Harbor town'], [20, 'City']];
export const rankFor = (lv) => RANKS.filter(r => lv >= r[0]).pop()[1];
export const LEVELS = {
  1:  [{ item: 'seed_turnip' }, { item: 'seed_lettuce' }, { item: 'seed_carrot' }, { item: 'worm' }],
  2:  [{ item: 'seed_beet' }, { item: 'seed_wheat' }, { place: "Rosa's Flowers opens" }, { tool: 'shovel' }],
  3:  [{ item: 'shrimp' }, { place: 'Your 1st extra lot', land: true }, { tool: 'saw' }, { tool: 'pick' }, { place: 'Nell\u2019s General Store opens', store: true }],
  4:  [{ item: 'seed_tomato' }, { item: 'seed_rice' }, { place: 'The cargo ship', ship: true }, { rod: 'reed' }],
  5:  [{ item: 'seed_corn' }, { place: 'A 2nd lot', land: true }, { decor: 'fountain' }, { rod: 'harbor' }, { later: 'Crab trap' }],
  6:  [{ item: 'lure' }],
  7:  [{ rod: 'golden' }],
  8:  [{ item: 'seed_watermelon' }, { place: 'A 3rd lot', land: true }],
  9:  [{ rod: 'storm' }, { later: 'Second crab trap' }],
  10: [{ item: 'seed_pumpkin' }],
  12: [{ place: 'A 4th lot', land: true }, { later: 'Fruit trees' }],
};
export function unlockLevel(item) {
  if (!item) return 1;
  for (const [lv, list] of Object.entries(LEVELS)) if (list.some(u => u.item === item)) return +lv;
  return 1;
}

// Debug-mode speedups.
export const DEBUG = { cropSeconds: 15, biteSeconds: 0.6, orderRefillSeconds: 10 };

// Pick a fish for a bite. `bait` = a BAIT key, `tod` = time of day key,
// `rand` = a function returning 0..1 (seedable for the test bot),
// `ctx` = { place, season, rain } (try/fishing; defaults: the beach, the current season, dry).
export function fishPool(tod, ctx = {}) {
  const place = ctx.place || 'beach', season = ctx.season || seasonInfo().season;
  return FISH.filter(f => f.place === place && (!f.times.length || f.times.includes(tod)) && (!f.only || f.only === season));
}
export function fishWeights(bait, tod, ctx = {}) {
  const m = (BAIT[bait] || BAIT.worm).mult, season = ctx.season || seasonInfo().season;
  const pool = fishPool(tod, ctx).filter(f => m[f.rarity] > 0);
  // a rarity's weight is shared by the species of that rarity that can bite right now
  return pool.map(f => [f, RARITY[f.rarity].weight * m[f.rarity] / pool.filter(g => g.rarity === f.rarity).length
    * ((f.season && f.season[season]) || 1) * (ctx.rain && f.rain ? f.rain : 1) * (ctx.rocks && f.rocks ? f.rocks : 1)]);   // by the river rocks (v0.1.61)
}
export function rollFish(bait, tod, rand = Math.random, ctx = {}) {
  const w = fishWeights(bait, tod, ctx);
  const total = w.reduce((s, x) => s + x[1], 0);
  let x = rand() * total;
  for (const [f, wt] of w) { x -= wt; if (x <= 0) return f; }
  return w[w.length - 1][0];
}

// Real-world season and day (decision 16: 2 real weeks per season).
const SEASONS = ['Spring', 'Summer', 'Fall', 'Winter'];
const EPOCH = Date.UTC(2026, 0, 5); // a Monday; seasons count from here
export function seasonInfo(now = Date.now()) {
  const days = Math.floor((now - EPOCH) / 86400000);
  const s = ((Math.floor(days / 14) % 4) + 4) % 4;
  return { season: SEASONS[s], day: (((days % 14) + 14) % 14) + 1 };
}

// Time of day from the real clock (debug can override).
export function timeOfDay(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 5 && h < 10) return 'morning';
  if (h >= 10 && h < 17) return 'day';
  if (h >= 17 && h < 20.5) return 'evening';
  return 'night';
}

// ---------- animals (v0.1.57, from try/chickens): coop, hens, ducks and the pond. The code is in animals.js ----------
export const ANIMALS = {
  level: 4,                                  // town level where Nell starts selling chickens
  coop: { buy: 600, holds: [4, 8, 12], bigger: [{ cost: 1500, level: 6 }, { cost: 4000, level: 9 }] },
  hen: 150, chick: 60,
  // ducks (Mac, Nov 15: "do the easiest first"; then "ducks should be separated"): the pond you place is their home
  duck: { level: 5, buy: 200, baby: 80, layMinutes: 30, egg: { name: 'Duck egg', price: 20, order: [1, 3] }, colors: ['#ffffff', '#9a7450', '#f3dcb4'], pond: 300, holds: [4, 8], bigger: [{ cost: 1200, level: 7 }] },
  feed: { pack: 5, buy: 40, eats: ['feed', 'wheat', 'corn'], pour: 6, hoursPerBird: 12 },   // 1 scoop or crop feeds one bird for an hour
  egg: { name: 'Egg', price: 12, order: [2, 5] },
  layMinutes: 20, growHours: 24,
  nestPerHen: 3,                             // eggs wait for you; when the nest is full, laying pauses (nothing is lost)
  heartSpeed: [1, 1, 1.25, 1.5],             // eggs come faster with 2 and 3 hearts
  heartHours: 20, fadeHours: 72,             // one heart a day from petting a fed hen; one fades after 3 days without (never below 1)
  yard: 3.3,                                 // how far birds wander from the coop's front (m)
  max: 16,
  colors: ['#fffaf0', '#b9733b', '#e9b24c', '#5a5560', '#f3dcb4', '#d98f5a'],
  chickColor: '#ffd84d',
};

// ---------- the first ten goals (v0.1.67): one at a time, to teach a new player the game. How each is checked is in goals.js ----------
// pic: an ICON name · prize: coins, or an item and how many · hint: shown when you tap the goal card
export const GOALS = [
  { id: 'hello',   title: 'Say hello to Higgins',                    pic: 'chat',   prize: { coins: 10 }, hint: 'Walk to Higgins by the dock and tap Talk.' },
  { id: 'plant',   title: 'Till a plot and plant your turnip seeds', pic: 'seeds',  prize: { coins: 10 }, hint: 'Open Farm tools, drag the hoe over grass, then tap your seeds and Plant.' },
  { id: 'water',   title: 'Water your turnips',                      pic: 'can',    prize: { coins: 10 }, hint: 'Open Farm tools, pick the watering can and drag it over your turnips.' },
  { id: 'worms',   title: 'Take worms from the bucket by Fishel',    pic: 'worm',   prize: { item: 'worm', n: 5 }, hint: 'The bucket is beside Fishel\u2019s stall. Walk up and tap Take.' },
  { id: 'catch',   title: 'Catch a fish',                            pic: 'fish',   prize: { coins: 20 }, hint: 'Take your rod to the dock, tap Cast, then tap Reel! when it bites.' },
  { id: 'book',    title: 'Open your Fish Book',                     pic: 'book',   prize: { coins: 10 }, hint: 'Tap the menu button, then Fish Book.' },
  { id: 'sell',    title: 'Sell your fish to Higgins',               pic: 'coin',   prize: { coins: 20 }, hint: 'Talk to Higgins and tap Sell everything.' },
  { id: 'bench',   title: 'Place your bench',                        pic: 'bench',  prize: { item: 'decor_flowers', n: 2 }, hint: 'Tap the house button, pick the bench and tap Place.' },
  { id: 'order',   title: 'Fill an order at the board',              pic: 'board',  prize: { coins: 30 }, hint: 'Bring what an order asks for to the board by Higgins and tap Fill.' },
  { id: 'harvest', title: 'Harvest your turnips',                    pic: 'basket', prize: { item: 'seed_carrot', n: 5 }, hint: 'Turnips take about 20 minutes. When the bubble shows, tap Harvest.' },
];

// ---------- pets (v0.1.68, from try/pets): the goldfish and the Shiba Inu puppy. The code is in pets.js ----------
export const PETS = {
  treatsFor: [0, 4, 12],                      // treats eaten in total for 1, 2, 3 hearts
  perDay: 3,                                  // treats a day, per pet
  bonus: [0.02, 0.05, 0.10],                  // fish: bites come this much faster at 1, 2, 3 hearts
  treat: { pack: 5, buy: 30 },                // Nell's pet treats; the fish also takes Fishel's worms
  starter: 3,                                 // free treats with an adoption
  back: 0.95, side: 0.8, roam: 1.5,           // follows this far behind (or beside); drifts within this ring when you stop
  kinds: {
    fish: { level: 2, bed: 'fishbowl', bedName: 'Fish bowl', height: 0.5, worms: true,
      names: ['Bubbles', 'Finn', 'Goldie', 'Splash', 'Pip', 'Coral', 'Wiggles', 'Dot', 'Sunny', 'Puddle', 'Peach', 'Blub'] },
    dog: { level: 4, bed: 'doghouse', bedName: 'Doghouse', length: 0.85, worms: false,
      names: ['Biscuit', 'Mochi', 'Scout', 'Peanut', 'Maple', 'Buddy', 'Waffles', 'Pepper', 'Koda', 'Ziggy', 'Bean', 'Toast'] },
  },
};
