'use strict';
/* ============================================================
   Annasetu data layer
   Tables: donors, ngos, volunteers, donations (linked by id)
   Everything the UI shows comes from here; nothing is random.
   ============================================================ */

const MIN = 6e4, DB_KEY = 'annasetu_db_v3', DB_VERSION = 3; let CO2_PER_KG = 2.5;

/* ---------- Reference data ---------- */
const FLOW = ['listed', 'claimed', 'enroute', 'picked', 'delivered'];
const STATUS_LABEL = { listed: 'Listed', claimed: 'Claimed by NGO', enroute: 'In transit', picked: 'Picked up', delivered: 'Delivered', expired: 'Expired' };
const STATUS_SHORT = { listed: 'Listed', claimed: 'Claimed', enroute: 'Transit', picked: 'Picked', delivered: 'Done' };
const STEP_TITLE = { listed: 'Listed by donor', claimed: 'Claimed by NGO', enroute: 'Volunteer en route', picked: 'Picked up', delivered: 'Delivered & verified' };
const STEP_PENDING = { claimed: 'Waiting for an NGO to accept', enroute: 'Waiting for a volunteer', picked: 'Awaiting pickup confirmation', delivered: 'Closed after the NGO confirms delivery' };
const CATEGORIES = { cooked: 'Cooked meals', packed: 'Packed meals', bakery: 'Bakery', sweets: 'Sweets & desserts', produce: 'Fresh produce' };
const LIVE = ['listed', 'claimed', 'enroute'];            // still time-sensitive
const TRANSITIONS = {                                       // allowed status changes
  listed: ['claimed', 'expired'],
  claimed: ['enroute', 'picked', 'expired'],
  enroute: ['picked', 'expired'],
  picked: ['delivered'],
  delivered: [],
  expired: []
};
const LIMITS = { name: 80, meals: [1, 5000], kg: [0.5, 2000], shelfMin: [10, 720] };

/* ---------- Master data (donors, NGOs, volunteers) ---------- */
const MASTER = {
  donors: [
    { id: 'D-001', name: 'Spice Route Kitchen', type: 'Restaurant', area: 'Bandra West', address: 'Hill Road, Bandra West, Mumbai 400050', phone: '+91 98200 10001' },
    { id: 'D-002', name: 'Grand Lawns Events', type: 'Caterer', area: 'Andheri East', address: 'MIDC Road, Andheri East, Mumbai 400093', phone: '+91 98200 10002' },
    { id: 'D-003', name: 'Daily Crumb Bakery', type: 'Bakery', area: 'Powai', address: 'Hiranandani Gardens, Powai, Mumbai 400076', phone: '+91 98200 10003' },
    { id: 'D-004', name: 'Spice Route Banquets', type: 'Banquet hall', area: 'Lower Parel', address: 'Senapati Bapat Marg, Lower Parel, Mumbai 400013', phone: '+91 98200 10004' },
    { id: 'D-005', name: 'BKC Corporate Cafeteria', type: 'Corporate cafeteria', area: 'Bandra Kurla Complex', address: 'G Block, Bandra Kurla Complex, Mumbai 400051', phone: '+91 98200 10005' },
    { id: 'D-006', name: 'Sweet Haven Mithai', type: 'Sweet shop', area: 'Dadar', address: 'Gokhale Road, Dadar West, Mumbai 400028', phone: '+91 98200 10006' }
  ],
  ngos: [
    { id: 'N-001', name: 'Seva Trust', area: 'Dharavi', address: '90 Feet Road, Dharavi, Mumbai 400017', capacity: 600, phone: '+91 98300 20001' },
    { id: 'N-002', name: 'Roti Bank', area: 'Kurla', address: 'LBS Marg, Kurla West, Mumbai 400070', capacity: 400, phone: '+91 98300 20002' },
    { id: 'N-003', name: 'Sunrise Community Kitchen', area: 'Dharavi', address: 'Kumbharwada, Dharavi, Mumbai 400019', capacity: 300, phone: '+91 98300 20003' }
  ],
  volunteers: [
    { id: 'V-001', name: 'Rahul M.', vehicle: 'two-wheeler', ngoId: 'N-003' },
    { id: 'V-002', name: 'Priya S.', vehicle: 'e-bike', ngoId: 'N-001' },
    { id: 'V-003', name: 'Imran K.', vehicle: 'van', ngoId: 'N-001' },
    { id: 'V-004', name: 'Anita D.', vehicle: 'two-wheeler', ngoId: 'N-002' }
  ]
};

/* ---------- Seed donations (fixed, ordered oldest to newest) ----------
   listedAgo / remain are minutes relative to "now" when the demo data is created. */
const SEED_DONATIONS = [
  { donorId: 'D-006', name: 'Dessert boxes', category: 'sweets', veg: true, meals: 35, kg: 9, listedAgo: 5700, remain: -4200, status: 'delivered', ngoId: 'N-002', volunteerId: 'V-004' },
  { donorId: 'D-005', name: 'Sandwich boxes', category: 'packed', veg: true, meals: 100, kg: 25, listedAgo: 4300, remain: -3900, status: 'delivered', ngoId: 'N-001', volunteerId: 'V-002' },
  { donorId: 'D-004', name: 'Dal khichdi', category: 'cooked', veg: true, meals: 70, kg: 28, listedAgo: 2800, remain: -2500, status: 'expired' },
  { donorId: 'D-002', name: 'Chicken pulao', category: 'cooked', veg: false, meals: 150, kg: 60, listedAgo: 2900, remain: -2600, status: 'delivered', ngoId: 'N-003', volunteerId: 'V-001' },
  { donorId: 'D-003', name: 'Pav and buns', category: 'bakery', veg: true, meals: 90, kg: 22, listedAgo: 1700, remain: -900, status: 'delivered', ngoId: 'N-002', volunteerId: 'V-004' },
  { donorId: 'D-001', name: 'Paneer curry and naan', category: 'cooked', veg: true, meals: 50, kg: 18, listedAgo: 1500, remain: -1000, status: 'delivered', ngoId: 'N-001', volunteerId: 'V-003' },
  { donorId: 'D-005', name: 'Corporate lunch boxes', category: 'packed', veg: true, meals: 80, kg: 32, listedAgo: 300, remain: -60, status: 'delivered', ngoId: 'N-002', volunteerId: 'V-004' },
  { donorId: 'D-006', name: 'Assorted mithai', category: 'sweets', veg: true, meals: 40, kg: 12, listedAgo: 120, remain: 1440, status: 'picked', ngoId: 'N-001', volunteerId: 'V-002' },
  { donorId: 'D-003', name: 'Bakery bread and buns', category: 'bakery', veg: true, meals: 60, kg: 15, listedAgo: 70, remain: 480, status: 'claimed', ngoId: 'N-001' },
  { donorId: 'D-001', name: 'Vegetable biryani', category: 'cooked', veg: true, meals: 25, kg: 10, listedAgo: 45, remain: 180, status: 'enroute', ngoId: 'N-003', volunteerId: 'V-001' },
  { donorId: 'D-002', name: 'Wedding buffet: dal, rice, sabzi', category: 'cooked', veg: true, meals: 300, kg: 110, listedAgo: 30, remain: 25, status: 'listed' },
  { donorId: 'D-004', name: 'Veg biryani and raita', category: 'cooked', veg: true, meals: 120, kg: 48, listedAgo: 20, remain: 210, status: 'listed' }
];

/* ---------- Helpers ---------- */
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const codeFor = (id, salt = '') => 'AS-' + hash(id + salt).toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
const etaMinutesFor = id => 6 + hash(id) % 9;                       // stable 6-14 minute estimate
const yymm = t => { const d = new Date(t); return String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0'); };
const donationId = (seq, t) => `DN-${yymm(t)}-${String(seq).padStart(3, '0')}`;

function buildDonation(spec, seq, now, master) {
  const id = donationId(seq, now), listedAt = now - spec.listedAgo * MIN, expiresAt = now + spec.remain * MIN;
  const donor = master.donors.find(x => x.id === spec.donorId), ngo = master.ngos.find(x => x.id === spec.ngoId), vol = master.volunteers.find(x => x.id === spec.volunteerId);
  const path = spec.status === 'expired' ? ['listed', 'expired'] : FLOW.slice(0, FLOW.indexOf(spec.status) + 1);
  const end = spec.status === 'expired' ? expiresAt : now - 4 * MIN;
  const who = { listed: donor.name, claimed: ngo && ngo.name, enroute: vol && vol.name, picked: (vol || ngo || {}).name, delivered: ngo && ngo.name, expired: 'System' };
  const d = {
    id, code: codeFor(id), donorId: spec.donorId, ngoId: spec.ngoId || null, volunteerId: spec.volunteerId || null,
    food: { name: spec.name, category: spec.category, veg: spec.veg }, qty: { meals: spec.meals, kg: spec.kg },
    listedAt, expiresAt, status: spec.status, etaAt: null, etaTotal: null,
    log: path.map((s, j) => ({ status: s, at: Math.round(listedAt + j * (end - listedAt) / Math.max(path.length - 1, 1)), by: who[s] }))
  };
  if (spec.status === 'enroute') { d.etaTotal = etaMinutesFor(id) * MIN; d.etaAt = now + d.etaTotal; }
  return d;
}

function buildSeed(now = Date.now()) {
  const master = JSON.parse(JSON.stringify(MASTER));
  return {
    version: DB_VERSION,
    session: { donorId: 'D-001', ngoId: 'N-001' },   // who the demo is "logged in" as
    ...master,
    seq: SEED_DONATIONS.length,
    donations: SEED_DONATIONS.map((s, n) => buildDonation(s, n + 1, now, master))
  };
}

/* ---------- Store (state + rules) ---------- */
const DB = {
  s: null,
  init() {
    try { const s = JSON.parse(localStorage.getItem(DB_KEY)); if (s && s.version === DB_VERSION) { this.s = s; return s; } } catch (e) { /* fall through */ }
    return this.reset();
  },
  reset() { this.s = buildSeed(); this.save(); return this.s; },
  save() { try { localStorage.setItem(DB_KEY, JSON.stringify(this.s)); } catch (e) { /* storage unavailable */ } },
  get(table, id) { return this.s[table].find(x => x.id === id) || null; },
  donor(d) { return this.get('donors', d.donorId); },
  ngo(d) { return d.ngoId ? this.get('ngos', d.ngoId) : null; },
  volunteer(d) { return d.volunteerId ? this.get('volunteers', d.volunteerId) : null; },
  byStatus(...st) { return this.s.donations.filter(d => st.includes(d.status)); },

  validate(i) {
    const n = (v, [lo, hi]) => Number.isFinite(v) && v >= lo && v <= hi;
    if (!this.get('donors', i.donorId)) return 'Choose a donor.';
    if (!i.name || !i.name.trim()) return 'Enter what food you are donating.';
    if (i.name.trim().length > LIMITS.name) return `Food name must be ${LIMITS.name} characters or fewer.`;
    if (!CATEGORIES[i.category]) return 'Choose a food category.';
    if (!n(i.meals, LIMITS.meals) || !Number.isInteger(i.meals)) return `Meals must be a whole number from ${LIMITS.meals[0]} to ${LIMITS.meals[1]}.`;
    if (!n(i.kg, LIMITS.kg)) return `Weight must be between ${LIMITS.kg[0]} and ${LIMITS.kg[1]} kg.`;
    if (!n(i.shelfMin, LIMITS.shelfMin)) return `Safe-to-eat time must be ${LIMITS.shelfMin[0]} to ${LIMITS.shelfMin[1]} minutes.`;
    return null;
  },
  create(i) {
    const err = this.validate(i); if (err) return { ok: false, error: err };
    const now = Date.now(), id = donationId(++this.s.seq, now), donor = this.get('donors', i.donorId);
    let code = codeFor(id), salt = 0; while (this.s.donations.some(x => x.code === code)) code = codeFor(id, String(++salt));
    const d = { id, code, donorId: donor.id, ngoId: null, volunteerId: null,
      food: { name: i.name.trim(), category: i.category, veg: !!i.veg }, qty: { meals: i.meals, kg: i.kg },
      listedAt: now, expiresAt: now + i.shelfMin * MIN, status: 'listed', etaAt: null, etaTotal: null,
      log: [{ status: 'listed', at: now, by: donor.name }] };
    this.s.donations.unshift(d); this.save(); return { ok: true, d };
  },
  transition(d, to, by) {
    if (!TRANSITIONS[d.status].includes(to)) return false;
    d.status = to; d.log.push({ status: to, at: Date.now(), by }); this.save(); return true;
  },
  claim(d, ngoId) {
    const ngo = this.get('ngos', ngoId); if (!ngo) return { ok: false, msg: 'Unknown NGO.' };
    if (d.status !== 'listed') return { ok: false, msg: 'This donation is no longer available.' };
    const committed = this.byStatus('claimed', 'enroute', 'picked').filter(x => x.ngoId === ngoId).reduce((s, x) => s + x.qty.meals, 0);
    if (committed + d.qty.meals > ngo.capacity) return { ok: false, msg: `${ngo.name} can serve ${ngo.capacity} meals at a time and has ${committed} committed. This needs ${d.qty.meals}.` };
    d.ngoId = ngoId; this.transition(d, 'claimed', ngo.name);
    return { ok: true, msg: `Claimed by ${ngo.name}. Pickup QR is ready on the donor side.` };
  },
  freeVolunteer(ngoId) {
    const busy = new Set(this.byStatus('enroute').map(x => x.volunteerId));
    return this.s.volunteers.find(v => v.ngoId === ngoId && !busy.has(v.id)) || null;
  },
  dispatch(d) {
    if (d.status !== 'claimed') return { ok: false, msg: 'Only claimed donations can get a volunteer.' };
    const v = this.freeVolunteer(d.ngoId); if (!v) return { ok: false, msg: 'All your volunteers are on a trip. Try again soon.' };
    d.volunteerId = v.id; d.etaTotal = etaMinutesFor(d.id) * MIN; d.etaAt = Date.now() + d.etaTotal;
    this.transition(d, 'enroute', v.name);
    return { ok: true, msg: `${v.name} (${v.vehicle}) is on the way to collect ${d.food.name}.` };
  },
  verifyScan(raw, ngoId) {
    const code = String(raw || '').trim().toUpperCase(); if (!code) return { ok: false, msg: 'Enter or scan a code first.' };
    const d = this.s.donations.find(x => x.code === code); if (!d) return { ok: false, msg: 'Code not recognised. Check the code and try again.' };
    if (d.status === 'expired') return { ok: false, msg: 'This donation expired and cannot be collected.' };
    if (d.status === 'listed') return { ok: false, msg: 'Claim this donation before scanning its QR.' };
    if (d.ngoId !== ngoId) return { ok: false, msg: `This pickup belongs to ${this.get('ngos', d.ngoId).name}, not your NGO.` };
    if (!['claimed', 'enroute'].includes(d.status)) return { ok: false, msg: `Already ${STATUS_LABEL[d.status].toLowerCase()}. Nothing to change.` };
    const v = this.volunteer(d); this.transition(d, 'picked', v ? v.name : this.get('ngos', ngoId).name);
    return { ok: true, msg: `Verified. ${d.food.name} is now Picked up.`, d };
  },
  confirmDelivery(d) {
    if (!this.transition(d, 'delivered', this.get('ngos', d.ngoId).name)) return { ok: false, msg: 'Only picked-up donations can be delivered.' };
    return { ok: true, msg: 'Delivery confirmed. Meals added to analytics.' };
  },
  expireDue(now = Date.now()) {
    let n = 0; this.s.donations.forEach(d => { if (LIVE.includes(d.status) && d.expiresAt < now && this.transition(d, 'expired', 'System')) n++; });
    return n;
  },

  /* ---------- Analytics (all derived from donations) ---------- */
  stats() {
    const del = this.byStatus('delivered'), exp = this.byStatus('expired');
    const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);
    const meals = sum(del, d => d.qty.meals), kg = sum(del, d => d.qty.kg), lost = sum(exp, d => d.qty.meals);
    const group = (list, key, label) => { const m = new Map(); list.forEach(d => { const k = key(d); m.set(k, (m.get(k) || 0) + d.qty.meals); }); return [...m].map(([k, v]) => ({ label: label(k), value: v })).sort((a, b) => b.value - a.value); };
    return { meals, kg, co2: Math.round(kg * CO2_PER_KG), lost, rate: meals + lost ? Math.round(meals / (meals + lost) * 100) : 0,
      byCategory: group(del, d => d.food.category, k => CATEGORIES[k]),
      byNgo: group(del, d => d.ngoId, k => this.get('ngos', k).name),
      byDonor: group(this.s.donations.filter(d => d.status !== 'expired'), d => d.donorId, k => this.get('donors', k).name) };
  }
};
DB.init();
