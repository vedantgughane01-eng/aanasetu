'use strict';
/* Annasetu UI. Data and rules live in data.js (DB). */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = ms => { if (ms <= 0) return 'Expired'; const m = Math.floor(ms / MIN), s = Math.floor(ms % MIN / 1e3); return (m >= 60 ? Math.floor(m / 60) + 'h ' : '') + m % 60 + 'm ' + String(s).padStart(2, '0') + 's'; };
const clock = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const RM = () => matchMedia('(prefers-reduced-motion:reduce)').matches, EZ = [.22, 1, .36, 1];
const PIN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>';
const TABS = [['home', 'Home'], ['donor', 'Donor'], ['list', 'Surplus food'], ['ngo', 'NGO'], ['track', 'Tracking'], ['stats', 'Analytics']];

let view = (location.hash || '#home').slice(1), sel = null, lastV, filter = 'all';
const sess = () => DB.s.session;
const etaMin = d => Math.max(1, Math.ceil(((d.etaAt || 0) - Date.now()) / MIN));

function toast(m) { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; if (window.Motion && !RM()) Motion.animate(t, { y: [20, 0], opacity: [0, 1] }, { duration: .3 }); clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', 3200); }

/* ---------- Small view pieces ---------- */
const tag = s => `<span class="tag ${s}">${STATUS_LABEL[s]}</span>`;
const vegTag = f => `<span class="tag ${f.veg ? 'veg' : 'nonveg'}">${f.veg ? 'Veg' : 'Non-veg'}</span>`;
const cdClass = d => 'cd ' + (d.expiresAt - Date.now() < 30 * MIN ? 'urgent' : 'mut');
const cd = d => LIVE.includes(d.status) ? `<span class="${cdClass(d)}" data-id="${d.id}">Expires in ${fmt(d.expiresAt - Date.now())}</span>` : '';
const opts = (list, cur, label) => list.map(x => `<option value="${x.id}" ${x.id === cur ? 'selected' : ''}>${esc(label(x))}</option>`).join('');
const bars = (rows, color) => { const mx = Math.max(1, ...rows.map(r => r.value)); return rows.map(r => `<div class="bar"><span class="bl">${esc(r.label)}</span><s style="width:${r.value / mx * 60}%;background:${color}"></s>${r.value}</div>`).join('') || '<p class="mut">Nothing delivered yet.</p>'; };

function tl(d) {
  if (d.status === 'expired') return '<p class="urgent">Expired before pickup. Food was not rescued.</p>';
  const k = FLOW.indexOf(d.status);
  return `<div class="tl">${FLOW.map((s, n) => `<i class="${n <= k ? 'd' : ''}"></i>`).join('')}</div><div class="steps">${FLOW.map(s => `<span>${STATUS_SHORT[s]}</span>`).join('')}</div>`;
}
function steps(d) {
  const exp = d.status === 'expired', reached = d.log.map(l => FLOW.indexOf(l.status)), k = exp ? Math.max(0, ...reached) : FLOW.indexOf(d.status);
  const v = DB.volunteer(d), ngo = DB.ngo(d), donor = DB.donor(d);
  const sub = [`${d.qty.meals} servings · ${esc(d.food.name)}`, ngo ? `${esc(ngo.name)} accepted the listing` : '',
    v ? (k > 2 ? `${esc(v.name)} reached the pickup point` : `${esc(v.name)} is <span class="eta" data-id="${d.id}">${etaMin(d)}</span> minutes from pickup`) : 'Collected directly by the NGO',
    'Collected and verified by QR scan', ngo ? `Delivery confirmed by ${esc(ngo.name)}` : ''];
  return `<ol class="vt">${FLOW.map((x, n) => {
    const st = n > k ? 'p' : (n < k || exp || k === 4) ? 'd' : 'c', t = [...d.log].reverse().find(l => l.status === x);
    return `<li class="${st}"><i></i><b>${STEP_TITLE[x]}</b><span>${n <= k ? sub[n] : STEP_PENDING[x]}</span><em>${n <= k && t ? clock(t.at) : '—'}</em></li>`;
  }).join('')}</ol>${exp ? `<p class="urgent">Expired before delivery. ${esc(donor.name)}'s food was not rescued.</p>` : ''}`;
}
function vinfo(d) {
  const v = DB.volunteer(d);
  if (d.status === 'enroute') return `Volunteer: ${esc(v.name)} · Vehicle: ${v.vehicle} · ETA <span class="eta" data-id="${d.id}">${etaMin(d)}</span> min`;
  if (v && ['picked', 'delivered'].includes(d.status)) return `Volunteer: ${esc(v.name)} · Vehicle: ${v.vehicle}`;
  return { listed: 'No volunteer yet. Waiting for an NGO to claim this food.', claimed: 'Claimed. The NGO will send a volunteer shortly.', expired: 'No volunteer was assigned in time.' }[d.status] || '';
}

/* ---------- Maps ---------- */
function mapOf(d) {
  const ngo = DB.ngo(d), a = encodeURIComponent(DB.donor(d).address), route = ngo && d.status !== 'expired', b = route ? encodeURIComponent(ngo.address) : '';
  return {
    route, from: DB.donor(d).area, to: ngo ? ngo.area : '',
    embed: route ? `https://www.google.com/maps?saddr=${a}&daddr=${b}&output=embed` : `https://www.google.com/maps?q=${a}&output=embed`,
    link: route ? `https://www.google.com/maps/dir/?api=1&origin=${a}&destination=${b}&travelmode=driving` : `https://www.google.com/maps/search/?api=1&query=${a}`
  };
}
let gmBad = 0, vt, cs = null, ct = null;
const useJS = () => window.GMAPS_KEY && !gmBad;
window.gm_authFailure = () => { gmBad = 1; if (view === 'track') render(); };
window.gmReady = () => { if (view === 'track') drawMap(); };
function loadG() {
  if (window.google && google.maps) return drawMap(); if (document.getElementById('gms')) return;
  const e = document.createElement('script'); e.id = 'gms'; e.async = 1; e.src = 'https://maps.googleapis.com/maps/api/js?key=' + window.GMAPS_KEY + '&callback=gmReady';
  e.onerror = () => { gmBad = 1; render(); }; document.head.appendChild(e);
}
function drawMap() {
  const d = DB.get('donations', sel), el = $('#tmap'); if (!el || !d || !window.google || !google.maps) return; clearInterval(vt);
  const map = new google.maps.Map(el, { zoom: 12, center: { lat: 19.076, lng: 72.8777 }, mapTypeControl: false, streetViewControl: false }), ngo = DB.ngo(d), donor = DB.donor(d);
  if (!ngo || d.status === 'expired') { new google.maps.Geocoder().geocode({ address: donor.address }, (r, st) => { if (st === 'OK') { map.setCenter(r[0].geometry.location); map.setZoom(15); new google.maps.Marker({ map, position: r[0].geometry.location, title: donor.name }); } }); return; }
  const dr = new google.maps.DirectionsRenderer({ map });
  new google.maps.DirectionsService().route({ origin: donor.address, destination: ngo.address, travelMode: 'DRIVING' }, (res, st) => {
    if (st !== 'OK') return; dr.setDirections(res); if (d.status !== 'enroute') return;
    const path = res.routes[0].overview_path, vm = new google.maps.Marker({ map, position: path[0], title: 'Volunteer', icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#f2a900', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 } });
    vt = setInterval(() => { if (!document.body.contains(el)) { clearInterval(vt); return; } const left = Math.max(0, ((d.etaAt || 0) - Date.now()) / (d.etaTotal || 8 * MIN)); vm.setPosition(path[Math.min(path.length - 1, Math.floor((1 - left) * path.length))]); }, 1000);
  });
}
function openMap(d) {
  const m = mapOf(d), f = $('#mapf'), emb = window.EMBED_MAPS !== false; f.hidden = !emb; if (emb) f.src = m.embed; $('#mapl').href = m.link;
  $('#mapt').textContent = m.route ? 'Pickup route' : 'Pickup location';
  $('#mapi').textContent = m.route ? `${m.from} → ${m.to}` : `${m.from} · waiting for an NGO`;
  $('#mapm').classList.add('on'); pop('#mapm .card');
}
const closeMap = () => { $('#mapm').classList.remove('on'); $('#mapf').src = 'about:blank'; };

/* ---------- Camera QR scanning ---------- */
async function camOn() {
  if (!navigator.mediaDevices || (!window.BarcodeDetector && !window.jsQR)) return toast('Camera scanning is not supported here. Type the code instead.');
  try { cs = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); } catch (e) { return toast('Camera permission denied. Type the code instead.'); }
  const v = $('#cam'), c = $('#camc'), x = c.getContext('2d'), bd = window.BarcodeDetector ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
  v.srcObject = cs; await v.play(); $('#camm').classList.add('on');
  ct = setInterval(async () => {
    if (!v.videoWidth) return; let val = null;
    try { if (bd) { const r = await bd.detect(v); val = r[0] && r[0].rawValue; } else { c.width = v.videoWidth; c.height = v.videoHeight; x.drawImage(v, 0, 0); const dt = x.getImageData(0, 0, c.width, c.height), r = jsQR(dt.data, dt.width, dt.height); val = r && r.data; } } catch (e) { /* keep scanning */ }
    if (val) { camOff(); const f = $('#sc'); if (f) f.value = val; scan(val); }
  }, 350);
}
function camOff() { clearInterval(ct); if (cs) cs.getTracks().forEach(t => t.stop()); cs = null; $('#camm').classList.remove('on'); }

/* ---------- Screens ---------- */
const V = {
  home() {
    const st = DB.stats(), waiting = DB.byStatus('listed').length;
    return `<section class="hero"><canvas id="cv"></canvas><div><h1>Every spare plate has a place to go.</h1><p>Annasetu connects restaurants and event hosts with NGOs in your city. List surplus food, get it picked up with a QR check, and track every meal to its destination.</p><button class="btn" data-go="donor">Donate food</button> <button class="btn alt" data-go="ngo">I'm an NGO</button></div></section>
<main><div class="grid"><div class="card kpi"><b>${st.meals}</b><span>meals delivered</span></div><div class="card kpi"><b>${waiting}</b><span>donations waiting for an NGO</span></div><div class="card kpi"><b>${st.co2} kg</b><span>CO₂ avoided</span></div><div class="card kpi"><b>${DB.s.donors.length + DB.s.ngos.length}</b><span>partner donors and NGOs</span></div></div>
<h2 style="margin-top:36px">How a donation moves</h2><div class="grid"><div class="card"><h3>1. List</h3><p class="mut">A restaurant or caterer lists surplus food with quantity and a safe-to-eat expiry time.</p></div><div class="card"><h3>2. Claim</h3><p class="mut">A nearby NGO claims it. The donor's QR code is generated for the pickup.</p></div><div class="card"><h3>3. Scan</h3><p class="mut">The NGO scans the QR at pickup. Status switches to Picked up automatically.</p></div><div class="card"><h3>4. Deliver</h3><p class="mut">The NGO confirms delivery, and meals and CO₂ saved appear in Analytics.</p></div></div></main>`;
  },
  donor() {
    const me = DB.get('donors', sess().donorId), mine = DB.s.donations.filter(d => d.donorId === me.id);
    return `<main><h2>Donor dashboard</h2><div class="grid"><div class="card"><h3>List surplus food</h3>
<label>Donating as<select id="asd">${opts(DB.s.donors, me.id, x => `${x.name} · ${x.area}`)}</select></label>
<p class="mut" style="margin-top:-4px">Pickup address: ${esc(me.address)}</p>
<label>Food item<input id="f" maxlength="${LIMITS.name}" placeholder="e.g. Paneer curry and naan"></label>
<label>Category<select id="fc">${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
<label>Type<select id="fv"><option value="1">Vegetarian</option><option value="0">Non-vegetarian</option></select></label>
<label>Meals it can serve<input id="m" type="number" value="50" min="${LIMITS.meals[0]}" max="${LIMITS.meals[1]}"></label>
<label>Weight (kg)<input id="k" type="number" value="20" min="${LIMITS.kg[0]}" max="${LIMITS.kg[1]}" step="0.5"></label>
<label>Safe to eat for (minutes)<input id="e" type="number" value="120" min="${LIMITS.shelfMin[0]}" max="${LIMITS.shelfMin[1]}"></label>
<button class="btn" data-a="add">List food</button></div>
<div class="card" style="grid-column:span 2"><h3>Your donations · ${esc(me.name)}</h3>${mine.length ? mine.map(d => `<div class="row" style="border-top:1px solid var(--ln);padding:10px 0"><div><span class="mut" style="font-size:12px">#${d.id}</span><br><b>${esc(d.food.name)}</b> ${vegTag(d.food)}<br><span class="mut">${d.qty.meals} meals · ${d.qty.kg} kg · ${CATEGORIES[d.food.category]}</span><br>${cd(d)}</div><div>${tag(d.status)} <button class="btn sm alt" data-a="qr" data-id="${d.id}">Show QR</button></div></div>`).join('') : '<p class="mut">No donations yet. List your first surplus food on the left.</p>'}</div></div></main>`;
  },
  list() {
    const L = DB.s.donations.filter(d => filter === 'all' || d.status === filter), ngo = DB.get('ngos', sess().ngoId);
    return `<main><div class="row"><h2>Surplus food nearby</h2><select id="flt" style="width:auto"><option value="all">All</option>${Object.keys(STATUS_LABEL).map(s => `<option value="${s}" ${filter === s ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}</select></div><div class="grid">${L.map(d => { const dn = DB.donor(d), n = DB.ngo(d);
      return `<div class="card"><div class="row"><span class="mut" style="font-size:12px">#${d.id}</span>${tag(d.status)}</div><b>${esc(d.food.name)}</b> ${vegTag(d.food)}<p class="mut">${esc(dn.name)} · ${esc(dn.area)}<br>${d.qty.meals} meals · ${d.qty.kg} kg · ${CATEGORIES[d.food.category]}${n ? '<br>NGO: ' + esc(n.name) : ''}</p>${cd(d)}<div style="margin-top:10px">${d.status === 'listed' ? `<button class="btn sm" data-a="claim" data-id="${d.id}">Claim as ${esc(ngo.name)}</button>` : ''}</div></div>`; }).join('') || '<p class="mut">Nothing matches this filter.</p>'}</div></main>`;
  },
  ngo() {
    const me = DB.get('ngos', sess().ngoId), mine = DB.s.donations.filter(d => d.ngoId === me.id && ['claimed', 'enroute', 'picked'].includes(d.status)), load = mine.reduce((s, d) => s + d.qty.meals, 0);
    return `<main><h2>NGO dashboard</h2><div class="grid"><div class="card"><label>Acting as<select id="asn">${opts(DB.s.ngos, me.id, x => `${x.name} · ${x.area}`)}</select></label><p class="mut" style="margin-top:-4px">${esc(me.address)}<br>Capacity ${me.capacity} meals · committed ${load}</p>
<h3 style="margin-top:18px">Scan pickup QR</h3><p class="mut">Scan the donor's QR, or type the code printed under it.</p><label>QR code<input id="sc" placeholder="AS-XXXXXX"></label><button class="btn" data-a="cam">Scan with camera</button> <button class="btn" data-a="scan">Verify and mark picked up</button> <button class="btn alt sm" data-a="sim">Simulate scan</button></div>
<div class="card" style="grid-column:span 2"><h3>Your pickups · ${esc(me.name)}</h3>${mine.length ? mine.map(d => `<div class="row" style="border-top:1px solid var(--ln);padding:10px 0"><div><span class="mut" style="font-size:12px">#${d.id}</span><br><b>${esc(d.food.name)}</b><br><span class="mut">${esc(DB.donor(d).name)} · ${esc(DB.donor(d).area)} · ${d.qty.meals} meals</span><br>${cd(d)}</div><div>${tag(d.status)} ${d.status === 'claimed' ? `<button class="btn sm" data-a="dispatch" data-id="${d.id}">Send volunteer</button>` : ''} ${d.status === 'picked' ? `<button class="btn sm" data-a="del" data-id="${d.id}">Confirm delivery</button>` : ''}</div></div>`).join('') : '<p class="mut">No active pickups. Claim food from Surplus food.</p>'}</div></div></main>`;
  },
  track() {
    const d = DB.get('donations', sel) || DB.byStatus('enroute')[0] || DB.s.donations[0]; sel = d.id; const m = mapOf(d), ngo = DB.ngo(d);
    return `<main><h2>Pickup tracking</h2><p class="mut">Donation #${d.id} · ${esc(d.food.name)} · ${esc(DB.donor(d).name)} → ${ngo ? esc(ngo.name) : 'waiting for an NGO'}</p>
<label style="max-width:420px">Choose a donation<select id="tsel">${DB.s.donations.map(x => `<option value="${x.id}" ${x.id === d.id ? 'selected' : ''}>#${x.id} · ${esc(x.food.name)}</option>`).join('')}</select></label>
<div class="tgrid"><div class="card"><div class="row"><h3 style="margin:0">Status</h3>${tag(d.status)}</div>${steps(d)}</div>
<div class="card"><h3>Live route</h3>${useJS() ? '<div id="tmap" role="img" aria-label="Live route map"></div>' : window.EMBED_MAPS === false ? '<div id="tmap" class="mapph">Map preview is not available on this page. Use Open in Google Maps to see the route.</div>' : `<iframe id="tmap" title="Route map from pickup to NGO kitchen" loading="lazy" src="${m.embed}"></iframe>`}<p class="mut">${vinfo(d)}</p><button class="btn sm alt" data-a="map" data-id="${d.id}">Expand map</button> <a class="btn sm" href="${m.link}" target="_blank" rel="noopener" style="text-decoration:none;display:inline-block">Open in Google Maps</a></div></div>
<h3 style="margin-top:32px">All donations</h3><div class="grid">${DB.s.donations.map(x => `<div class="card"><div class="row"><b>${esc(x.food.name)}</b><span><button class="mapbtn" data-a="map" data-id="${x.id}" aria-label="Open ${esc(x.food.name)} in Google Maps" title="Open map">${PIN}</button>${tag(x.status)}</span></div><p class="mut">#${x.id} · ${esc(DB.donor(x).name)}${DB.ngo(x) ? ' → ' + esc(DB.ngo(x).name) : ''}</p>${tl(x)}<button class="btn sm alt" style="margin-top:10px" data-a="pick" data-id="${x.id}">Track</button></div>`).join('')}</div></main>`;
  },
  stats() {
    const st = DB.stats(), C = { listed: '#f2a900', claimed: '#2b6cb0', enroute: '#6b5bd2', picked: '#5aa63a', delivered: '#1d8a5a', expired: '#c0392b' };
    return `<main><h2>Waste analytics</h2><div class="grid"><div class="card kpi"><b>${st.meals}</b><span>meals delivered</span></div><div class="card kpi"><b>${st.kg} kg</b><span>food rescued</span></div><div class="card kpi"><b>${st.co2} kg</b><span>CO₂ avoided (est. ${CO2_PER_KG} kg per kg)</span></div><div class="card kpi"><b>${st.rate}%</b><span>rescue rate (${st.lost} meals expired)</span></div></div>
<div class="grid" style="margin-top:14px"><div class="card"><h3>Delivered by category</h3>${bars(st.byCategory, C.delivered)}</div><div class="card"><h3>Delivered by NGO</h3>${bars(st.byNgo, C.claimed)}</div><div class="card"><h3>Meals listed by donor</h3>${bars(st.byDonor, C.listed)}</div></div>
<div class="card" style="margin-top:14px"><h3>Meals per donation</h3>${DB.s.donations.map(d => `<div class="bar"><span class="bl">${esc(d.food.name)}</span><s style="width:${d.qty.meals / Math.max(...DB.s.donations.map(x => x.qty.meals)) * 60}%;background:${C[d.status]}"></s>${d.qty.meals}</div>`).join('')}<p class="mut">Bar colour shows current status: ${Object.keys(STATUS_LABEL).map(s => `<span style="color:${C[s]}">■</span> ${STATUS_LABEL[s]}`).join(' ')}</p></div>
<p style="margin-top:18px"><button class="btn sm alt" data-a="reset">Reset demo data</button></p></main>`;
  }
};

/* ---------- Rendering and motion ---------- */
function render() {
  if (heroOff) { heroOff(); heroOff = null; } if (!V[view]) view = 'home';
  $('#nav').innerHTML = '<b>Annasetu</b>' + TABS.map(t => `<a data-go="${t[0]}" class="${view === t[0] ? 'on' : ''}" tabindex="0">${t[1]}</a>`).join('');
  $('#app').innerHTML = V[view](); if (view === 'home') hero(); if (view === 'track' && useJS()) loadG(); fx();
}
function go(v) { view = v; location.hash = v; render(); }
function pop(s) { if (window.Motion && !RM()) Motion.animate(s, { scale: [.8, 1], opacity: [0, 1] }, { type: 'spring', stiffness: 320, damping: 22 }); }
function celebrate(t) { $('#okt').textContent = t; const o = $('#okv'); o.style.display = 'grid'; pop('#okv .card'); if (window.Motion && !RM()) Motion.animate('#ckp', { strokeDashoffset: [40, 0] }, { duration: .5, delay: .25 }); setTimeout(() => o.style.display = 'none', 1500); }
function fx() {
  if (lastV === view) return; lastV = view; scrollTo(0, 0); if (!window.Motion || RM()) return;
  const { animate, stagger, inView } = Motion, R = 'main h2,main .card';
  animate('.hero h1,.hero p,.hero .btn', { opacity: [0, 1], y: [28, 0] }, { delay: stagger(.1, { startDelay: .1 }), duration: .7, ease: EZ });
  document.querySelectorAll(R).forEach(e => e.style.opacity = 0);
  inView(R, i => { animate(i.target, { opacity: [0, 1], y: [24, 0] }, { duration: .5, ease: EZ }); }, { margin: '0px 0px -8% 0px' });
  setTimeout(() => document.querySelectorAll(R).forEach(e => { if (e.style.opacity === '0') e.style.opacity = 1; }), 2500);
  document.querySelectorAll('.kpi b').forEach(b => { const m = b.textContent.match(/^(\d+)(.*)$/); if (m) animate(0, +m[1], { duration: 1.3, ease: 'easeOut', onUpdate: v => b.textContent = Math.round(v) + m[2] }); });
  document.querySelectorAll('.bar s').forEach((s, n) => animate(s, { scaleX: [0, 1] }, { duration: .8, delay: .2 + n * .05, ease: EZ }));
  document.querySelectorAll('.vt li').forEach((l, n) => animate(l, { opacity: [0, 1], x: [-12, 0] }, { duration: .4, delay: .25 + n * .1 }));
  document.querySelectorAll('.tl i.d').forEach((s, n) => animate(s, { scaleX: [0, 1] }, { duration: .5, delay: n * .12 }));
}
let heroOff = null;
function hero() { const cv = $('#cv'); if (!cv || typeof initHero3D !== 'function') return; try { heroOff = initHero3D(cv); } catch (e) { heroOff = null; console.error('3D hero failed, showing the page without it:', e); } }
function showQR(d) { $('#mt').textContent = d.food.name; $('#mc').textContent = `#${d.id} · Code: ${d.code}`; $('#qr').innerHTML = ''; new QRCode($('#qr'), { text: d.code, width: 170, height: 170 }); $('#modal').classList.add('on'); pop('#modal .card'); }
async function apiRequest(path, options = {}) {
  const response = await fetch((window.ANNASETU_API_BASE || 'http://127.0.0.1:5000/api') + path, {
    method: options.method || 'GET', headers: { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.msg || payload.error || `Request failed (${response.status})`);
  return payload;
}
async function refreshServerState() {
  const payload = await apiRequest('/bootstrap');
  const previous = DB.s && DB.s.session ? DB.s.session : { donorId: 'D-001', ngoId: 'N-001' };
  DB.s = payload.state;
  DB.s.session = {
    donorId: DB.s.donors.some(x => x.id === previous.donorId) ? previous.donorId : (DB.s.donors[0] || {}).id,
    ngoId: DB.s.ngos.some(x => x.id === previous.ngoId) ? previous.ngoId : (DB.s.ngos[0] || {}).id
  };
  CO2_PER_KG = payload.co2PerKg || 2.5;
  return payload;
}
async function scan(raw) {
  try {
    const r = await apiRequest('/pickup/verify', { method: 'POST', body: { code: raw, ngoId: sess().ngoId } });
    await refreshServerState(); toast(r.msg); celebrate('QR verified'); render();
  } catch (e) { toast(e.message); }
}
async function bootBackend() {
  try { await refreshServerState(); render(); }
  catch (e) {
    render();
    toast('Backend unavailable. Start MySQL and the Flask API, then reload.');
    console.error('Annasetu backend connection failed:', e);
    const banner = $('#alert'); banner.style.display = 'block';
    banner.textContent = 'Backend unavailable. Start MySQL and Flask, then reload. Demo data currently shown is local only.';
  }
}

/* ---------- Events ---------- */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-go],[data-a]'); if (!t) return; if (t.dataset.go) return go(t.dataset.go);
  const a = t.dataset.a, d = DB.get('donations', t.dataset.id), me = sess();
  const done = async promise => { try { const r = await promise; await refreshServerState(); toast(r.msg); render(); } catch (err) { toast(err.message); } };
  switch (a) {
    case 'close': $('#modal').classList.remove('on'); break;
    case 'map': openMap(d); break;
    case 'mclose': closeMap(); break;
    case 'cam': camOn(); break;
    case 'camx': camOff(); break;
    case 'pick': sel = d.id; render(); scrollTo({ top: 0, behavior: 'smooth' }); break;
    case 'qr': showQR(d); break;
    case 'claim': done(apiRequest(`/donations/${encodeURIComponent(d.id)}/claim`, { method: 'POST', body: { ngoId: me.ngoId } })); break;
    case 'dispatch': done(apiRequest(`/donations/${encodeURIComponent(d.id)}/dispatch`, { method: 'POST', body: { ngoId: me.ngoId } })); break;
    case 'del': done(apiRequest(`/donations/${encodeURIComponent(d.id)}/deliver`, { method: 'POST', body: { ngoId: me.ngoId } })); break;
    case 'scan': scan($('#sc').value); break;
    case 'sim': { const c = DB.s.donations.find(x => x.ngoId === me.ngoId && ['claimed', 'enroute'].includes(x.status)); $('#sc').value = c ? c.code : ''; if (!c) toast('No claimed pickup to scan for this NGO yet.'); break; }
    case 'add': {
      try {
        const r = await apiRequest('/donations', { method: 'POST', body: { donorId: me.donorId, name: $('#f').value, category: $('#fc').value, veg: $('#fv').value === '1', meals: Number($('#m').value), kg: Number($('#k').value), shelfMin: Number($('#e').value) } });
        await refreshServerState(); const created = DB.get('donations', r.id); toast(r.msg || 'Donation listed.'); render(); if (created) showQR(created);
      } catch (err) { toast(err.message); }
      break;
    }
    case 'reset': if (confirm('Reset all demo data to the starting set?')) { try { const r = await apiRequest('/demo/reset', { method: 'POST', body: {} }); await refreshServerState(); sel = null; filter = 'all'; render(); toast(r.msg || 'Demo data reset.'); } catch (err) { toast(err.message); } } break;
  }
});
document.addEventListener('change', e => {
  const id = e.target.id;
  if (id === 'flt') { filter = e.target.value; render(); }
  else if (id === 'tsel') { sel = e.target.value; render(); }
  else if (id === 'asd') { sess().donorId = e.target.value; DB.save(); render(); }
  else if (id === 'asn') { sess().ngoId = e.target.value; DB.save(); render(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('nav a')) go(e.target.dataset.go);
  if (e.key === 'Escape') { camOff(); $('#modal').classList.remove('on'); closeMap(); }
});
addEventListener('hashchange', () => { const v = location.hash.slice(1); if (V[v] && v !== view) { view = v; render(); } });

/* Once per second: update countdowns, expire overdue food, refresh the alert banner. Forms are never re-rendered. */
setInterval(() => {
  document.querySelectorAll('.eta').forEach(e => { const d = DB.get('donations', e.dataset.id); if (d && d.etaAt) e.textContent = etaMin(d); });
  if (Date.now() - (window._lastExpiryCheck || 0) > 30000) {
    window._lastExpiryCheck = Date.now();
    apiRequest('/expire', { method: 'POST', body: {} }).then(async r => { if (r.expired) { await refreshServerState(); if (!document.activeElement.matches('input,select')) render(); } }).catch(err => console.warn('Expiry sweep failed:', err.message));
  }
  const changed = false;
  document.querySelectorAll('.cd').forEach(e => { const d = DB.get('donations', e.dataset.id); if (d && LIVE.includes(d.status)) { e.textContent = 'Expires in ' + fmt(d.expiresAt - Date.now()); e.className = cdClass(d); } });
  const urgent = DB.byStatus(...LIVE).filter(d => d.expiresAt - Date.now() < 30 * MIN), al = $('#alert');
  al.style.display = urgent.length ? 'block' : 'none';
  al.textContent = urgent.length ? 'Expiry alert: ' + urgent.map(d => `${d.food.name} (${fmt(d.expiresAt - Date.now())})`).join('; ') : '';
  if (changed && view !== 'home' && !document.activeElement.matches('input,select')) render();
}, 1000);
bootBackend();
