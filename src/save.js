// Saving. The real save and the debug save are separate, so debug mode never
// touches real progress. Storage can be missing or throw (private mode, some
// in-app browsers), so every call is wrapped and the game still runs without it.
import { START } from './data.js';

const KEYS = { real: 'tidewell.save.v1', debug: 'tidewell.debug.v1', settings: 'tidewell.settings.v1' };

function read(key) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
}

export function freshSave() {
  return {
    v: 1,
    coins: START.coins,
    inv: { ...START.inv },
    plots: [],            // { x, z, crop, plantedAt }
    decor: [],            // { id, x, z, r } placed decor
    kitGiven: false,      // Higgins's starter decor kit
    fishelMet: false,
  rosaMet: false,       // Rosa's Flowers (town level 2)
  lots: [],             // lots you've bought, e.g. 'east1' (decision 69)
  cleared: [],          // weeds, rocks, stumps and trees you've cleared on them ('east1:12')
  tools: [],            // tools bought from Higgins: shovel, saw, pick (decision 73)
  hits: {},             // hits so far on things you're clearing ('back1:12': 2)
  dig: null,            // today's dig spots
  cargo: null,          // the cargo ship's hold, star request, trip and payout (decision 70)
  look: null,           // your character's look (decision 63); null = the plain white dummy, until the wardrobe greets you
    caught: {},           // fish id -> how many ever caught
    orders: { slots: [], taken: [], next: 1 },   // order board; a slot is an order or { empty: true, at }
    friends: {},          // townsfolk id -> friendship points
    xp: 0, level: 1,      // town level (decision 60); xp is lifetime total
    introDone: false,
    body: 'm',
    pos: null,
    createdAt: Date.now(),
  };
}

export function loadSave(debug) {
  const s = read(debug ? KEYS.debug : KEYS.real);
  if (!s || s.v !== 1) return freshSave();
  const f = freshSave();
  return { ...f, ...s, inv: { ...(s.inv || {}) }, decor: [...(s.decor || [])], lots: [...(s.lots || [])], tools: [...(s.tools || [])], hits: { ...(s.hits || {}) }, cleared: [...(s.cleared || [])], orders: { ...f.orders, ...(s.orders || {}) }, friends: { ...(s.friends || {}) } };
}
export function storeSave(state, debug) { state.savedAt = Date.now(); return write(debug ? KEYS.debug : KEYS.real, state); }
// read a save without loading it (main menu cards)
export function peekSave(debug) { return read(debug ? KEYS.debug : KEYS.real); }
export function resetSave(debug) { try { localStorage.removeItem(debug ? KEYS.debug : KEYS.real); } catch (e) {} }

export function loadSettings() {
  return { debug: false, fastCrops: true, instantBite: false, todOverride: null, ...(read(KEYS.settings) || {}) };
}
export function storeSettings(s) { return write(KEYS.settings, s); }
export function storageWorks() {
  try { localStorage.setItem('tidewell.ping', '1'); localStorage.removeItem('tidewell.ping'); return true; } catch (e) { return false; }
}
