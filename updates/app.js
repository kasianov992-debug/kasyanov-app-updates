const STORE_KEY = "ip_kasyanov_v1";
function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const d = JSON.parse(raw); if (d && d.carriers) return d; }
  } catch (e) {}
  const seed = JSON.parse(JSON.stringify(SEED));
  saveStore(seed);
  return seed;
}
function saveStore(d) { localStorage.setItem(STORE_KEY, JSON.stringify(d)); }
function normName(s) {
  return String(s || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}
function normPlate(s) {
  return String(s || "").toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
}
function allocId(kind, list) {
  if (!DB.next) DB.next = {carrier:100,driver:100,truck:100,zayavka:100,trip:100,quote:100};
  const maxExisting = (list || []).reduce((m, x) => Math.max(m, Number(x.id) || 0), 0);
  let n = Math.max(Number(DB.next[kind]) || 1, maxExisting + 1);
  DB.next[kind] = n + 1;
  return n;
}
function findCarrier(inn, fullName) {
  if (inn) {
    const byInn = DB.carriers.find(c => String(c.inn || "") === String(inn));
    if (byInn) return byInn;
  }
  const n = normName(fullName);
  if (!n) return null;
  return DB.carriers.find(c => normName(c.full_name) === n) || null;
}
function findDriverByName(fullName) {
  const n = normName(fullName);
  if (!n) return null;
  return DB.drivers.find(d => normName(d.full_name) === n) || null;
}
function findTruckByPlate(tractor, trailer) {
  const p = normPlate(tractor);
  if (!p) return null;
  const tr = normPlate(trailer || "");
  return DB.trucks.find(t => {
    if (normPlate(t.tractor_number) !== p) return false;
    if (!tr) return true;
    return normPlate(t.trailer_number) === tr;
  }) || null;
}

function zayavkaTombstoneKey(number, date, carrierInn, carrierName) {
  return [String(number || ""), String(date || ""), String(carrierInn || ""), normName(carrierName || "")].join("|");
}
function isZayavkaDeleted(number, date, carrierInn, carrierName) {
  if (!DB.deleted_zayavki || !DB.deleted_zayavki.length) return false;
  const key = zayavkaTombstoneKey(number, date, carrierInn, carrierName);
  return DB.deleted_zayavki.some(t => zayavkaTombstoneKey(t.number, t.date, t.carrier_inn, t.carrier_name) === key);
}
function markZayavkaDeleted(z) {
  if (!DB.deleted_zayavki) DB.deleted_zayavki = [];
  const c = (z && z.carrier) || {};
  const row = {
    number: String(z.number || ""),
    date: String(z.date || ""),
    carrier_inn: String(c.inn || ""),
    carrier_name: String(c.full_name || ""),
    deleted_at: new Date().toISOString()
  };
  if (!isZayavkaDeleted(row.number, row.date, row.carrier_inn, row.carrier_name)) {
    DB.deleted_zayavki.push(row);
  }
}
function isBlankZayavka(z) {
  if (!z) return true;
  const has = (v) => String(v || "").trim() !== "";
  return !has(z.number) && !has(z.loading_address) && !has(z.unloading_address) && !has(z.rate) && !has(z.driver) && !has(z.cargo)
    && !(z.carrier && (has(z.carrier.full_name) || has(z.carrier.inn)));
}
function purgeBlankZayavki() {
  if (!DB.zayavki) return 0;
  const before = DB.zayavki.length;
  DB.zayavki = DB.zayavki.filter(z => !isBlankZayavka(z));
  return before - DB.zayavki.length;
}
function zayavkaExists(number, date, carrierInn, carrierName) {
  const num = String(number || "");
  const dt = String(date || "");
  const inn = String(carrierInn || "");
  const n = normName(carrierName || "");
  return DB.zayavki.some(z => {
    if (String(z.number || "") !== num) return false;
    if (String(z.date || "") !== dt) return false;
    const zc = z.carrier || {};
    if (inn && String(zc.inn || "") === inn) return true;
    if (n && normName(zc.full_name) === n) return true;
    return false;
  });
}
function tripTombstoneKey(date, driver, route, carrier) {
  return [String(date || ""), normName(driver || ""), normName(route || ""), normName(carrier || "")].join("|");
}
function isTripDeleted(date, driver, route, carrier, id) {
  if (!DB.deleted_trips || !DB.deleted_trips.length) return false;
  if (id != null && DB.deleted_trips.some(t => t.id != null && Number(t.id) === Number(id))) return true;
  const key = tripTombstoneKey(date, driver, route, carrier);
  return DB.deleted_trips.some(t => tripTombstoneKey(t.date, t.driver, t.route, t.carrier) === key);
}
function markTripDeleted(t) {
  if (!DB.deleted_trips) DB.deleted_trips = [];
  const row = {
    id: t && t.id != null ? Number(t.id) : null,
    date: String((t && t.date) || ""),
    driver: String((t && t.driver) || ""),
    route: String((t && t.route) || ""),
    carrier: String((t && t.carrier) || ""),
    deleted_at: new Date().toISOString()
  };
  if (!isTripDeleted(row.date, row.driver, row.route, row.carrier, row.id)) {
    DB.deleted_trips.push(row);
  }
}
function tripExists(date, driver) {
  const d = String(date || "");
  const n = normName(driver);
  return DB.trips.some(t => String(t.date || "") === d && normName(t.driver) === n);
}
function mergeImportPack(pack) {
  if (!DB.carriers) DB.carriers = [];
  if (!DB.drivers) DB.drivers = [];
  if (!DB.trucks) DB.trucks = [];
  if (!DB.trips) DB.trips = [];
  if (!DB.zayavki) DB.zayavki = [];
  if (!DB.quotes_extra) DB.quotes_extra = [];
  if (!DB.deleted_zayavki) DB.deleted_zayavki = [];
  if (!DB.deleted_trips) DB.deleted_trips = [];
  if (!DB.deleted_mail) DB.deleted_mail = [];
  if (!DB.mail_feed) DB.mail_feed = [];
  if (!DB.mail_seen) DB.mail_seen = [];
  const added = {carriers:0, drivers:0, trucks:0, trips:0, zayavki:0};
  for (const src of (pack.carriers || [])) {
    const existing = findCarrier(src.inn, src.full_name);
    if (existing) {
      // matched by ИНН (preferred) or name: fill ONLY blank fields, never overwrite
      if (src.inn && String(existing.inn || "") === String(src.inn)) {
        const fields = ["type","full_name","kpp","ogrn","address","phone","bank","bik","ks","rs","signatory","notes"];
        for (const f of fields) {
          const incoming = src[f];
          if (incoming == null || String(incoming).trim() === "") continue;
          if (String(existing[f] || "").trim() !== "") continue;
          existing[f] = incoming;
        }
      }
      continue;
    }
    const row = {
      id: allocId("carrier", DB.carriers),
      type: src.type || "ИП",
      full_name: src.full_name || "",
      inn: src.inn || "",
      kpp: src.kpp || "",
      ogrn: src.ogrn || "",
      address: src.address || "",
      phone: src.phone || "",
      bank: src.bank || "",
      bik: src.bik || "",
      ks: src.ks || "",
      rs: src.rs || "",
      signatory: src.signatory || "",
      notes: src.notes || ""
    };
    DB.carriers.push(row);
    added.carriers++;
  }
  for (const src of (pack.drivers || [])) {
    let drv = findDriverByName(src.full_name);
    let carrierId = null;
    if (src._carrier_inn) {
      const c = findCarrier(src._carrier_inn, null);
      if (c) carrierId = c.id;
    }
    if (!drv) {
      drv = {
        id: allocId("driver", DB.drivers),
        carrier_id: carrierId,
        full_name: src.full_name || "",
        birth_date: src.birth_date || "",
        passport: "",
        passport_issued: "",
        address: src.address || "",
        license_number: src.license_number || "",
        license_issued: src.license_issued || "",
        phone: src.phone || "",
        notes: src.notes || "",
        block: ""
      };
      DB.drivers.push(drv);
      added.drivers++;
    } else if (drv.carrier_id == null && carrierId != null) {
      drv.carrier_id = carrierId;
    }
    const tk = src._truck;
    if (tk && tk.tractor_number) {
      let truck = findTruckByPlate(tk.tractor_number, tk.trailer_number);
      if (!truck) {
        truck = {
          id: allocId("truck", DB.trucks),
          carrier_id: carrierId,
          driver_id: drv.id,
          line: tk.line || "",
          brand: tk.brand || "",
          tractor_number: tk.tractor_number || "",
          trailer_brand: tk.trailer_brand || "",
          trailer_number: tk.trailer_number || "",
          notes: tk.line || ""
        };
        DB.trucks.push(truck);
        added.trucks++;
      } else {
        if (truck.carrier_id == null && carrierId != null) truck.carrier_id = carrierId;
        if (truck.driver_id == null) truck.driver_id = drv.id;
      }
      if (drv.truck_id == null) drv.truck_id = truck.id;
    }
  }
  for (const src of (pack.trips || [])) {
    if (isTripDeleted(src.date, src.driver, src.route, src.carrier, src.id)) continue;
    if (tripExists(src.date, src.driver)) continue;
    DB.trips.push({
      id: allocId("trip", DB.trips),
      date: src.date || "",
      client: src.client || "",
      route: src.route || "",
      carrier: src.carrier || "",
      driver: src.driver || "",
      client_rate: Number(src.client_rate) || 0,
      carrier_rate: Number(src.carrier_rate) || 0,
      pay_client: src.pay_client || "не оплачено",
      pay_carrier: src.pay_carrier || "не оплачено",
      zayavka_id: src.zayavka_id == null ? null : src.zayavka_id,
      note: src.note || ""
    });
    added.trips++;
  }
  for (const src of (pack.zayavki || [])) {
    const cSnap = src.carrier || {};
    const inn = src._carrier_inn || cSnap.inn || "";
    const found = findCarrier(inn, cSnap.full_name || src._carrier_name || "");
    const cName = cSnap.full_name || (found && found.full_name) || src._carrier_name || "";
    const cInn = inn || (found && found.inn) || "";
    if (isZayavkaDeleted(src.number, src.date, cInn, cName)) continue;
    if (zayavkaExists(src.number, src.date, cInn, cName)) continue;
    const carrierObj = Object.assign({
      type: "ИП", full_name: "", inn: "", kpp: "", ogrn: "", address: "",
      bik: "", bank: "", ks: "", rs: "", signatory: ""
    }, found ? {
      type: found.type, full_name: found.full_name, inn: found.inn, kpp: found.kpp || "",
      ogrn: found.ogrn || "", address: found.address || "", bik: found.bik || "",
      bank: found.bank || "", ks: found.ks || "", rs: found.rs || "", signatory: found.signatory || ""
    } : {}, cSnap);
    const row = {
      id: allocId("zayavka", DB.zayavki),
      number: String(src.number || ""),
      date: src.date || "",
      with_stamp: src.with_stamp !== false,
      loading_address: src.loading_address || "",
      loading_datetime: src.loading_datetime || "",
      delivery_date: src.delivery_date || "",
      unloading_address: src.unloading_address || "",
      weight_kg: src.weight_kg || "",
      cargo: src.cargo || "",
      rate: src.rate || "",
      truck: src.truck || "",
      driver: src.driver || "",
      carrier_id: found ? found.id : null,
      carrier: carrierObj,
      created_at: src.date || ""
    };
    DB.zayavki.push(row);
    added.zayavki++;
  }
  return added;
}
function applyVersionedImports() {
  if (typeof IMPORT_PACKS === "undefined" || !IMPORT_PACKS || !IMPORT_PACKS.length) return;
  if (!DB.imports_done) DB.imports_done = [];
  let changed = false;
  const summary = [];
  for (const pack of IMPORT_PACKS) {
    if (!pack || !pack.id) continue;
    if (DB.imports_done.indexOf(pack.id) >= 0) continue;
    const added = mergeImportPack(pack);
    DB.imports_done.push(pack.id);
    changed = true;
    summary.push({id: pack.id, added: added});
  }
  if (changed) saveStore(DB);
  window.__lastImportSummary = summary;
}
let DB = loadStore();
if (!DB.deleted_zayavki) DB.deleted_zayavki = [];
if (!DB.deleted_trips) DB.deleted_trips = [];
if (!DB.deleted_mail) DB.deleted_mail = [];
if (!DB.mail_feed) DB.mail_feed = [];
if (!DB.mail_seen) DB.mail_seen = [];
applyVersionedImports();
try { let ch=false; if (typeof ensureTrucksFromSources === "function") { if (ensureTrucksFromSources()) ch=true; } if (typeof linkTrucksToCarriers === "function") { const r = linkTrucksToCarriers(); if (r && r.linked_now) ch=true; } if (ch) saveStore(DB); } catch (e) {}
(function () {
  const n = purgeBlankZayavki();
  if (n) saveStore(DB);
})();
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}
function money(n) {
  if (n == null || n === "") return "—";
  return Number(n).toLocaleString("ru-RU");
}
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function fmtDate(d) {
  if (!d || d === "None" || d === "null") return "—";
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[3] + "." + m[2] + "." + m[1];
  return String(d);
}
function dateText(iso) {
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return fmtDate(iso);
  const months = ["","января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  return Number(m[3]) + " " + months[Number(m[2])] + " " + m[1];
}
function carrierTableLine(c) {
  if (!c) return "";
  const t = (c.type || "ИП").toUpperCase() === "ИП" ? "ИП" : (c.type || "");
  let s = (t ? t + " " : "") + (c.full_name || "");
  if (c.inn) s += " ИНН " + c.inn;
  return s.trim();
}
function executorTitle(c) {
  if (!c) return "";
  const t = (c.type || "ИП").toUpperCase();
  if (t === "ИП") return "ИП " + (c.full_name || "");
  return (c.type || "") + " " + (c.full_name || "");
}
let currentTab = "pochta", editingZayavkaId = null, previewZayavkaId = null;
let zayavkaFormBaseline = null; // JSON snapshot after open/save; null = not on form
let zayavkaFormSaved = true;
let editingTripId = null;
let tripFormBaseline = null;
let tripFormSaved = true;
const MAIL_SEEN_KEY = "ip_kasyanov_mail_seen_v1";
const MAIL_SOUND_KEY = "ip_kasyanov_mail_sound_v1";
const MAIL_SOUND_KNOWN_KEY = "ip_kasyanov_mail_sound_known_v1";
const DOC_TITLE_BASE = "Магистраль — система для экспедиторов";
const MAIL_AUTO_REFRESH_MS = 2 * 60 * 1000;

function isMailSoundEnabled() {
  try {
    const v = localStorage.getItem(MAIL_SOUND_KEY);
    if (v == null) return true;
    return v !== "0" && v !== "false" && v !== "off";
  } catch (e) { return true; }
}
function setMailSoundEnabled(on) {
  try { localStorage.setItem(MAIL_SOUND_KEY, on ? "1" : "0"); } catch (e) {}
}
function loadMailSoundKnownIds() {
  try {
    const raw = localStorage.getItem(MAIL_SOUND_KNOWN_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    const set = {};
    for (const id of Array.isArray(arr) ? arr : []) if (id) set[id] = 1;
    return set;
  } catch (e) { return {}; }
}
function saveMailSoundKnownIds(set) {
  try { localStorage.setItem(MAIL_SOUND_KNOWN_KEY, JSON.stringify(Object.keys(set || {}))); } catch (e) {}
}
function seedMailSoundKnownFromFeed() {
  const set = loadMailSoundKnownIds();
  for (const it of (DB && DB.mail_feed) || []) if (it && it.id) set[it.id] = 1;
  saveMailSoundKnownIds(set);
}
function setMailSoundHint(msg) {
  window.__mailSoundHint = msg || "";
  const el = document.getElementById("mail-sound-hint");
  if (el) el.textContent = window.__mailSoundHint;
}
function playMailNotifySound(opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        setMailSoundHint("Звук недоступен в этом браузере");
        reject(new Error("no AudioContext"));
        return;
      }
      if (!window.__mailAudioCtx) window.__mailAudioCtx = new AC();
      const ctx = window.__mailAudioCtx;
      const startTones = () => {
        const now = ctx.currentTime;
        const tones = [
          { freq: 523.25, at: 0, dur: 0.22 },
          { freq: 659.25, at: 0.12, dur: 0.28 },
          { freq: 783.99, at: 0.26, dur: 0.32 }
        ];
        for (const t of tones) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = "sine";
          o.frequency.value = t.freq;
          const t0 = now + t.at;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.11, t0 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + t.dur);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(t0);
          o.stop(t0 + t.dur + 0.02);
        }
        window.__mailAudioBlocked = false;
        if (!opts.keepHint) setMailSoundHint("");
        setTimeout(resolve, 520);
      };
      const kick = () => {
        if (ctx.state === "suspended") {
          ctx.resume().then(startTones).catch((e) => {
            window.__mailAudioBlocked = true;
            setMailSoundHint("Нажмите один раз по странице или «Проверить звук», чтобы разрешить звук");
            reject(e);
          });
        } else {
          startTones();
        }
      };
      kick();
    } catch (e) {
      window.__mailAudioBlocked = true;
      setMailSoundHint("Нажмите один раз по странице или «Проверить звук», чтобы разрешить звук");
      reject(e);
    }
  });
}
function notifyNewMailSound(newIds) {
  const ids = (newIds || []).filter(Boolean);
  const set = loadMailSoundKnownIds();
  const fresh = [];
  for (const id of ids) {
    if (!set[id]) { fresh.push(id); set[id] = 1; }
  }
  for (const it of (DB && DB.mail_feed) || []) if (it && it.id) set[it.id] = 1;
  saveMailSoundKnownIds(set);
  if (!fresh.length) return;
  if (!isMailSoundEnabled()) return;
  playMailNotifySound().catch(() => {});
}
function snapshotZayavkaForm() {
  try { return JSON.stringify(readZayavkaForm()); } catch (e) { return null; }
}
function markZayavkaFormClean() {
  zayavkaFormBaseline = snapshotZayavkaForm();
  zayavkaFormSaved = true;
}
function isZayavkaFormDirty() {
  if (zayavkaFormBaseline == null) return false;
  const cur = snapshotZayavkaForm();
  if (cur == null) return false;
  return cur !== zayavkaFormBaseline;
}
function confirmLeaveZayavkaForm() {
  if (!isZayavkaFormDirty()) return true;
  // OK = сохранить и уйти; Cancel = остаться на форме
  const ans = confirm("Сохранить изменения?\n\nОК — сохранить и уйти.\nОтмена — остаться в форме.");
  if (ans) {
    saveZayavka(false);
    return !!zayavkaFormSaved;
  }
  return false;
}
function snapshotTripForm() {
  try { return JSON.stringify(readTripForm()); } catch (e) { return null; }
}
function markTripFormClean() {
  tripFormBaseline = snapshotTripForm();
  tripFormSaved = true;
}
function isTripFormDirty() {
  if (tripFormBaseline == null) return false;
  const cur = snapshotTripForm();
  if (cur == null) return false;
  return cur !== tripFormBaseline;
}
function confirmLeaveTripForm() {
  if (!isTripFormDirty()) return true;
  const ans = confirm("Сохранить изменения рейса?\n\nОК — сохранить и уйти.\nОтмена — остаться в форме.");
  if (ans) {
    saveTrip(false);
    return !!tripFormSaved;
  }
  return false;
}
function loadMailSeenIds() {
  try {
    const fromDb = Array.isArray(DB.mail_seen) ? DB.mail_seen : [];
    const raw = localStorage.getItem(MAIL_SEEN_KEY);
    const fromLs = raw ? JSON.parse(raw) : [];
    const set = {};
    for (const id of fromDb.concat(Array.isArray(fromLs) ? fromLs : [])) if (id) set[id] = 1;
    return set;
  } catch (e) { return {}; }
}
function saveMailSeenIds(set) {
  const arr = Object.keys(set);
  DB.mail_seen = arr;
  try { localStorage.setItem(MAIL_SEEN_KEY, JSON.stringify(arr)); } catch (e) {}
  try { saveStore(DB); } catch (e) {}
}
function markMailSeen(id) {
  if (!id) return;
  const set = loadMailSeenIds();
  set[id] = 1;
  saveMailSeenIds(set);
}
function markAllMailSeen(ids) {
  const set = loadMailSeenIds();
  for (const id of ids || []) if (id) set[id] = 1;
  saveMailSeenIds(set);
}
function countUnseenMail() {
  const set = loadMailSeenIds();
  const items = DB.mail_feed || [];
  let n = 0;
  for (const it of items) if (it && it.id && !isMailDeleted(it.id) && !set[it.id]) n++;
  return n;
}
function updateHomeTabBadge() {
  // legacy name: badge now lives on «Почта»
  updatePochtaTabBadge();
}
function updatePochtaTabBadge() {
  const btn = document.querySelector('#nav button[data-tab="pochta"]');
  const n = countUnseenMail();
  if (btn) btn.textContent = n > 0 ? ("Почта (" + n + ")") : "Почта";
  try {
    document.title = n > 0 ? ("(" + n + ") Почта") : DOC_TITLE_BASE;
  } catch (e) {}
}

document.getElementById("nav").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  showTab(btn.dataset.tab);
});
function showTab(tab, opts) {
  opts = opts || {};
  try { if (window.ensureGrailNavButton) window.ensureGrailNavButton(); } catch (e) {}
  if (currentTab === "rolis" && tab !== "rolis") {
    try { if (typeof captureRolisLifeUi === "function") captureRolisLifeUi(); } catch (e) {}
  }
  // Leaving an open заявка form?
  const leavingForm = zayavkaFormBaseline != null && !(tab === "zayavki" && (opts.mode === "new" || opts.mode === "edit"));
  if (leavingForm) {
    if (!confirmLeaveZayavkaForm()) return;
    zayavkaFormBaseline = null;
  }
  const leavingTrip = tripFormBaseline != null && !(tab === "reisy" && (opts.mode === "edit" || opts.mode === "new"));
  if (leavingTrip) {
    if (!confirmLeaveTripForm()) return;
    tripFormBaseline = null;
    editingTripId = null;
  }
  // Destroy map when leaving Карта so DOM wipe does not leave a stale Leaflet instance
  if (currentTab === "karta" && tab !== "karta" && typeof destroyMap === "function") {
    try { destroyMap("karta-map"); } catch (e) {}
  }
  if (tab === "home") tab = "pochta"; // вкладка «Главное» удалена
  currentTab = tab;
  if (tab !== "rolis" && window.__rolisLifeTimer) {
    clearInterval(window.__rolisLifeTimer);
    window.__rolisLifeTimer = null;
  }
  document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  updateHomeTabBadge();
  try { if (typeof updateChatTabBadge === "function") updateChatTabBadge(); } catch (e) {}
  const main = document.getElementById("main");
  if (tab === "zayavki") main.innerHTML = renderZayavki(opts);
  else if (tab === "stavki") main.innerHTML = renderStavki();
  else if (tab === "karta") main.innerHTML = renderKarta();
  else if (tab === "pochta") main.innerHTML = renderPochta();
  else if (tab === "reisy") main.innerHTML = renderReisy(opts);
  else if (tab === "sprav") main.innerHTML = renderSprav();
  else if (tab === "backup") main.innerHTML = renderBackup();
  else if (tab === "chat") main.innerHTML = (typeof renderChat === "function" ? renderChat() : "<p>Чат недоступен</p>");
  else if (tab === "rolis") main.innerHTML = (typeof renderRolis === "function" ? renderRolis() : "<p>РОЛИС недоступен</p>");
  else if (tab === "grail") main.innerHTML = (window.renderGrail ? window.renderGrail() : "<p>Грайл недоступен</p>");
  else main.innerHTML = renderPochta();
  bindTabHandlers(tab);
}
function renderHome() {
  // removed in 1.0.7 — redirect
  return renderPochta();
}

function renderZayavki(opts) {
  opts = opts || {};
  if (opts.mode === "new" || opts.mode === "edit") return renderZayavkaForm(opts.mode === "new" ? null : (opts.id || editingZayavkaId));
  if (opts.mode === "preview") return renderZayavkaPreview(opts.id || previewZayavkaId);
  const rows = DB.zayavki.slice().sort((a,b) => (b.date||"").localeCompare(a.date||"") || (b.id-a.id));
  let html = `<h1>Заявки</h1><div class="toolbar"><button class="btn" id="btn-new-z">Новая заявка</button></div>
  <div class="card"><table><thead><tr><th>№</th><th>Дата</th><th>Маршрут</th><th>Перевозчик</th><th>Ставка</th><th></th></tr></thead><tbody>`;
  if (!rows.length) html += `<tr><td colspan="6" class="muted">Пока нет заявок</td></tr>`;
  for (const z of rows) {
    const cname = (z.carrier && z.carrier.full_name) || "";
    html += `<tr><td><strong>${esc(z.number)}</strong></td><td>${esc(fmtDate(z.date))}</td>
      <td>${esc(z.loading_address)} → ${esc(z.unloading_address)}</td><td>${esc(cname)}</td><td>${esc(z.rate)}</td>
      <td><button class="btn small ghost" data-view="${z.id}">Открыть</button>
        <button class="btn small ghost" data-edit="${z.id}">Изменить</button>
        <button class="btn small ghost" data-copy="${z.id}">Копировать</button>
        <button class="btn small ghost" style="color:#b91c1c" data-del-z="${z.id}">Удалить</button></td></tr>`;
  }
  return html + `</tbody></table></div>`;
}
function emptyZayavka() {
  return { id:null, number:"", date:new Date().toISOString().slice(0,10), with_stamp:true,
    loading_address:"", loading_datetime:"", delivery_date:"", unloading_address:"",
    weight_kg:"", cargo:"", rate:"", truck:"", driver:"",
    carrier:{type:"ИП",full_name:"",inn:"",kpp:"",ogrn:"",address:"",bik:"",bank:"",ks:"",rs:"",signatory:""},
    carrier_id:null };
}
function renderZayavkaForm(id) {
  let z = id ? DB.zayavki.find(x => x.id === id) : null;
  if (!z) z = emptyZayavka();
  editingZayavkaId = z.id;
  const carriersOpts = DB.carriers.map(c =>
    `<option value="${c.id}" ${z.carrier_id===c.id?"selected":""}>${esc(c.full_name)}</option>`).join("");
  const c = z.carrier || {};
  return `<h1>${z.id ? "Изменить заявку №"+esc(z.number) : "Новая заявка"}</h1>
  <div class="toolbar">
    <button class="btn ghost" id="btn-back-z">← К списку</button>
    <button class="btn" id="btn-save-z">Сохранить</button>
    <button class="btn secondary" id="btn-save-preview">Сохранить и открыть</button>
    ${z.id ? `<button class="btn ghost" style="color:#b91c1c!important" id="btn-del-z">Удалить</button>` : ""}
  </div>
  <div class="card">
    <div class="row">
      <div class="field" style="max-width:120px"><label>Номер</label><input id="z-number" value="${esc(z.number)}"></div>
      <div class="field" style="max-width:160px"><label>Дата</label><input type="date" id="z-date" value="${esc(z.date)}"></div>
      <div class="field wide"><label>Взять из предыдущей</label>
        <select id="z-copy-from"><option value="">—</option>
          ${DB.zayavki.map(x=>`<option value="${x.id}">№${esc(x.number)} · ${esc((x.carrier&&x.carrier.full_name)||"")} · ${esc(fmtDate(x.date))}</option>`).join("")}
        </select></div>
      <div class="field check"><input type="checkbox" id="z-stamp" ${z.with_stamp!==false?"checked":""}><label for="z-stamp">Печать</label></div>
    </div>
    <div class="row">
      <div class="field wide"><label>Адрес загрузки</label><input id="z-load" value="${esc(z.loading_address)}"></div>
      <div class="field"><label>Дата и время загрузки</label><input id="z-loaddt" value="${esc(z.loading_datetime)}"></div>
      <div class="field"><label>Дата доставки</label><input id="z-deliv" value="${esc(z.delivery_date)}"></div>
    </div>
    <div class="row">
      <div class="field wide"><label>Адрес выгрузки</label><input id="z-unload" value="${esc(z.unloading_address)}"></div>
      <div class="field"><label>Вес груза, кг</label><input id="z-weight" value="${esc(z.weight_kg)}"></div>
    </div>
    <div class="row">
      <div class="field wide"><label>Сведение о грузе</label><input id="z-cargo" value="${esc(z.cargo)}"></div>
      <div class="field wide"><label>Ставка (с НДС/без и когда оплата)</label><input id="z-rate" value="${esc(z.rate)}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Машина перевозчика</label>
        <select id="z-truck-pick"><option value="">— выбрать из справочника —</option></select></div>
      <div class="field wide"><label>Марка, №тягача, №п/п</label><input id="z-truck" value="${esc(z.truck)}"></div>
    </div>
    <div class="row"><div class="field wide"><label>Водитель (паспорт и телефон)</label><textarea id="z-driver">${esc(z.driver)}</textarea></div></div>
  </div>
  <div class="card"><h2>Перевозчик (исполнитель)</h2>
    <div class="row"><div class="field wide"><label>Из справочника</label>
      <select id="z-carrier-pick"><option value="">— вручную —</option>${carriersOpts}</select></div></div>
    <div class="row">
      <div class="field" style="max-width:100px"><label>Тип</label><select id="c-type"><option ${c.type==="ИП"||!c.type?"selected":""}>ИП</option><option ${c.type==="ООО"?"selected":""}>ООО</option></select></div>
      <div class="field wide"><label>ФИО / название</label><input id="c-name" value="${esc(c.full_name||"")}"></div>
      <div class="field"><label>ИНН</label><input id="c-inn" value="${esc(c.inn||"")}"></div>
      <div class="field"><label>КПП</label><input id="c-kpp" value="${esc(c.kpp||"")}"></div>
    </div>
    <div class="row">
      <div class="field"><label>ОГРН</label><input id="c-ogrn" value="${esc(c.ogrn||"")}"></div>
      <div class="field wide"><label>Адрес</label><input id="c-addr" value="${esc(c.address||"")}"></div>
    </div>
    <div class="row">
      <div class="field"><label>БИК</label><input id="c-bik" value="${esc(c.bik||"")}"></div>
      <div class="field wide"><label>Банк</label><input id="c-bank" value="${esc(c.bank||"")}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Корр. счёт</label><input id="c-ks" value="${esc(c.ks||"")}"></div>
      <div class="field"><label>Расч. счёт</label><input id="c-rs" value="${esc(c.rs||"")}"></div>
      <div class="field"><label>Подписант</label><input id="c-sig" value="${esc(c.signatory||"")}"></div>
    </div>
  </div>`;
}
function readZayavkaForm() {
  return {
    id: editingZayavkaId,
    number: document.getElementById("z-number").value.trim(),
    date: document.getElementById("z-date").value,
    with_stamp: document.getElementById("z-stamp").checked,
    loading_address: document.getElementById("z-load").value.trim(),
    loading_datetime: document.getElementById("z-loaddt").value.trim(),
    delivery_date: document.getElementById("z-deliv").value.trim(),
    unloading_address: document.getElementById("z-unload").value.trim(),
    weight_kg: document.getElementById("z-weight").value.trim(),
    cargo: document.getElementById("z-cargo").value.trim(),
    rate: document.getElementById("z-rate").value.trim(),
    truck: document.getElementById("z-truck").value.trim(),
    driver: document.getElementById("z-driver").value.trim(),
    carrier_id: document.getElementById("z-carrier-pick").value ? Number(document.getElementById("z-carrier-pick").value) : null,
    carrier: {
      type: document.getElementById("c-type").value,
      full_name: document.getElementById("c-name").value.trim(),
      inn: document.getElementById("c-inn").value.trim(),
      kpp: document.getElementById("c-kpp").value.trim(),
      ogrn: document.getElementById("c-ogrn").value.trim(),
      address: document.getElementById("c-addr").value.trim(),
      bik: document.getElementById("c-bik").value.trim(),
      bank: document.getElementById("c-bank").value.trim(),
      ks: document.getElementById("c-ks").value.trim(),
      rs: document.getElementById("c-rs").value.trim(),
      signatory: document.getElementById("c-sig").value.trim(),
    }
  };
}
function saveZayavka(andPreview) {
  const z = readZayavkaForm();
  if (!z.number) { alert("Укажите номер заявки"); zayavkaFormSaved = false; return false; }
  if (z.id) {
    const i = DB.zayavki.findIndex(x => x.id === z.id);
    if (i >= 0) DB.zayavki[i] = z;
  } else {
    // Создаём запись только при «Сохранить» — не раньше
    z.id = DB.next.zayavka++;
    DB.zayavki.push(z);
  }
  if (z.carrier.full_name && z.carrier.inn) {
    let found = DB.carriers.find(c => c.inn === z.carrier.inn);
    if (found) { Object.assign(found, z.carrier); z.carrier_id = found.id; }
    else { const nc = Object.assign({id: DB.next.carrier++}, z.carrier); DB.carriers.push(nc); z.carrier_id = nc.id; }
  }
  saveStore(DB); toast("Заявка сохранена"); editingZayavkaId = z.id;
  zayavkaFormSaved = true;
  markZayavkaFormClean();
  if (andPreview) {
    zayavkaFormBaseline = null; // leaving form for preview
    previewZayavkaId = z.id;
    showTab("zayavki", {mode:"preview", id: z.id});
  }
  return true;
}
function deleteZayavka(id) {
  const z = DB.zayavki.find(x => x.id === Number(id));
  if (!z) return;
  const label = "№" + (z.number || z.id) + (z.carrier && z.carrier.full_name ? " · " + z.carrier.full_name : "");
  if (!confirm("Удалить заявку " + label + "?\nИмпорт больше не добавит её снова.")) return;
  markZayavkaDeleted(z);
  DB.zayavki = DB.zayavki.filter(x => x.id !== z.id);
  saveStore(DB);
  zayavkaFormBaseline = null;
  editingZayavkaId = null;
  previewZayavkaId = null;
  toast("Заявка удалена");
  showTab("zayavki", {mode:"list"});
}
function fillCarrierFields(c) {
  if (!c) return;
  document.getElementById("c-type").value = c.type || "ИП";
  document.getElementById("c-name").value = c.full_name || "";
  document.getElementById("c-inn").value = c.inn || "";
  document.getElementById("c-kpp").value = c.kpp || "";
  document.getElementById("c-ogrn").value = c.ogrn || "";
  document.getElementById("c-addr").value = c.address || "";
  document.getElementById("c-bik").value = c.bik || "";
  document.getElementById("c-bank").value = c.bank || "";
  document.getElementById("c-ks").value = c.ks || "";
  document.getElementById("c-rs").value = c.rs || "";
  document.getElementById("c-sig").value = c.signatory || "";
}
function applyCopyFrom(id) {
  const src = DB.zayavki.find(x => x.id === Number(id));
  if (!src) return;
  document.getElementById("z-load").value = src.loading_address || "";
  document.getElementById("z-loaddt").value = src.loading_datetime || "";
  document.getElementById("z-deliv").value = src.delivery_date || "";
  document.getElementById("z-unload").value = src.unloading_address || "";
  document.getElementById("z-weight").value = src.weight_kg || "";
  document.getElementById("z-cargo").value = src.cargo || "";
  document.getElementById("z-rate").value = src.rate || "";
  document.getElementById("z-truck").value = src.truck || "";
  document.getElementById("z-driver").value = src.driver || "";
  if (src.carrier) fillCarrierFields(src.carrier);
  if (src.carrier_id) document.getElementById("z-carrier-pick").value = String(src.carrier_id);
  if (typeof fillZayavkaTruckOptions === "function") fillZayavkaTruckOptions(src.carrier_id || null, src.truck || "");
  toast("Скопировано из заявки №" + src.number);
}
function renderZayavkaHTML(z) {
  const c = z.carrier || {};
  const stamp = z.with_stamp !== false ? `<img class="stamp" src="${STAMP_SRC}" alt="печать"/>` : "";
  const addr = (CUSTOMER.address_lines || []).map(l => `<div>${esc(l)}</div>`).join("");
  const bank = (CUSTOMER.bank_lines || []).map(l => `<div>${esc(l)}</div>`).join("");
  let execInn = "";
  if (c.inn) {
    if ((c.type || "ИП").toUpperCase() === "ИП") execInn = `<div>${esc(c.inn)}</div>`;
    else execInn = `<div>ИНН: ${esc(c.inn)}</div>`;
  }
  return `<div class="zdoc">
  <div class="title">Договор-заявка № ${esc(z.number)} от ${esc(dateText(z.date))} г.</div>
  <div class="clause1">1. Перевозчик доверяет получение указанного груза водителю, указанному в данной Заявке, и несет полную материальную ответственность за сохранность принятого им груза. Заявка, переданная и подписанная по факсимильной и электронной связи, имеет юридическую силу.</div>
  <table class="main">
    <tr><td class="lbl">Заказчик:</td><td class="val">${esc(CUSTOMER.table_line)}</td></tr>
    <tr><td class="lbl">Адрес загрузки:</td><td class="val">${esc(z.loading_address)}</td></tr>
    <tr><td class="lbl">Дата и время загрузки</td><td class="val">${esc(z.loading_datetime)}</td></tr>
    <tr><td class="lbl">Дата доставки</td><td class="val">${esc(z.delivery_date)}</td></tr>
    <tr><td class="lbl">Адрес выгрузки:</td><td class="val">${esc(z.unloading_address)}</td></tr>
    <tr><td class="lbl">Вес груза, кг</td><td class="val">${esc(z.weight_kg)}</td></tr>
    <tr><td class="lbl">Сведение о грузе :</td><td class="val">${esc(z.cargo)}</td></tr>
    <tr><td class="lbl">Ставка:</td><td class="val">${esc(z.rate)}</td></tr>
    <tr><td class="lbl">Перевозчик:</td><td class="val">${esc(carrierTableLine(c))}</td></tr>
    <tr><td class="lbl">Марка, №тягача, №п/п</td><td class="val">${esc(z.truck)}</td></tr>
    <tr class="driver"><td class="lbl">Водитель (паспорт и телефон)</td><td class="val pre">${esc(z.driver)}</td></tr>
  </table>
  <div class="clauses">
    <p>2. Перевозчик обязан:<br/>
-Подать под погрузку исправные автомобили, пригодные для перевозки груза в соответствии с требованиями Заказчика: кузов (тент) без повреждений, чистые без посторонних предметов и запахов; наличие обрешетки кузова и стяжных ремней; конструкция пломбировочного троса предусматривает одну точку опломбирования; пол ровный без щелей, зазоров, выступов.<br/>
-При приемке груза к перевозке осуществить проверку количества и внешнего состояния груза, качество укладки, упаковки, крепления и распределения груза в транспортное средство на складе. Перевозчик не должен производить погрузку некачественно упакованною груза, обнаруженного визуально, о чем обязан незамедлительно проинформировать Заказчика.<br/>
-Перевозчик обязан в течение 10 календарных дней с момента доставки груза грузополучателю, предоставить Заказчику экземпляр оригинальных транспортных накладных со всеми отметками и печатями.<br/>
-Возместить Заказчику ущерб за утрату, недостачу, или повреждение груза в течение 5-ти календарных дней с момента обнаружения ущерба, в размере стоимости груза.</p>
    <p>3. Оплата услуг Перевозчика допускается от 3-х лиц. 3а простой на погрузке/выгрузки Заказчик уплачивает штраф в размере 8000 рублей за каждый автомобиль за каждые сутки простоя, начиная с 25-го часа. В данном случае перевозчик не имеет права покидать место погрузки/'выгрузки без письменного согласия Заказчика вне зависимости от информации, полученной от грузоотправителя/грузополучателя. Для оплаты простоя Перевозчику необходимо письменное заявление с приложением документов, подтверждающих простой. В случае, если Перевозчик опоздал на погрузку/ выгрузку более чем на 30 минут, простой не оплачивается.</p>
    <p>4. Заказчик имеет право отменить данную Перевозчику заявку без применения штрафных санкций, заблаговременно уведомив об этом Перевозчика не позднее чем за 12 часов до времени загрузки.</p>
    <p>5. Перевозчик оплачивает за срыв погрузки штраф 20% от стоимости перевозки.</p>
    <p>6. Сторона, к которой предъявлена претензия, обязана рассмотреть ее по существу и направить мотивированный ответ в течение 5-ти календарных дней с даты получения претензии. При не достижении взаимоприемлемого решения стороны вправе передать спорный вопрос на разрешение в судебном порядке в арбитражный суд Краснодарского края.</p>
  </div>
  <div class="footer">
    <div class="col left">
      <div class="head">ЗАКАЗЧИК:</div>
      <div>${esc(CUSTOMER.footer_name)}</div>${addr}
      <div>${esc(CUSTOMER.inn_kpp)}</div>${bank}
      <div>${esc(CUSTOMER.phone)}</div>
      <div>${esc(CUSTOMER.email)}</div>
      <div class="sig-block">${stamp}
        <div class="sig-name">${esc(CUSTOMER.signatory_line)}</div>
        <div class="mp">М.П.</div>
      </div>
    </div>
    <div class="col right">
      <div class="head">ИСПОЛНИТЕЛЬ:</div>
      <div>${esc(executorTitle(c))}</div>${execInn}
      ${c.kpp ? `<div>КПП: ${esc(c.kpp)}</div>` : ""}
      ${c.ogrn ? `<div>ОГРН: ${esc(c.ogrn)}</div>` : ""}
      ${c.address ? `<div>${esc(c.address)}</div>` : ""}
      ${c.bik ? `<div>БИК: ${esc(c.bik)}</div>` : ""}
      ${c.bank ? `<div>Банк: ${esc(c.bank)}</div>` : ""}
      ${c.ks ? `<div>Корреспондентский счёт: ${esc(c.ks)}</div>` : ""}
      ${c.rs ? `<div>Расчётный счёт: ${esc(c.rs)}</div>` : ""}
      <div class="sig-block">
        <div class="sig-name">${esc(c.signatory || "")}______________________________</div>
        <div class="mp">М.П.</div>
      </div>
    </div>
  </div>
</div>`;
}
function renderZayavkaPreview(id) {
  const z = DB.zayavki.find(x => x.id === Number(id));
  if (!z) return `<p>Заявка не найдена</p><button class="btn" onclick="showTab('zayavki',{mode:'list'})">Назад</button>`;
  previewZayavkaId = z.id;
  return `<h1>Заявка №${esc(z.number)}</h1>
  <div class="toolbar">
    <button class="btn ghost" id="btn-back-z">← К списку</button>
    <button class="btn ghost" data-edit="${z.id}">Изменить</button>
    <button class="btn" id="btn-print-z">Скачать PDF</button>
    <button class="btn secondary" id="btn-word-z">Скачать Word</button>
    <button class="btn ghost" style="color:#b91c1c!important" data-del-z="${z.id}">Удалить</button>
  </div>
  <div class="preview-frame" id="z-preview">${renderZayavkaHTML(z)}</div>
  <p class="note">«Скачать PDF» открывает печать браузера — выберите «Сохранить как PDF».</p>`;
}
function downloadWord(z) {
  const body = renderZayavkaHTML(z);
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Заявка ${esc(z.number)}</title>
<style>@page{size:A4;margin:10mm 12mm 8mm 12mm}body{font-family:"Times New Roman",Times,serif;font-size:10.5pt}</style>
</head><body>${body}</body></html>`;
  const blob = new Blob(["\ufeff", doc], {type: "application/msword"});
  const a = document.createElement("a");
  const nameSafe = ((z.carrier && z.carrier.full_name) || "zayavka").split(/\s+/)[0];
  a.href = URL.createObjectURL(blob);
  a.download = `Заявка_${z.number}_${nameSafe}.doc`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function printZayavka(z) {
  document.getElementById("print-root").innerHTML = renderZayavkaHTML(z);
  document.body.classList.add("print-mode");
  window.print();
  setTimeout(() => document.body.classList.remove("print-mode"), 500);
}
const ALIASES = {
  "спб":"спб","питер":"спб","санкт-петербург":"спб","с-петербург":"спб","петербург":"спб",
  "плп":"спб","петролеспорт":"спб","бронка":"спб","пкт":"спб","ктсп":"спб","шушары":"спб","стрельна":"спб",
  "новороссийск":"новороссийск","ново":"новороссийск","нврск":"новороссийск","порт ново":"новороссийск",
  "нврс":"новороссийск","нутеп":"новороссийск","нутэп":"новороссийск","нмтп":"новороссийск","нтл":"новороссийск","раевская":"новороссийск",
  "москва":"москва","мск":"москва","химки":"москва","котельники":"москва",
  "казань":"казань","краснодар":"краснодар","тимашевск":"краснодар",
  "ростов":"ростов","ростов-на-дону":"ростов","ростов на дону":"ростов",
  "екатеринбург":"екатеринбург","екб":"екатеринбург","свердловск":"екатеринбург",
  "нижний новгород":"нижний новгород","н.новгород":"нижний новгород","нижний":"нижний новгород","нн":"нижний новгород",
  "самара":"самара","саратов":"саратов","волгоград":"волгоград",
  "челябинск":"челябинск","уфа":"уфа","пермь":"пермь",
  "воронеж":"воронеж","белгород":"белгород","курск":"курск","липецк":"липецк",
  "тула":"тула","калуга":"калуга","смоленск":"смоленск","брянск":"брянск",
  "тверь":"тверь","ярославль":"ярославль","владимир":"владимир","рязань":"рязань",
  "пенза":"пенза","оренбург":"оренбург","ставрополь":"ставрополь",
  "пятигорск":"пятигорск","минеральные воды":"минеральные воды","минводы":"минеральные воды",
  "махачкала":"махачкала","тюмень":"тюмень","новосибирск":"новосибирск","омск":"омск",
  "геленджик":"геленджик","анапа":"анапа","таганрог":"таганрог",
  "петрозаводск":"петрозаводск","гатчина":"гатчина",
  "серпухов":"серпухов","домодедово":"домодедово","долгопрудный":"долгопрудный",
  "пушкино":"пушкино","фрязино":"фрязино","томилино":"томилино","солнцево":"солнцево",
  "покров":"покров","киржач":"киржач","кимры":"кимры","ермолино":"ермолино",
  "лебедянь":"лебедянь","чегем":"чегем","саратов":"саратов",
  "сочи":"сочи","адлер":"сочи",
  "нутеп":"новороссийск","нутэп":"новороссийск","нмтп":"новороссийск","новоморснаб":"новороссийск",
  "юкк":"новороссийск","рускон":"новороссийск","нк-депо":"новороссийск","нк депо":"новороссийск",
  "верхняя баканка":"новороссийск","терминал плп":"спб","терминал нутеп":"новороссийск"
};

const DEST_REGION = {
  "нахабино":"москва-запад","красногорск":"москва-запад","дзержинский":"москва-восток",
  "томилино":"москва-восток","солнцево":"москва","долгопрудный":"москва","домодедово":"москва",
  "пушкино":"москва","фрязино":"москва","черная грязь":"москва","юг мо":"москва","москва":"москва",
  "климовск":"москва","серпухов":"москва-юг","горки":"москва","химки":"москва","котельники":"москва",
  "бритово":"москва","покров":"москва-восток","киржач":"москва-восток",
  "спб":"спб","гатчина":"спб","новороссийск":"новороссийск","анапа":"новороссийск","геленджик":"новороссийск",
  "ростов":"ростов","таганрог":"ростов","казань":"казань","саратов":"саратов","краснодар":"краснодар",
  "тимашевск":"краснодар","пятигорск":"пятигорск","чегем":"пятигорск","сочи":"сочи","адлер":"сочи","нутеп":"новороссийск","нмтп":"новороссийск","плп":"спб",
  "бронка":"спб","ктсп":"спб","шушары":"спб","видное":"москва","мытищи":"москва","ногинск":"москва","подольск":"москва",
  "раменское":"москва","ступино":"москва-юг","чехов":"москва-юг","мосрентген":"москва","ворсино":"москва-юг",
  "азов":"ростов","аксай":"ростов","батайск":"ростов","волжский":"волгоград","кропоткин":"краснодар",
  "отрадный":"самара","зеленокумск":"ставрополь","татаново":"тамбов"
};
/* Приблизительные координаты городов (широта, долгота) — для оценки ₽/км */
const CITY_COORDS = {
  "новороссийск":[44.72,37.77], "спб":[59.93,30.33], "москва":[55.75,37.62],
  "казань":[55.80,49.11], "нижний новгород":[56.33,44.00], "самара":[53.20,50.15],
  "саратов":[51.53,46.03], "волгоград":[48.71,44.51], "ростов":[47.23,39.72],
  "краснодар":[45.04,38.98], "екатеринбург":[56.84,60.60], "челябинск":[55.16,61.40],
  "уфа":[54.74,55.97], "пермь":[58.01,56.23], "воронеж":[51.67,39.18],
  "белгород":[50.60,36.59], "курск":[51.73,36.19], "липецк":[52.61,39.57],
  "тула":[54.19,37.62], "калуга":[54.51,36.26], "смоленск":[54.78,32.05],
  "брянск":[53.25,34.37], "тверь":[56.86,35.92], "ярославль":[57.63,39.87],
  "владимир":[56.13,40.41], "рязань":[54.63,39.74], "пенза":[53.20,45.00],
  "оренбург":[51.77,55.10], "ставрополь":[45.04,41.97], "пятигорск":[44.05,43.06],
  "минеральные воды":[44.21,43.14], "махачкала":[42.98,47.50], "тюмень":[57.15,65.53],
  "новосибирск":[55.03,82.92], "омск":[54.99,73.37],
  "кимры":[56.87,37.36], "томилино":[55.66,37.95], "домодедово":[55.44,37.75],
  "долгопрудный":[55.94,37.52], "пушкино":[56.01,37.85], "фрязино":[55.96,38.05],
  "солнцево":[55.65,37.39], "серпухов":[54.92,37.41], "покров":[55.92,39.18],
  "киржач":[56.16,38.87], "гатчина":[59.57,30.13], "геленджик":[44.56,38.08],
  "анапа":[44.89,37.32], "таганрог":[47.24,38.90], "чегем":[43.57,43.59],
  "петрозаводск":[61.78,34.35], "ермолино":[55.20,36.72], "лебедянь":[53.01,39.15],
  "малая вишера":[58.85,32.22], "бритово":[55.50,37.85],
  "москва-запад":[55.75,37.40], "москва-восток":[55.70,37.90], "москва-юг":[55.55,37.60],
  "юг мо":[55.55,37.60], "черная грязь":[55.75,37.35], "климовск":[55.37,37.53],
  "горки":[55.70,37.30], "химки":[55.89,37.45], "котельники":[55.66,37.86],
  "дзержинский":[55.63,37.85], "нахабино":[55.85,37.18], "тимашевск":[45.62,38.94],
  "валуйки":[50.21,38.10], "алексеевка":[50.63,38.69],
  "сочи":[43.60,39.73], "адлер":[43.44,39.92],
  "нутеп":[44.725,37.780], "нмтп":[44.724,37.795], "плп":[59.88,30.22],
  "бронка":[59.93,29.65], "ктсп":[59.89,30.15], "шушары":[59.78,30.45],
  "волжский":[48.79,44.77], "буденновск":[44.78,44.17], "азов":[47.10,39.42],
  "аксай":[47.26,39.87], "батайск":[47.14,39.75], "великий новгород":[58.52,31.27],
  "видное":[55.55,37.71], "ворсино":[55.23,36.68], "гагарин":[55.55,34.99],
  "зеленокумск":[44.41,43.88], "кропоткин":[45.44,40.58], "мосрентген":[55.62,37.47],
  "мытищи":[55.91,37.73], "ногинск":[55.87,38.44], "орел":[52.97,36.06],
  "отрадный":[53.38,51.35], "подольск":[55.43,37.54], "раменское":[55.57,38.22],
  "ступино":[54.89,38.08], "татаново":[52.72,41.45], "чехов":[55.15,37.48],
  "гизель":[43.04,44.57], "верхняя баканка":[44.85,37.66],
"нальчик":[43.49,43.62], "владикавказ":[43.02,44.68],
  "красноярск":[56.01,92.87], "иркутск":[52.29,104.28], "хабаровск":[48.48,135.07],
  "калининград":[54.71,20.51], "мурманск":[68.97,33.09], "архангельск":[64.54,40.54],
  "иваново":[57.00,40.97], "кострома":[57.77,40.93], "тамбов":[52.72,41.45],
  "астрахань":[46.35,48.04], "тольятти":[53.51,49.42], "ульяновск":[54.31,48.40],
  "ижевск":[56.85,53.20], "киров":[58.60,49.66], "курган":[55.45,65.34],
  "барнаул":[53.35,83.78], "томск":[56.50,84.97], "кемерово":[55.35,86.09],
  "новокузнецк":[53.76,87.13], "магнитогорск":[53.41,58.98], "нижневартовск":[60.94,76.55],
  "сургут":[61.25,73.40], "новороссийск порт":[44.72,37.78]
};

function normalizePlace(s) {
  s = String(s || "").trim().toLowerCase().replace(/ё/g,"е").replace(/[«»"'`]/g,"");
  s = s.replace(/\s+/g," ");
  if (!s) return "";
  /* сначала кусок до запятой — «Валуйки, Белгородская обл» → валуйки */
  const head = s.split(",")[0].trim();
  for (const [k,v] of Object.entries(ALIASES)) {
    if (s === k || head === k || s.startsWith(k+" ") || s.startsWith(k+",") || s.startsWith(k+"(") || s.startsWith(k+"/")) return v;
  }
  const keys = Object.keys(ALIASES).concat(Object.keys(CITY_COORDS)).sort((a,b)=>b.length-a.length);
  for (const k of keys) {
    if (k.length < 4) continue;
    if (head === k || head.startsWith(k+" ") || head.startsWith(k+"-")) return ALIASES[k] || k;
  }
  for (const k of keys) {
    if (k.length >= 4 && (s.includes(k) || k.includes(s))) return ALIASES[k] || k;
  }
  return s;
}
function canonPlace(s) {
  return normalizePlace(s);
}
function destRegion(norm) {
  if (!norm) return "";
  if (DEST_REGION[norm]) return DEST_REGION[norm];
  for (const [k,v] of Object.entries(DEST_REGION)) {
    if (norm.includes(k) || k.includes(norm)) return v;
  }
  return norm;
}
function resolveCity(name) {
  const n = normalizePlace(name);
  if (!n) return null;
  if (CITY_COORDS[n]) return {key:n, coords:CITY_COORDS[n]};
  const reg = destRegion(n);
  if (reg && CITY_COORDS[reg]) return {key:reg, coords:CITY_COORDS[reg]};
  for (const [k,c] of Object.entries(CITY_COORDS)) {
    if (n.includes(k) || k.includes(n)) return {key:k, coords:c};
  }
  return null;
}
function haversineKm(a, b) {
  const R = 6371;
  const p1 = a[0]*Math.PI/180, p2 = b[0]*Math.PI/180;
  const dphi = (b[0]-a[0])*Math.PI/180, dl = (b[1]-a[1])*Math.PI/180;
  const x = Math.sin(dphi/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}
function roadKm(fromName, toName) {
  const a = resolveCity(fromName), b = resolveCity(toName);
  if (!a || !b) return null;
  return {km: haversineKm(a.coords, b.coords) * 1.2, fromKey:a.key, toKey:b.key};
}
function segmentPlace(s) {
  let t = String(s || "").replace(/ё/g, "е");
  t = t.replace(/^\(\s*\d\s*\)\s*/, "");
  t = t.split("(")[0];
  return canonPlace(t);
}
/** Прямое плечо. Кругорейс и «порожний → город, сдача в порт» не считаем прямой ставкой. */
function quoteEndpoints(q) {
  const rf = String(q.route_from || "");
  const rt = String(q.route_to || "");
  const blob = (q.quote_raw || "") + " " + (q.conditions || "") + " " + (q.return_empty || "") + " " + (q.container || "");
  let from = q.from_norm || segmentPlace(rf);
  let to = q.to_norm || segmentPlace(rt);
  let is_roundtrip = false;
  let is_empty_only = false;
  const rfLow = rf.toLowerCase().replace(/ё/g, "е");
  const rawLow = String(q.quote_raw || "").toLowerCase().replace(/ё/g, "е");

  if (/→|->/.test(rf)) {
    is_roundtrip = true;
    const parts = rf.split(/→|->/).map(segmentPlace).filter(Boolean);
    if (parts.length) {
      from = parts[0];
      to = parts[parts.length - 1];
    }
  } else if (/\(порожн|порожний\)|порожний\s*[–\-→]/.test(rfLow + " " + rawLow)) {
    is_roundtrip = true;
  }

  if (!is_roundtrip && /сдач|возврат/i.test(rt)) {
    const head = segmentPlace(rt);
    if (head && head !== canonPlace(to)) to = head;
  }

  const emptyBlob = blob.toLowerCase().replace(/ё/g, "е");
  if (!is_roundtrip && /вывоз порожн|порожние контейнер|порожних контейнер|порожний контейнер|порожн(?:ых|ие|ий)\s+реф|rf\s*empty|\bempty\b/.test(emptyBlob)) {
    is_empty_only = true;
  }
  from = canonPlace(from);
  to = canonPlace(to);
  return {from, to, is_roundtrip, is_empty_only, delivery_raw: to};
}
function scoreMatch(qFrom, qTo, rowFrom, rowTo) {
  const qf = canonPlace(qFrom);
  const qt = canonPlace(qTo);
  const rf = canonPlace(rowFrom);
  const rt = canonPlace(rowTo);
  let fromScore = 0, toScore = 0;
  if (qf && rf) {
    if (qf === rf) fromScore = 50;
    else if (qf.includes(rf) || rf.includes(qf)) fromScore = 25;
    else if (destRegion(qf) && destRegion(qf) === destRegion(rf)) fromScore = 25;
  }
  if (qt && rt) {
    if (qt === rt) toScore = 50;
    else if (qt.includes(rt) || rt.includes(qt)) toScore = 25;
    else if (destRegion(qt) && destRegion(qt) === destRegion(rt)) toScore = 25;
  }
  return {total: fromScore + toScore, fromScore, toScore};
}
function allQuotes() { return BASE_QUOTES.concat(DB.quotes_extra || []); }
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a,b)=>a-b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 0) return Math.round((s[mid - 1] + s[mid]) / 2);
  return s[mid];
}
function fitLinear(pts) {
  /* pts: [[km, price], ...] → {a,b,n} price ≈ a + b·km */
  if (!pts || pts.length < 3) return null;
  const n = pts.length;
  let sx=0, sy=0, sxx=0, sxy=0;
  for (const [x,y] of pts) { sx+=x; sy+=y; sxx+=x*x; sxy+=x*y; }
  const den = n*sxx - sx*sx;
  if (Math.abs(den) < 1e-9) return null;
  const b = (n*sxy - sx*sy) / den;
  const a = (sy - b*sx) / n;
  if (!(b > 0) || !(a > -500000)) return null; /* разумный уклон */
  return {a, b, n};
}
function fmtRub(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
function fmtPair(a,b,est) {
  /* est kept for callers. Full rubles: «169 000 и 154 000 руб», not «169/154». */
  const fa = fmtRub(a);
  const fb = fmtRub(b);
  if (fa && fb) return fa + " и " + fb + " руб";
  if (fa) return fa + " руб (только 20')";
  if (fb) return fb + " руб (только 40')";
  return null;
}
function fmtOneRate(n) {
  const s = fmtRub(n);
  return s ? (s + " руб") : null;
}
function normalizeContainerType(t) {
  const s = String(t || "20").toLowerCase().replace(/ё/g, "е").trim();
  if (s === "40" || s === "40'" || s === "40′" || s === "40ft") return "40";
  if (s === "rf" || s === "reefer" || s === "реф" || s === "ref") return "rf";
  return "20";
}
function containerTypeLabel(t) {
  if (t === "40") return "40′";
  if (t === "rf") return "реф";
  return "20′";
}
function containerTypeTitle(t) {
  if (t === "40") return "40-футовый контейнер";
  if (t === "rf") return "реф-контейнер";
  return "20-футовый контейнер";
}
function quoteSearchBlob(q) {
  q = q || {};
  return [q.container, q.cont_norm, q.cargo, q.conditions, q.quote_raw]
    .map(x => String(x || "")).join(" ")
    .toLowerCase()
    .replace(/ё/g, "е");
}
function isReeferQuote(q) {
  const blob = quoteSearchBlob(q);
  if (/реф|reefer/.test(blob)) return true;
  if (/40\s*rf|40rf|40\s*re\b|40re\b|40\s*rh|40rh|40\s*hr|40hr/.test(blob)) return true;
  if (/(^|[^a-zа-я0-9])rf([^a-zа-я0-9]|$)/.test(blob)) return true;
  return false;
}
function positivePrice(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function quoteContainerKind(q) {
  if (!q) return "other";
  if (isReeferQuote(q)) return "rf";
  const cn = String(q.cont_norm || "").toLowerCase().replace(/ё/g, "е").trim();
  const box = String(q.container || "").toLowerCase().replace(/ё/g, "е");
  const text = (box + " " + String(q.quote_raw || "")).toLowerCase().replace(/ё/g, "е");
  if (cn === "тент/перетарка") return "other";
  if (/фура|тент|перетарк|бигбэг/.test(text) && !/20|40|контейнер|\bктк\b/.test(text)) return "other";
  const bothTxt = /20\s*\/\s*40|40\s*\/\s*20|20\s*и\s*40|20к[аи].{0,16}40|20['′]?\s*\/\s*40/.test(text);
  if (cn === "20/40" || cn === "40/20" || bothTxt) return "both";
  const p20 = positivePrice(q.price_20), p40 = positivePrice(q.price_40);
  if (cn === "20") {
    if (/^40\b|40hc|40dc|40'/.test(box.trim()) && !p20 && p40) return "40";
    return "20";
  }
  if (cn === "40") return "40";
  if (cn === "реф") return "rf";
  const has20 = /(?:^|[^0-9])20(?:dc|dv|hc|ка|'|′|фт|\b)/.test(text);
  const has40 = /(?:^|[^0-9])40(?:dc|hc|ка|'|′|фт|\b)/.test(text);
  if (has20 && has40) return "both";
  if (has40) return "40";
  if (has20) return "20";
  if (p20 && p40) return "both";
  if (p40) return "40";
  if (p20) return "20";
  return "other";
}
function selectedQuotePrice(q, ctype) {
  if (!q) return null;
  const kind = quoteContainerKind(q);
  if (ctype === "rf") {
    if (kind !== "rf") return null;
    return positivePrice(q.price_40) || positivePrice(q.price_20);
  }
  if (kind === "rf" || kind === "other") return null;
  if (ctype === "40") {
    if (kind === "20") return null;
    return positivePrice(q.price_40);
  }
  if (kind === "40") return null;
  return positivePrice(q.price_20);
}
function roundToThousand(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v / 1000) * 1000;
}
function netOfVat(q, amount) {
  if (amount == null) return null;
  const vat = String((q && q.vat) || "").toLowerCase().replace(/ё/g, "е");
  const raw = String((q && q.quote_raw) || "").toLowerCase().replace(/ё/g, "е");
  if (/без\s*ндс/.test(vat)) return amount;
  const rawNet = /плюс\s*ндс|\+\s*5\s*%|\+\s*ндс|без\s*ндс|ндс\s*сверху/.test(raw);
  const rawGross = /включая\s*ндс|(?:^|[^а-я+])с\s*ндс/.test(raw);
  if (rawGross && !rawNet) {
    const rate = (/22\s*%/.test(raw) && !/5\s*%/.test(raw)) ? 0.22 : 0.05;
    return amount / (1 + rate);
  }
  if (rawNet || /плюс\s*ндс|\+\s*ндс|\+\s*5|сверху/.test(vat)) return amount;
  if (/включая\s*ндс|(?:^|[^а-я])с\s*ндс/.test(vat)) return amount / 1.05;
  return amount;
}
function quoteWeightT(q) {
  const w = Number(q && q.weight_t);
  if (Number.isFinite(w) && w > 0) return w;
  const raw = String((q && q.quote_raw) || "").toLowerCase().replace(/ё/g, "е");
  const range = raw.match(/(\d{2}(?:[.,]\d)?)\s*[–\-]\s*(\d{2}(?:[.,]\d)?)\s*т/);
  if (range) {
    const a = parseFloat(range[1].replace(",", "."));
    const b = parseFloat(range[2].replace(",", "."));
    if (a > 0 && b > 0) return (a + b) / 2;
  }
  const one = raw.match(/(?<!до\s)(\d{2}(?:[.,]\d)?)\s*т/);
  if (one) return parseFloat(one[1].replace(",", "."));
  return null;
}
function quoteIsDrop(q) {
  const blob = [q && q.return_empty, q && q.conditions, q && q.quote_raw].join(" ").toLowerCase().replace(/ё/g, "е");
  return /сброс/.test(blob);
}
function userReturnIntent(text) {
  const s = String(text || "").toLowerCase().replace(/ё/g, "е").trim();
  if (!s) return null;
  if (/сброс/.test(s)) return {kind: "drop"};
  const city = canonPlace(s.replace(/^в\s+/, ""));
  return city ? {kind: "city", city: city} : null;
}
function parseReturnVariants(q) {
  const raw = String((q && q.quote_raw) || "").replace(/ё/g, "е");
  if (!/тыс/i.test(raw) || !/\d{2,3}\s*\/\s*\d{2,3}/.test(raw)) return null;
  const parts = raw.split(/;|\n|(?=\bвар\.?\s*\d)|(?=со сдачей)/i).map(function (s) { return s.trim(); }).filter(Boolean);
  const out = [];
  const seen = {};
  for (const part of parts) {
    const m = part.match(/(\d{2,3})\s*\/\s*(\d{2,3})\s*тыс/i);
    if (!m) continue;
    const low = part.toLowerCase();
    const hasNovo = /новороссий/.test(low) || /(^|[^а-я])ново([^а-я]|$)/.test(low);
    const hasSpb = /спб|питер|петербург/.test(low);
    if (hasNovo === hasSpb) continue;
    const city = hasNovo ? "новороссийск" : "спб";
    if (seen[city]) continue;
    seen[city] = 1;
    out.push({city: city, price_20: Number(m[1]) * 1000, price_40: Number(m[2]) * 1000});
  }
  return out.length >= 2 ? out : null;
}
function variantAmount(variant, ctype) {
  if (!variant) return null;
  if (ctype === "20") return positivePrice(variant.price_20);
  return positivePrice(variant.price_40);
}
function inferLaneOrigin(L) {
  if (L.route_from) return normalizePlace(L.route_from);
  const raw = String(L.sample_raw || "").toLowerCase().replace(/ё/g,"е");
  const dest = normalizePlace(L.route_to || "");
  /* ищем «город - …» / «город→» в начале объявления */
  const cities = Object.keys(CITY_COORDS).concat(Object.keys(ALIASES)).sort((a,b)=>b.length-a.length);
  let best = null, bestPos = 1e9;
  for (const c of cities) {
    if (c.length < 4) continue;
    const pos = raw.indexOf(c);
    if (pos >= 0 && pos < bestPos) {
      const key = ALIASES[c] || c;
      if (key === dest) continue;
      best = key; bestPos = pos;
    }
  }
  return best || "";
}
function defaultOverweight(weightT, roadKmVal) {
  const longHaul = roadKmVal != null && roadKmVal >= 1500;
  const heavy = weightT != null && weightT >= 27;
  if (heavy || longHaul) return "5 000–8 000 ₽/т (ориентир для 27–28 т / дальних плеч)";
  if (roadKmVal != null && roadKmVal < 200) return "1 000–1 500 ₽/т (ориентир, ближнее плечо)";
  return "3 000–3 500 ₽/т (ориентир по зоне; точного нет в базе)";
}
function buildDistanceModel() {
  const pts20 = {all:[], byOrigin:{}};
  const pts40 = {all:[], byOrigin:{}};
  function add(bucket, origin, km, price) {
    if (!price || km == null || km < 80) return;
    bucket.all.push([km, price]);
    if (!bucket.byOrigin[origin]) bucket.byOrigin[origin] = [];
    bucket.byOrigin[origin].push([km, price]);
  }
  for (const q of allQuotes()) {
    const ep = quoteEndpoints(q);
    if (ep.is_roundtrip || ep.is_empty_only) continue;
    const blob = ((q.quote_raw||"")+" "+(q.conditions||"")).toLowerCase();
    if (/\bвтт\b|перетарк/.test(blob)) continue;
    const rd = roadKm(ep.from, ep.to);
    if (!rd) continue;
    add(pts20, rd.fromKey, rd.km, q.price_20);
    add(pts40, rd.fromKey, rd.km, q.price_40);
  }
  return {pts20, pts40};
}
function estimateByDistance(nf, nt, weightT) {
  const rd = roadKm(nf, nt);
  const unknown = [];
  if (!resolveCity(nf)) unknown.push(nf || "(откуда)");
  if (!resolveCity(nt)) unknown.push(nt || "(куда)");
  if (unknown.length) {
    return {
      ok:false, unknown,
      message: "Не знаю координаты: " + unknown.join(", ") +
        ". Напишите рядом крупный город из списка (например Казань, Москва, СПб, Екатеринбург)."
    };
  }
  const model = buildDistanceModel();
  function pickFit(bucket) {
    const same = bucket.byOrigin[rd.fromKey] || [];
    if (same.length >= 5) {
      const f = fitLinear(same);
      if (f) return {fit:f, scope:"по вашим ставкам из " + rd.fromKey, n:f.n};
    }
    const f = fitLinear(bucket.all);
    if (f) return {fit:f, scope:"по всем вашим ставкам с известным плечом", n:f.n};
    return null;
  }
  const f20 = pickFit(model.pts20);
  const f40 = pickFit(model.pts40);
  if (!f20 && !f40) {
    return {ok:false, unknown:[], message:"В базе слишком мало ставок с известным расстоянием — оценить не могу."};
  }
  let p20 = f20 ? f20.fit.a + f20.fit.b * rd.km : null;
  let p40 = f40 ? f40.fit.a + f40.fit.b * rd.km : null;
  if (p20 && p40 && p20 < p40) p20 = p40;
  if (p20) p20 = Math.round(p20/1000)*1000;
  if (p40) p40 = Math.round(p40/1000)*1000;

  /* 3–5 ближайших по плечу реальных ставок (прямые, не кругорейсы) */
  const analogs = [];
  for (const q of allQuotes()) {
    const ep = quoteEndpoints(q);
    if (ep.is_empty_only) continue;
    const qrd = roadKm(ep.from, ep.to);
    if (!qrd) continue;
    if (q.price_20 == null && q.price_40 == null) continue;
    const sameOrigin = qrd.fromKey === rd.fromKey ? 0 : 1;
    const dKm = Math.abs(qrd.km - rd.km);
    let destDist = 5000;
    if (CITY_COORDS[qrd.toKey] && CITY_COORDS[rd.toKey]) {
      destDist = haversineKm(CITY_COORDS[qrd.toKey], CITY_COORDS[rd.toKey]) * 1.2;
    }
    const rank = 0.55 * dKm + 0.45 * destDist;
    analogs.push({
      q, ep, km:qrd.km, dKm, destDist, rank, sameOrigin,
      pair: fmtPair(q.price_20, q.price_40, false)
    });
  }
  analogs.sort((a,b) => a.sameOrigin - b.sameOrigin || a.rank - b.rank || String(b.q.date||"").localeCompare(String(a.q.date||"")));
  const top = analogs.slice(0, 5);

  const rubKm20 = f20 && rd.km ? Math.round(p20 / rd.km) : null;
  const rubKm40 = f40 && rd.km ? Math.round(p40 / rd.km) : null;
  return {
    ok:true, km: Math.round(rd.km), fromKey:rd.fromKey, toKey:rd.toKey,
    price_20:p20, price_40:p40,
    fit20: f20, fit40: f40,
    rub_km_20: rubKm20, rub_km_40: rubKm40,
    analogs: top,
    method: ""
  };
}
function suggestRate(routeFrom, routeTo, weightT, returnEmpty, secondUnload, containerType) {
  const ctype = normalizeContainerType(containerType);
  const nf = canonPlace(routeFrom);
  const nt = canonPlace(routeTo);
  const rd = roadKm(nf, nt);
  const intent = userReturnIntent(returnEmpty);
  const typeTitle = containerTypeTitle(ctype);

  function rowOf(q) {
    const amount = selectedQuotePrice(q, ctype);
    if (amount == null) return null;
    let net = netOfVat(q, amount);
    const variants = parseReturnVariants(q);
    let variantCity = "";
    if (intent && intent.kind === "city" && variants) {
      const hit = variants.filter(function (v) { return v.city === intent.city; })[0];
      const alt = hit ? variantAmount(hit, ctype) : null;
      if (alt) {
        net = alt;
        variantCity = hit.city;
      }
    }
    net = roundToThousand(net);
    if (!net) return null;
    return {
      q: q,
      ep: quoteEndpoints(q),
      net: net,
      weight: quoteWeightT(q),
      drop: quoteIsDrop(q),
      variants: variants,
      variantCity: variantCity
    };
  }

  const rows = [];
  for (const q of allQuotes()) {
    const row = rowOf(q);
    if (!row) continue;
    if (ctype !== "rf" && row.ep.is_empty_only) continue;
    if (row.ep.is_roundtrip) continue;
    const leg = roadKm(row.ep.from, row.ep.to);
    if (leg && leg.km > 1200 && row.net < 120000 && ctype !== "rf") continue;
    if (!row.ep.from || !row.ep.to) continue;
    rows.push(row);
  }

  function sameLane(row) {
    return row.ep.from === nf && row.ep.to === nt;
  }
  function mentionsReturnCity(q, city) {
    const blob = [q.return_empty, q.conditions, q.quote_raw].join(" ").toLowerCase().replace(/ё/g, "е");
    if (!/сдач|возврат|порожн/.test(blob)) return false;
    if (city === "спб") return /спб|питер|петербург/.test(blob);
    if (city === "новороссийск") return /новороссий|(^|[^а-я])ново([^а-я])/.test(blob);
    return blob.indexOf(city) >= 0;
  }
  function applyReturn(pool) {
    if (!intent || !pool.length) return pool;
    if (intent.kind === "drop") {
      const drops = pool.filter(function (r) { return r.drop; });
      return drops.length ? drops : pool;
    }
    const named = pool.filter(function (r) {
      return r.variantCity === intent.city || (!r.drop && !r.variants && mentionsReturnCity(r.q, intent.city));
    });
    if (named.length) return named;
    const plain = pool.filter(function (r) { return !r.drop; });
    return plain.length ? plain : pool;
  }
  function keepFresh(pool) {
    const dates = pool.map(function (r) { return String(r.q.date || ""); }).filter(Boolean).sort();
    if (!dates.length) return pool;
    const newest = dates[dates.length - 1];
    function since(days) {
      const cut = new Date(newest + "T00:00:00Z");
      cut.setUTCDate(cut.getUTCDate() - days);
      const iso = cut.toISOString().slice(0, 10);
      return pool.filter(function (r) { return String(r.q.date || "") >= iso; });
    }
    const recent = since(21);
    if (recent.length >= 4) return recent;
    const wider = since(80);
    if (wider.length >= 3) return wider;
    return pool;
  }
  function takeWeight(pool) {
    if (weightT == null || !pool.length) return {rows: pool, loose: false};
    const known = pool.filter(function (r) { return r.weight != null; });
    if (!known.length) return {rows: pool, loose: true};
    let hit = [];
    for (const tol of [1.5, 3, 5]) {
      hit = known.filter(function (r) { return Math.abs(r.weight - weightT) <= tol; });
      if (hit.length >= 3) return {rows: hit, loose: tol > 3};
      if (hit.length >= 2 && tol <= 3) return {rows: hit, loose: false};
    }
    known.sort(function (a, b) { return Math.abs(a.weight - weightT) - Math.abs(b.weight - weightT); });
    return {
      rows: known.slice(0, Math.min(3, known.length)),
      loose: Math.abs(known[0].weight - weightT) >= 4
    };
  }
  function dropOutliers(pool) {
    if (pool.length < 5) return pool;
    const med = median(pool.map(function (r) { return r.net; }));
    const kept = pool.filter(function (r) { return r.net >= med * 0.62 && r.net <= med * 1.55; });
    return kept.length >= 3 ? kept : pool;
  }

  let exact = rows.filter(sameLane);
  let reeferKind = "";
  if (ctype === "rf") {
    const loaded = exact.filter(function (r) { return !r.ep.is_empty_only; });
    reeferKind = loaded.length ? "loaded" : (exact.length ? "empty" : "");
    if (loaded.length) exact = loaded;
  }

  let mode = exact.length ? "exact" : "";
  let pool = exact.length ? applyReturn(exact) : [];
  let looseWeight = false;
  if (pool.length) {
    pool = keepFresh(pool);
    const w = takeWeight(pool);
    pool = w.rows;
    looseWeight = w.loose;
    pool = dropOutliers(pool);
  }

  if (!pool.length && ctype !== "rf" && rd) {
    const radius = Math.max(140, Math.min(380, rd.km * 0.26));
    let close = rows.filter(function (r) {
      if (r.ep.from !== nf || r.ep.to === nt) return false;
      const leg = roadKm(r.ep.from, r.ep.to);
      if (!leg) return false;
      const ratio = leg.km / rd.km;
      if (ratio < 0.62 || ratio > 1.45) return false;
      const destA = resolveCity(r.ep.to);
      const destB = resolveCity(nt);
      if (!destA || !destB) return false;
      const d = haversineKm(destA.coords, destB.coords);
      return d <= radius && d > 15;
    });
    if (close.length) {
      mode = "close";
      close = applyReturn(close);
      close = keepFresh(close);
      const w = takeWeight(close);
      close = w.rows;
      looseWeight = w.loose;
      pool = close;
    }
  }

  function weightSpan(list) {
    const ws = list.map(function (r) { return r.weight; }).filter(function (v) { return v != null; });
    if (!ws.length) return "";
    const mn = Math.min.apply(null, ws);
    const mx = Math.max.apply(null, ws);
    const fmt = function (n) { return (Math.round(n * 10) / 10).toString().replace(".", ","); };
    if (Math.abs(mx - mn) < 0.6) return "около " + fmt(mn) + " т";
    return fmt(mn) + "–" + fmt(mx) + " т";
  }
  function shortRoute(q) {
    const cut = function (s) { return String(s || "").split(/[,(]/)[0].trim(); };
    return (cut(q.route_from) || "?") + " → " + (cut(q.route_to) || "?");
  }

  const prices = pool.map(function (r) { return r.net; }).filter(Boolean);
  const primary = prices.length ? roundToThousand(median(prices)) : null;
  const isClose = mode === "close";
  const exactHit = mode === "exact" && prices.length > 0;
  const has_proposal = !!primary;
  let confidence = exactHit ? "точная" : (isClose ? "близкая" : "нет данных");
  let pairText = primary ? fmtOneRate(primary) : ("нет ставки на " + typeTitle);
  let warning = "";
  let method = "";
  let band = "";

  if (has_proposal) {
    const mn = roundToThousand(Math.min.apply(null, prices));
    const mx = roundToThousand(Math.max.apply(null, prices));
    const span = weightSpan(pool);
    const bits = [prices.length === 1 ? "1 ставка" : ("медиана по " + prices.length + " ставкам")];
    if (span) bits.push(span);
    if (mn && mx && mn !== mx) bits.push(fmtRub(mn) + "–" + fmtRub(mx) + " руб");
    band = bits.join(" · ");
    if (exactHit) {
      method = "Точное совпадение · " + containerTypeLabel(ctype);
      if (intent && intent.kind === "drop") method += " · со сбросом";
      else if (intent && intent.kind === "city") {
        const cityName = intent.city === "спб" ? "СПб" : (intent.city === "новороссийск" ? "Новороссийск" : intent.city);
        method += " · сдача в " + cityName;
      }
    } else {
      const counts = {};
      pool.forEach(function (r) {
        const key = shortRoute(r.q);
        counts[key] = (counts[key] || 0) + 1;
      });
      const named = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 3)
        .map(function (k) { return counts[k] > 1 ? (k + " (" + counts[k] + ")") : k; });
      warning = "Близкие ставки: точного " + String(routeFrom || "").trim() + " → " + String(routeTo || "").trim() + " в базе нет.";
      method = "Близкие: " + named.join("; ") + (span ? (", " + span) : "") + ".";
    }
    if (looseWeight && weightT != null) {
      const shown = weightSpan(pool) || "другой";
      warning = (warning ? warning + " " : "") + "В базе вес " + shown + ", в запросе " + weightT + " т — перевес в этих ставках не указан.";
    }
    if (ctype === "rf" && (reeferKind === "empty" || (exactHit && pool.every(function (r) { return r.ep.is_empty_only; })))) {
      warning = "Это ставка на вывоз порожнего реф-контейнера, не на гружёный рейс.";
      method = "Порожний реф · точное совпадение";
    }
  } else if (ctype === "rf") {
    method = "нет данных по рефу";
    const unknown = [];
    if (!resolveCity(nf)) unknown.push(routeFrom || "(откуда)");
    if (!resolveCity(nt)) unknown.push(routeTo || "(куда)");
    warning = unknown.length
      ? ("По этому направлению нет ставки на реф-контейнер. Не знаю город: " + unknown.join(", ") + ".")
      : "По этому направлению нет ставки на реф-контейнер.";
  } else {
    method = "нет данных";
    const unknown = [];
    if (!resolveCity(nf)) unknown.push(routeFrom || "(откуда)");
    if (!resolveCity(nt)) unknown.push(routeTo || "(куда)");
    if (unknown.length) {
      warning = "Не знаю координаты: " + unknown.join(", ") + ". Напишите рядом крупный город (Казань, Москва, СПб, Екатеринбург).";
    } else {
      warning = "По этому направлению нет цены на " + typeTitle + " и нет близких ставок того же типа.";
    }
  }

  let ow = null;
  const owCounts = {};
  pool.forEach(function (r) {
    const s = String(r.q.overweight || "").trim();
    if (!s) return;
    owCounts[s] = (owCounts[s] || 0) + 1;
  });
  let owBest = "";
  let owN = 0;
  Object.keys(owCounts).forEach(function (s) {
    if (owCounts[s] > owN) { owBest = s; owN = owCounts[s]; }
  });
  if (owBest && (owN >= 2 || pool.length <= 3)) ow = owBest;
  else if (pool.length) ow = "в этих ставках перевес отдельно не указан";
  else ow = "—";

  const extras = [];
  if (secondUnload) extras.push("+5 000 ₽ за 2-ю точку выгрузки (рабочая практика)");
  const variants = [];
  const altSeen = {};
  rows.filter(sameLane).forEach(function (r) {
    (r.variants || []).forEach(function (v) {
      if (intent && intent.kind === "city" && v.city === intent.city) return;
      const sum = roundToThousand(variantAmount(v, ctype));
      if (!sum || (primary && Math.abs(sum - primary) < 1000)) return;
      const label = v.city === "спб" ? "СПб" : "Новороссийск";
      const line = "Со сдачей в " + label + ": " + fmtOneRate(sum) + ".";
      if (!altSeen[line]) { altSeen[line] = 1; variants.push(line); }
    });
  });
  const portLane = nf === "спб" || nf === "новороссийск" || nt === "спб" || nt === "новороссийск";
  if (!variants.length && !returnEmpty && has_proposal && portLane) {
    variants.push("Дайте два варианта: сдача порожнего в СПб и в Новороссийске — цена сильно отличается.");
  }
  if (!intent && exactHit) {
    const drops = pool.filter(function (r) { return r.drop; });
    const plain = pool.filter(function (r) { return !r.drop; });
    if (drops.length >= 3 && plain.length >= 3) {
      const dMed = roundToThousand(median(drops.map(function (r) { return r.net; })));
      const pMed = roundToThousand(median(plain.map(function (r) { return r.net; })));
      if (dMed && pMed && Math.abs(dMed - pMed) / pMed >= 0.08) {
        variants.unshift("Со сбросом: " + fmtOneRate(dMed) + " (" + drops.length + "). Без сброса: " + fmtOneRate(pMed) + " (" + plain.length + ").");
      }
    }
  }

  const sources = pool.slice().sort(function (a, b) {
    return String(b.q.date || "").localeCompare(String(a.q.date || ""));
  }).slice(0, 8).map(function (r) {
    return {
      date: r.q.date,
      source: r.q.source,
      route: (r.q.route_from || "") + " → " + (r.q.route_to || ""),
      pair: fmtOneRate(r.net),
      vat: r.q.vat,
      overweight: r.q.overweight,
      raw: r.q.quote_raw,
      return_empty: r.q.return_empty,
      score: exactHit ? 100 : null,
      note: isClose ? "близкие" : (r.drop ? "со сбросом" : "")
    };
  });

  const laneSource = (typeof BASE_LANES !== "undefined" && Array.isArray(BASE_LANES)) ? BASE_LANES : [];
  const laneHits = [];
  for (const L of laneSource) {
    const lFrom = inferLaneOrigin(L);
    const lTo = canonPlace(L.route_to || "");
    const sc = scoreMatch(nf, nt, lFrom, lTo);
    let ok = sc.toScore >= 25;
    if (lFrom) ok = ok && sc.fromScore >= 25;
    else {
      const raw = String(L.sample_raw || "").toLowerCase().replace(/ё/g, "е");
      if (nf === "новороссийск") ok = ok && /новорос|ново\s*-|ново\s|нврск|нврс|раевск|терминал ново|нутеп|нмтп/.test(raw);
      else if (nf === "спб") ok = ok && /(^|[^а-я])спб|питер|санкт|плп|бронка|пкт|шушар|ктсп/.test(raw) && !/новорос|нврск|раевск|нутеп/.test((raw.split(/→|->|—/)[0] || raw));
      else ok = false;
    }
    if (ok) laneHits.push(Object.assign({}, L, {_score: sc.total || sc.toScore, _from: lFrom || nf}));
  }
  laneHits.sort(function (a, b) { return (b._score || 0) - (a._score || 0) || (b.n || 0) - (a.n || 0); });
  const carrier_lanes = laneHits.filter(function (L) {
    const reef = isReeferQuote({
      container: L.container, cont_norm: "", cargo: "", conditions: "", quote_raw: L.sample_raw || ""
    });
    return ctype === "rf" ? reef : !reef;
  }).slice(0, 5).map(function (L) {
    return {
      route: (L._from || L.route_from || "?") + " → " + (L.route_to || ""),
      container: L.container,
      weight_band: L.weight_band,
      n: L.n,
      min: L.min_price,
      median: L.median_price,
      max: L.max_price,
      dates: (L.date_from || "") + "…" + (L.date_to || "")
    };
  });
  let market_median_note = null;
  if (carrier_lanes.length) {
    let meds = carrier_lanes.filter(function (L) { return (L.n || 0) >= 2; }).map(function (L) { return L.median; }).filter(Boolean);
    if (!meds.length) meds = carrier_lanes.map(function (L) { return L.median; }).filter(Boolean);
    if (meds.length) market_median_note = median(meds);
  }

  let unknown_city = null;
  if (!has_proposal) {
    const unknown = [];
    if (!resolveCity(nf)) unknown.push(routeFrom || "(откуда)");
    if (!resolveCity(nt)) unknown.push(routeTo || "(куда)");
    if (unknown.length) unknown_city = unknown;
  }

  return {
    pair_text: pairText,
    price: primary,
    price_20: ctype === "20" ? primary : null,
    price_40: (ctype === "40" || ctype === "rf") ? primary : null,
    container_type: ctype,
    container_label: containerTypeLabel(ctype),
    container_title: typeTitle,
    vat: "+5% НДС",
    overweight: ow || "—",
    confidence: confidence,
    is_estimate: !exactHit,
    extras: extras,
    variants_note: variants,
    sources: sources,
    carrier_lanes: carrier_lanes,
    market_median_note: market_median_note,
    warning: warning,
    has_proposal: has_proposal,
    method: method,
    band_text: band,
    distance_km: rd ? Math.round(rd.km) : null,
    dist_info: null,
    unknown_city: unknown_city
  };
}

function renderStavki() {
  return `<h1>Калькулятор ставок</h1>
  <div class="warn-box">Подбор по базе ставок: маршрут, тип контейнера, вес и сдача порожнего. Сумма — в рублях, для выбранного типа.</div>
  <div class="card">
    <div class="row">
      <div class="field"><label>Откуда</label><input id="s-from" placeholder="СПб"></div>
      <div class="field"><label>Куда</label><input id="s-to" placeholder="Казань"></div>
      <div class="field" style="min-width:240px;flex:1.3">
        <label>Контейнер</label>
        <div class="toolbar" id="s-cont" role="radiogroup" aria-label="Контейнер" style="margin:0">
          <button type="button" class="btn small" data-cont="20" aria-pressed="true" title="20-футовый контейнер">20′</button>
          <button type="button" class="btn small ghost" data-cont="40" aria-pressed="false" title="40-футовый контейнер">40′</button>
          <button type="button" class="btn small ghost" data-cont="rf" aria-pressed="false" title="Реф-контейнер (RF)">Реф</button>
        </div>
      </div>
      <div class="field" style="max-width:110px"><label>Вес, т</label><input id="s-w" placeholder="20"></div>
      <div class="field"><label>Сдача порожнего</label><input id="s-ret" placeholder="СПб / Новороссийск"></div>
      <div class="field check"><input type="checkbox" id="s-2u"><label for="s-2u">2-я выгрузка</label></div>
    </div>
    <button class="btn" id="btn-stavki">Подобрать</button>
  </div>
  <div id="stavki-result"></div>
  <div class="card"><h2>Добавить свою ставку в базу</h2>
    <div class="row">
      <div class="field" style="max-width:150px"><label>Дата</label><input type="date" id="aq-date"></div>
      <div class="field"><label>Откуда</label><input id="aq-from"></div>
      <div class="field"><label>Куда</label><input id="aq-to"></div>
      <div class="field"><label>Контейнер</label>
        <select id="aq-cont">
          <option value="20/40">20′ / 40′</option>
          <option value="20">20-футовый (20′)</option>
          <option value="40">40-футовый (40′)</option>
          <option value="rf">Реф-контейнер (RF)</option>
        </select>
      </div>
      <div class="field" style="max-width:120px"><label>20', руб</label><input id="aq-20" placeholder="265000"></div>
      <div class="field" style="max-width:120px"><label>40' / реф, руб</label><input id="aq-40" placeholder="250000"></div>
      <div class="field" style="max-width:100px"><label>НДС</label><input id="aq-vat" value="+5%"></div>
    </div>
    <div class="row">
      <div class="field"><label>Клиент</label><input id="aq-client"></div>
      <div class="field wide"><label>Как писали (сырой текст)</label><input id="aq-raw"></div>
      <div class="field"><label>Перевес</label><input id="aq-ow" placeholder="3500/т"></div>
    </div>
    <button class="btn secondary" id="btn-add-quote">Добавить</button>
  </div>`;
}
function selectedContainerType() {
  const g = document.getElementById("s-cont");
  if (!g) return "20";
  const on = g.querySelector('[aria-pressed="true"]');
  return normalizeContainerType(on && on.getAttribute("data-cont"));
}
function bindContainerTypeButtons() {
  const g = document.getElementById("s-cont");
  if (!g) return;
  g.querySelectorAll("[data-cont]").forEach(btn => {
    btn.onclick = () => {
      g.querySelectorAll("[data-cont]").forEach(b => {
        const on = b === btn;
        b.setAttribute("aria-pressed", on ? "true" : "false");
        b.className = "btn small" + (on ? "" : " ghost");
      });
    };
  });
}
function showStavkiResult() {
  const from = document.getElementById("s-from").value.trim();
  const to = document.getElementById("s-to").value.trim();
  if (!from || !to) { alert("Укажите откуда и куда"); return; }
  const w = parseFloat(document.getElementById("s-w").value) || null;
  const ret = document.getElementById("s-ret").value.trim();
  const su = document.getElementById("s-2u").checked;
  const ctype = selectedContainerType();
  const r = suggestRate(from, to, w, ret, su, ctype);
  let html = `<div class="card"><h2>Предложение · ${esc(r.container_title || containerTypeTitle(ctype))}</h2>`;
  if (r.has_proposal) {
    html += `<div class="pair">${esc(r.pair_text)} <span class="chip">${esc(r.container_label || "")}</span> <span style="font-size:1rem;font-weight:600">${esc(r.vat)}</span></div>`;
    if (r.band_text) html += `<p class="muted">${esc(r.band_text)}</p>`;
    html += `<p>Перевес: <strong>${esc(r.overweight)}</strong> · Уверенность: <span class="chip ${r.is_estimate?"warn":""}">${esc(r.confidence)}</span>
      ${r.distance_km?` · ${r.distance_km} км`:""}</p>`;
    if (r.method && !/оценк|a \+|₽\/км|\bn=/.test(r.method)) html += `<p class="muted">${esc(r.method)}</p>`;
  } else {
    html += `<div class="pair" style="color:var(--warn)">${esc(r.pair_text)}</div>`;
    if (r.unknown_city && r.unknown_city.length) {
      html += `<p>Не знаю город: <strong>${esc(r.unknown_city.join(", "))}</strong>. Укажите рядом крупный город (Казань, Москва, СПб, Екатеринбург…).</p>`;
    }
  }
  for (const e of r.extras) html += `<div class="chip">${esc(e)}</div>`;
  for (const v of r.variants_note) html += `<p class="muted">${esc(v)}</p>`;
  if (r.warning && !/оценк[аи] по расстоянию|a \+ b|₽\/км|\bn=/.test(r.warning)) {
    html += `<div class="warn-box">${esc(r.warning)}</div>`;
  }
  if (r.carrier_lanes.length) {
    html += `<h3 style="margin-top:16px">Рынок перевозчиков (MAX)</h3>`;
    if (r.market_median_note) html += `<p class="muted">Медиана рынка по найденным плечам: <strong>${money(r.market_median_note)}</strong> ₽ (без НДС у перевозчиков)</p>`;
    html += `<table><thead><tr><th>Маршрут</th><th>Конт.</th><th>Вес</th><th>n</th><th>мин</th><th>медиана</th><th>макс</th><th>даты</th></tr></thead><tbody>`;
    for (const L of r.carrier_lanes) {
      html += `<tr><td>${esc(L.route)}</td><td>${esc(L.container)}</td><td>${esc(L.weight_band)}</td><td>${esc(L.n)}</td>
        <td>${money(L.min)}</td><td><strong>${money(L.median)}</strong></td><td>${money(L.max)}</td>
        <td class="muted">${esc(L.dates)}</td></tr>`;
    }
    html += `</tbody></table>`;
  }
  html += `</div>`;
  document.getElementById("stavki-result").innerHTML = html;
  try { renderStavkiMapPanel(from, to); } catch (e) { console.warn(e); }
}
function addQuote() {
  const from = document.getElementById("aq-from").value.trim();
  const to = document.getElementById("aq-to").value.trim();
  if (!from || !to) { alert("Укажите маршрут"); return; }
  const contSel = (document.getElementById("aq-cont") || {}).value || "20/40";
  let container = "20/40", cont_norm = "20/40";
  if (contSel === "20") { container = "20'"; cont_norm = "20"; }
  else if (contSel === "40") { container = "40'"; cont_norm = "40"; }
  else if (contSel === "rf") { container = "реф"; cont_norm = "реф"; }
  const q = {
    date: document.getElementById("aq-date").value || new Date().toISOString().slice(0,10),
    source: "вручную", who: "owner",
    client: document.getElementById("aq-client").value.trim(), contact: "",
    route_from: from, route_to: to,
    from_norm: normalizePlace(from), to_norm: normalizePlace(to),
    return_empty: "", container: container, cont_norm: cont_norm, cargo: "",
    weight_t: null, conditions: "",
    quote_raw: document.getElementById("aq-raw").value.trim(),
    price_20: parseInt(document.getElementById("aq-20").value,10) || null,
    price_40: parseInt(document.getElementById("aq-40").value,10) || null,
    vat: document.getElementById("aq-vat").value.trim() || "+5%",
    overweight: document.getElementById("aq-ow").value.trim(), outcome: ""
  };
  if (!DB.quotes_extra) DB.quotes_extra = [];
  DB.quotes_extra.push(q); saveStore(DB); toast("Ставка добавлена в базу");
}
function defaultVatPct() {
  const v = Number(window._tripVatPct);
  return Number.isFinite(v) && v >= 0 ? v : 5;
}
function rateNetOfVat(amount, withVat, vatPct) {
  const n = Number(amount) || 0;
  const pct = (vatPct == null ? defaultVatPct() : Number(vatPct)) || 0;
  if (!withVat || pct <= 0) return n;
  return n / (1 + pct / 100);
}
function computeTripMarginHint(t) {
  const vat = t.vat_pct != null && t.vat_pct !== "" ? Number(t.vat_pct) : defaultVatPct();
  const clientNet = rateNetOfVat(t.client_rate, !!t.client_with_vat, vat);
  const carrierNet = rateNetOfVat(t.carrier_rate, !!t.carrier_with_vat, vat);
  const extra = Number(t.extra_expenses) || 0;
  const margin = clientNet - carrierNet - extra;
  const pct = clientNet > 0 ? (margin / clientNet) * 100 : null;
  return { margin: Math.round(margin), pct, clientNet, carrierNet, vat };
}
function tripMarginValue(t) {
  if (!t) return 0;
  if (t.margin !== "" && t.margin != null && Number.isFinite(Number(t.margin))) return Number(t.margin);
  return computeTripMarginHint(t).margin;
}
function ensureTripMarginFilled(t) {
  if (!t) return t;
  if (t.margin === "" || t.margin == null || !Number.isFinite(Number(t.margin))) {
    t.margin = computeTripMarginHint(t).margin;
  }
  return t;
}
function tripStatusOptions(selected) {
  const opts = ["черновик", "в работе", "выполнен", "оплачен", "отменён"];
  const cur = selected || "в работе";
  if (cur && opts.indexOf(cur) < 0) opts.unshift(cur);
  return opts.map(o => `<option${o === cur ? " selected" : ""}>${o}</option>`).join("");
}
function payOptions(selected) {
  const opts = ["не оплачено", "частично", "оплачено"];
  const cur = selected || "не оплачено";
  return opts.map(o => `<option${o === cur ? " selected" : ""}>${o}</option>`).join("");
}
function renderTripForm(trip) {
  const t = trip || {};
  const isEdit = !!(trip && trip.id != null);
  const hint = computeTripMarginHint(t);
  const marginVal = (t.margin !== "" && t.margin != null) ? t.margin : "";
  return `<div class="card" id="trip-form-wrap">
    <h2>${isEdit ? "Изменить рейс" : "Новый рейс"}</h2>
    <input type="hidden" id="t-id" value="${isEdit ? esc(String(t.id)) : ""}">
    <div class="row">
      <div class="field" style="max-width:150px"><label>Дата</label><input type="date" id="t-date" value="${esc(t.date||"")}"></div>
      <div class="field"><label>Клиент</label><input id="t-client" value="${esc(t.client||"")}"></div>
      <div class="field wide"><label>Маршрут</label><input id="t-route" value="${esc(t.route||"")}"></div>
      <div class="field"><label>Статус</label><select id="t-status">${tripStatusOptions(t.status)}</select></div>
    </div>
    <div class="row">
      <div class="field"><label>Перевозчик</label><input id="t-carrier" value="${esc(t.carrier||"")}"></div>
      <div class="field"><label>Водитель</label><input id="t-driver" value="${esc(t.driver||"")}"></div>
      <div class="field"><label>Машина</label><input id="t-truck" value="${esc(t.truck||"")}" placeholder="тягач / прицеп"></div>
    </div>
    <div class="row">
      <div class="field"><label>Ставка клиенту</label><input id="t-cr" type="number" value="${t.client_rate != null ? esc(String(t.client_rate)) : ""}">
        <label class="check"><input type="checkbox" id="t-cr-vat" ${t.client_with_vat ? "checked" : ""}> с НДС</label></div>
      <div class="field"><label>Ставка перевозчику</label><input id="t-car" type="number" value="${t.carrier_rate != null ? esc(String(t.carrier_rate)) : ""}">
        <label class="check"><input type="checkbox" id="t-car-vat" ${t.carrier_with_vat ? "checked" : ""}> с НДС</label></div>
      <div class="field" style="max-width:120px"><label>НДС %</label><input id="t-vat-pct" type="number" step="0.1" value="${esc(String(t.vat_pct != null ? t.vat_pct : defaultVatPct()))}"></div>
      <div class="field"><label>Доп. расходы</label><input id="t-extra" type="number" value="${t.extra_expenses != null ? esc(String(t.extra_expenses)) : "0"}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Маржа (вручную)</label>
        <input id="t-margin" type="number" value="${marginVal !== "" ? esc(String(marginVal)) : ""}">
        <div class="muted" id="t-margin-hint">расчёт: ${money(hint.margin)}${hint.pct != null ? " (" + hint.pct.toFixed(1) + "%)" : ""}</div>
        <button type="button" class="btn small ghost" id="btn-fill-margin">подставить расчёт</button>
      </div>
      <div class="field"><label>Оплата клиент</label><select id="t-pay-c">${payOptions(t.pay_client)}</select></div>
      <div class="field"><label>Оплата перевозчик</label><select id="t-pay-car">${payOptions(t.pay_carrier)}</select></div>
      <div class="field"><label>Заявка</label>
        <select id="t-zid"><option value="">—</option>
          ${DB.zayavki.map(z=>`<option value="${z.id}" ${t.zayavka_id===z.id?"selected":""}>№${esc(z.number)} ${esc((z.carrier&&z.carrier.full_name)||"")}</option>`).join("")}
        </select></div>
    </div>
    <div class="row">
      <div class="field wide"><label>Документы / заметка</label><input id="t-note" value="${esc(t.note||"")}"></div>
    </div>
    <div class="toolbar">
      <button class="btn" id="btn-save-trip">Сохранить рейс</button>
      <button class="btn ghost" id="btn-cancel-trip" type="button">Отмена</button>
    </div>
  </div>`;
}
function readTripForm() {
  const idRaw = (document.getElementById("t-id") || {}).value;
  return {
    id: idRaw ? Number(idRaw) : null,
    date: (document.getElementById("t-date") || {}).value || "",
    client: ((document.getElementById("t-client") || {}).value || "").trim(),
    route: ((document.getElementById("t-route") || {}).value || "").trim(),
    status: (document.getElementById("t-status") || {}).value || "в работе",
    carrier: ((document.getElementById("t-carrier") || {}).value || "").trim(),
    driver: ((document.getElementById("t-driver") || {}).value || "").trim(),
    truck: ((document.getElementById("t-truck") || {}).value || "").trim(),
    client_rate: Number((document.getElementById("t-cr") || {}).value) || 0,
    carrier_rate: Number((document.getElementById("t-car") || {}).value) || 0,
    client_with_vat: !!(document.getElementById("t-cr-vat") || {}).checked,
    carrier_with_vat: !!(document.getElementById("t-car-vat") || {}).checked,
    vat_pct: Number((document.getElementById("t-vat-pct") || {}).value),
    extra_expenses: Number((document.getElementById("t-extra") || {}).value) || 0,
    margin: (function(){
      const el = document.getElementById("t-margin");
      if (!el || el.value === "") return null;
      const n = Number(el.value);
      return Number.isFinite(n) ? n : null;
    })(),
    pay_client: (document.getElementById("t-pay-c") || {}).value || "не оплачено",
    pay_carrier: (document.getElementById("t-pay-car") || {}).value || "не оплачено",
    zayavka_id: (function(){
      const v = (document.getElementById("t-zid") || {}).value;
      return v ? Number(v) : null;
    })(),
    note: ((document.getElementById("t-note") || {}).value || "").trim()
  };
}
function refreshTripMarginHint() {
  const hintEl = document.getElementById("t-margin-hint");
  if (!hintEl) return;
  const draft = readTripForm();
  const hint = computeTripMarginHint(draft);
  hintEl.textContent = "расчёт: " + money(hint.margin) + (hint.pct != null ? (" (" + hint.pct.toFixed(1) + "%)") : "");
}
function renderReisy(opts) {
  opts = opts || {};
  const month = (window._tripMonth) || new Date().toISOString().slice(0,7);
  const trips = DB.trips.filter(t => !month || (t.date||"").startsWith(month));
  let sumClient = 0, sumCarrier = 0, sumMargin = 0;
  for (const t of trips) {
    sumClient += Number(t.client_rate)||0;
    sumCarrier += Number(t.carrier_rate)||0;
    sumMargin += tripMarginValue(t);
  }
  const showForm = opts.mode === "edit" || opts.mode === "new" || editingTripId != null;
  let formTrip = null;
  if (opts.mode === "edit" || editingTripId != null) {
    const id = opts.id != null ? opts.id : editingTripId;
    formTrip = DB.trips.find(x => x.id === Number(id)) || null;
  }
  let html = `<h1>Рейсы</h1>
  <div class="toolbar">
    <label class="muted">Месяц <input type="month" id="trip-month" value="${esc(month)}"></label>
    <button class="btn" id="btn-new-trip">Добавить рейс</button>
    <button class="btn secondary" id="btn-export-trips">Excel (CSV)</button>
  </div>
  <div class="grid stats">
    <div class="card stat"><div class="num">${trips.length}</div><div class="lbl">Рейсов</div></div>
    <div class="card stat"><div class="num">${money(sumClient)}</div><div class="lbl">Клиенту</div></div>
    <div class="card stat"><div class="num">${money(sumCarrier)}</div><div class="lbl">Перевозчику</div></div>
    <div class="card stat"><div class="num">${money(sumMargin)}</div><div class="lbl">Маржа</div></div>
  </div>`;
  if (showForm) html += renderTripForm(formTrip);
  else html += `<div id="trip-form-wrap" style="display:none"></div>`;
  html += `<div class="card"><table><thead><tr>
    <th>Дата</th><th>Клиент</th><th>Маршрут</th><th>Перевозчик</th><th>Клиенту</th><th>Перевозчику</th><th>Маржа</th><th>Оплаты</th><th></th>
  </tr></thead><tbody>`;
  if (!trips.length) html += `<tr><td colspan="9" class="muted">Рейсов за месяц нет</td></tr>`;
  for (const t of trips.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)))) {
    const margin = tripMarginValue(t);
    html += `<tr>
      <td>${esc(fmtDate(t.date))}</td><td>${esc(t.client)}</td><td>${esc(t.route)}
        ${t.status?`<div class="muted">${esc(t.status)}</div>`:""}</td>
      <td>${esc(t.carrier)}<div class="muted">${esc(t.driver||"")}</div>
        ${t.truck?`<div class="muted">${esc(t.truck)}</div>`:""}</td>
      <td>${money(t.client_rate)}</td><td>${money(t.carrier_rate)}</td><td><strong>${money(margin)}</strong></td>
      <td><span class="chip">${esc(t.pay_client)}</span> / <span class="chip">${esc(t.pay_carrier)}</span>
        ${t.note?`<div class="muted">${esc(t.note)}</div>`:""}
        ${t.zayavka_id?`<div><a href="#" data-view="${t.zayavka_id}">заявка</a></div>`:""}</td>
      <td class="nowrap">
        <button class="btn small" data-edit-trip="${t.id}">Изменить</button>
        <button class="btn small ghost" data-del-trip="${t.id}">Удалить</button>
      </td></tr>`;
  }
  return html + `</tbody></table></div>`;
}
function saveTrip(andStay) {
  const form = document.getElementById("trip-form-wrap");
  if (!form || !document.getElementById("t-date")) {
    tripFormSaved = false;
    return false;
  }
  const raw = readTripForm();
  // If margin blank — fill from hint once; never overwrite typed value
  if (raw.margin == null) {
    raw.margin = computeTripMarginHint(raw).margin;
  }
  const id = raw.id;
  if (id != null && DB.trips.some(x => x.id === id)) {
    const t = DB.trips.find(x => x.id === id);
    Object.assign(t, raw, { id: t.id });
  } else {
    const t = Object.assign({}, raw, { id: allocId("trip", DB.trips) });
    DB.trips.push(t);
  }
  saveStore(DB);
  tripFormSaved = true;
  markTripFormClean();
  toast("Рейс сохранён");
  if (andStay) return true;
  editingTripId = null;
  tripFormBaseline = null;
  showTab("reisy");
  return true;
}
function exportTripsCSV() {
  const month = window._tripMonth || "";
  const trips = DB.trips.filter(t => !month || (t.date||"").startsWith(month));
  const header = ["Дата","Клиент","Маршрут","Статус","Перевозчик","Водитель","Машина","Ставка клиенту","Ставка перевозчику","Доп. расходы","Маржа","Оплата клиент","Оплата перевозчик","Заметка","Заявка"];
  const lines = [header.join(";")];
  for (const t of trips) {
    const margin = tripMarginValue(t);
    const z = t.zayavka_id ? (DB.zayavki.find(x=>x.id===t.zayavka_id)||{}) : {};
    const row = [fmtDate(t.date), t.client, t.route, t.status||"", t.carrier, t.driver, t.truck||"", t.client_rate, t.carrier_rate, t.extra_expenses||0, margin, t.pay_client, t.pay_carrier, t.note, z.number||""]
      .map(v => { const s = String(v==null?"":v).replace(/"/g,'""'); return /[;"\n]/.test(s) ? `"${s}"` : s; });
    lines.push(row.join(";"));
  }
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], {type:"text/csv;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "reysy_" + (month||"all") + ".csv";
  a.click();
}
function formatTripRate(rate) {
  if (rate == null || rate === "") return "—";
  if (typeof rate === "number") return rate ? money(rate) + " ₽" : "—";
  const s = String(rate).trim();
  return s || "—";
}
function tripCoveredByZayavki(trip, zList) {
  const tDate = String(trip.date || "");
  const dName = normName(trip.driver || "");
  const surname = dName.split(" ")[0] || "";
  let dmy = "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(tDate)) {
    dmy = tDate.slice(8, 10) + "." + tDate.slice(5, 7) + "." + tDate.slice(0, 4);
  }
  for (const z of zList) {
    if (tDate && String(z.date || "") === tDate) return true;
    const load = String(z.loading_datetime || "");
    if (tDate && load.includes(tDate)) return true;
    if (dmy && load.includes(dmy)) return true;
    if (surname && normName(z.driver || "").includes(surname)) return true;
  }
  return false;
}
function tripsOfCarrier(c) {
  const items = [];
  const seen = new Set();
  const zList = [];
  const n = normName(c.full_name);
  const inn = String(c.inn || "");
  for (const z of (DB.zayavki || [])) {
    const zc = z.carrier || {};
    const same = z.carrier_id === c.id || (inn && String(zc.inn || "") === inn) || normName(zc.full_name) === n;
    if (!same) continue;
    zList.push(z);
    const key = "z:" + z.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const route = [z.loading_address, z.unloading_address].filter(Boolean).join(" → ");
    items.push({date: z.date || z.created_at || "", route: route, rate: formatTripRate(z.rate), tip: "заявка №" + (z.number || "")});
  }
  for (const t of (DB.trips || [])) {
    if (normName(t.carrier) !== n) continue;
    if (tripCoveredByZayavki(t, zList)) continue;
    const key = "trip:" + t.id;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({date: t.date, route: t.route || "", rate: formatTripRate(t.carrier_rate || t.client_rate || 0), tip: t.note || ""});
  }
  items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return items;
}
function tripsOfDriver(d) {
  const items = [];
  const seen = new Set();
  const zList = [];
  const n = normName(d.full_name);
  const surname = n.split(" ")[0] || "";
  for (const z of (DB.zayavki || [])) {
    const blk = normName(z.driver || "");
    if (!surname || !blk.includes(surname)) continue;
    zList.push(z);
    const key = "z:" + z.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const route = [z.loading_address, z.unloading_address].filter(Boolean).join(" → ");
    items.push({date: z.date || z.created_at || "", route: route, rate: formatTripRate(z.rate), tip: "заявка №" + (z.number || "")});
  }
  for (const t of (DB.trips || [])) {
    if (normName(t.driver) !== n) continue;
    if (tripCoveredByZayavki(t, zList)) continue;
    const key = "trip:" + t.id;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({date: t.date, route: t.route || "", rate: formatTripRate(t.carrier_rate || t.client_rate || 0), tip: t.note || ""});
  }
  items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return items;
}
function renderTripsCell(items) {
  if (!items.length) return `<div class="muted trips-count">Рейсы: 0</div>`;
  const title = items.map(it => `${fmtDate(it.date)} · ${it.route} · ${it.rate}`).join("\\n");
  let list = items.slice(0, 4).map(it =>
    `<div class="trip-line" title="${esc(it.tip || "")}">${esc(fmtDate(it.date))} · ${esc(it.route)} · ${esc(it.rate)}</div>`
  ).join("");
  if (items.length > 4) list += `<div class="muted">и ещё ${items.length - 4}</div>`;
  return `<div class="trips-count" title="${esc(title)}">Рейсы: ${items.length}</div><div class="trips-list">${list}</div>`;
}

function truckPlateKey(t) {
  return normPlate((t && (t.tractor_number || t.line || t.notes)) || "");
}
function trucksOfCarrier(carrierId) {
  return (DB.trucks || []).filter(t => t.carrier_id != null && Number(t.carrier_id) === Number(carrierId));
}
function trucksUnlinked() {
  return (DB.trucks || []).filter(t => t.carrier_id == null);
}
function formatTruckShort(t) {
  if (!t) return "";
  const head = [t.brand, t.tractor_number].filter(Boolean).join(" ").trim();
  const trail = [t.trailer_brand, t.trailer_number].filter(Boolean).join(" ").trim();
  if (head && trail) return head + " / " + trail;
  return head || trail || t.line || t.notes || ("#" + t.id);
}
function driverNameForTruck(t) {
  if (!t) return "";
  if (t.driver_id != null) {
    const d = DB.drivers.find(x => x.id === t.driver_id);
    if (d) return d.full_name || "";
  }
  const d2 = DB.drivers.find(x => x.truck_id != null && Number(x.truck_id) === Number(t.id));
  return d2 ? (d2.full_name || "") : "";
}
function findCarrierIdForPlate(plate) {
  const p = normPlate(plate);
  if (!p) return null;
  // zayavki with this plate
  for (const z of (DB.zayavki || [])) {
    const zt = normPlate(z.truck || "");
    if (zt && (zt === p || zt.indexOf(p) >= 0 || p.indexOf(zt) >= 0)) {
      if (z.carrier_id != null) return z.carrier_id;
      const inn = z.carrier && z.carrier.inn;
      const found = findCarrier(inn, z.carrier && z.carrier.full_name);
      if (found) return found.id;
    }
  }
  // trips
  for (const tr of (DB.trips || [])) {
    const blob = normPlate([tr.truck, tr.note, tr.route].filter(Boolean).join(" "));
    if (blob && blob.indexOf(p) >= 0) {
      const found = findCarrier(null, tr.carrier);
      if (found) return found.id;
    }
  }
  return null;
}

/** Parse "Марка А123ВС 45 / п/п XYZ" style line into fields. */
function parseTruckLine(line) {
  const s = String(line || "").trim();
  if (!s) return null;
  const plateRe = /[АВЕКМНОРСТУХABEKMHOPCTYX]\s*\d{3}\s*[АВЕКМНОРСТУХABEKMHOPCTYX]{2}\s*\d{2,3}|\d{4}\s*[АВЕКМНОРСТУХABEKMHOPCTYX]{2}\s*\d{2,3}/gi;
  const plates = (s.match(plateRe) || []).map(x => x.replace(/\s+/g, " ").trim());
  const tractor = plates[0] || "";
  const trailer = plates[1] || "";
  let brand = "";
  const bm = s.match(/^\s*([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\-]*(?:\s+[A-Za-zА-Яа-яЁё\-]+)?)/);
  if (bm) {
    const cand = bm[1].trim().replace(/[,/]+$/, "").trim();
    if (cand.length > 1 && !/\d/.test(cand) && !/^(п\/п|пп|прицеп)$/i.test(cand)) brand = cand;
  }
  return {
    line: s,
    brand: brand,
    tractor_number: tractor,
    trailer_number: trailer,
    trailer_brand: "",
    notes: s
  };
}
/** Idempotent: create truck rows from zayavki/trips text when plate not yet in DB.trucks. */
function ensureTrucksFromSources() {
  if (!DB.trucks) DB.trucks = [];
  let created = 0;
  const seen = new Set();
  function upsertFromLine(line, carrierId, driverHint) {
    const parsed = parseTruckLine(line);
    if (!parsed || !parsed.tractor_number) return;
    const key = normPlate(parsed.tractor_number);
    if (!key || seen.has(key)) return;
    seen.add(key);
    let truck = typeof findTruckByPlate === "function" ? findTruckByPlate(parsed.tractor_number, parsed.trailer_number) : null;
    if (!truck) {
      truck = DB.trucks.find(t => normPlate(t.tractor_number || t.line || "") === key);
    }
    if (!truck) {
      truck = Object.assign({ id: allocId("truck", DB.trucks), carrier_id: carrierId != null ? carrierId : null, driver_id: null }, parsed);
      DB.trucks.push(truck);
      created++;
    } else if (truck.carrier_id == null && carrierId != null) {
      truck.carrier_id = carrierId;
    }
    if (driverHint && truck.driver_id == null) {
      const d = DB.drivers.find(x => normName(x.full_name) === normName(driverHint));
      if (d) {
        truck.driver_id = d.id;
        if (d.truck_id == null) d.truck_id = truck.id;
        if (truck.carrier_id == null && d.carrier_id != null) truck.carrier_id = d.carrier_id;
      }
    }
  }
  for (const z of (DB.zayavki || [])) {
    if (!z.truck) continue;
    let cid = z.carrier_id != null ? z.carrier_id : null;
    if (cid == null && z.carrier) {
      const f = findCarrier(z.carrier.inn, z.carrier.full_name);
      if (f) cid = f.id;
    }
    upsertFromLine(z.truck, cid, z.driver);
  }
  for (const tr of (DB.trips || [])) {
    if (!tr.truck && !(tr.note || "").match(/[АВЕКМНОРСТУХA-Z]\s*\d{3}/i)) continue;
    const line = tr.truck || tr.note || "";
    const found = findCarrier(null, tr.carrier);
    upsertFromLine(line, found ? found.id : null, tr.driver);
  }
  return created;
}

/** Idempotent: only fills blank carrier_id. Never overwrites user assignment. */
function linkTrucksToCarriers() {
  if (!DB.trucks) DB.trucks = [];
  let linked = 0, unlinked = 0;
  for (const t of DB.trucks) {
    if (t.carrier_id != null) continue;
    let cid = null;
    if (t.driver_id != null) {
      const d = DB.drivers.find(x => x.id === t.driver_id);
      if (d && d.carrier_id != null) cid = d.carrier_id;
    }
    if (cid == null) {
      const d2 = DB.drivers.find(x => x.truck_id != null && Number(x.truck_id) === Number(t.id));
      if (d2 && d2.carrier_id != null) cid = d2.carrier_id;
    }
    if (cid == null) cid = findCarrierIdForPlate(t.tractor_number || t.line || "");
    if (cid != null) {
      t.carrier_id = cid;
      linked++;
    } else {
      unlinked++;
    }
  }
  // also count already-linked for report
  const already = DB.trucks.filter(t => t.carrier_id != null).length - linked;
  const report = { linked_now: linked, already_linked: Math.max(0, already), unlinked: unlinked, total: DB.trucks.length };
  window.__truckLinkReport = report;
  return report;
}
(function runTruckLinkMigration() {
  let created = 0;
  try { created = ensureTrucksFromSources() || 0; } catch (e) {}
  const rep = linkTrucksToCarriers();
  rep.created_from_sources = created;
  window.__truckLinkReport = rep;
  if (rep.linked_now || created) try { saveStore(DB); } catch (e) {}
})();
function renderCarrierTrucksCell(c) {
  const list = trucksOfCarrier(c.id);
  if (!list.length) return `<span class="muted">—</span>`;
  return list.map(t => `<div class="mono" title="${esc(formatTruckShort(t))}">${esc(t.tractor_number || formatTruckShort(t))}</div>`).join("");
}
function renderTruckEditorList(carrierId) {
  const list = trucksOfCarrier(carrierId);
  let h = `<div class="card" style="background:#fff;margin-top:10px"><h3>Машины</h3>`;
  if (!list.length) h += `<p class="muted">Машин пока нет</p>`;
  else {
    h += `<table><thead><tr><th>Тягач</th><th>Прицеп</th><th>Марка</th><th>Водитель</th><th></th></tr></thead><tbody>`;
    for (const t of list) {
      h += `<tr>
        <td class="mono">${esc(t.tractor_number||"")}</td>
        <td class="mono">${esc(t.trailer_number||"")}</td>
        <td>${esc([t.brand,t.trailer_brand].filter(Boolean).join(" / "))}</td>
        <td>${esc(driverNameForTruck(t))}</td>
        <td class="nowrap">
          <button type="button" class="btn small ghost" onclick="editTruck(${t.id},${carrierId})">Изменить</button>
          <button type="button" class="btn small ghost" style="color:#b91c1c" onclick="deleteTruck(${t.id})">Удалить</button>
        </td></tr>`;
    }
    h += `</tbody></table>`;
  }
  h += `<div class="toolbar"><button type="button" class="btn small" onclick="editTruck(null,${carrierId})">+ Добавить машину</button></div>
    <div id="truck-edit-${carrierId}"></div></div>`;
  return h;
}
function renderUnlinkedTrucksBlock() {
  const list = trucksUnlinked();
  if (!list.length) return "";
  const opts = DB.carriers.map(c => `<option value="${c.id}">${esc(c.full_name)}</option>`).join("");
  let h = `<div class="card"><h2>Машины без перевозчика <span class="chip">${list.length}</span></h2>
    <p class="muted">Привяжите к перевозчику — тогда они появятся в его карточке и в заявке.</p>
    <table><thead><tr><th>Тягач</th><th>Прицеп</th><th>Марка / строка</th><th>Назначить</th></tr></thead><tbody>`;
  for (const t of list) {
    h += `<tr class="sprav-row" data-fio="${esc(formatTruckShort(t))}">
      <td class="mono">${esc(t.tractor_number||"")}</td>
      <td class="mono">${esc(t.trailer_number||"")}</td>
      <td>${esc(t.brand||"")} ${esc(t.line||t.notes||"")}</td>
      <td><select id="orphan-truck-${t.id}"><option value="">— перевозчик —</option>${opts}</select>
        <button type="button" class="btn small" onclick="assignTruckCarrier(${t.id})">OK</button>
        <button type="button" class="btn small ghost" onclick="editTruck(${t.id},null)">Изменить</button>
      </td></tr>`;
  }
  return h + `</tbody></table><div id="truck-edit-orphan"></div></div>`;
}
function editTruck(id, carrierId) {
  const t = id == null ? { carrier_id: carrierId } : (DB.trucks.find(x => x.id === id) || {});
  const cid = t.carrier_id != null ? t.carrier_id : carrierId;
  const boxId = cid != null ? ("truck-edit-" + cid) : "truck-edit-orphan";
  let box = document.getElementById(boxId);
  if (!box) {
    // fallback: inject into carrier-edit
    box = document.getElementById("carrier-edit") || document.getElementById("main");
  }
  const carrierOpts = `<option value="">— без перевозчика —</option>` + DB.carriers.map(c =>
    `<option value="${c.id}" ${Number(cid)===c.id?"selected":""}>${esc(c.full_name)}</option>`).join("");
  const driverOpts = `<option value="">—</option>` + DB.drivers
    .filter(d => cid == null || d.carrier_id == null || Number(d.carrier_id) === Number(cid))
    .map(d => `<option value="${d.id}" ${t.driver_id===d.id?"selected":""}>${esc(d.full_name)}</option>`).join("");
  box.innerHTML = `<div class="card" style="background:#f1f5f9;margin-top:8px">
    <h3>${id==null?"Новая машина":"Изменить машину"}</h3>
    <div class="row">
      <div class="field"><label>Марка тягача</label><input id="trk-brand" value="${esc(t.brand||"")}"></div>
      <div class="field"><label>№ тягача</label><input id="trk-tractor" value="${esc(t.tractor_number||"")}"></div>
      <div class="field"><label>Марка прицепа</label><input id="trk-trailer-brand" value="${esc(t.trailer_brand||"")}"></div>
      <div class="field"><label>№ прицепа</label><input id="trk-trailer" value="${esc(t.trailer_number||"")}"></div>
      <div class="field wide"><label>Строка в заявке</label><input id="trk-line" value="${esc(t.line||t.notes||"")}"></div>
      <div class="field"><label>Перевозчик</label><select id="trk-carrier">${carrierOpts}</select></div>
      <div class="field"><label>Водитель</label><select id="trk-driver">${driverOpts}</select></div>
    </div>
    <div class="toolbar">
      <button type="button" class="btn" onclick="saveTruck(${id==null?"null":id})">Сохранить машину</button>
      <button type="button" class="btn ghost" onclick="showTab('sprav')">Отмена</button>
    </div></div>`;
  box.scrollIntoView({behavior:"smooth", block:"nearest"});
}
function saveTruck(id) {
  const v = {
    brand: (document.getElementById("trk-brand")||{}).value.trim(),
    tractor_number: (document.getElementById("trk-tractor")||{}).value.trim(),
    trailer_brand: (document.getElementById("trk-trailer-brand")||{}).value.trim(),
    trailer_number: (document.getElementById("trk-trailer")||{}).value.trim(),
    line: (document.getElementById("trk-line")||{}).value.trim(),
    notes: (document.getElementById("trk-line")||{}).value.trim(),
    carrier_id: (function(){ const v=(document.getElementById("trk-carrier")||{}).value; return v?Number(v):null; })(),
    driver_id: (function(){ const v=(document.getElementById("trk-driver")||{}).value; return v?Number(v):null; })()
  };
  if (!v.tractor_number && !v.line) { toast("Укажите номер тягача или строку"); return; }
  if (!v.line) {
    v.line = [v.brand, v.tractor_number].filter(Boolean).join(" ");
    if (v.trailer_number) v.line += " / " + [v.trailer_brand, v.trailer_number].filter(Boolean).join(" ");
  }
  if (id == null) {
    const row = Object.assign({ id: allocId("truck", DB.trucks) }, v);
    DB.trucks.push(row);
    if (v.driver_id != null) {
      const d = DB.drivers.find(x => x.id === v.driver_id);
      if (d) d.truck_id = row.id;
    }
  } else {
    const t = DB.trucks.find(x => x.id === id);
    if (t) Object.assign(t, v);
    if (v.driver_id != null) {
      const d = DB.drivers.find(x => x.id === v.driver_id);
      if (d) d.truck_id = id;
    }
  }
  saveStore(DB); toast("Машина сохранена"); showTab("sprav");
}
function deleteTruck(id) {
  const t = DB.trucks.find(x => x.id === id);
  if (!t || !confirm("Удалить машину " + formatTruckShort(t) + "?")) return;
  DB.trucks = DB.trucks.filter(x => x.id !== id);
  DB.drivers.forEach(d => { if (Number(d.truck_id) === Number(id)) d.truck_id = null; });
  saveStore(DB); toast("Удалено"); showTab("sprav");
}
function assignTruckCarrier(truckId) {
  const sel = document.getElementById("orphan-truck-" + truckId);
  if (!sel || !sel.value) { toast("Выберите перевозчика"); return; }
  const t = DB.trucks.find(x => x.id === truckId);
  if (!t) return;
  t.carrier_id = Number(sel.value);
  saveStore(DB); toast("Привязано"); showTab("sprav");
}
function fillZayavkaTruckOptions(carrierId, selectedLine) {
  const sel = document.getElementById("z-truck-pick");
  if (!sel) return;
  const list = carrierId != null ? trucksOfCarrier(carrierId) : [];
  sel.innerHTML = `<option value="">— выбрать из справочника —</option>` +
    list.map(t => `<option value="${esc(formatTruckShort(t))}" data-id="${t.id}">${esc(formatTruckShort(t))}</option>`).join("");
  if (selectedLine) {
    const hit = list.find(t => formatTruckShort(t) === selectedLine || (t.line||"") === selectedLine);
    if (hit) sel.value = formatTruckShort(hit);
  }
  sel.onchange = () => {
    if (sel.value) {
      const inp = document.getElementById("z-truck");
      if (inp) inp.value = sel.value;
    }
  };
}
function renderSprav() {
  let html = `<h1>Справочник</h1>
  <div class="card"><div class="field wide"><label>Поиск по ФИО</label>
    <input id="sprav-search" type="search" placeholder="Например: Другов или Керим" oninput="filterSprav(this.value)" autocomplete="off"></div>
    <p class="muted" id="sprav-found"></p></div>
  <div class="card"><h2>Перевозчики</h2>
  <div class="toolbar"><button class="btn small" onclick="editCarrier(null)">+ Добавить перевозчика</button></div>
  <div id="carrier-edit"></div>
  <table><thead><tr><th>Тип</th><th>ФИО / название</th><th>ИНН</th><th>Телефон</th><th>Машины</th><th>Рейсы</th><th>Банк</th><th>р/с</th><th></th></tr></thead><tbody>`;
  for (const c of DB.carriers) {
    const trips = tripsOfCarrier(c);
    const noteShort = c.notes ? `<div class="muted" style="font-size:.8rem">${esc(String(c.notes).slice(0,80))}${String(c.notes).length>80?"…":""}</div>` : "";
    html += `<tr class="sprav-row" data-fio="${esc((c.full_name||"")+" "+(c.short_name||"")+" "+(c.signatory||""))}"><td>${esc(c.type)}</td><td>${esc(c.full_name)}${noteShort}</td><td>${esc(c.inn)}</td><td>${esc(c.phone)}</td><td>${renderCarrierTrucksCell(c)}</td><td>${renderTripsCell(trips)}</td><td>${esc(c.bank)}</td><td class="mono">${esc(c.rs)}</td><td><button class="btn small ghost" onclick="editCarrier(${c.id})">Изменить</button></td></tr>`;
  }
  html += `</tbody></table></div>`;
  html += renderUnlinkedTrucksBlock();
  html += `<div class="card"><h2>Водители</h2>
  <div class="toolbar"><button class="btn small" onclick="editDriver(null)">+ Добавить водителя</button></div>
  <div id="driver-edit"></div>
  <table><thead><tr><th>ФИО</th><th>Права</th><th>Телефон</th><th>Рейсы</th><th></th></tr></thead><tbody>`;
  for (const d of DB.drivers) {
    const trips = tripsOfDriver(d);
    const car = d.carrier_id != null ? (DB.carriers.find(x => x.id === d.carrier_id) || null) : null;
    const extras = [];
    if (d.birth_date) extras.push(`<div class="muted">${esc(d.birth_date)} г.р.</div>`);
    if (car) extras.push(`<div class="muted">${esc(car.full_name)}</div>`);
    if (d.notes) extras.push(`<div class="muted" style="font-size:.8rem">${esc(String(d.notes).slice(0,90))}${String(d.notes).length>90?"…":""}</div>`);
    html += `<tr class="sprav-row" data-fio="${esc(d.full_name||"")}"><td>${esc(d.full_name)}${extras.join("")}</td><td>${esc(d.license_number)}</td><td>${esc(d.phone)}</td><td>${renderTripsCell(trips)}</td><td><button class="btn small ghost" onclick="editDriver(${d.id})">Изменить</button></td></tr>`;
  }
  html += `</tbody></table>
  <p class="note">Новых перевозчиков программа запоминает сама, когда вы сохраняете заявку с ИНН. Машины хранятся у перевозчика. Рейсы считаются из вкладки «Рейсы» и из заявок.</p></div>`;
  return html;
}
function sprvTruckOwner(t) {
  const names = [];
  for (const k of ["carrier_id","driver_id"]) {
    if (t[k] == null) continue;
    const list = k === "carrier_id" ? DB.carriers : DB.drivers;
    const x = list.find(o => String(o.id) === String(t[k]));
    if (x) names.push(x.full_name || "");
  }
  for (const d of DB.drivers) if (d.truck_id != null && String(d.truck_id) === String(t.id)) names.push(d.full_name || "");
  return names.join(" ");
}
const CARRIER_FIELDS = [
  ["full_name","ФИО (для ИП) или название","wide"],["inn","ИНН",""],["kpp","КПП (для ООО)",""],["ogrn","ОГРН / ОГРНИП",""],
  ["address","Адрес","wide"],["phone","Телефон",""],
  ["bank","Банк","wide"],["bik","БИК",""],["ks","к/с",""],["rs","р/с",""],
  ["signatory","Подписант (напр. ИП Иванов И.И.)","wide"],["notes","Примечание","wide"]];
function editCarrier(id) {
  const c = id == null ? {type:"ИП"} : (DB.carriers.find(x => x.id === id) || {});
  const types = ["ИП","ООО","АО","Самозанятый"];
  if (c.type && !types.includes(c.type)) types.push(c.type);
  let f = `<div class="card" style="background:#f8fafc"><h2>${id==null?"Новый перевозчик":"Изменить перевозчика"}</h2><div class="row">
    <div class="field" style="max-width:150px"><label>Тип</label><select id="car-type">${types.map(t=>`<option ${c.type===t?"selected":""}>${t}</option>`).join("")}</select></div>`;
  for (const [k,label,cls] of CARRIER_FIELDS)
    f += `<div class="field ${cls}"><label>${label}</label><input id="car-${k}" value="${esc(c[k]||"")}"></div>`;
  f += `</div><div class="toolbar" style="margin-top:10px">
      <button class="btn" onclick="saveCarrier(${id==null?"null":id})">Сохранить</button>
      <button class="btn ghost" onclick="document.getElementById('carrier-edit').innerHTML=''">Отмена</button>
      ${id==null?"":`<button class="btn ghost" style="color:#b91c1c!important" onclick="deleteCarrier(${id})">Удалить</button>`}
    </div></div>`;
  if (id != null) f += renderTruckEditorList(id);
  const box = document.getElementById("carrier-edit");
  box.innerHTML = f;
  box.scrollIntoView({behavior:"smooth", block:"start"});
  document.getElementById("car-full_name").focus();
}
function saveCarrier(id) {
  const v = {type: document.getElementById("car-type").value};
  for (const [k] of CARRIER_FIELDS) v[k] = document.getElementById("car-"+k).value.trim();
  if (!v.full_name) { toast("Впишите ФИО или название"); return; }
  if (v.inn) {
    const dup = DB.carriers.find(x => x.inn === v.inn && x.id !== id);
    if (dup && !confirm("Перевозчик с ИНН " + v.inn + " уже есть (" + dup.full_name + "). Всё равно сохранить?")) return;
  }
  if (id == null) {
    if (!DB.next) DB.next = {carrier:100,driver:100,truck:100,zayavka:100,trip:100,quote:100};
    if (!DB.next.carrier) DB.next.carrier = Math.max(100, ...DB.carriers.map(x => x.id + 1));
    DB.carriers.push(Object.assign({id: DB.next.carrier++}, v));
  } else {
    const c = DB.carriers.find(x => x.id === id);
    if (c) Object.assign(c, v);
  }
  saveStore(DB); toast("Перевозчик сохранён"); showTab("sprav");
}
function deleteCarrier(id) {
  const c = DB.carriers.find(x => x.id === id);
  if (!c || !confirm("Удалить перевозчика " + (c.full_name||"") + "? Старые заявки не изменятся.")) return;
  DB.carriers = DB.carriers.filter(x => x.id !== id);
  DB.drivers.forEach(d => { if (d.carrier_id === id) d.carrier_id = null; });
  DB.trucks.forEach(tr => { if (Number(tr.carrier_id) === Number(id)) tr.carrier_id = null; });
  saveStore(DB); toast("Удалено"); showTab("sprav");
}
const DRIVER_FIELDS = [
  ["full_name","ФИО","wide"],["birth_date","Дата рождения",""],["phone","Телефон",""],
  ["passport","Паспорт (серия и номер)",""],["passport_issued","Кем и когда выдан паспорт","wide"],
  ["address","Адрес регистрации","wide"],
  ["license_number","Вод. удостоверение №",""],["license_issued","Кем и когда выдано ВУ",""],
  ["notes","Примечание","wide"]];
function editDriver(id) {
  const d = id == null ? {} : (DB.drivers.find(x => x.id === id) || {});
  const box = document.getElementById("driver-edit");
  const carrierOpts = `<option value="">— не выбран —</option>` + DB.carriers.map(c =>
    `<option value="${c.id}" ${d.carrier_id===c.id?"selected":""}>${esc(c.full_name)}</option>`).join("");
  let f = `<div class="card" style="background:#f8fafc"><h2>${id==null?"Новый водитель":"Изменить водителя"}</h2><div class="row">`;
  for (const [k,label,cls] of DRIVER_FIELDS)
    f += `<div class="field ${cls}"><label>${label}</label><input id="drv-${k}" value="${esc(d[k]||"")}"></div>`;
  f += `<div class="field wide"><label>Перевозчик</label><select id="drv-carrier_id">${carrierOpts}</select></div></div>
    <div class="toolbar" style="margin-top:10px">
      <button class="btn" onclick="saveDriver(${id==null?"null":id})">Сохранить</button>
      <button class="btn ghost" onclick="document.getElementById('driver-edit').innerHTML=''">Отмена</button>
      ${id==null?"":`<button class="btn ghost" style="color:#b91c1c!important" onclick="deleteDriver(${id})">Удалить</button>`}
    </div></div>`;
  box.innerHTML = f;
  box.scrollIntoView({behavior:"smooth", block:"start"});
  document.getElementById("drv-full_name").focus();
}
function saveDriver(id) {
  const v = {};
  for (const [k] of DRIVER_FIELDS) v[k] = document.getElementById("drv-"+k).value.trim();
  const cv = document.getElementById("drv-carrier_id").value;
  v.carrier_id = cv ? Number(cv) : null;
  if (!v.full_name) { toast("Впишите ФИО"); return; }
  v.block = "";
  if (id == null) {
    if (!DB.next) DB.next = {carrier:100,driver:100,truck:100,zayavka:100,trip:100,quote:100};
    if (!DB.next.driver) DB.next.driver = Math.max(100, ...DB.drivers.map(x => x.id + 1));
    DB.drivers.push(Object.assign({id: DB.next.driver++}, v));
  } else {
    const d = DB.drivers.find(x => x.id === id);
    if (d) Object.assign(d, v);
  }
  saveStore(DB); toast("Водитель сохранён"); showTab("sprav");
}
function deleteDriver(id) {
  const d = DB.drivers.find(x => x.id === id);
  if (!d || !confirm("Удалить водителя " + (d.full_name||"") + "?")) return;
  DB.drivers = DB.drivers.filter(x => x.id !== id);
  saveStore(DB); toast("Удалено"); showTab("sprav");
}
function filterSprav(q) {
  const words = String(q||"").toLowerCase().replace(/ё/g,"е").split(/\s+/).filter(Boolean);
  let shown = 0, total = 0;
  document.querySelectorAll(".sprav-row").forEach(tr => {
    const hay = (tr.dataset.fio + " " + tr.textContent).toLowerCase().replace(/ё/g,"е");
    const ok = words.every(w => hay.includes(w));
    tr.style.display = ok ? "" : "none";
    total++; if (ok) shown++;
  });
  const el = document.getElementById("sprav-found");
  if (el) el.textContent = words.length ? (shown ? `Найдено строк: ${shown}` : "Ничего не найдено") : "";
}
function renderBackup() {
  return `<h1>Резервная копия</h1>
  <div class="card">
    <p>Все ваши заявки, рейсы, справочник и добавленные ставки хранятся <strong>в этом браузере на этом компьютере</strong>.</p>
    <p class="muted">Если очистите историю браузера или откроете файл на другом ПК — данные пропадут. Скачайте копию заранее.</p>
    <div class="toolbar">
      <button class="btn" id="btn-export-bak">Скачать резервную копию (JSON)</button>
      <label class="btn secondary" style="cursor:pointer">Загрузить копию
        <input type="file" id="btn-import-bak" accept="application/json,.json" hidden>
      </label>
      <button class="btn ghost" id="btn-reset">Сбросить к исходным</button>
    </div>
  </div>`;
}
function exportBackup() {
  const blob = new Blob([JSON.stringify(DB, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "kasyanov_backup_" + new Date().toISOString().slice(0,10) + ".json";
  a.click();
}
function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (!d.carriers || !d.zayavki) throw new Error("Неверный файл");
      DB = d;
      if (!DB.trips) DB.trips = [];
      if (!DB.quotes_extra) DB.quotes_extra = [];
      if (!DB.next) DB.next = {carrier:100,driver:100,truck:100,zayavka:100,trip:100,quote:100};
      if (!DB.imports_done) DB.imports_done = [];
      if (!DB.rolis || typeof DB.rolis !== "object") DB.rolis = { byKey: {}, cards: [] };
      if (!DB.rolis.byKey || typeof DB.rolis.byKey !== "object") DB.rolis.byKey = {};
      if (!Array.isArray(DB.rolis.cards)) DB.rolis.cards = [];
      saveStore(DB); applyVersionedImports(); toast("Копия загружена"); showTab("pochta");
    } catch (e) { alert("Не удалось прочитать файл: " + e.message); }
  };
  reader.readAsText(file, "utf-8");
}
function bindTabHandlers(tab) {
  if (tab === "zayavki") {
    const bn = document.getElementById("btn-new-z");
    if (bn) bn.onclick = () => { editingZayavkaId = null; showTab("zayavki",{mode:"new"}); };
    document.querySelectorAll("[data-view]").forEach(b => b.onclick = (e) => {
      e.preventDefault(); previewZayavkaId = Number(b.dataset.view);
      showTab("zayavki",{mode:"preview", id: previewZayavkaId});
    });
    document.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => {
      editingZayavkaId = Number(b.dataset.edit);
      showTab("zayavki",{mode:"edit", id: editingZayavkaId});
    });
    document.querySelectorAll("[data-copy]").forEach(b => b.onclick = () => {
      const src = DB.zayavki.find(x => x.id === Number(b.dataset.copy));
      if (!src) return;
      editingZayavkaId = null;
      showTab("zayavki",{mode:"new"});
      setTimeout(() => {
        applyCopyFrom(src.id);
        document.getElementById("z-number").value = "";
        document.getElementById("z-date").value = new Date().toISOString().slice(0,10);
      }, 0);
    });
    document.querySelectorAll("[data-del-z]").forEach(b => b.onclick = () => deleteZayavka(b.dataset.delZ));
    const bdel = document.getElementById("btn-del-z");
    if (bdel) bdel.onclick = () => deleteZayavka(editingZayavkaId);
    const back = document.getElementById("btn-back-z");
    if (back) back.onclick = () => {
      if (document.getElementById("z-number") && !confirmLeaveZayavkaForm()) return;
      zayavkaFormBaseline = null;
      editingZayavkaId=null; previewZayavkaId=null;
      showTab("zayavki",{mode:"list"});
    };
    const save = document.getElementById("btn-save-z");
    if (save) save.onclick = () => saveZayavka(false);
    const sp = document.getElementById("btn-save-preview");
    if (sp) sp.onclick = () => saveZayavka(true);
    // Dirty tracking for form (only when form fields exist)
    if (document.getElementById("z-number")) {
      markZayavkaFormClean();
      const formRoot = document.getElementById("main");
      if (formRoot && !formRoot._zDirtyBound) {
        formRoot.addEventListener("input", () => { if (zayavkaFormBaseline != null) zayavkaFormSaved = false; });
        formRoot.addEventListener("change", () => { if (zayavkaFormBaseline != null) zayavkaFormSaved = false; });
        formRoot._zDirtyBound = true;
      }
    } else {
      zayavkaFormBaseline = null;
    }
    const cf = document.getElementById("z-copy-from");
    if (cf) cf.onchange = () => { if (cf.value) applyCopyFrom(cf.value); };
    const cp = document.getElementById("z-carrier-pick");
    if (cp) {
      const syncTrucks = () => {
        const cid = cp.value ? Number(cp.value) : null;
        fillZayavkaTruckOptions(cid, (document.getElementById("z-truck")||{}).value || "");
      };
      syncTrucks();
      cp.onchange = () => {
        const c = DB.carriers.find(x => x.id === Number(cp.value));
        if (c) {
          fillCarrierFields(c);
          const d = DB.drivers.find(x => x.carrier_id === c.id);
          if (d && d.block) document.getElementById("z-driver").value = d.block;
          else if (d) {
            let blk = d.full_name;
            if (d.birth_date) blk += ", " + d.birth_date + " г.р.";
            if (d.passport) blk += ", паспорт " + d.passport;
            if (d.passport_issued) blk += ", выдан " + d.passport_issued;
            if (d.address) blk += ", зарегистрирован по адресу: " + d.address;
            if (d.license_number) blk += "\nВод удостоверение " + d.license_number + (d.license_issued ? ", выдано " + d.license_issued : "");
            if (d.phone) blk += "\nТел. " + d.phone;
            document.getElementById("z-driver").value = blk;
          }
          const trucks = trucksOfCarrier(c.id);
          if (trucks.length === 1) {
            document.getElementById("z-truck").value = formatTruckShort(trucks[0]);
          }
        }
        syncTrucks();
      };
    }
    const pr = document.getElementById("btn-print-z");
    if (pr) pr.onclick = () => { const z = DB.zayavki.find(x => x.id === previewZayavkaId); if (z) printZayavka(z); };
    const wd = document.getElementById("btn-word-z");
    if (wd) wd.onclick = () => { const z = DB.zayavki.find(x => x.id === previewZayavkaId); if (z) downloadWord(z); };
  }
  if (tab === "karta") {
    bindKartaHandlers();
  }
  if (tab === "stavki") {
    bindContainerTypeButtons();
    document.getElementById("btn-stavki").onclick = showStavkiResult;
    document.getElementById("btn-add-quote").onclick = addQuote;
    ["s-from","s-to","s-w","s-ret"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); showStavkiResult(); }
      });
    });
  }
  if (tab === "reisy") {
    const m = document.getElementById("trip-month");
    if (m) m.onchange = () => { window._tripMonth = m.value; showTab("reisy"); };
    const bn = document.getElementById("btn-new-trip");
    if (bn) bn.onclick = () => {
      editingTripId = null;
      showTab("reisy", { mode: "new" });
      markTripFormClean();
    };
    const st = document.getElementById("btn-save-trip");
    if (st) st.onclick = () => saveTrip(false);
    const cancel = document.getElementById("btn-cancel-trip");
    if (cancel) cancel.onclick = () => {
      if (!confirmLeaveTripForm()) return;
      tripFormBaseline = null; editingTripId = null; showTab("reisy");
    };
    const fill = document.getElementById("btn-fill-margin");
    if (fill) fill.onclick = () => {
      const hint = computeTripMarginHint(readTripForm());
      const el = document.getElementById("t-margin");
      if (el) el.value = String(hint.margin);
      refreshTripMarginHint();
    };
    ["t-cr","t-car","t-extra","t-vat-pct","t-cr-vat","t-car-vat"].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", refreshTripMarginHint);
      el.addEventListener("change", refreshTripMarginHint);
    });
    if (document.getElementById("t-date")) markTripFormClean();
    document.getElementById("btn-export-trips").onclick = exportTripsCSV;
    document.querySelectorAll("[data-edit-trip]").forEach(b => b.onclick = () => {
      editingTripId = Number(b.dataset.editTrip);
      showTab("reisy", { mode: "edit", id: editingTripId });
    });
    document.querySelectorAll("[data-del-trip]").forEach(b => b.onclick = () => {
      if (!confirm("Удалить рейс? Импорт больше не вернёт его.")) return;
      const id = Number(b.dataset.delTrip);
      const trip = DB.trips.find(t => t.id === id);
      if (trip) markTripDeleted(trip);
      DB.trips = DB.trips.filter(t => t.id !== id);
      saveStore(DB); showTab("reisy");
    });
    document.querySelectorAll("[data-view]").forEach(b => b.onclick = (e) => {
      e.preventDefault(); previewZayavkaId = Number(b.dataset.view);
      showTab("zayavki",{mode:"preview", id: previewZayavkaId});
    });
  }
  if (tab === "pochta") {
    bindPochtaHandlers();
  }
  if (tab === "chat") {
    if (typeof bindChatHandlers === "function") bindChatHandlers();
  }
  if (tab === "rolis") {
    if (typeof bindRolisHandlers === "function") bindRolisHandlers();
  }
  if (tab === "grail") {
    if (window.bindGrailHandlers) window.bindGrailHandlers();
  }
  if (tab === "backup") {
    document.getElementById("btn-export-bak").onclick = exportBackup;
    document.getElementById("btn-import-bak").onchange = (e) => { if (e.target.files[0]) importBackup(e.target.files[0]); };
    document.getElementById("btn-reset").onclick = () => {
      if (!confirm("Сбросить все данные к исходным (Стец, Другов, Мамбетшаев)?")) return;
      localStorage.removeItem(STORE_KEY); DB = loadStore(); applyVersionedImports(); toast("Сброшено"); showTab("pochta");
    };
  }
}
function handleHash() {
  const h = location.hash || "";
  let m = h.match(/^#print-zayavka-(\d+)/);
  if (m) {
    const z = DB.zayavki.find(x => x.id === Number(m[1]));
    if (z) {
      document.body.classList.add("print-mode");
      document.getElementById("print-root").innerHTML = renderZayavkaHTML(z);
      return true;
    }
  }
  m = h.match(/^#preview-(\d+)/);
  if (m) { showTab("zayavki", {mode:"preview", id: Number(m[1])}); return true; }
  m = h.match(/^#tab-(\w+)/);
  if (m) { showTab(m[1]); return true; }
  return false;
}
window.addEventListener("hashchange", () => {
  // Leaflet zoom +/- uses <a href="#"> — ignore empty hash so map is not remounted
  const h = location.hash || "";
  if (!h || h === "#") return;
  if (!handleHash()) showTab(currentTab);
});
/* boot deferred to bootCloudAuth() in 1.0.7 */

/* === РОЛИС (вкладка Магистраль 1.1.0, карточка контейнера 1.2.0) === */
const ROLIS_LOGIN_URL = "https://www.rlisystems.ru/webiom/login.jsf";
const ROLIS_SERVICE_URL = "https://www.rlisystems.ru/service/";
const ROLIS_STATUS_SUGGESTIONS = [
  "визит оформлен",
  "пропуск есть",
  "на терминале",
  "досмотр",
  "выпуск разрешён",
  "вывезен",
  "сдан порожний"
];
const ROLIS_DEMO_STATUSES = [
  "на терминале",
  "досмотр назначен",
  "выпуск разрешён",
  "визит оформлен",
  "вывезен",
  "ожидает слот",
  "сдан порожний"
];
const ROLIS_TERMINALS = [
  "ПКТ", "Петролеспорт", "УЛКТ", "НУТЭП", "Янино",
  "Нева-Металл", "Логистика-Терминал", "Терминал Врангель"
];
const ROLIS_LIFE_STAGES = [
  { id: "port", title: "В порту" },
  { id: "pickup", title: "Вывоз" },
  { id: "handling", title: "Обработка" },
  { id: "return", title: "Возврат порожнего" },
  { id: "closed", title: "Закрыт" }
];
const ROLIS_HANDLING_TYPES = ["перетарка", "выгрузка", "затарка"];
const ROLIS_CONT_TYPES = [
  { id: "20", label: "20′" },
  { id: "40", label: "40′" },
  { id: "40hc", label: "40HC" },
  { id: "rf", label: "реф" }
];
/** Unlocked cards advance one stage this often while DEMO is the active mode. */
const ROLIS_DEMO_STEP_MS = 30000;
function ensureRolisStore() {
  if (!DB.rolis || typeof DB.rolis !== "object") DB.rolis = {};
  if (!DB.rolis.byKey || typeof DB.rolis.byKey !== "object") DB.rolis.byKey = {};
  if (!Array.isArray(DB.rolis.cards)) DB.rolis.cards = [];
  return DB.rolis;
}

function rolisKey(zayavkaId, container) {
  return String(zayavkaId || "") + "|" + String(container || "").toUpperCase();
}

function extractContainerNumbers(text) {
  const s = String(text || "").toUpperCase();
  const re = /\b([A-Z]{4}\d{7})\b/g;
  const out = [];
  const seen = {};
  let m;
  while ((m = re.exec(s))) {
    if (!seen[m[1]]) { seen[m[1]] = true; out.push(m[1]); }
  }
  return out;
}

function guessShippingLine(container, cargo) {
  const pref = String(container || "").toUpperCase().slice(0, 4);
  const map = {
    ARKU: "Arkas", FYCU: "FESCO", TRHU: "Triton", AXIU: "Axis",
    TCLU: "Textainer", DFSU: "Dong Fang", TCNU: "Textainer",
    MSKU: "Maersk", CMAU: "CMA CGM", HLCU: "Hapag-Lloyd",
    MSCU: "MSC", OOLU: "OOCL", SEGU: "Sea", BSIU: "Blue Sky", DRYU: "Dong Young"
  };
  if (map[pref]) return map[pref];
  const c = String(cargo || "");
  const m = c.match(/\b(Arkas|FESCO|Maersk|MSC|CMA|Hapag|OOCL|Evergreen|COSCO|ONE)\b/i);
  return m ? m[1] : "—";
}

function detectRolisTerminal(load, unload) {
  const blob = (String(load || "") + " | " + String(unload || "")).toUpperCase();
  const rules = [
    [/НУТЭП|NUTEP/, "НУТЭП"],
    [/ПЕТРОЛЕСПОРТ|\bПЛП\b|PLP/, "Петролеспорт"],
    [/\bПКТ\b|ПЕРВЫЙ (КОНТЕЙНЕРНЫЙ|КОНТЕЙН\.)/, "ПКТ"],
    [/УЛКТ|УСТЬ-?ЛУГ/, "УЛКТ"],
    [/ЯНИНО/, "Янино"],
    [/НЕВА-?МЕТАЛЛ/, "Нева-Металл"],
    [/ЛОГИСТИКА-?ТЕРМИНАЛ|ШУШАР/, "Логистика-Терминал"],
    [/ВРАНГЕЛЬ/, "Терминал Врангель"],
    [/МОБИ\s*ДИК|КРОНШТАДТ/, "МОБИ ДИК"],
    [/НК-?ДЕПО/, "НК-Депо"],
    [/\bНЛЭ\b/, "НЛЭ"]
  ];
  for (const [re, name] of rules) {
    if (re.test(blob)) return name;
  }
  // fallback: first address fragment
  const a = String(load || "").trim() || String(unload || "").trim();
  return a ? a.split(",")[0].trim() : "—";
}

function driverNameOnly(driverBlock) {
  let s = String(driverBlock || "").trim();
  if (!s) return "—";
  s = s.split(/\n/)[0];
  s = s.split(/,\s*(?:паспорт|дата рождения|место рождения|тел\.?|вод(?:ительское)?|зарегистрирован)/i)[0];
  s = s.replace(/,\s*$/, "").trim();
  return s || "—";
}

function parseTruckTractorTrailer(truckLine) {
  const raw = String(truckLine || "").trim();
  if (!raw) return { tractor: "—", trailer: "—" };
  const parts = raw.split(/\s*\/\s*/);
  let left = parts[0] || "";
  let right = parts.slice(1).join(" / ");
  const plateLike = /([А-ЯЁA-Z]\s*\d{3}\s*[А-ЯЁA-Z]{2}\s*\d{2,3}|[А-ЯЁA-Z]\d{3}[А-ЯЁA-Z]{2}\d{2,3}|\d{4}\s*[А-ЯЁA-Z]{2}\s*\d{2,3})/i;
  function pickPlate(chunk, wholeIfNone) {
    const m = String(chunk || "").match(plateLike);
    if (m) return m[1].replace(/\s+/g, " ").trim().toUpperCase();
    const cleaned = String(chunk || "")
      .replace(/^(марка|тягач|авто|полуприцеп|п\/п|прицеп)[:\s,]*/i, "")
      .replace(/гос\.?\s*номер[:\s]*/i, "")
      .trim();
    return cleaned || (wholeIfNone ? String(chunk || "").trim() : "—");
  }
  // Prefer plate extraction from left/right
  let tractor = pickPlate(left, true);
  let trailer = right ? pickPlate(right, true) : "—";
  // If left had brand+plate, pickPlate already got plate when possible
  if (/гос\.?\s*номер/i.test(left)) {
    const m = left.match(plateLike);
    if (m) tractor = m[1].replace(/\s+/g, " ").trim().toUpperCase();
  }
  if (/полуприцеп|п\/п|прицеп/i.test(right || "")) {
    const m = String(right).match(plateLike);
    if (m) trailer = m[1].replace(/\s+/g, " ").trim().toUpperCase();
  }
  return { tractor: tractor || "—", trailer: trailer || "—" };
}

function buildRolisRows() {
  ensureRolisStore();
  const rows = [];
  const list = (DB.zayavki || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id - a.id));
  for (const z of list) {
    const conts = extractContainerNumbers(z.cargo || "");
    const route = [z.loading_address || "", z.unloading_address || ""].filter(Boolean).join(" → ") || "—";
    const terminal = detectRolisTerminal(z.loading_address, z.unloading_address);
    const driver = driverNameOnly(z.driver);
    const truckParts = parseTruckTractorTrailer(z.truck);
    const base = {
      zayavkaId: z.id,
      zayavkaNumber: z.number || "",
      date: z.date || "",
      route,
      terminal,
      terminalFull: z.loading_address || z.unloading_address || "—",
      driver,
      truck: z.truck || "—",
      tractor: truckParts.tractor,
      trailer: truckParts.trailer,
      cargo: z.cargo || ""
    };
    if (conts.length) {
      for (const c of conts) {
        rows.push(Object.assign({}, base, {
          container: c,
          line: guessShippingLine(c, z.cargo)
        }));
      }
    } else {
      rows.push(Object.assign({}, base, {
        container: "",
        line: "—"
      }));
    }
  }
  return rows;
}

function getRolisManual(zayavkaId, container) {
  ensureRolisStore();
  const k = rolisKey(zayavkaId, container || ("zid:" + zayavkaId));
  return DB.rolis.byKey[k] || { status: "", note: "" };
}

function setRolisManual(zayavkaId, container, status, note) {
  ensureRolisStore();
  const k = rolisKey(zayavkaId, container || ("zid:" + zayavkaId));
  DB.rolis.byKey[k] = {
    status: String(status || "").trim(),
    note: String(note || "").trim(),
    updated_at: new Date().toISOString()
  };
  saveStore(DB);
}

/** Deterministic demo hash from container / key (not saved). */
function rolisDemoHash(str) {
  let h = 2166136261;
  const s = String(str || "EMPTY");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildRolisDemo(container, terminalHint) {
  const h = rolisDemoHash(container || "NOCONT");
  const status = ROLIS_DEMO_STATUSES[h % ROLIS_DEMO_STATUSES.length];
  const term = terminalHint && terminalHint !== "—"
    ? terminalHint
    : ROLIS_TERMINALS[(h >>> 3) % ROLIS_TERMINALS.length];
  // fake time today-ish from hash
  const mins = h % (24 * 60);
  const hh = String(Math.floor(mins / 60)).padStart(2, "0");
  const mm = String(mins % 60).padStart(2, "0");
  const dayOffset = h % 3;
  const d = new Date();
  d.setDate(d.getDate() - dayOffset);
  const dateStr = d.toISOString().slice(0, 10);
  const timeStr = dateStr + " " + hh + ":" + mm;
  const events = [
    { t: timeStr, text: "Контейнер зафиксирован на терминале «" + term + "»" },
    { t: timeStr, text: "Текущий статус: " + status }
  ];
  if (status === "досмотр назначен" || status === "выпуск разрешён") {
    events.push({ t: timeStr, text: "Таможенная операция (симуляция)" });
  }
  if (status === "визит оформлен" || status === "вывезен") {
    events.push({ t: timeStr, text: "Код визита (симуляция): V" + String(100000 + (h % 900000)) });
  }
  return { status, terminal: term, time: timeStr, events, demo: true };
}

function formatVisitClipboard(row) {
  const lines = [
    "Контейнер: " + (row.container || "—"),
    "Терминал: " + (row.terminalFull || row.terminal || "—"),
    "Тягач: " + (row.tractor || "—"),
    "Прицеп: " + (row.trailer || "—"),
    "Водитель: " + (row.driver || "—"),
    "Дата: " + (row.date || "—")
  ];
  return lines.join("\n");
}

async function copyTextRolis(text, okMsg) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    toast(okMsg || "Скопировано");
  } catch (e) {
    toast("Не удалось скопировать");
  }
}


function rolisDemoEnabled() {
  if (window.__rolisDemoOn == null) window.__rolisDemoOn = true;
  return !!window.__rolisDemoOn;
}
function clampStage(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return 0;
  if (x >= ROLIS_LIFE_STAGES.length - 1) return ROLIS_LIFE_STAGES.length - 1;
  return Math.round(x);
}
function rolisStageIndex(value) {
  if (typeof value === "number" && Number.isFinite(value)) return clampStage(value);
  const s = String(value == null ? "" : value).trim().toLowerCase().replace(/ё/g, "е");
  const aliases = {
    "0": 0, "port": 0, "в порту": 0,
    "1": 1, "pickup": 1, "вывоз": 1,
    "2": 2, "handling": 2, "обработка": 2,
    "3": 3, "return": 3, "возврат": 3, "возврат порожнего": 3,
    "4": 4, "closed": 4, "закрыт": 4
  };
  if (Object.prototype.hasOwnProperty.call(aliases, s)) return aliases[s];
  return -1;
}
function newLifeId() {
  return "lc" + Date.now().toString(36) + Math.floor(Math.random() * 1000000).toString(36);
}
function rolisNormCont(s) {
  return String(s || "").toUpperCase().replace(/\s+/g, "").slice(0, 16);
}
function toIsoDate(v) {
  const s = String(v || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return m[3] + "-" + m[2] + "-" + m[1];
  return "";
}
function parseIsoDateLocal(s) {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) return null;
  return d;
}
function parseNonNegInt(s) {
  const t = String(s == null ? "" : s).trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return { ok: true, value: "" };
  if (!/^\d+(\.0+)?$/.test(t)) return { ok: false, value: "" };
  return { ok: true, value: Math.round(Number(t)) };
}
function parseCostInput(s) {
  const t = String(s == null ? "" : s).replace(/₽/g, "").replace(/\s/g, "").replace(",", ".").trim();
  if (!t) return { ok: true, value: "" };
  if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false, value: "" };
  const n = Math.round(Number(t));
  if (!Number.isFinite(n) || n < 0) return { ok: false, value: "" };
  return { ok: true, value: n };
}
function formatRubles(n) {
  if (n == null || n === "") return "—";
  const v = Number(String(n).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(v)) return "—";
  const sign = v < 0 ? "−" : "";
  const body = String(Math.abs(Math.round(v))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return sign + body + " ₽";
}
function formatKg(v) {
  const t = String(v == null ? "" : v).trim();
  if (!t) return "";
  const n = Number(t.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return t;
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " кг";
}
function ruDays(n) {
  const a = Math.abs(Math.round(Number(n) || 0));
  const m10 = a % 10, m100 = a % 100;
  let w = "дней";
  if (m100 < 11 || m100 > 14) {
    if (m10 === 1) w = "день";
    else if (m10 >= 2 && m10 <= 4) w = "дня";
  }
  return a + " " + w;
}
function dueText(label, days) {
  if (days > 0) return label + ": осталось " + ruDays(days);
  if (days === 0) return label + ": последний день";
  return label + ": просрочено " + ruDays(days);
}
function guessContTypeFromText(text) {
  const s = String(text || "").toLowerCase().replace(/ё/g, "е");
  if (/реф|reefer|\brf\b|40\s*rh|40rh/.test(s)) return "rf";
  if (/40\s*h\s*c|40hc|high\s*cube|хай\s*кьюб/.test(s)) return "40hc";
  if (/(^|[^0-9])40([^0-9]|$)|40['′]|40фт|40dc|40dv/.test(s)) return "40";
  if (/(^|[^0-9])20([^0-9]|$)|20['′]|20фт|20dc|20dv/.test(s)) return "20";
  return "";
}
function guessHsCode(text) {
  const s = String(text || "");
  const m = s.match(/ТН\s*ВЭД[^0-9]{0,16}(\d[\d\s]{3,18}\d)/i) || s.match(/\b(?:HS|ТНВЭД)\s*[:№\-]?\s*(\d{4,10})\b/i);
  if (!m) return "";
  return m[1].replace(/\s+/g, "").slice(0, 10);
}
function rolisContTypeLabel(id) {
  const t = ROLIS_CONT_TYPES.find(x => x.id === id);
  return t ? t.label : "";
}
function emptyLifeCard() {
  return {
    id: "", container: "", line: "", terminal: "", arrival_date: "", free_days: "",
    truck: "", driver: "", pickup_date: "", handling_type: "", warehouse: "", handling_date: "",
    return_terminal: "", return_deadline: "", return_date: "",
    stage: 0, stage_locked: false, assignee: "", cost: "",
    cargo: "", weight_kg: "", hs_code: "", cont_type: "",
    zayavka_id: null, created_at: "", updated_at: "", demo_anchor: ""
  };
}
function rolisCards() {
  return ensureRolisStore().cards.filter(c => c && typeof c === "object");
}
function findLifeCard(id) {
  const key = String(id || "");
  return rolisCards().find(c => String(c.id) === key) || null;
}
function currentLifeFilter() {
  const f = String(window.__rolisLifeFilter || "");
  return ROLIS_LIFE_STAGES.some(s => s.id === f) ? f : "";
}
function lifeField(v) {
  return v == null ? "" : String(v);
}
function rolisDemoElapsed(card) {
  const anchor = Date.parse((card && (card.demo_anchor || card.created_at)) || "") || Date.now();
  const nudge = (window.__rolisDemoNudge && card && window.__rolisDemoNudge[card.id]) || 0;
  return Date.now() + nudge - anchor;
}
function rolisDemoStageIndex(card) {
  const base = clampStage(card && card.stage);
  const elapsed = rolisDemoElapsed(card);
  if (!Number.isFinite(elapsed) || elapsed < 0) return base;
  return clampStage(base + Math.floor(elapsed / ROLIS_DEMO_STEP_MS));
}
function rolisCardView(card) {
  card = card || {};
  const saved = clampStage(card.stage);
  const locked = !!card.stage_locked;
  const demoOn = rolisDemoEnabled();
  let index = saved;
  let mode = locked ? "manual" : "saved";
  if (!locked && demoOn) {
    const svc = window.__rolisServiceStage && window.__rolisServiceStage[card.id];
    if (svc && svc.stage != null && svc.stage >= 0) {
      index = clampStage(svc.stage);
      mode = "service";
    } else {
      index = rolisDemoStageIndex(card);
      mode = "demo";
    }
  }
  const stage = ROLIS_LIFE_STAGES[index] || ROLIS_LIFE_STAGES[0];
  let eta = "";
  if (mode === "manual") eta = "Стадия зафиксирована вручную";
  else if (mode === "service") eta = "Стадия из веб-сервиса РОЛИС";
  else if (mode === "demo") {
    if (index >= ROLIS_LIFE_STAGES.length - 1) eta = "ДЕМО · стадия «Закрыт»";
    else {
      const elapsed = rolisDemoElapsed(card);
      const into = ((elapsed % ROLIS_DEMO_STEP_MS) + ROLIS_DEMO_STEP_MS) % ROLIS_DEMO_STEP_MS;
      const left = Math.max(1, Math.ceil((ROLIS_DEMO_STEP_MS - into) / 1000));
      eta = "ДЕМО · следующая стадия через " + left + " с";
    }
  } else if (!demoOn) eta = "Демо выключено — показана сохранённая стадия";
  return { index: index, mode: mode, title: stage.title, id: stage.id, eta: eta };
}
function lifeDeadlineInfo(card) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const out = [];
  const arrival = parseIsoDateLocal(card && card.arrival_date);
  if (arrival && card.free_days !== "" && card.free_days != null && Number.isFinite(Number(card.free_days))) {
    const end = new Date(arrival.getTime());
    end.setDate(end.getDate() + Number(card.free_days));
    out.push({ key: "storage", label: "Хранение", days: Math.round((end.getTime() - start.getTime()) / 86400000) });
  }
  const ret = parseIsoDateLocal(card && card.return_deadline);
  if (ret) {
    out.push({ key: "return", label: "Возврат", days: Math.round((ret.getTime() - start.getTime()) / 86400000) });
  }
  return out;
}
function lifeAlertClass(card, view) {
  if (!view || view.index === 4) return "";
  const dues = lifeDeadlineInfo(card);
  let soon = false;
  for (const d of dues) {
    if (d.days < 0) return "is-overdue";
    if (d.days <= 2) soon = true;
  }
  return soon ? "is-soon" : "";
}
function dueClass(days, muted) {
  if (muted) return "rolis-due is-muted";
  if (days < 0) return "rolis-due is-bad";
  if (days <= 2) return "rolis-due is-soon";
  return "rolis-due";
}
function lifeNowLine(card, view) {
  if (!view || view.index === 4) return "";
  if (view.index === 0) {
    return [card.terminal, card.arrival_date ? ("прибытие " + fmtDate(card.arrival_date)) : "", (card.free_days !== "" && card.free_days != null) ? ("свободно " + card.free_days + " дн.") : ""].filter(Boolean).join(" · ");
  }
  if (view.index === 1) {
    return [card.truck, card.driver, card.pickup_date ? fmtDate(card.pickup_date) : ""].filter(Boolean).join(" · ");
  }
  if (view.index === 2) {
    return [card.handling_type, card.warehouse, card.handling_date ? fmtDate(card.handling_date) : ""].filter(Boolean).join(" · ");
  }
  return [card.return_terminal, card.return_deadline ? ("срок " + fmtDate(card.return_deadline)) : "", card.return_date ? ("факт " + fmtDate(card.return_date)) : ""].filter(Boolean).join(" · ");
}
function lifeMatchesQuery(card, q) {
  const raw = String(q || "").trim();
  if (!raw) return true;
  const n = normName(raw);
  if (normName(card.cargo || "").indexOf(n) >= 0) return true;
  const cont = rolisNormCont(card.container).toLowerCase();
  const compact = n.replace(/\s+/g, "");
  return !!(compact && cont.indexOf(compact) >= 0);
}
function cardFromRolisRow(row) {
  const z = (DB.zayavki || []).find(x => x && x.id === row.zayavkaId) || {};
  const carrierName = (z.carrier && z.carrier.full_name) || "";
  const cargo = String(z.cargo || row.cargo || "").trim();
  const now = new Date().toISOString();
  const driver = row.driver && row.driver !== "—" ? row.driver : "";
  const truck = row.tractor && row.tractor !== "—" ? row.tractor : "";
  const terminal = row.terminal && row.terminal !== "—" ? row.terminal : "";
  const card = emptyLifeCard();
  card.container = rolisNormCont(row.container);
  card.line = row.line && row.line !== "—" ? row.line : "";
  card.terminal = terminal;
  card.arrival_date = toIsoDate(z.date || row.date);
  card.truck = truck;
  card.driver = driver;
  card.warehouse = String(z.unloading_address || "").trim();
  card.return_terminal = terminal;
  card.assignee = carrierName || driver;
  card.cargo = cargo;
  card.weight_kg = String(z.weight_kg == null ? "" : z.weight_kg).trim();
  card.hs_code = guessHsCode(cargo);
  card.cont_type = guessContTypeFromText(cargo);
  card.zayavka_id = row.zayavkaId != null ? row.zayavkaId : null;
  card.created_at = now;
  card.updated_at = now;
  card.demo_anchor = now;
  return card;
}
function renderLifeSteps(current) {
  return ROLIS_LIFE_STAGES.map((s, i) => {
    const cls = i < current ? "is-done" : (i === current ? "is-current" : "");
    const aria = i === current ? ` aria-current="step"` : "";
    return `<li class="${cls}"${aria}>${esc(s.title)}</li>`;
  }).join("");
}
function renderLifeCard(card) {
  const view = rolisCardView(card);
  const alert = lifeAlertClass(card, view);
  const closed = view.index === 4;
  const dues = lifeDeadlineInfo(card);
  let dueHtml = "";
  if (!dues.length) {
    dueHtml = `<span class="rolis-due is-muted">Сроки сверхнорматива не заданы</span>`;
  } else {
    for (const d of dues) {
      const tip = d.key === "storage"
        ? "Сверхнорматив хранения: дата прибытия плюс свободные дни"
        : "Сверхнорматив возврата порожнего: срок возврата";
      dueHtml += `<span class="${dueClass(d.days, closed)}" title="${esc(tip)}">${esc(dueText(d.label, d.days))}</span> `;
    }
  }
  const typeLabel = rolisContTypeLabel(card.cont_type);
  const cargo = String(card.cargo || "").trim();
  const weight = formatKg(card.weight_kg);
  const hs = String(card.hs_code || "").trim();
  const bits = [];
  if (weight) bits.push(weight);
  if (hs) bits.push("ТН ВЭД " + hs);
  const tag = view.mode === "demo"
    ? `<span class="rolis-demo-tag">ДЕМО</span>`
    : (view.mode === "manual" ? `<span class="rolis-chip">вручную</span>` : (view.mode === "service" ? `<span class="rolis-chip">РОЛИС</span>` : ""));
  const resume = (view.mode === "manual" && rolisDemoEnabled())
    ? `<button type="button" class="btn small ghost" data-life-act="demo" data-life-id="${esc(card.id)}">Снова демо</button>`
    : "";
  const nowLine = lifeNowLine(card, view);
  return `<article class="rolis-life-card ${alert}" data-life-id="${esc(card.id)}" data-stage-now="${view.index}" data-stage-mode="${esc(view.mode)}">
    <div class="rolis-life-head">
      <div class="rolis-life-title"><span class="mono">${card.container ? esc(card.container) : "без номера"}</span>${typeLabel ? ` <span class="rolis-chip">${esc(typeLabel)}</span>` : ""} ${tag}</div>
      <div class="rolis-muted">${card.line ? esc(card.line) : ""}</div>
    </div>
    <div class="rolis-life-cargo"><strong>Груз:</strong> ${cargo ? `<span class="rolis-cargo-name">${esc(cargo)}</span>` : `<span class="rolis-muted">не указан</span>`}</div>
    ${bits.length ? `<div class="rolis-sub">${esc(bits.join(" · "))}</div>` : ""}
    <ol class="rolis-steps">${renderLifeSteps(view.index)}</ol>
    <div class="rolis-life-meta">
      <span>Везёт: <strong>${card.assignee ? esc(card.assignee) : "не указано"}</strong></span>
      <span>Стоимость: <strong>${esc(formatRubles(card.cost))}</strong></span>
    </div>
    <div class="rolis-life-dues">${dueHtml}</div>
    <div class="rolis-sub">Сейчас: ${esc(view.title)}${nowLine ? " · " + esc(nowLine) : ""}</div>
    <div class="rolis-sub" data-life-eta>${esc(view.eta)}</div>
    <div class="rolis-life-actions">
      <button type="button" class="btn small" data-life-act="edit" data-life-id="${esc(card.id)}">Изменить</button>
      <button type="button" class="btn small secondary" data-life-act="prev" data-life-id="${esc(card.id)}" ${view.index === 0 ? "disabled" : ""}>Назад</button>
      <button type="button" class="btn small" data-life-act="next" data-life-id="${esc(card.id)}" ${view.index === 4 ? "disabled" : ""}>Дальше</button>
      ${resume}
      <button type="button" class="btn small ghost" data-life-act="del" data-life-id="${esc(card.id)}" style="color:#b91c1c!important">Удалить</button>
    </div>
  </article>`;
}
function renderRolisLifeCards() {
  const q = window.__rolisLifeQ || "";
  const filter = currentLifeFilter();
  const all = rolisCards().filter(c => c.id).slice().sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));
  if (!all.length) return `<p class="rolis-muted">Нет карточек. Создайте новую или заполните из заявки.</p>`;
  const shown = all.filter(c => lifeMatchesQuery(c, q) && (!filter || rolisCardView(c).id === filter));
  if (!shown.length) return `<p class="rolis-muted">Ничего не найдено. Смените стадию или поиск.</p>`;
  return shown.map(renderLifeCard).join("");
}
function lifeSelectOptions(list, current, placeholder) {
  let html = `<option value="">${esc(placeholder || "—")}</option>`;
  const cur = String(current || "");
  let seen = !cur;
  for (const item of list) {
    const id = typeof item === "string" ? item : item.id;
    const label = typeof item === "string" ? item : item.label;
    if (id === cur) seen = true;
    html += `<option value="${esc(id)}" ${id === cur ? "selected" : ""}>${esc(label)}</option>`;
  }
  if (cur && !seen) html += `<option value="${esc(cur)}" selected>${esc(cur)}</option>`;
  return html;
}
function renderLifePrefillOptions() {
  const rows = buildRolisRows();
  let html = `<option value="">— контейнер из заявки —</option>`;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const cargo = String(r.cargo || "").replace(/\s+/g, " ").trim();
    const short = cargo.length > 42 ? cargo.slice(0, 42) + "…" : cargo;
    const label = (r.container || "без номера") + (short ? " · " + short : "") + (r.zayavkaNumber ? " · заявка " + r.zayavkaNumber : "");
    html += `<option value="${i}">${esc(label)}</option>`;
  }
  return html;
}
function renderLifeForm() {
  const mode = window.__rolisLifeEdit;
  if (!mode) return "";
  const src = Object.assign(emptyLifeCard(), window.__rolisLifeDraft || {});
  const isNew = mode === "new" || !src.id;
  const stageOpts = ROLIS_LIFE_STAGES.map((s, i) => `<option value="${i}" ${Number(src.stage) === i ? "selected" : ""}>${esc(s.title)}</option>`).join("");
  return `<div class="rolis-life-form" id="rolis-life-form">
    <h3>${isNew ? "Новая карточка" : "Изменить карточку"}</h3>
    <input type="hidden" id="rolis-f-id" value="${esc(src.id)}">
    <input type="hidden" id="rolis-f-zayavka" value="${src.zayavka_id == null ? "" : esc(src.zayavka_id)}">
    <h3>Груз</h3>
    <div class="row">
      <div class="field wide"><label for="rolis-f-cargo">Груз</label><textarea id="rolis-f-cargo" placeholder="Наименование, описание">${esc(src.cargo)}</textarea></div>
    </div>
    <div class="row">
      <div class="field"><label for="rolis-f-weight">Вес, кг</label><input id="rolis-f-weight" inputmode="decimal" value="${esc(lifeField(src.weight_kg))}" placeholder="18000"></div>
      <div class="field"><label for="rolis-f-hs">Код ТН ВЭД</label><input id="rolis-f-hs" value="${esc(src.hs_code)}" placeholder="необязательно"></div>
      <div class="field"><label for="rolis-f-type">Тип контейнера</label><select id="rolis-f-type">${lifeSelectOptions(ROLIS_CONT_TYPES, src.cont_type, "—")}</select></div>
    </div>
    <h3>1. В порту</h3>
    <div class="row">
      <div class="field"><label for="rolis-f-container">Номер контейнера</label><input id="rolis-f-container" class="mono" value="${esc(src.container)}" placeholder="MSKU1234567" autocapitalize="characters"></div>
      <div class="field"><label for="rolis-f-line">Линия</label><input id="rolis-f-line" value="${esc(src.line)}" placeholder="Maersk"></div>
      <div class="field"><label for="rolis-f-terminal">Терминал / порт</label><input id="rolis-f-terminal" value="${esc(src.terminal)}" placeholder="ПКТ"></div>
    </div>
    <div class="row">
      <div class="field"><label for="rolis-f-arrival">Дата прибытия</label><input type="date" id="rolis-f-arrival" value="${esc(toIsoDate(src.arrival_date))}"></div>
      <div class="field"><label for="rolis-f-free">Свободные дни</label><input id="rolis-f-free" inputmode="numeric" value="${esc(lifeField(src.free_days))}" placeholder="5"></div>
    </div>
    <h3>2. Вывоз</h3>
    <div class="row">
      <div class="field"><label for="rolis-f-truck">Машина, госномер</label><input id="rolis-f-truck" value="${esc(src.truck)}" placeholder="А123ВС178"></div>
      <div class="field"><label for="rolis-f-driver">Водитель</label><input id="rolis-f-driver" value="${esc(src.driver)}"></div>
      <div class="field"><label for="rolis-f-pickup">Дата вывоза</label><input type="date" id="rolis-f-pickup" value="${esc(toIsoDate(src.pickup_date))}"></div>
    </div>
    <h3>3. Обработка</h3>
    <div class="row">
      <div class="field"><label for="rolis-f-handling">Тип</label><select id="rolis-f-handling">${lifeSelectOptions(ROLIS_HANDLING_TYPES, src.handling_type, "—")}</select></div>
      <div class="field wide"><label for="rolis-f-warehouse">Адрес склада</label><input id="rolis-f-warehouse" value="${esc(src.warehouse)}"></div>
      <div class="field"><label for="rolis-f-hdate">Дата</label><input type="date" id="rolis-f-hdate" value="${esc(toIsoDate(src.handling_date))}"></div>
    </div>
    <h3>4. Возврат порожнего</h3>
    <div class="row">
      <div class="field"><label for="rolis-f-rterm">Терминал возврата</label><input id="rolis-f-rterm" value="${esc(src.return_terminal)}"></div>
      <div class="field"><label for="rolis-f-rdead">Срок возврата</label><input type="date" id="rolis-f-rdead" value="${esc(toIsoDate(src.return_deadline))}"></div>
      <div class="field"><label for="rolis-f-rdate">Фактическая дата</label><input type="date" id="rolis-f-rdate" value="${esc(toIsoDate(src.return_date))}"></div>
    </div>
    <h3>Стадия, кто везёт, стоимость</h3>
    <div class="row">
      <div class="field"><label for="rolis-f-stage">Стадия</label><select id="rolis-f-stage">${stageOpts}</select></div>
      <div class="field"><label for="rolis-f-assignee">Кто везёт</label><input id="rolis-f-assignee" value="${esc(src.assignee)}"></div>
      <div class="field"><label for="rolis-f-cost">Стоимость, ₽</label><input id="rolis-f-cost" inputmode="numeric" value="${esc(lifeField(src.cost))}" placeholder="125000"></div>
      <div class="field check"><input type="checkbox" id="rolis-f-lock" ${src.stage_locked ? "checked" : ""}><label for="rolis-f-lock">Зафиксировать стадию вручную</label></div>
    </div>
    <p class="note">Сумма полными рублями, можно с пробелами: 125 000. Демо само не переписывает зафиксированную стадию.</p>
    <div class="toolbar">
      <button type="button" class="btn" data-life-act="save">Сохранить</button>
      <button type="button" class="btn ghost" data-life-act="cancel">Отмена</button>
      ${src.id ? `<button type="button" class="btn ghost" data-life-act="del" data-life-id="${esc(src.id)}" style="color:#b91c1c!important">Удалить</button>` : ""}
    </div>
  </div>`;
}
function renderRolisLifeSection() {
  const demoOn = rolisDemoEnabled();
  const filter = currentLifeFilter();
  const q = window.__rolisLifeQ || "";
  const filterOpts = `<option value="">Все стадии</option>` + ROLIS_LIFE_STAGES.map(s =>
    `<option value="${s.id}" ${filter === s.id ? "selected" : ""}>${esc(s.title)}</option>`).join("");
  const banner = demoOn
    ? `<div class="rolis-demo-banner">ДЕМО · стадии сменяются сами, примерно каждые 30 секунд. «Дальше» и «Назад» фиксируют карточку.</div>`
    : `<div class="rolis-demo-banner">Демо выключено. Показана сохранённая стадия, без автосмены.</div>`;
  return `<div class="card" id="rolis-life">
    <h2>Карточка контейнера</h2>
    <p class="note">Учёт по системе РОЛИС: порт, вывоз, обработка, возврат порожнего. Карточки в том же общем хранилище, что и ручной статус. Старые статусы и заметки не меняются. Пока стадия не зафиксирована, демо её не записывает.</p>
    ${banner}
    <div class="toolbar">
      <button type="button" class="btn" data-life-act="new">Новая карточка</button>
      <div class="field" style="min-width:220px;flex:1.4;margin:0">
        <label for="rolis-life-prefill">Из заявки</label>
        <select id="rolis-life-prefill">${renderLifePrefillOptions()}</select>
      </div>
      <button type="button" class="btn secondary" data-life-act="from-z">Заполнить из заявки</button>
    </div>
    <div class="row">
      <div class="field wide"><label for="rolis-life-q">Поиск</label>
        <input id="rolis-life-q" type="search" value="${esc(q)}" placeholder="Номер контейнера или груз" autocomplete="off"></div>
      <div class="field" style="max-width:240px"><label for="rolis-life-filter">Стадия</label>
        <select id="rolis-life-filter">${filterOpts}</select></div>
    </div>
    ${renderLifeForm()}
    <div id="rolis-life-list">${renderRolisLifeCards()}</div>
  </div>`;
}
function readRolisLifeForm() {
  const g = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : "";
  };
  const lock = document.getElementById("rolis-f-lock");
  const zid = g("rolis-f-zayavka");
  return {
    id: g("rolis-f-id"),
    container: g("rolis-f-container"),
    line: g("rolis-f-line"),
    terminal: g("rolis-f-terminal"),
    arrival_date: g("rolis-f-arrival"),
    free_days: g("rolis-f-free"),
    truck: g("rolis-f-truck"),
    driver: g("rolis-f-driver"),
    pickup_date: g("rolis-f-pickup"),
    handling_type: g("rolis-f-handling"),
    warehouse: g("rolis-f-warehouse"),
    handling_date: g("rolis-f-hdate"),
    return_terminal: g("rolis-f-rterm"),
    return_deadline: g("rolis-f-rdead"),
    return_date: g("rolis-f-rdate"),
    stage: g("rolis-f-stage"),
    stage_locked: !!(lock && lock.checked),
    assignee: g("rolis-f-assignee"),
    cost: g("rolis-f-cost"),
    cargo: g("rolis-f-cargo"),
    weight_kg: g("rolis-f-weight"),
    hs_code: g("rolis-f-hs"),
    cont_type: g("rolis-f-type"),
    zayavka_id: zid === "" ? null : zid
  };
}
function captureRolisLifeUi() {
  const q = document.getElementById("rolis-life-q");
  if (q) window.__rolisLifeQ = q.value || "";
  const f = document.getElementById("rolis-life-filter");
  if (f) window.__rolisLifeFilter = f.value || "";
  if (document.getElementById("rolis-f-container")) window.__rolisLifeDraft = readRolisLifeForm();
}
function upsertRolisLifeCard(data) {
  data = data || {};
  const cost = parseCostInput(data.cost);
  if (!cost.ok) { toast("Стоимость — число в рублях, например 125000"); return null; }
  const free = parseNonNegInt(data.free_days);
  if (!free.ok) { toast("Свободные дни — целое число от 0"); return null; }
  const container = rolisNormCont(data.container);
  const cargo = String(data.cargo || "").trim();
  if (!container && !cargo) { toast("Укажите номер контейнера или груз"); return null; }
  const store = ensureRolisStore();
  const now = new Date().toISOString();
  let card = data.id ? store.cards.find(c => c && String(c.id) === String(data.id)) : null;
  if (!card) {
    card = emptyLifeCard();
    card.id = newLifeId();
    card.created_at = now;
    store.cards.unshift(card);
  }
  card.container = container;
  card.line = String(data.line || "").trim();
  card.terminal = String(data.terminal || "").trim();
  card.arrival_date = toIsoDate(data.arrival_date);
  card.free_days = free.value;
  card.truck = String(data.truck || "").trim();
  card.driver = String(data.driver || "").trim();
  card.pickup_date = toIsoDate(data.pickup_date);
  const handling = String(data.handling_type || "").trim();
  if (!handling || ROLIS_HANDLING_TYPES.indexOf(handling) >= 0 || handling === card.handling_type) card.handling_type = handling;
  card.warehouse = String(data.warehouse || "").trim();
  card.handling_date = toIsoDate(data.handling_date);
  card.return_terminal = String(data.return_terminal || "").trim();
  card.return_deadline = toIsoDate(data.return_deadline);
  card.return_date = toIsoDate(data.return_date);
  card.stage = clampStage(data.stage);
  card.stage_locked = !!data.stage_locked;
  card.assignee = String(data.assignee || "").trim();
  card.cost = cost.value;
  card.cargo = cargo;
  card.weight_kg = String(data.weight_kg || "").trim();
  card.hs_code = String(data.hs_code || "").trim().slice(0, 32);
  card.cont_type = ROLIS_CONT_TYPES.some(t => t.id === data.cont_type) ? data.cont_type : "";
  if (data.zayavka_id != null && data.zayavka_id !== "") card.zayavka_id = data.zayavka_id;
  card.updated_at = now;
  if (!card.stage_locked) {
    card.demo_anchor = now;
    if (window.__rolisDemoNudge) delete window.__rolisDemoNudge[card.id];
  } else if (!card.demo_anchor) {
    card.demo_anchor = card.created_at || now;
  }
  saveStore(DB);
  return card;
}
function moveRolisLifeStage(id, dir) {
  const card = findLifeCard(id);
  if (!card) return null;
  const view = rolisCardView(card);
  const next = clampStage(view.index + dir);
  if (next === view.index) return card;
  card.stage = next;
  card.stage_locked = true;
  card.updated_at = new Date().toISOString();
  saveStore(DB);
  return card;
}
function resumeRolisLifeDemo(id) {
  const card = findLifeCard(id);
  if (!card) return null;
  const view = rolisCardView(card);
  card.stage = view.index;
  card.stage_locked = false;
  card.demo_anchor = new Date().toISOString();
  card.updated_at = card.demo_anchor;
  if (window.__rolisDemoNudge) delete window.__rolisDemoNudge[card.id];
  saveStore(DB);
  return card;
}
function deleteRolisLifeCard(id) {
  if (typeof confirm === "function" && !confirm("Удалить карточку контейнера?")) return;
  const store = ensureRolisStore();
  store.cards = store.cards.filter(c => !c || String(c.id) !== String(id));
  saveStore(DB);
  if (String(window.__rolisLifeEdit || "") === String(id)) {
    window.__rolisLifeEdit = null;
    window.__rolisLifeDraft = null;
  }
  window.__rolisLifeAnchor = "card";
  showTab("rolis");
  toast("Карточка удалена");
}
function scrollRolisLife() {
  const mode = window.__rolisLifeAnchor || "";
  window.__rolisLifeAnchor = "";
  if (!mode) return;
  const el = mode === "form"
    ? (document.getElementById("rolis-life-form") || document.getElementById("rolis-life"))
    : (document.querySelector(".rolis-life-card") || document.getElementById("rolis-life"));
  if (el && el.scrollIntoView) {
    try { el.scrollIntoView({ block: "start" }); } catch (e) {}
  }
}
function beginLifeEdit(card) {
  if (!card) return;
  const view = rolisCardView(card);
  const draft = Object.assign({}, card);
  if (!card.stage_locked && (view.mode === "demo" || view.mode === "service")) draft.stage = view.index;
  window.__rolisLifeEdit = card.id;
  window.__rolisLifeDraft = draft;
  window.__rolisLifeAnchor = "form";
  showTab("rolis");
}
function createLifeFromRow(row) {
  if (!row) return;
  const cont = rolisNormCont(row.container);
  const existing = rolisCards().find(c => String(c.zayavka_id) === String(row.zayavkaId) && rolisNormCont(c.container) === cont);
  if (existing) {
    beginLifeEdit(existing);
    toast("Карточка этого контейнера уже есть");
    return;
  }
  const card = cardFromRolisRow(row);
  if (!card.container && !String(card.cargo || "").trim()) {
    window.__rolisLifeEdit = "new";
    window.__rolisLifeDraft = card;
    showTab("rolis");
    toast("В заявке нет номера и груза — заполните карточку");
    return;
  }
  card.id = newLifeId();
  ensureRolisStore().cards.unshift(card);
  saveStore(DB);
  beginLifeEdit(card);
  toast("Карточка создана из заявки");
}
function createLifeFromSelect() {
  const sel = document.getElementById("rolis-life-prefill");
  if (!sel || sel.value === "") { toast("Выберите контейнер из заявки"); return; }
  const idx = Number(sel.value);
  const row = buildRolisRows()[idx];
  if (!row) { toast("Заявка не найдена"); return; }
  createLifeFromRow(row);
}
function nudgeRolisDemoStages() {
  if (!window.__rolisDemoNudge) window.__rolisDemoNudge = {};
  for (const card of rolisCards()) {
    if (card.stage_locked) continue;
    const view = rolisCardView(card);
    if (view.mode !== "demo" || view.index >= ROLIS_LIFE_STAGES.length - 1) continue;
    window.__rolisDemoNudge[card.id] = (window.__rolisDemoNudge[card.id] || 0) + ROLIS_DEMO_STEP_MS;
  }
}
/**
 * Хук официального веб-сервиса РОЛИС (SOAP).
 * Сейчас сеть не вызывается и страницы портала не читаются.
 * Позже по номеру контейнера верните стадию, например
 *   { connected: true, stage: "port" | "pickup" | "handling" | "return" | "closed" }
 * Если карточку не зафиксировали вручную, эта стадия появится на ней вместо демо.
 * Не заменяйте тело разбором сайта РОЛИС.
 */
async function rolisFetchStatus(containerNumber, card) {
  return {
    connected: false,
    source: "unconfigured",
    container: String(containerNumber || "")
  };
}
window.rolisFetchStatus = rolisFetchStatus;
async function rolisPullServiceStages() {
  const fn = window.rolisFetchStatus;
  if (typeof fn !== "function") return false;
  if (!window.__rolisServiceStage) window.__rolisServiceStage = {};
  let changed = false;
  for (const card of rolisCards()) {
    if (!card.id || card.stage_locked) continue;
    let res = null;
    try { res = await fn(card.container, card); } catch (e) { res = null; }
    if (res && res.connected && res.stage != null && res.stage !== "") {
      const idx = rolisStageIndex(res.stage);
      if (idx >= 0) {
        const prev = window.__rolisServiceStage[card.id];
        window.__rolisServiceStage[card.id] = { stage: idx, source: "rolis" };
        if (!prev || prev.stage !== idx) changed = true;
        continue;
      }
    }
    if (window.__rolisServiceStage[card.id]) {
      delete window.__rolisServiceStage[card.id];
      changed = true;
    }
  }
  return changed;
}
function rolisLifeTick() {
  if (currentTab !== "rolis" || !rolisDemoEnabled()) return;
  const root = document.getElementById("rolis-life-list");
  if (!root || !root.querySelectorAll) return;
  const filter = currentLifeFilter();
  const q = (document.getElementById("rolis-life-q") || {}).value;
  if (q != null && document.getElementById("rolis-life-q")) window.__rolisLifeQ = q;
  const want = rolisCards().filter(c => c.id && lifeMatchesQuery(c, window.__rolisLifeQ || "") && (!filter || rolisCardView(c).id === filter));
  const shown = root.querySelectorAll("[data-life-id]");
  let structural = shown.length !== want.length;
  if (!structural) {
    for (const card of want) {
      const el = root.querySelector('[data-life-id="' + String(card.id).replace(/[^a-z0-9]/gi, "") + '"]');
      if (!el) { structural = true; break; }
      const view = rolisCardView(card);
      if (el.getAttribute("data-stage-now") !== String(view.index) || el.getAttribute("data-stage-mode") !== view.mode) {
        structural = true;
        break;
      }
      const eta = el.querySelector("[data-life-eta]");
      if (eta) eta.textContent = view.eta;
    }
  }
  if (structural) root.innerHTML = renderRolisLifeCards();
}
function onRolisLifeClick(e) {
  const t = e.target && e.target.closest ? e.target.closest("[data-life-act]") : null;
  if (!t || t.disabled) return;
  const act = t.getAttribute("data-life-act");
  const id = t.getAttribute("data-life-id") || "";
  if (act === "new") {
    window.__rolisLifeEdit = "new";
    window.__rolisLifeDraft = emptyLifeCard();
    window.__rolisLifeAnchor = "form";
    showTab("rolis");
    return;
  }
  if (act === "from-z") { createLifeFromSelect(); return; }
  if (act === "cancel") {
    window.__rolisLifeEdit = null;
    window.__rolisLifeDraft = null;
    window.__rolisLifeAnchor = "card";
    showTab("rolis");
    return;
  }
  if (act === "save") {
    const card = upsertRolisLifeCard(readRolisLifeForm());
    if (!card) return;
    window.__rolisLifeEdit = card.id;
    window.__rolisLifeDraft = Object.assign({}, card);
    window.__rolisLifeAnchor = "form";
    showTab("rolis");
    toast("Карточка сохранена");
    return;
  }
  if (act === "edit") {
    const card = findLifeCard(id);
    if (card) beginLifeEdit(card);
    return;
  }
  if (act === "prev" || act === "next") {
    moveRolisLifeStage(id, act === "next" ? 1 : -1);
    if (document.getElementById("rolis-f-container")) captureRolisLifeUi();
    window.__rolisLifeAnchor = "card";
    showTab("rolis");
    toast("Стадия зафиксирована");
    return;
  }
  if (act === "demo") {
    resumeRolisLifeDemo(id);
    if (document.getElementById("rolis-f-container")) captureRolisLifeUi();
    window.__rolisLifeAnchor = "card";
    showTab("rolis");
    toast("Снова демо: стадия пойдёт сама");
    return;
  }
  if (act === "del") deleteRolisLifeCard(id);
}
function bindRolisLife() {
  const root = document.getElementById("rolis-life");
  if (!root || root.__lifeBound) return;
  root.__lifeBound = true;
  root.addEventListener("click", onRolisLifeClick);
  const q = document.getElementById("rolis-life-q");
  if (q) q.addEventListener("input", () => {
    window.__rolisLifeQ = q.value || "";
    const list = document.getElementById("rolis-life-list");
    if (list) list.innerHTML = renderRolisLifeCards();
  });
  const filter = document.getElementById("rolis-life-filter");
  if (filter) filter.addEventListener("change", () => {
    window.__rolisLifeFilter = filter.value || "";
    const list = document.getElementById("rolis-life-list");
    if (list) list.innerHTML = renderRolisLifeCards();
  });
  if (window.__rolisLifeTimer) clearInterval(window.__rolisLifeTimer);
  window.__rolisLifeTimer = setInterval(rolisLifeTick, 1000);
  rolisPullServiceStages().then(changed => {
    if (!changed || currentTab !== "rolis") return;
    const list = document.getElementById("rolis-life-list");
    if (!list) return;
    list.innerHTML = renderRolisLifeCards();
  }).catch(() => {});
}


function renderRolis() {
  ensureRolisStore();
  const rows = buildRolisRows();
  if (window.__rolisDemoOn == null) window.__rolisDemoOn = true;
  const demoOn = !!window.__rolisDemoOn;
  const suggestOpts = ROLIS_STATUS_SUGGESTIONS.map(s => `<option value="${esc(s)}">`).join("");

  let tableBody = "";
  if (!rows.length) {
    tableBody = `<tr><td colspan="9" class="rolis-muted">Нет заявок — добавьте заявку во вкладке «Заявки», и контейнеры появятся здесь.</td></tr>`;
  } else {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const man = getRolisManual(r.zayavkaId, r.container);
      const hasCont = !!r.container;
      const demo = demoOn ? buildRolisDemo(r.container || ("zid:" + r.zayavkaId), r.terminal) : null;
      let demoCell = `<span class="rolis-muted">—</span>`;
      if (demo) {
        const log = demo.events.map(ev => `<li>${esc(ev.t)} — ${esc(ev.text)}</li>`).join("");
        demoCell = `<div class="rolis-demo-cell">
          <div class="rolis-demo-status">${esc(demo.status)} <span class="rolis-demo-tag">демо</span></div>
          <div class="rolis-demo-meta">${esc(demo.terminal)} · ${esc(demo.time)}</div>
          <details class="rolis-demo-details"><summary>События</summary><ul class="rolis-demo-log">${log}</ul></details>
        </div>`;
      }
      tableBody += `<tr data-rolis-idx="${i}">
        <td class="mono">${hasCont ? esc(r.container) : '<span class="rolis-muted">нет №</span>'}</td>
        <td>${esc(r.line)}</td>
        <td><div class="rolis-clip">${esc(r.terminal)}</div><span class="rolis-sub">${esc(r.terminalFull)}</span></td>
        <td><div class="rolis-clip">${esc(r.route)}</div></td>
        <td>${esc(r.driver)}<span class="rolis-sub mono">${esc(r.truck)}</span></td>
        <td>${esc(fmtDate(r.date))}</td>
        <td class="rolis-status-cell">
          <input list="rolis-status-list" class="rolis-status-input" data-zid="${r.zayavkaId}" data-cont="${esc(r.container)}" value="${esc(man.status)}" placeholder="Статус, напр. визит оформлен" title="Статус в РОЛИС">
          <textarea class="rolis-note-input" data-zid="${r.zayavkaId}" data-cont="${esc(r.container)}" placeholder="Заметка" title="Заметка">${esc(man.note)}</textarea>
        </td>
        <td>${demoCell}</td>
        <td class="rolis-actions">
          <button type="button" class="btn small" data-rolis-copy-num="${i}" ${hasCont ? "" : "disabled"}>Копировать №</button>
          <button type="button" class="btn small secondary" data-rolis-copy-visit="${i}">Для визита</button>
          <button type="button" class="btn small" data-rolis-life="${i}">Карточка</button>
        </td>
      </tr>`;
    }
  }

  return `<h1>РОЛИС</h1>
  <div class="card rolis-hero">
    <div class="rolis-hero-main">
      <div class="toolbar">
        <a class="btn" href="${ROLIS_LOGIN_URL}" target="_blank" rel="noopener noreferrer">Открыть РОЛИС</a>
        <a class="btn ghost" href="${ROLIS_SERVICE_URL}" target="_blank" rel="noopener noreferrer">Услуги РОЛИС</a>
      </div>
      <p class="note" style="margin:0;max-width:40rem">Вход на портал ДелоТех / КОНТЕРРА (rlisystems.ru). Встраивание недоступно; работайте вручную в окне РОЛИС.</p>
    </div>
    <div class="rolis-links">
      <div>Поддержка: <a href="mailto:office@rlisystems.ru">office@rlisystems.ru</a></div>
      <div>Тел.: <a href="tel:+78123357733">+7 (812) 335-77-33</a></div>
      <div class="rolis-muted">Терминалы: ПКТ, Петролеспорт, УЛКТ, НУТЭП, Янино и др.</div>
    </div>
  </div>

  ${renderRolisLifeSection()}

  <div class="card">
    <h2>Мои контейнеры</h2>
    <p class="note">Из заявок Магистрали. Паспортные данные не копируются. «Статус в РОЛИС» общий для сотрудников (облако). Демо-столбец локальный и не сохраняется.</p>
    <datalist id="rolis-status-list">${suggestOpts}</datalist>
    <div class="rolis-table-wrap">
      <table class="rolis-table">
        <thead><tr>
          <th>№ контейнера</th><th>Линия</th><th>Терминал / порт</th><th>Маршрут</th>
          <th>Водитель и авто</th><th>Дата</th><th>Статус в РОЛИС</th>
          <th>Демо-статус</th><th>Действия</th>
        </tr></thead>
        <tbody>${tableBody}</tbody>
      </table>
    </div>
  </div>

  <div class="card rolis-guide">
    <h2>Как оформить вывоз в РОЛИС</h2>
    <p class="note">По материалам <a href="https://www.rlisystems.ru/service/" target="_blank" rel="noopener noreferrer">rlisystems.ru/service</a>. Уточняйте порядок в кабинете РОЛИС.</p>
    <ol>
      <li><strong>Вход.</strong> Откройте портал и войдите как экспедитор (договор с ДелоТех / КОНТЕРРА).</li>
      <li><strong>Визиты.</strong> Оформите автомобильный визит на вывоз — получите <em>код визита</em> для въезда на терминал.</li>
      <li><strong>Терминал и слот.</strong> Выберите терминал (ПКТ, Петролеспорт, УЛКТ, НУТЭП, Янино и др.) и время, если требуется.</li>
      <li><strong>Водитель и авто.</strong> Укажите допущенных на терминал водителя и тягач/полуприцеп.</li>
      <li><strong>Доверенность с ЭП.</strong> На ПКТ, УЛКТ и НУТЭП релиз-ордер и доверенность подписываются ЭП (нужен сертификат экспедитора).</li>
      <li><strong>На терминале.</strong> Водитель въезжает по коду визита; ПСО — по SMS или в сервисном центре.</li>
    </ol>
    <p class="note">ЭП: КриптоПро, Рутокен, сертификаты — <a href="https://www.rlisystems.ru/faq/" target="_blank" rel="noopener noreferrer">FAQ РОЛИС</a>. Вопросы: office@rlisystems.ru, +7 (812) 335-77-33.</p>
  </div>

  <div class="card">
    <h2>Автоматические статусы</h2>
    <div class="rolis-demo-banner">Демо-режим: примерные данные, не из РОЛИС</div>
    <p class="note">Имитация статуса по номеру контейнера и автосмена стадий на карточках. Не живые данные РОЛИС и не перезаписывает поле «Статус в РОЛИС». Демо-стадия карточки в облако не пишется, пока её не зафиксировали вручную.</p>
    <div class="toolbar">
      <button type="button" class="btn" id="rolis-demo-refresh">Обновить статусы (демо)</button>
      <button type="button" class="btn ghost" id="rolis-demo-toggle">${demoOn ? "Скрыть демо" : "Показать демо"}</button>
    </div>
    <div class="rolis-connect">
      <label style="display:flex;gap:8px;align-items:flex-start">
        <input type="checkbox" id="rolis-real-connect" disabled>
        <span><strong>Подключить настоящий РОЛИС</strong><br>
        <span class="rolis-muted">Официальный веб-сервис (SOAP) подключится позже и выставит стадии. Пока только демо, сайт РОЛИС отсюда не читается.</span></span>
      </label>
    </div>
  </div>`;
}

function bindRolisHandlers() {
  window.__rolisRowsCache = buildRolisRows();

  document.querySelectorAll("[data-rolis-copy-num]").forEach(btn => {
    btn.onclick = () => {
      const i = Number(btn.getAttribute("data-rolis-copy-num"));
      const row = (window.__rolisRowsCache || [])[i];
      if (!row || !row.container) return;
      copyTextRolis(row.container, "Номер контейнера скопирован");
    };
  });
  document.querySelectorAll("[data-rolis-copy-visit]").forEach(btn => {
    btn.onclick = () => {
      const i = Number(btn.getAttribute("data-rolis-copy-visit"));
      const row = (window.__rolisRowsCache || [])[i];
      if (!row) return;
      copyTextRolis(formatVisitClipboard(row), "Данные для визита скопированы");
    };
  });
  document.querySelectorAll("[data-rolis-life]").forEach(btn => {
    btn.onclick = () => {
      const i = Number(btn.getAttribute("data-rolis-life"));
      const row = (window.__rolisRowsCache || [])[i];
      if (!row) return;
      createLifeFromRow(row);
    };
  });

  const persist = (el) => {
    const zid = Number(el.getAttribute("data-zid"));
    const cont = el.getAttribute("data-cont") || "";
    const row = el.closest("tr");
    if (!row) return;
    const statusEl = row.querySelector(".rolis-status-input");
    const noteEl = row.querySelector(".rolis-note-input");
    setRolisManual(zid, cont, statusEl ? statusEl.value : "", noteEl ? noteEl.value : "");
    toast("Статус РОЛИС сохранён");
  };
  document.querySelectorAll(".rolis-status-input").forEach(el => {
    el.addEventListener("change", () => persist(el));
  });
  document.querySelectorAll(".rolis-note-input").forEach(el => {
    el.addEventListener("change", () => persist(el));
  });

  const refresh = document.getElementById("rolis-demo-refresh");
  if (refresh) refresh.onclick = () => {
    captureRolisLifeUi();
    window.__rolisDemoOn = true;
    nudgeRolisDemoStages();
    showTab("rolis");
    rolisPullServiceStages().catch(() => {});
    toast("Демо-статусы обновлены, стадии карточек сдвинуты");
  };
  const tog = document.getElementById("rolis-demo-toggle");
  if (tog) tog.onclick = () => {
    captureRolisLifeUi();
    window.__rolisDemoOn = !window.__rolisDemoOn;
    showTab("rolis");
  };
  const real = document.getElementById("rolis-real-connect");
  if (real) {
    real.onclick = (e) => {
      e.preventDefault();
      toast("Подключение настоящего РОЛИС настроит ассистент");
    };
  }
  bindRolisLife();
  scrollRolisLife();
}


window.__appLogicReady = true;

(function fillBlankTripMargins() {
  let changed = false;
  for (const t of (DB.trips || [])) {
    if (t.margin === "" || t.margin == null || !Number.isFinite(Number(t.margin))) {
      t.margin = computeTripMarginHint(t).margin;
      changed = true;
    }
  }
  if (changed) try { saveStore(DB); } catch (e) {}
})();

/* === Карта (Leaflet + Яндекс тайлы EPSG:3395; OSRM только по клику) === */
const _LEAFLET_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAApCAYAAADAk4LOAAAFgUlEQVR4Aa1XA5BjWRTN2oW17d3YaZtr2962HUzbDNpjszW24mRt28p47v7zq/bXZtrp/lWnXr337j3nPCe85NcypgSFdugCpW5YoDAMRaIMqRi6aKq5E3YqDQO3qAwjVWrD8Ncq/RBpykd8oZUb/kaJutow8r1aP9II0WmLKLIsJyv1w/kqw9Ch2MYdB++12Onxee/QMwvf4/Dk/Lfp/i4nxTXtOoQ4pW5Aj7wpici1A9erdAN2OH64x8OSP9j3Ft3b7aWkTg/Fm91siTra0f9on5sQr9INejH6CUUUpavjFNq1B+Oadhxmnfa8RfEmN8VNAsQhPqF55xHkMzz3jSmChWU6f7/XZKNH+9+hBLOHYozuKQPxyMPUKkrX/K0uWnfFaJGS1QPRtZsOPtr3NsW0uyh6NNCOkU3Yz+bXbT3I8G3xE5EXLXtCXbbqwCO9zPQYPRTZ5vIDXD7U+w7rFDEoUUf7ibHIR4y6bLVPXrz8JVZEql13trxwue/uDivd3fkWRbS6/IA2bID4uk0UpF1N8qLlbBlXs4Ee7HLTfV1j54APvODnSfOWBqtKVvjgLKzF5YdEk5ewRkGlK0i33Eofffc7HT56jD7/6U+qH3Cx7SBLNntH5YIPvODnyfIXZYRVDPqgHtLs5ABHD3YzLuespb7t79FY34DjMwrVrcTuwlT55YMPvOBnRrJ4VXTdNnYug5ucHLBjEpt30701A3Ts+HEa73u6dT3FNWwflY86eMHPk+Yu+i6pzUpRrW7SNDg5JHR4KapmM5Wv2E8Tfcb1HoqqHMHU+uWDD7zg54mz5/2BSnizi9T1Dg4QQXLToGNCkb6tb1NU+QAlGr1++eADrzhn/u8Q2YZhQVlZ5+CAOtqfbhmaUCS1ezNFVm2imDbPmPng5wmz+gwh+oHDce0eUtQ6OGDIyR0uUhUsoO3vfDmmgOezH0mZN59x7MBi++WDL1g/eEiU3avlidO671bkLfwbw5XV2P8Pzo0ydy4t2/0eu33xYSOMOD8hTf4CrBtGMSoXfPLchX+J0ruSePw3LZeK0juPJbYzrhkH0io7B3k164hiGvawhOKMLkrQLyVpZg8rHFW7E2uHOL888IBPlNZ1FPzstSJM694fWr6RwpvcJK60+0HCILTBzZLFNdtAzJaohze60T8qBzyh5ZuOg5e7uwQppofEmf2++DYvmySqGBuKaicF1blQjhuHdvCIMvp8whTTfZzI7RldpwtSzL+F1+wkdZ2TBOW2gIF88PBTzD/gpeREAMEbxnJcaJHNHrpzji0gQCS6hdkEeYt9DF/2qPcEC8RM28Hwmr3sdNyht00byAut2k3gufWNtgtOEOFGUwcXWNDbdNbpgBGxEvKkOQsxivJx33iow0Vw5S6SVTrpVq11ysA2Rp7gTfPfktc6zhtXBBC+adRLshf6sG2RfHPZ5EAc4sVZ83yCN00Fk/4kggu40ZTvIEm5g24qtU4KjBrx/BTTH8ifVASAG7gKrnWxJDcU7x8X6Ecczhm3o6YicvsLXWfh3Ch1W0k8x0nXF+0fFxgt4phz8QvypiwCCFKMqXCnqXExjq10beH+UUA7+nG6mdG/Pu0f3LgFcGrl2s0kNNjpmoJ9o4B29CMO8dMT4Q5ox8uitF6fqsrJOr8qnwNbRzv6hSnG5wP+64C7h9lp30hKNtKdWjtdkbuPA19nJ7Tz3zR/ibgARbhb4AlhavcBebmTHcFl2fvYEnW0ox9xMxKBS8btJ+KiEbq9zA4RthQXDhPa0T9TEe69gWupwc6uBUphquXgf+/FrIjweHQS4/pduMe5ERUMHUd9xv8ZR98CxkS4F2n3EUrUZ10EYNw7BWm9x1GiPssi3GgiGRDKWRYZfXlON+dfNbM+GgIwYdwAAAAASUVORK5CYII=";
const _LEAFLET_ICON_2X = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAABSCAMAAAAhFXfZAAAC91BMVEVMaXEzeak2f7I4g7g3g7cua5gzeKg8hJo3grY4g7c3grU0gLI2frE0daAubJc2gbQwd6QzeKk2gLMtd5sxdKIua5g1frA2f7IydaM0e6w2fq41fK01eqo3grgubJgta5cxdKI1f7AydaQydaMxc6EubJgvbJkwcZ4ubZkwcJwubZgubJcydqUydKIxapgubJctbJcubZcubJcvbJYubJcvbZkubJctbJctbZcubJg2f7AubJcrbZcubJcubJcua5g3grY0fq8ubJcubJdEkdEwhsw6i88vhswuhcsuhMtBjMgthMsrg8srgss6is8qgcs8i9A9iMYtg8spgcoogMo7hcMngMonf8olfso4gr8kfck5iM8jfMk4iM8he8k1fro7itAgesk2hs8eecgzfLcofssdeMg0hc4cd8g2hcsxeLQbdsgZdcgxeLImfcszhM0vda4xgckzhM4xg84wf8Yxgs4udKsvfcQucqhUndROmdM1fK0wcZ8vb5w0eqpQm9MzeKhXoNVcpdYydKNWn9VZotVKltJFjsIwcJ1Rms9OlslLmtH///8+kc9epdYzd6dbo9VHkMM2f7FHmNBClM8ydqVcpNY9hro3gLM9hLczealQmcw3fa46f7A8gLMxc6I3eagyc6FIldJMl9JSnNRSntNNl9JPnNJFi75UnM9ZodVKksg8kM45jc09e6ZHltFBk883gbRBh7pDk9EwcaBzn784g7dKkcY2i81Om9M7j85Llc81is09g7Q4grY/j9A0eqxKmdFFltBEjcXf6fFImdBCiLxJl9FGlNFBi78yiMxVndEvbpo6js74+vx+psPP3+o/ks5HkcpGmNCjwdZCkNDM3ehYoNJEls+lxNkxh8xHks0+jdC1zd5Lg6r+/v/H2ufz9/o3jM3t8/edvdM/k89Th61OiLBSjbZklbaTt9BfptdjmL1AicBHj8hGk9FAgK1dkLNTjLRekrdClc/k7fM0icy0y9tgp9c4jc2NtM9Dlc8zicxeXZn3AAAAQ3RSTlMAHDdTb4yPA+LtnEQmC4L2EmHqB7XA0d0sr478x4/Yd5i1zOfyPkf1sLVq4Nh3FvjxopQ2/STNuFzUwFIwxKaejILpIBEV9wAABhVJREFUeF6s1NdyFEcYBeBeoQIhRAkLlRDGrhIgY3BJL8CVeKzuyXFzzjkn5ZxzzuScg3PO8cKzu70JkO0LfxdTU//pM9vTu7Xgf6KqOVTb9X7toRrVEfBf1HTVjZccrT/2by1VV928Yty9ZbVuucdz90frG8DBjl9pVApbOstvmMuvVgaNXSfAAd6pGxpy6yxf5ph43pS/4f3uoaGm2rdu72S9xzOvMymkZFq/ptDrk90mhW7e4zl7HLzhxGWPR20xmSxJ/VqldG5m9XhaVOA1DadsNh3Pu5L2N6QtPO/32JpqQBVVk20oy/Pi2s23WEvyfHbe1thadVQttvm7Llf65gGmXK67XtupyoM7HQhmXdLS8oGWJNeOJ3C5fG5XCEJnkez3/oFdsvgJ4l2ANZwhrJKk/7OSXa+3Vw2WJMlKnGkobouYk6T0TyX30klOUnTD9HJ5qpckL3EW/w4XF3Xd0FGywXUrstrclVsqz5Pd/sXFYyDnPdrLcQODmGOK47IZb4CmibmMn+MYRzFZ5jg33ZL/EJrWcszHmANy3ARBK/IXtciJy8VsitPSdE3uuHxzougojcUdr8/32atnz/ev3f/K5wtpxUTpcaI45zusVDpYtZi+jg0oU9b3x74h7+n9ABvYEZeKaVq0sh0AtLKsFtqNBdeT0MrSzwwlq9+x6xAO4tgOtSzbCjrNQQiNvQUbUEubvzBUeGw26yDCsRHCoLkTHDa7IdOLIThs/gHvChszh2CimE8peRs47cxANI0lYNB5y1DljpOF0IhzBDPOZnDOqYYbeGKECbPzWnXludPphw5c2YBq5zlwXphIbO4VDCZ0gnPfUO1TwZoYwAs2ExPCedAu9DAjfQUjzITQb3jNj0KG2Sgt6BHaQUdYzWz+XmBktOHwanXjaSTcwwziBcuMOtwBmqPrTOxFQR/DRKKPqyur0aiW6cULYsx6tBm0jXpR/AUWR6HRq9WVW6MRhIq5jLyjbaCTDCijyYJNpCajdyobP/eTw0iexBAKkJ3gA5KcQb2zBXsIBckn+xVv8jkZSaEFHE+jFEleAEfayRU0MouNoBmB/L50Ai/HSLIHxcrpCvnhSQAuakKp2C/YbCylJjXRVy/z3+Kv/RrNcCo+WUzlVEhzKffnTQnxeN9fWF88fiNCUdSTsaufaChKWInHeysygfpIqagoakW+vV20J8uyl6TyNKEZWV4oRSPyCkWpgOLSbkCObT8o2r6tlG58HQquf6O0v50tB7JM7F4EORd2dx/K0w/KHsVkLPaoYrwgP/y7krr3SSMA4zj+OBgmjYkxcdIJQyQRKgg2viX9Hddi9UBb29LrKR7CVVEEEXWojUkXNyfTNDE14W9gbHJNuhjDettN3ZvbOvdOqCD3Jp/9l+/wJE+9PkYGjx/fqkys3S2rMozM/o2106rfMUINo6hVqz+eu/hd1c4xTg0TAfy5kV+4UG6+IthHTU9woWmxuKNbTfuCSfovBCxq7EtHqvYL4Sm6F8GVxsSXHMQ07TOi1DKtZxjWaaIyi4CXWjxPccUw8WVbMYY5wxC1mzEyXMJWkllpRloi+Kkoq69sxBTlElF6aAxYUbjXNlhlDZilDnM4U5SlN5biRsRHnbx3mbeWjEh4mEyiuJDl5XcWVmX5GvNkFgLWZM5qwsop4/AWfLhU1cR7k1VVvcYCWRkOI6Xy5gmnphCYIkvzuNYzHzosq2oNk2RtSs8khfUOfHIDgR6ysYBaMpl4uEgk2U/oJTs9AaTSwma7dT69geAE2ZpEjUsn2ieJNHeKfrI3EcAGJ2ZaNgVuC8EBctCLc57P5u5led6IOBkIYkuQMrmmjChs4VkfOerHqSBkPzZlhe06RslZ3zMjk2sscqKwY0RcjKK+LWbzd7KiHhkncs/siFJ+V5eXxD34B8nVuJEpGJNmxN2gH3vSvp7J70tF+D1Ej8qUJD1TkErAND2GZwTFg/LubvmgiBG3SOvdlsqFQrkEzJCL1rstlnVFROixZoDDSuXQFHESwVGlcuQcMb/b42NgjLowh5MTDFE3vNB5qStRIErdCQEh6pLPR92anSUb/wAIhldAaDMpGgAAAABJRU5ErkJggg==";
const _LEAFLET_SHADOW = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACkAAAApCAQAAAACach9AAACMUlEQVR4Ae3ShY7jQBAE0Aoz/f9/HTMzhg1zrdKUrJbdx+Kd2nD8VNudfsL/Th///dyQN2TH6f3y/BGpC379rV+S+qqetBOxImNQXL8JCAr2V4iMQXHGNJxeCfZXhSRBcQMfvkOWUdtfzlLgAENmZDcmo2TVmt8OSM2eXxBp3DjHSMFutqS7SbmemzBiR+xpKCNUIRkdkkYxhAkyGoBvyQFEJEefwSmmvBfJuJ6aKqKWnAkvGZOaZXTUgFqYULWNSHUckZuR1HIIimUExutRxwzOLROIG4vKmCKQt364mIlhSyzAf1m9lHZHJZrlAOMMztRRiKimp/rpdJDc9Awry5xTZCte7FHtuS8wJgeYGrex28xNTd086Dik7vUMscQOa8y4DoGtCCSkAKlNwpgNtphjrC6MIHUkR6YWxxs6Sc5xqn222mmCRFzIt8lEdKx+ikCtg91qS2WpwVfBelJCiQJwvzixfI9cxZQWgiSJelKnwBElKYtDOb2MFbhmUigbReQBV0Cg4+qMXSxXSyGUn4UbF8l+7qdSGnTC0XLCmahIgUHLhLOhpVCtw4CzYXvLQWQbJNmxoCsOKAxSgBJno75avolkRw8iIAFcsdc02e9iyCd8tHwmeSSoKTowIgvscSGZUOA7PuCN5b2BX9mQM7S0wYhMNU74zgsPBj3HU7wguAfnxxjFQGBE6pwN+GjME9zHY7zGp8wVxMShYX9NXvEWD3HbwJf4giO4CFIQxXScH1/TM+04kkBiAAAAAElFTkSuQmCC";
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving/";
const TILE_ERROR_SWITCH_THRESHOLD = 4;
const TILE_PROVIDERS = [
  {
    id: "yandex",
    crs: "EPSG3395",
    url: "https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x={x}&y={y}&z={z}&scale=1&lang=ru_RU",
    options: {
      maxZoom: 19,
      attribution: '&copy; <a href="https://yandex.ru/maps/">Яндекс</a>'
    }
  },
  {
    id: "esri",
    crs: "EPSG3857",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 19,
      attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, DeLorme, NAVTEQ'
    }
  },
  {
    id: "opentopomap",
    crs: "EPSG3857",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 17, subdomains: "abc",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> | &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
    }
  }
];
function providerCrs(prov) {
  if (prov && prov.crs === "EPSG3395" && L.CRS && L.CRS.EPSG3395) return L.CRS.EPSG3395;
  return (L.CRS && L.CRS.EPSG3857) || undefined;
}
function providerLabel(id) {
  if (id === "yandex") return "Яндекс";
  if (id === "esri") return "Esri";
  return id || "";
}
let _mapInstances = {};
let _mapLayerGroups = {}; // containerId -> featureGroup of routes
let _mapItemLayers = {};  // itemId -> {line,m1,m2,group,item,path}
let _mapSelectedId = null;
let _preferredTileProviderIdx = 0;
let _kartaInited = false;
let _kartaUserZoomed = false;
let _kartaPaintGen = 0;
let _osrmCache = {}; // "from|to" -> {latlngs, km, source}
let _osrmInflight = 0;

function leafletReady() { return typeof L !== "undefined"; }
function setupLeafletIcons() {
  if (!leafletReady() || L.Icon.Default.prototype._ipkFixed) return;
  L.Icon.Default.mergeOptions({
    iconUrl: _LEAFLET_ICON, iconRetinaUrl: _LEAFLET_ICON_2X, shadowUrl: _LEAFLET_SHADOW
  });
  L.Icon.Default.prototype._ipkFixed = true;
}
function mapOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}
function destroyMap(id) {
  const m = _mapInstances[id];
  if (m) { try { m.remove(); } catch (e) {} delete _mapInstances[id]; }
  delete _mapLayerGroups[id];
  if (id === "karta-map") { _kartaInited = false; _mapItemLayers = {}; }
}
function switchTileProvider(containerId, providerIdx, view) {
  _preferredTileProviderIdx = providerIdx;
  const old = _mapInstances[containerId];
  let center = (view && view.center) || [55.75, 37.62];
  let zoom = (view && view.zoom) || 5;
  if (old) {
    try {
      const c = old.getCenter();
      center = [c.lat, c.lng];
      zoom = old.getZoom();
    } catch (e) {}
  }
  const wasKarta = containerId === "karta-map";
  const keepSelected = _mapSelectedId;
  destroyMap(containerId);
  const map = ensureMap(containerId, { center, zoom });
  if (wasKarta) {
    _kartaInited = !!map;
    _mapSelectedId = keepSelected;
    _kartaUserZoomed = true;
    if (typeof paintKartaRoutes === "function") paintKartaRoutes();
    if (map) try { map.setView(center, zoom, { animate: false }); } catch (e) {}
  }
  return map;
}
function attachTileLayer(map, containerId, providerIdx) {
  const prov = TILE_PROVIDERS[providerIdx];
  if (!prov) return null;
  const want = providerCrs(prov);
  if (want && map.options.crs && map.options.crs !== want) {
    return switchTileProvider(containerId, providerIdx);
  }
  if (map._ipkTileLayer) { try { map.removeLayer(map._ipkTileLayer); } catch (e) {} }
  const layer = L.tileLayer(prov.url, Object.assign({
    updateWhenZooming: true,
    keepBuffer: 2,
    errorTileUrl: ""
  }, prov.options));
  let errCount = 0, switched = false;
  layer.on("tileerror", () => {
    errCount++;
    if (switched || errCount < TILE_ERROR_SWITCH_THRESHOLD) return;
    switched = true;
    const next = providerIdx + 1;
    if (next < TILE_PROVIDERS.length) {
      const nextProv = TILE_PROVIDERS[next];
      const nextCrs = providerCrs(nextProv);
      if (nextCrs && map.options.crs && map.options.crs !== nextCrs) {
        switchTileProvider(containerId, next);
      } else {
        _preferredTileProviderIdx = next;
        attachTileLayer(map, containerId, next);
      }
    } else {
      const banner = document.getElementById(containerId + "-offline");
      if (banner) { banner.hidden = false; banner.textContent = "Карта требует интернет"; }
    }
  });
  layer.addTo(map);
  map._ipkTileProvider = prov.id;
  map._ipkTileLayer = layer;
  return layer;
}
/** Create once per container; reuse on tab re-entry. */
function ensureMap(containerId, opts) {
  opts = opts || {};
  const el = document.getElementById(containerId);
  if (!el || !leafletReady()) return null;
  setupLeafletIcons();
  let map = _mapInstances[containerId];
  if (map && map.getContainer && map.getContainer() === el) {
    setTimeout(() => { try { map.invalidateSize({ animate: false }); } catch (e) {} }, 50);
    setTimeout(() => { try { map.invalidateSize({ animate: false }); } catch (e) {} }, 250);
    return map;
  }
  destroyMap(containerId);
  const startIdx = Math.min(_preferredTileProviderIdx, TILE_PROVIDERS.length - 1);
  const startProv = TILE_PROVIDERS[startIdx] || TILE_PROVIDERS[0];
  const mapOpts = {
    zoomControl: true,
    attributionControl: true,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    boxZoom: true,
    keyboard: true,
    touchZoom: true,
    dragging: true,
    zoomSnap: 0.5,
    zoomDelta: 0.5
  };
  const crs = providerCrs(startProv);
  if (crs) mapOpts.crs = crs;
  map = L.map(el, mapOpts);
  attachTileLayer(map, containerId, startIdx);
  map.setView(opts.center || [55.75, 37.62], opts.zoom || 5);
  _mapInstances[containerId] = map;
  _mapLayerGroups[containerId] = L.featureGroup().addTo(map);
  // Prevent zoom control <a href="#"> from touching location.hash (would remount the tab)
  try {
    const zc = map.zoomControl && map.zoomControl._container;
    if (zc) zc.querySelectorAll("a").forEach(a => { a.setAttribute("href", "javascript:void(0)"); a.addEventListener("click", ev => { ev.preventDefault(); }); });
  } catch (e) {}
  map.on("zoomstart", () => { _kartaUserZoomed = true; });
  map.on("dragstart", () => { _kartaUserZoomed = true; });
  // zoom must NOT redraw routes or fetch OSRM
  setTimeout(() => { try { map.invalidateSize({ animate: false }); } catch (e) {} }, 60);
  setTimeout(() => { try { map.invalidateSize({ animate: false }); } catch (e) {} }, 300);
  return map;
}
function createMap(containerId, opts) {
  // stavki panel: always fresh (container rebuilt)
  destroyMap(containerId);
  return ensureMap(containerId, opts);
}
function parseRouteEndpoints(routeStr) {
  const s = String(routeStr || "").trim();
  if (!s) return null;
  const parts = s.split(/\s*(?:→|->|—|–)\s*/).map(x => x.trim()).filter(Boolean);
  if (parts.length >= 2) return { from: parts[0], to: parts[parts.length - 1] };
  return null;
}
function endpointsForZayavka(z) {
  const from = z.loading_address || "", to = z.unloading_address || "";
  if (from && to) return { from, to };
  return parseRouteEndpoints([from, to].filter(Boolean).join(" → "));
}
function endpointsForTrip(t) { return parseRouteEndpoints(t.route || ""); }
function formatMapRate(v) {
  if (v == null || v === "") return "—";
  if (typeof formatTripRate === "function") return formatTripRate(v);
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  if (!isNaN(n) && n > 0) return money(n) + " ₽";
  return String(v);
}
function straightPath(fromName, toName) {
  const a = resolveCity(fromName), b = resolveCity(toName);
  if (!a || !b) return { ok: false, unknown: [!a && fromName, !b && toName].filter(Boolean) };
  const km = haversineKm(a.coords, b.coords) * 1.2;
  return {
    ok: true, fromKey: a.key, toKey: b.key,
    fromCoords: a.coords, toCoords: b.coords,
    latlngs: [a.coords, b.coords], km, source: "straight"
  };
}
async function fetchOsrmLatLngs(a, b) {
  const url = OSRM_URL + a[1] + "," + a[0] + ";" + b[1] + "," + b[0] + "?overview=full&geometries=geojson";
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 5000) : null;
  try {
    const r = await fetch(url, { mode: "cors", signal: ctrl ? ctrl.signal : undefined });
    if (!r.ok) throw new Error("osrm " + r.status);
    const data = await r.json();
    const route = data.routes && data.routes[0];
    if (!route || !route.geometry || !route.geometry.coordinates) throw new Error("no geom");
    return { latlngs: route.geometry.coordinates.map(c => [c[1], c[0]]), km: (route.distance || 0) / 1000, source: "osrm" };
  } finally { if (timer) clearTimeout(timer); }
}
async function resolveRoutePath(fromName, toName, opts) {
  opts = opts || {};
  const preferOsrm = !!opts.osrm;
  const key = String(fromName) + "|" + String(toName);
  const base = straightPath(fromName, toName);
  if (!base.ok) return base;
  if (!preferOsrm || !mapOnline()) return base;
  if (_osrmCache[key]) {
    return Object.assign({}, base, _osrmCache[key], { ok: true, fromKey: base.fromKey, toKey: base.toKey, fromCoords: base.fromCoords, toCoords: base.toCoords });
  }
  if (_osrmInflight >= 2) return base;
  _osrmInflight++;
  try {
    const osrm = await fetchOsrmLatLngs(base.fromCoords, base.toCoords);
    _osrmCache[key] = osrm;
    return Object.assign({}, base, osrm);
  } catch (e) {
    return base;
  } finally {
    _osrmInflight = Math.max(0, _osrmInflight - 1);
  }
}
function collectMapItems() {
  const items = [];
  for (const z of (DB.zayavki || [])) {
    const ep = endpointsForZayavka(z);
    if (!ep) continue;
    items.push({
      id: "z-" + z.id, kind: "zayavka", title: "Заявка №" + (z.number || z.id),
      from: ep.from, to: ep.to, date: z.date || z.created_at || "",
      driver: z.driver || "", rate: z.rate,
      carrier: (z.carrier && z.carrier.full_name) || "", raw: z
    });
  }
  for (const t of (DB.trips || [])) {
    const ep = endpointsForTrip(t);
    if (!ep) continue;
    items.push({
      id: "t-" + t.id, kind: "trip", title: "Рейс " + (t.client || t.id),
      from: ep.from, to: ep.to, date: t.date || "",
      driver: t.driver || t.carrier || "", rate: t.client_rate || t.carrier_rate || "",
      carrier: t.carrier || "", raw: t
    });
  }
  items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return items;
}
function popupHtml(item, path) {
  const km = path && path.km ? (" · " + Math.round(path.km) + " км") : "";
  const src = path && path.source === "osrm" ? " (по дорогам)" : " (оценка)";
  return `<strong>${esc(item.title)}</strong><br>
    ${esc(item.from)} → ${esc(item.to)}${km}${src}<br>
    Дата: <strong>${esc(fmtDate(item.date))}</strong><br>
    Водитель: <strong>${esc(item.driver || "—")}</strong><br>
    Ставка: <strong>${esc(formatMapRate(item.rate))}</strong>` +
    (item.carrier ? `<br>Перевозчик: ${esc(item.carrier)}` : "") +
    `<br><span class="muted">Клик по линии — маршрут по дорогам</span>`;
}
function clearRouteLayers(containerId) {
  const g = _mapLayerGroups[containerId];
  if (g) g.clearLayers();
  if (containerId === "karta-map") _mapItemLayers = {};
}
function drawStraightItem(map, containerId, item, opts) {
  opts = opts || {};
  const path = straightPath(item.from, item.to);
  if (!path.ok) return null;
  const color = item.kind === "trip" ? "#2563eb" : "#059669";
  const selected = opts.selected || _mapSelectedId === item.id;
  const line = L.polyline(path.latlngs, {
    color, weight: selected ? 6 : 4, opacity: selected ? 0.95 : 0.75,
    interactive: true
  });
  const m1 = L.marker(path.fromCoords);
  const m2 = L.marker(path.toCoords);
  const html = popupHtml(item, path);
  line.bindPopup(html); m1.bindPopup(html); m2.bindPopup(html);
  const group = L.featureGroup([line, m1, m2]);
  const host = _mapLayerGroups[containerId];
  if (host) host.addLayer(group); else group.addTo(map);
  const rec = { line, m1, m2, group, item, path };
  _mapItemLayers[item.id] = rec;
  line.on("click", () => { selectMapItem(item.id, { osrm: true }); });
  m1.on("click", () => { selectMapItem(item.id, { osrm: true }); });
  m2.on("click", () => { selectMapItem(item.id, { osrm: true }); });
  if (opts.open) setTimeout(() => { try { line.openPopup(); } catch (e) {} }, 0);
  return rec;
}
async function upgradeItemToOsrm(itemId) {
  const rec = _mapItemLayers[itemId];
  if (!rec) return;
  const item = rec.item;
  const path = await resolveRoutePath(item.from, item.to, { osrm: true });
  if (!path.ok || path.source !== "osrm") return;
  rec.path = path;
  rec.line.setLatLngs(path.latlngs);
  const html = popupHtml(item, path);
  rec.line.setPopupContent(html);
  rec.m1.setPopupContent(html);
  rec.m2.setPopupContent(html);
  try { rec.line.openPopup(); } catch (e) {}
  const map = _mapInstances["karta-map"];
  if (map) {
    try { map.fitBounds(rec.line.getBounds().pad(0.2), { animate: true, maxZoom: 10 }); } catch (e) {}
  }
}
function mapFilters() {
  const showZ = document.getElementById("map-show-z")?.checked !== false;
  const showT = document.getElementById("map-show-t")?.checked !== false;
  const carrier = (document.getElementById("map-filter-carrier")?.value || "").trim();
  const period = (document.getElementById("map-filter-period")?.value || "").trim(); // YYYY-MM or empty
  return { showZ, showT, carrier, period };
}
function itemMatchesFilters(item, f) {
  if (item.kind === "zayavka" && !f.showZ) return false;
  if (item.kind === "trip" && !f.showT) return false;
  if (f.carrier && normName(item.carrier || "") !== normName(f.carrier) &&
      !normName(item.carrier || "").includes(normName(f.carrier))) return false;
  if (f.period && !(String(item.date || "").startsWith(f.period))) return false;
  return true;
}
function uniqueCarriers(items) {
  const set = {};
  for (const it of items) {
    const c = (it.carrier || "").trim();
    if (c) set[c] = 1;
  }
  return Object.keys(set).sort((a, b) => a.localeCompare(b, "ru"));
}
function renderKarta() {
  const online = mapOnline();
  const items = collectMapItems();
  const carriers = uniqueCarriers(items);
  const months = [...new Set(items.map(i => String(i.date || "").slice(0, 7)).filter(m => m.length === 7))].sort().reverse();
  return `<h1>Карта</h1>
  <div class="warn-box">${online
    ? "Подложка: Яндекс.Карты (русские подписи). Линии сразу по прямой; по клику — маршрут по дорогам. Масштаб: колёсико / +/−. При сбое тайлов — запасной Esri."
    : "Карта требует интернет — тайлы недоступны офлайн."}</div>
  <div class="map-toolbar">
    <label class="check"><input type="checkbox" id="map-show-z" checked> Заявки <span class="map-leg map-leg-z"></span></label>
    <label class="check"><input type="checkbox" id="map-show-t" checked> Рейсы <span class="map-leg map-leg-t"></span></label>
    <label>Перевозчик
      <select id="map-filter-carrier"><option value="">Все</option>
        ${carriers.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
      </select>
    </label>
    <label>Период
      <select id="map-filter-period"><option value="">Все</option>
        ${months.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join("")}
      </select>
    </label>
    <button class="btn secondary" id="btn-map-fit" type="button">Показать все</button>
    <span class="muted" id="map-status"></span>
  </div>
  <div class="map-legend card" style="padding:8px 12px;margin-bottom:8px">
    <span class="map-leg map-leg-z"></span> Заявки &nbsp;&nbsp;
    <span class="map-leg map-leg-t"></span> Рейсы &nbsp;&nbsp;
    <span class="muted">Клик по линии — попап (водитель, дата, ставка) и маршрут по дорогам</span>
  </div>
  <div class="card" style="padding:0;overflow:hidden">
    <div class="map-wrap tall" id="karta-map-wrap">
      <div id="karta-map" style="height:100%;width:100%"></div>
      <div class="map-offline" id="karta-map-offline" ${online ? "hidden" : ""}>Карта требует интернет</div>
    </div>
  </div>
  <div class="card">
    <h2>Маршруты в базе</h2>
    <div class="map-list" id="map-list"></div>
  </div>`;
}
function paintKartaRoutes(opts) {
  opts = opts || {};
  const t0 = performance.now();
  const map = ensureMap("karta-map", { center: [55.0, 40.0], zoom: 5 });
  if (!map) return;
  const offline = document.getElementById("karta-map-offline");
  if (offline) offline.hidden = mapOnline();
  const f = mapFilters();
  const listEl = document.getElementById("map-list");
  const status = document.getElementById("map-status");
  clearRouteLayers("karta-map");
  const items = collectMapItems().filter(it => itemMatchesFilters(it, f));
  let drawn = 0, skipped = 0;
  if (listEl) listEl.innerHTML = "";
  // Sync straight lines only — never await OSRM here (freeze fix)
  for (const item of items) {
    const canPlot = !!(resolveCity(item.from) && resolveCity(item.to));
    if (listEl) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "map-item" + (_mapSelectedId === item.id ? " active" : "");
      btn.dataset.mapId = item.id;
      btn.innerHTML = `<strong>${esc(item.title)}</strong> · ${esc(fmtDate(item.date))}
        <div>${esc(item.from)} → ${esc(item.to)}</div>
        <div class="meta">Водитель: ${esc(item.driver || "—")} · Ставка: ${esc(formatMapRate(item.rate))} · ${esc(item.carrier || "")}${canPlot ? "" : " · <span style=color:#b45309>нет координат</span>"}</div>`;
      btn.onclick = () => selectMapItem(item.id, { osrm: true });
      listEl.appendChild(btn);
    }
    if (!canPlot) { skipped++; continue; }
    const rec = drawStraightItem(map, "karta-map", item, {
      selected: _mapSelectedId === item.id,
      open: _mapSelectedId === item.id
    });
    if (rec) drawn++;
  }
  const g = _mapLayerGroups["karta-map"];
  // Never steal zoom from the user. Callers that want a refit must clear _kartaUserZoomed first.
  if (!_kartaUserZoomed && g && drawn) {
    try { map.fitBounds(g.getBounds().pad(0.15), { animate: false, maxZoom: 8 }); } catch (e) {}
  }
  try { map.invalidateSize({ animate: false }); } catch (e) {}
  const ms = Math.round(performance.now() - t0);
  if (status) {
    const prov = map._ipkTileProvider ? providerLabel(map._ipkTileProvider) : "";
    status.textContent = `На карте: ${drawn}` + (skipped ? ` · без координат: ${skipped}` : "")
      + (prov ? ` · ${prov}` : "") + ` · ${ms} мс`;
  }
  _kartaInited = true;
}
async function selectMapItem(id, opts) {
  opts = opts || {};
  _mapSelectedId = id;
  // highlight without full rebuild if possible
  for (const [iid, rec] of Object.entries(_mapItemLayers)) {
    const sel = iid === id;
    try { rec.line.setStyle({ weight: sel ? 6 : 4, opacity: sel ? 0.95 : 0.75 }); } catch (e) {}
  }
  document.querySelectorAll("#map-list .map-item").forEach(el => {
    el.classList.toggle("active", el.dataset.mapId === id);
  });
  if (opts.osrm) await upgradeItemToOsrm(id);
  else {
    const rec = _mapItemLayers[id];
    if (rec) try { rec.line.openPopup(); } catch (e) {}
  }
}
function bindKartaHandlers() {
  ["map-show-z", "map-show-t", "map-filter-carrier", "map-filter-period"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.onchange = () => {
      _kartaUserZoomed = false;
      paintKartaRoutes();
    };
  });
  const fit = document.getElementById("btn-map-fit");
  if (fit) fit.onclick = () => {
    _mapSelectedId = null;
    _kartaUserZoomed = false;
    paintKartaRoutes();
  };
  // Defer paint so layout/CSS settle (zoom + invalidateSize)
  const gen = ++_kartaPaintGen;
  if (!_kartaInited) _kartaUserZoomed = false;
  requestAnimationFrame(() => {
    if (gen !== _kartaPaintGen) return;
    paintKartaRoutes();
    setTimeout(() => {
      if (gen !== _kartaPaintGen) return;
      const map = _mapInstances["karta-map"];
      if (map) try { map.invalidateSize({ animate: false }); } catch (e) {}
    }, 200);
  });
}

async function renderStavkiMapPanel(from, to) {
  let card = document.getElementById("stavki-map-card");
  if (!card) {
    const host = document.getElementById("stavki-result");
    if (!host) return;
    card = document.createElement("div");
    card.id = "stavki-map-card";
    card.className = "card";
    host.appendChild(card);
  }
  const online = mapOnline();
  card.innerHTML = `<h2>Карта маршрута</h2>
    <p class="muted" id="stavki-map-meta">Считаю маршрут…</p>
    <div class="map-wrap" id="stavki-map-wrap">
      <div id="stavki-map" style="height:100%;width:100%"></div>
      <div class="map-offline" id="stavki-map-offline" ${online ? "hidden" : ""}>Карта требует интернет</div>
    </div>`;
  if (!leafletReady()) {
    document.getElementById("stavki-map-meta").textContent = "Карта недоступна";
    return;
  }
  // Draw straight immediately, then optionally upgrade OSRM
  const straight = straightPath(from, to);
  const meta = document.getElementById("stavki-map-meta");
  if (!straight.ok) {
    meta.textContent = "Не знаю координаты: " + (straight.unknown || []).join(", ");
    return;
  }
  meta.textContent = `${straight.fromKey} → ${straight.toKey} · ${Math.round(straight.km)} км · оценка (прямая × 1.2)`;
  const map = createMap("stavki-map", { center: straight.fromCoords, zoom: 6 });
  if (!map) return;
  let line = L.polyline(straight.latlngs, { color: "#7c3aed", weight: 5, opacity: 0.9 }).addTo(map);
  L.marker(straight.fromCoords).addTo(map).bindPopup("Откуда: " + esc(from));
  L.marker(straight.toCoords).addTo(map).bindPopup("Куда: " + esc(to));
  try { map.fitBounds(line.getBounds().pad(0.2), { animate: false, maxZoom: 9 }); } catch (e) {}
  setTimeout(() => { try { map.invalidateSize({ animate: false }); map.fitBounds(line.getBounds().pad(0.2), { animate: false, maxZoom: 9 }); } catch (e) {} }, 120);
  const off = document.getElementById("stavki-map-offline");
  if (off) off.hidden = mapOnline();
  // Background OSRM — does not block UI
  try {
    const path = await resolveRoutePath(from, to, { osrm: true });
    if (path.ok && path.source === "osrm" && _mapInstances["stavki-map"] === map) {
      line.setLatLngs(path.latlngs);
      meta.textContent = `${path.fromKey} → ${path.toKey} · ${Math.round(path.km)} км · по дорогам (OSRM)`;
      try { map.fitBounds(line.getBounds().pad(0.2), { animate: true, maxZoom: 9 }); } catch (e) {}
    }
  } catch (e) {}
}
/* === Почта / лента запросов (mail_public.json) === */
function mailRefreshStatusText() {
  const parts = [];
  try {
    if (window.__mailLastRefreshAt) {
      const d = window.__mailLastRefreshAt instanceof Date ? window.__mailLastRefreshAt : new Date(window.__mailLastRefreshAt);
      const hhmm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
      parts.push("Обновлено: " + hhmm + " МСК");
    }
  } catch (e) {}
  try {
    if (window.__mailFeedGeneratedAt) {
      const g = new Date(window.__mailFeedGeneratedAt);
      if (!isNaN(g.getTime())) {
        const gtxt = g.toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
        parts.push("данные: " + gtxt + " МСК");
      } else {
        parts.push("данные: " + String(window.__mailFeedGeneratedAt));
      }
    }
  } catch (e) {}
  if (window.__mailLastRefreshError) parts.push(String(window.__mailLastRefreshError));
  if (window.__mailLastSyncHint) parts.push(String(window.__mailLastSyncHint));
  return parts.join(" · ");
}
function cacheBustUrl(url) {
  if (!url) return url;
  // PostgREST rejects unknown query params (e.g. t=...) on /rest/v1/* 
  if (/\/rest\/v1\//i.test(String(url))) return String(url);
  const sep = String(url).indexOf("?") >= 0 ? "&" : "?";
  return String(url) + sep + "t=" + Date.now();
}
function updateMailSourceList() {
  const list = [];
  try {
    if (typeof getSupabaseUpdateRestUrl === "function") list.push(getSupabaseUpdateRestUrl());
  } catch (e) {}
  try {
    if (typeof SUPABASE_UPDATE_REST === "string" && SUPABASE_UPDATE_REST) list.push(SUPABASE_UPDATE_REST);
  } catch (e) {}
  if (typeof updateUrlListAll === "function") {
    try {
      for (const u of updateUrlListAll()) if (u) list.push(u);
    } catch (e) {}
  } else if (typeof updateUrlList === "function") {
    try {
      for (const u of updateUrlList()) if (u) list.push(u);
    } catch (e) {}
  }
  if (typeof UPDATE_URLS !== "undefined" && Array.isArray(UPDATE_URLS)) {
    for (const u of UPDATE_URLS) if (u) list.push(u);
  }
  if (typeof UPDATE_URL === "string" && UPDATE_URL) list.push(UPDATE_URL);
  const seen = {};
  const out = [];
  for (const u of list) { if (!u || seen[u]) continue; seen[u] = 1; out.push(u); }
  return out;
}
function isMailSupabaseUrl(url) {
  if (typeof isSupabaseUpdateUrl === "function") return isSupabaseUpdateUrl(url);
  return /\/rest\/v1\/app_updates/i.test(String(url || ""));
}
async function fetchMailBundleFromUrl(url) {
  const resolve = (typeof resolveUrl === "function")
    ? resolveUrl
    : (base, rel) => {
        if (!rel) return null;
        if (/^https?:\/\//i.test(rel)) return rel;
        try { return new URL(rel, base).toString(); } catch (e) { return rel; }
      };
  if (isMailSupabaseUrl(url)) {
    const headers = (typeof supabaseUpdateHeaders === "function")
      ? supabaseUpdateHeaders()
      : (typeof SUPABASE_ANON_KEY === "string" ? {
          apikey: SUPABASE_ANON_KEY,
          Authorization: "Bearer " + SUPABASE_ANON_KEY,
          Accept: "application/json"
        } : { Accept: "application/json" });
    const text = (typeof fetchUpdateText === "function")
      ? await fetchUpdateText(url, headers)
      : await (await fetch(url, { cache: "no-store", mode: "cors", headers: headers })).text();
    const data = JSON.parse(text);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("пустой ответ Supabase");
    const manifest = (typeof manifestFromSupabaseRow === "function")
      ? manifestFromSupabaseRow(row)
      : { version: row.version, data: {} };
    let items = [];
    let generated_at = null;
    if (manifest.data && Array.isArray(manifest.data.mail_inline)) items = manifest.data.mail_inline;
    else if (row.mail && Array.isArray(row.mail.items)) items = row.mail.items;
    else if (Array.isArray(row.mail)) items = row.mail;
    if (row.mail && row.mail.generated_at) generated_at = row.mail.generated_at;
    else if (manifest.data && manifest.data.mail_generated_at) generated_at = manifest.data.mail_generated_at;
    let quotes = null;
    if (manifest.data && Array.isArray(manifest.data.quotes_inline)) quotes = manifest.data.quotes_inline;
    else if (Array.isArray(row.quotes)) quotes = row.quotes;
    return { host: "Supabase", items: items, generated_at: generated_at, quotes: quotes, version: String(manifest.version || row.version || "") };
  }
  const r = await fetch(cacheBustUrl(url), { cache: "no-store", mode: "cors" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const manifest = await r.json();
  const mailRel = (manifest.data && (manifest.data.mail_url || manifest.data.mail)) || "mail_public.json";
  const mailUrl = resolve(url, mailRel);
  if (!mailUrl) throw new Error("В манифесте нет mail_url");
  const mr = await fetch(cacheBustUrl(mailUrl), { cache: "no-store", mode: "cors" });
  if (!mr.ok) throw new Error("HTTP " + mr.status + " (mail)");
  const mail = await mr.json();
  const items = Array.isArray(mail) ? mail : (mail.items || []);
  const generated_at = mail && mail.generated_at ? mail.generated_at : null;
  let quotes = null;
  const qRel = manifest.data && (manifest.data.quotes_url || manifest.data.quotes);
  if (qRel && typeof mergeQuotesExtra === "function") {
    try {
      const qUrl = resolve(url, qRel);
      const qr = await fetch(cacheBustUrl(qUrl), { cache: "no-store", mode: "cors" });
      if (qr.ok) {
        const qj = await qr.json();
        quotes = Array.isArray(qj) ? qj : (qj.quotes || []);
      }
    } catch (e) {}
  }
  let host = "mirror";
  try {
    if (typeof updateHostLabel === "function") host = updateHostLabel(url);
    else if (String(url).indexOf("jsdelivr") >= 0) host = "jsDelivr";
  } catch (e) {}
  return { host: host, items: items, generated_at: generated_at, quotes: quotes, version: String(manifest.version || "") };
}

async function fetchMailItemsFromSupabase() {
  const sb = (typeof initSupabaseClient === "function") ? initSupabaseClient() : (window.__sb || null);
  if (!sb) throw new Error("нет клиента Supabase");
  if (!isLoggedIn()) throw new Error("нужен вход");
  const { data, error } = await sb
    .from("mail_items")
    .select("id,received_at,from_name,from_email,subject,snippet,is_rate_request,route,container,weight,folder")
    .order("received_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message || "mail_items");
  const items = (data || []).map((row) => {
    const received = row.received_at ? new Date(row.received_at) : null;
    const dateStr = received && !isNaN(received.getTime())
      ? received.toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" })
      : "";
    const timeStr = received && !isNaN(received.getTime())
      ? received.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" })
      : "";
    const company = String(row.from_name || "").trim() || String(row.from_email || "").trim();
    const isRate = !!row.is_rate_request;
    return {
      id: String(row.id),
      date: dateStr,
      time_msk: timeStr,
      received_at: row.received_at || "",
      type: isRate ? "запрос ставки" : "прочее",
      source: "почта",
      company: company,
      subject: String(row.subject || ""),
      route: String(row.route || ""),
      container: String(row.container || ""),
      weight: String(row.weight || ""),
      rate: "",
      summary: String(row.snippet || "").slice(0, 400),
      is_rate_request: isRate,
      from_email: String(row.from_email || "")
    };
  });
  const generated_at = items.length && items[0].received_at ? items[0].received_at : new Date().toISOString();
  return { host: "Mail.ru→Supabase", items: items, generated_at: generated_at, quotes: null, version: "" };
}

async function triggerMailruSync() {
  const sb = (typeof initSupabaseClient === "function") ? initSupabaseClient() : (window.__sb || null);
  if (!sb || !isLoggedIn()) return { skipped: true };
  try {
    const { data, error } = await sb.functions.invoke("mailru-sync", {
      body: { source: "pochta_refresh" }
    });
    if (error) return { ok: false, error: error.message || String(error) };
    return data || { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

async function refreshMailFeed(opts) {
  opts = opts || {};
  const setSt = (msg) => {
    window.__mailLastRefreshError = (msg && /не удалось|нет интернета|ошибка/i.test(msg)) ? msg : "";
    const text = msg || mailRefreshStatusText();
    const a = document.getElementById("mail-refresh-status");
    if (a) a.textContent = text;
    const b = document.getElementById("home-refresh-status");
    if (b) b.textContent = text;
  };
  const btns = [
    document.getElementById("btn-mail-refresh"),
    document.getElementById("btn-refresh-feed")
  ].filter(Boolean);
  for (const btn of btns) btn.disabled = true;
  setSt("Обновляю запросы…");
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new Error("Нет интернета");
    }
    let best = null, lastErr = null, syncInfo = null;
    // Manual refresh: ask Edge Function to pull Mail.ru (user JWT; function checks profiles)
    if (opts.manual || !opts.auto) {
      try {
        syncInfo = await triggerMailruSync();
      } catch (e) { /* non-fatal */ }
    }
    // Primary: authenticated mail_items from Supabase (direct Mail.ru sync)
    try {
      const live = await fetchMailItemsFromSupabase();
      if (live && Array.isArray(live.items) && live.items.length) {
        best = live;
      } else if (live && Array.isArray(live.items)) {
        // empty inbox still counts as success so we don't fall back to stale public feed only
        best = live;
      }
    } catch (e) { lastErr = e; }
    // Secondary: merge/keep existing public feed mirrors (app_updates / jsDelivr)
    const urls = updateMailSourceList();
    for (const url of urls) {
      try {
        const bundle = await fetchMailBundleFromUrl(url);
        if (!bundle || !Array.isArray(bundle.items) || !bundle.items.length) {
          throw new Error("пустая лента @ " + (bundle && bundle.host || "mirror"));
        }
        if (!best) best = bundle;
        else if (bundle.host !== "Mail.ru→Supabase") {
          // merge later via mergeMailFeed; keep denser legacy if live empty
          if (!best.items.length) best = bundle;
          else {
            // stash legacy items onto best for merge
            best = Object.assign({}, best, {
              items: (best.items || []).concat(bundle.items || []),
              quotes: best.quotes || bundle.quotes
            });
          }
        }
        if (bundle.host === "Supabase" && !(best && best.host === "Mail.ru→Supabase")) {
          best = bundle;
        }
      } catch (e) { lastErr = e; }
    }
    if (!best) throw lastErr || new Error("Не удалось скачать ленту запросов");
    if (syncInfo && syncInfo.error && !opts.auto) {
      window.__mailLastSyncHint = "синхронизация: " + String(syncInfo.error).slice(0, 120);
    } else if (syncInfo && syncInfo.ok === false && syncInfo.detail) {
      window.__mailLastSyncHint = "синхронизация: " + String(syncInfo.detail).slice(0, 120);
    } else {
      window.__mailLastSyncHint = "";
    }
    if (best.generated_at) window.__mailFeedGeneratedAt = best.generated_at;
    const added = typeof mergeMailFeed === "function" ? mergeMailFeed(best.items) : 0;
    let quotesAdded = 0;
    if (best.quotes && typeof mergeQuotesExtra === "function") {
      try { quotesAdded = mergeQuotesExtra(best.quotes); } catch (e) {}
    }
    window.__mailLastRefreshAt = new Date();
    window.__mailLastRefreshError = "";
    const hhmm = window.__mailLastRefreshAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
    let msg = "Обновлено: " + hhmm + " МСК · " + (best.host || "mirror");
    if (window.__mailFeedGeneratedAt) {
      try {
        const g = new Date(window.__mailFeedGeneratedAt);
        const gtxt = g.toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
        msg += " · данные: " + gtxt + " МСК";
      } catch (e) {
        msg += " · данные: " + String(window.__mailFeedGeneratedAt);
      }
    }
    if (added) msg += " · запросов +" + added;
    if (quotesAdded) msg += " · ставок +" + quotesAdded;
    setSt(msg);
    const isAuto = !!opts.auto;
    if (typeof toast === "function") {
      if (!isAuto) toast(added ? ("Новых запросов: " + added) : "Запросы обновлены");
      else if (added) toast("Новых запросов: " + added);
    }
    try { if (typeof updateHomeTabBadge === "function") updateHomeTabBadge(); } catch (e) {}
    if (!isAuto) {
      try { showTab(currentTab || "pochta"); } catch (e) {}
    } else if (added || quotesAdded) {
      if (currentTab === "pochta" || currentTab === "home") {
        try { showTab(currentTab); } catch (e) {}
      }
    }
    return { added, quotesAdded, generated_at: window.__mailFeedGeneratedAt || null, host: best.host };
  } catch (e) {
    const offline = (typeof navigator !== "undefined" && navigator.onLine === false);
    const msg = offline ? "Нет интернета — запросы не обновлены" : ("Не удалось обновить запросы" + (e && e.message ? (": " + e.message) : ""));
    window.__mailLastRefreshError = msg;
    setSt(msg);
    if (typeof toast === "function" && !opts.auto) toast(msg);
    return null;
  } finally {
    for (const btn of btns) btn.disabled = false;
  }
}
function ensureDeletedMail() {
  if (!DB.deleted_mail) DB.deleted_mail = [];
}
function isMailDeleted(id) {
  if (!id || !DB || !DB.deleted_mail || !DB.deleted_mail.length) return false;
  const s = String(id);
  return DB.deleted_mail.some(t => String((t && t.id) || t) === s);
}
function markMailDeleted(id) {
  if (!id) return;
  ensureDeletedMail();
  const s = String(id);
  if (!isMailDeleted(s)) DB.deleted_mail.push({ id: s, deleted_at: new Date().toISOString() });
  if (DB.mail_feed) DB.mail_feed = DB.mail_feed.filter(it => !it || String(it.id) !== s);
  saveStore(DB);
}
/* mail_items в Supabase доступен сотрудникам только на чтение (SELECT).
   Удаление — метка в общем хранилище app_data, чтобы обновление ленты не вернуло письмо. */
function deleteMailItem(id) {
  if (!id) return;
  const it = (DB.mail_feed || []).find(x => x && String(x.id) === String(id));
  const subj = it && it.subject ? String(it.subject) : "это письмо";
  if (!confirm("Удалить из списка?\n\n" + subj + "\n\nПисьмо скроется здесь и не вернётся при обновлении почты.")) return;
  markMailDeleted(id);
  try { markMailSeen(id); } catch (e) {}
  try { updateHomeTabBadge(); } catch (e) {}
  toast("Письмо убрано из списка");
  if (currentTab === "pochta") showTab("pochta");
}
function mergeMailFeed(items) {
  if (!Array.isArray(items) || !items.length) return 0;
  if (!DB.mail_feed) DB.mail_feed = [];
  ensureDeletedMail();
  const beforeN = DB.mail_feed.length;
  const kept = DB.mail_feed.filter(it => it && !isMailDeleted(it.id));
  const stripped = kept.length !== beforeN;
  if (stripped) DB.mail_feed = kept;
  const byId = {};
  for (const it of DB.mail_feed) if (it && it.id) byId[it.id] = it;
  let added = 0, updated = 0;
  const newIds = [];
  for (const raw of items) {
    if (!raw || !raw.id) continue;
    if (isMailDeleted(raw.id)) continue;
    const row = {
      id: String(raw.id),
      date: String(raw.date || "").slice(0, 10),
      time_msk: String(raw.time_msk || ""),
      received_at: String(raw.received_at || ""),
      type: String(raw.type || (raw.is_rate_request ? "запрос ставки" : "прочее")),
      source: String(raw.source || ""),
      company: String(raw.company || ""),
      subject: String(raw.subject || ""),
      route: String(raw.route || ""),
      container: String(raw.container || ""),
      weight: String(raw.weight || ""),
      rate: String(raw.rate || ""),
      summary: String(raw.summary || ""),
      is_rate_request: !!(raw.is_rate_request || raw.type === "запрос ставки"),
      from_email: String(raw.from_email || "")
    };
    // defensive: never keep forbidden keys
    if (byId[row.id]) {
      const prev = byId[row.id];
      let changed = false;
      for (const k of Object.keys(row)) {
        if (row[k] && row[k] !== prev[k]) { prev[k] = row[k]; changed = true; }
      }
      if (changed) updated++;
    } else {
      DB.mail_feed.push(row);
      byId[row.id] = row;
      added++;
      newIds.push(row.id);
    }
  }
  if (added || updated || stripped) {
    DB.mail_feed.sort((a, b) => {
      const ta = String(a.received_at || a.date || "");
      const tb = String(b.received_at || b.date || "");
      return tb.localeCompare(ta);
    });
    saveStore(DB);
  }
  try { notifyNewMailSound(newIds); } catch (e) {}
  return added;
}
function mailTypeOptions() {
  return ["", "запрос ставки", "заявка", "отклик перевозчика", "ставка рынка", "прочее"];
}
function filterMailItems(q, typ, src) {
  const qq = String(q || "").toLowerCase().trim();
  let items = (DB.mail_feed || []).filter(it => it && !isMailDeleted(it.id));
  if (typ) items = items.filter(it => it.type === typ);
  if (src) items = items.filter(it => it.source === src);
  if (qq) {
    items = items.filter(it => {
      const blob = [it.company, it.subject, it.route, it.container, it.summary, it.rate, it.weight]
        .join(" ").toLowerCase();
      return blob.indexOf(qq) >= 0;
    });
  }
  items.sort((a, b) => {
    const ta = String(a.received_at || a.date || "");
    const tb = String(b.received_at || b.date || "");
    return tb.localeCompare(ta);
  });
  return items;
}
function renderMailCard(it, seen) {
  const isNew = it.id && !seen[it.id];
  const isRate = !!(it.is_rate_request || it.type === "запрос ставки");
  let when = esc(fmtDate(it.date));
  if (it.time_msk) when += " " + esc(it.time_msk) + " МСК";
  else if (it.received_at) {
    try {
      const d = new Date(it.received_at);
      if (!isNaN(d.getTime())) {
        when = esc(d.toLocaleString("ru-RU", {
          timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit"
        })) + " МСК";
      }
    } catch (e) {}
  }
  return `<div class="card mail-item${isNew ? " is-new" : ""}${isRate ? " is-rate" : ""}" data-mail-id="${esc(it.id || "")}"${isRate ? ' style="border-left:3px solid #c45c26"' : ""}>
    <div class="mail-head">
      <strong>${when}</strong>
      <span class="chip${isRate ? " badge-new" : ""}">${esc(it.type || "")}</span>
      <span class="chip muted">${esc(it.source || "")}</span>
      ${isNew ? `<span class="chip badge-new">новое</span>` : ""}
      ${it.company ? `<span>${esc(it.company)}</span>` : ""}
      <button type="button" class="btn small ghost" data-mail-del="${esc(it.id || "")}" style="margin-left:auto;color:#b91c1c!important">Удалить</button>
    </div>
    <div class="mail-subj">${esc(it.subject || "без темы")}</div>
    <div class="muted">${esc(it.route || "")}${it.container ? " · " + esc(it.container) : ""}${it.weight ? " · " + esc(it.weight) : ""}</div>
    ${it.rate ? `<div><strong>${esc(it.rate)}</strong></div>` : ""}
    ${it.summary ? `<div class="muted">${esc(it.summary)}</div>` : ""}
    ${isNew ? `<button type="button" class="btn small ghost" data-mail-seen="${esc(it.id)}">отметить просмотренным</button>` : ""}
  </div>`;
}
function renderPochta() {
  const q = window._mailQ || "";
  const typ = window._mailType || "";
  const src = window._mailSrc || "";
  const seen = loadMailSeenIds();
  const items = filterMailItems(q, typ, src);
  const typeOpts = mailTypeOptions().map(t =>
    `<option value="${esc(t)}" ${t === typ ? "selected" : ""}>${t ? esc(t) : "Все типы"}</option>`
  ).join("");
  return `<h1>Почта</h1>
  <div class="warn-box">Почта подтягивается напрямую из Mail.ru в ваш Supabase (для вошедших сотрудников). Публичная лента обновлений по-прежнему без телефонов, ФИО и реквизитов.</div>
  <div class="card">
    <div class="row">
      <div class="field wide"><label>Поиск</label>
        <input id="mail-q" type="search" value="${esc(q)}" placeholder="компания, маршрут, контейнер…"></div>
      <div class="field"><label>Тип</label><select id="mail-type">${typeOpts}</select></div>
      <div class="field"><label>Источник</label>
        <select id="mail-src">
          <option value="" ${!src ? "selected" : ""}>Все</option>
          <option value="почта" ${src === "почта" ? "selected" : ""}>почта</option>
          <option value="MAX" ${src === "MAX" ? "selected" : ""}>MAX</option>
        </select></div>
    </div>
    <div class="toolbar">
      <button type="button" class="btn secondary" id="btn-mail-refresh" title="Подтянуть свежие запросы">⟳ Обновить</button>
      <button type="button" class="btn ghost" id="btn-mail-seen-all">Отметить все просмотренными</button>
      <button type="button" class="btn ghost" id="btn-mail-sound-toggle" title="Звук при новых запросах">🔔 Звук: ${isMailSoundEnabled() ? "вкл" : "выкл"}</button>
      <button type="button" class="btn ghost" id="btn-mail-sound-test" title="Проверить звук уведомления">Проверить звук</button>
      <span class="muted" id="mail-count">Показано: ${items.length}</span>
    </div>
    <div class="muted" id="mail-refresh-status">${esc(mailRefreshStatusText())}</div>
    <div class="muted" id="mail-sound-hint" style="margin-top:4px">${esc(window.__mailSoundHint || "")}</div>
    <p class="muted" style="margin:6px 0 0;font-size:0.9em">Автообновление каждые ~2 мин, пока вкладка открыта. «⟳ Обновить» также запускает синхронизацию с Mail.ru.</p>
  </div>
  <div id="mail-list">${items.length ? items.map(it => renderMailCard(it, seen)).join("") : `<p class="muted">Ничего не найдено</p>`}</div>`;
}
function bindMailSeenButtons(root) {
  (root || document).querySelectorAll("[data-mail-seen]").forEach(b => {
    b.onclick = () => {
      markMailSeen(b.dataset.mailSeen);
      updateHomeTabBadge();
      if (currentTab === "pochta") showTab("pochta");
    };
  });
}
function bindHomeFeedHandlers() {
  const r = document.getElementById("btn-refresh-feed");
  if (r) r.onclick = () => {
    if (typeof refreshMailFeed === "function") refreshMailFeed({ manual: true });
    else if (typeof checkForUpdates === "function") checkForUpdates({ manual: true });
    else toast("Обновление недоступно офлайн");
  };
  const a = document.getElementById("btn-mark-all-seen");
  if (a) a.onclick = () => {
    markAllMailSeen((DB.mail_feed || []).map(x => x.id));
    updateHomeTabBadge();
    showTab("pochta");
  };
  bindMailSeenButtons(document.getElementById("home-feed"));
}
function bindPochtaHandlers() {
  const apply = () => {
    window._mailQ = (document.getElementById("mail-q") || {}).value || "";
    window._mailType = (document.getElementById("mail-type") || {}).value || "";
    window._mailSrc = (document.getElementById("mail-src") || {}).value || "";
    showTab("pochta");
  };
  const q = document.getElementById("mail-q");
  if (q) {
    let timer = null;
    q.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(apply, 250);
    });
    q.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); apply(); } });
  }
  const typ = document.getElementById("mail-type");
  if (typ) typ.onchange = apply;
  const src = document.getElementById("mail-src");
  if (src) src.onchange = apply;
  const ref = document.getElementById("btn-mail-refresh");
  if (ref) ref.onclick = () => {
    if (typeof refreshMailFeed === "function") refreshMailFeed({ manual: true });
    else if (typeof checkForUpdates === "function") checkForUpdates({ manual: true });
  };
  const all = document.getElementById("btn-mail-seen-all");
  if (all) all.onclick = () => {
    markAllMailSeen((DB.mail_feed || []).map(x => x.id));
    updateHomeTabBadge();
    showTab("pochta");
  };
  const snd = document.getElementById("btn-mail-sound-toggle");
  if (snd) snd.onclick = () => {
    setMailSoundEnabled(!isMailSoundEnabled());
    showTab("pochta");
  };
  const test = document.getElementById("btn-mail-sound-test");
  if (test) test.onclick = () => {
    playMailNotifySound().then(() => {
      if (typeof toast === "function") toast("Звук уведомления работает");
    }).catch(() => {
      if (typeof toast === "function") toast("Разрешите звук: нажмите по странице и повторите");
    });
  };
  bindMailSeenButtons(document.getElementById("mail-list"));
  bindMailDeleteButtons(document.getElementById("mail-list"));
}
function bindMailDeleteButtons(root) {
  (root || document).querySelectorAll("[data-mail-del]").forEach(b => {
    b.onclick = () => deleteMailItem(b.getAttribute("data-mail-del"));
  });
}

function startMailAutoRefresh() {
  try { seedMailSoundKnownFromFeed(); } catch (e) {}
  try { updateHomeTabBadge(); } catch (e) {}
  if (window.__mailAutoRefreshTimer) return;
  window.__mailAutoRefreshTimer = setInterval(() => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (typeof refreshMailFeed === "function") refreshMailFeed({ auto: true });
  }, MAIL_AUTO_REFRESH_MS);
}
/* startMailAutoRefresh: after login via bootCloudAuth */

/* === Cloud: Supabase auth, shared store sync, chat (v1.0.8) === */
const SUPABASE_URL = "https://vourhkrahnbuugwfdgmt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvdXJoa3JhaG5idXVnd2ZkZ210Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2ODM2NjIsImV4cCI6MjEwOTI1OTY2Mn0._4KCTFhpI6SG1UljKQWaKHtBiPnnyXC83ZVEUKyqoZY";
const CLOUD_STORE_KEY = "store";
const CHAT_UNREAD_KEY = "ip_kasyanov_chat_unread_v1";

window.__sb = null;
window.__sbSession = null;
window.__sbProfile = null;
window.__sbProfiles = [];
window.__cloudReady = false;
window.__cloudOffline = false;
window.__syncTimer = null;
window.__syncing = false;
window.__ignoreRemoteStoreUntil = 0;
window.__chatChannel = "general";
window.__chatMessages = [];
window.__chatSub = null;
window.__storeSub = null;

/* Old HTML shells: inject Supabase (RU-reachable) + jsDelivr ahead of raw.githubusercontent.
   Do not `const SUPABASE_UPDATE_REST` here — 1.1.1+ shells already declare it (would throw and blank the app). */
function getSupabaseUpdateRestUrl() {
  try {
    if (typeof SUPABASE_UPDATE_REST === "string" && SUPABASE_UPDATE_REST) return SUPABASE_UPDATE_REST;
  } catch (e) {}
  try {
    if (typeof window !== "undefined" && typeof window.SUPABASE_UPDATE_REST === "string" && window.SUPABASE_UPDATE_REST) {
      return window.SUPABASE_UPDATE_REST;
    }
  } catch (e) {}
  return "https://vourhkrahnbuugwfdgmt.supabase.co/rest/v1/app_updates?id=eq.current&select=*";
}
function preferUpdateMirrors() {
  try {
    const sb = getSupabaseUpdateRestUrl();
    const jsd = "https://cdn.jsdelivr.net/gh/kasianov992-debug/kasyanov-app-updates@main/updates/manifest.json";
    if (typeof UPDATE_URLS !== "undefined" && Array.isArray(UPDATE_URLS)) {
      if (UPDATE_URLS.indexOf(jsd) < 0) UPDATE_URLS.unshift(jsd);
      if (UPDATE_URLS.indexOf(sb) < 0) UPDATE_URLS.unshift(sb);
    }
    if (typeof UPDATE_URL === "undefined" || !UPDATE_URL) {
      try { window.UPDATE_URL = sb; } catch (e) {}
    }
  } catch (e) {}
}
preferUpdateMirrors();


function getSupabaseLib() {
  return (window.supabase && window.supabase.createClient) ? window.supabase : null;
}


const SUPABASE_JS_URLS = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js",
  "https://unpkg.com/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js"
];

function loadScriptOnce(url, timeoutMs) {
  timeoutMs = timeoutMs || 8000;
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-sb-cdn="' + url + '"]');
    if (existing && getSupabaseLib()) { resolve(); return; }
    const s = document.createElement("script");
    s.src = url;
    s.async = true;
    s.dataset.sbCdn = url;
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      s.remove();
      reject(new Error("timeout " + url));
    }, timeoutMs);
    s.onload = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    s.onerror = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      s.remove();
      reject(new Error("load_failed " + url));
    };
    document.head.appendChild(s);
  });
}

async function ensureSupabaseJs() {
  if (getSupabaseLib()) return true;
  let lastErr = null;
  for (const url of SUPABASE_JS_URLS) {
    try {
      await loadScriptOnce(url, 8000);
      if (getSupabaseLib()) return true;
      lastErr = new Error("loaded but no window.supabase: " + url);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("supabase-js unavailable");
}


function initSupabaseClient() {
  const lib = getSupabaseLib();
  if (!lib) return null;
  if (!window.__sb) {
    window.__sb = lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return window.__sb;
}

function isLoggedIn() {
  return !!(window.__sbSession && window.__sbSession.user);
}

function isOwner() {
  return !!(window.__sbProfile && window.__sbProfile.role === "owner");
}

function setLoginError(msg) {
  const el = document.getElementById("login-error");
  if (el) el.textContent = msg || "";
}

function showLoginScreen(show) {
  const overlay = document.getElementById("login-overlay");
  const shell = document.querySelector(".app-shell");
  if (overlay) overlay.hidden = !show;
  if (shell) shell.style.visibility = show ? "hidden" : "visible";
  document.body.classList.toggle("login-mode", !!show);
}

function updateUserChip() {
  const el = document.getElementById("user-chip");
  if (!el) return;
  if (!isLoggedIn()) {
    el.textContent = "";
    el.hidden = true;
    return;
  }
  const name = (window.__sbProfile && window.__sbProfile.display_name) ||
    (window.__sbSession.user.email || "пользователь");
  const role = window.__sbProfile && window.__sbProfile.role === "owner" ? "владелец" : "сотрудник";
  el.hidden = false;
  el.textContent = name + " · " + role;
}

async function loadProfile() {
  const sb = initSupabaseClient();
  if (!sb || !isLoggedIn()) return null;
  const uid = window.__sbSession.user.id;
  const { data, error } = await sb.from("profiles").select("id, display_name, role").eq("id", uid).maybeSingle();
  if (error) throw error;
  window.__sbProfile = data || null;
  return data;
}

async function loadAllProfiles() {
  const sb = initSupabaseClient();
  if (!sb || !isLoggedIn()) return [];
  const { data, error } = await sb.from("profiles").select("id, display_name, role").order("display_name");
  if (error) throw error;
  window.__sbProfiles = data || [];
  return window.__sbProfiles;
}

function scheduleCloudSave() {
  if (!isLoggedIn() || window.__cloudOffline) return;
  if (window.__syncTimer) clearTimeout(window.__syncTimer);
  window.__syncTimer = setTimeout(() => { pushStoreToCloud().catch(() => {}); }, 800);
}

const _origSaveStore = typeof saveStore === "function" ? saveStore : null;
function saveStore(d) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch (e) {}
  scheduleCloudSave();
}

async function pushStoreToCloud() {
  const sb = initSupabaseClient();
  if (!sb || !isLoggedIn() || window.__syncing) return;
  window.__syncing = true;
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (!value) return;
    window.__ignoreRemoteStoreUntil = Date.now() + 1500;
    const { error } = await sb.from("app_data").upsert({
      key: CLOUD_STORE_KEY,
      value,
      updated_by: window.__sbSession.user.id,
    });
    if (error) throw error;
  } catch (e) {
    console.warn("cloud push failed", e);
  } finally {
    window.__syncing = false;
  }
}

async function pullStoreFromCloud(opts) {
  opts = opts || {};
  const sb = initSupabaseClient();
  if (!sb || !isLoggedIn()) return { ok: false, reason: "no_session" };
  try {
    const { data, error } = await sb.from("app_data").select("key, value, updated_at").eq("key", CLOUD_STORE_KEY).maybeSingle();
    if (error) throw error;
    if (!data || !data.value || typeof data.value !== "object") {
      // Seed cloud from local once
      const localRaw = localStorage.getItem(STORE_KEY);
      if (localRaw) {
        await pushStoreToCloud();
        return { ok: true, seeded: true };
      }
      return { ok: true, empty: true };
    }
    const cloud = data.value;
    if (!cloud.carriers) return { ok: false, reason: "bad_shape" };
    window.__ignoreRemoteStoreUntil = Date.now() + 1500;
    DB = cloud;
    if (!DB.deleted_zayavki) DB.deleted_zayavki = [];
    if (!DB.deleted_trips) DB.deleted_trips = [];
    if (!DB.deleted_mail) DB.deleted_mail = [];
    if (!DB.mail_feed) DB.mail_feed = [];
    if (!DB.mail_seen) DB.mail_seen = [];
    if (!DB.quotes_extra) DB.quotes_extra = [];
    if (!DB.rolis) DB.rolis = { byKey: {}, cards: [] };
    if (!DB.rolis.byKey) DB.rolis.byKey = {};
    if (!Array.isArray(DB.rolis.cards)) DB.rolis.cards = [];
    try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } catch (e) {}
    try { applyVersionedImports(); } catch (e) {}
    if (opts.rerender !== false) {
      try { showTab(currentTab || "pochta"); } catch (e) {}
    }
    return { ok: true, pulled: true, updated_at: data.updated_at };
  } catch (e) {
    console.warn("cloud pull failed", e);
    return { ok: false, reason: String(e && e.message || e) };
  }
}

function subscribeStoreRealtime() {
  const sb = initSupabaseClient();
  if (!sb || !isLoggedIn()) return;
  if (window.__storeSub) {
    try { sb.removeChannel(window.__storeSub); } catch (e) {}
    window.__storeSub = null;
  }
  window.__storeSub = sb.channel("app_data_store")
    .on("postgres_changes", { event: "*", schema: "public", table: "app_data", filter: "key=eq.store" }, (payload) => {
      if (Date.now() < window.__ignoreRemoteStoreUntil) return;
      const row = payload.new || payload.old;
      if (!row || !row.value || !row.value.carriers) return;
      if (row.updated_by && window.__sbSession && row.updated_by === window.__sbSession.user.id) return;
      DB = row.value;
      if (!DB.deleted_mail) DB.deleted_mail = [];
      if (!DB.mail_feed) DB.mail_feed = [];
      if (!DB.rolis || typeof DB.rolis !== "object") DB.rolis = { byKey: {}, cards: [] };
      if (!DB.rolis.byKey) DB.rolis.byKey = {};
      if (!Array.isArray(DB.rolis.cards)) DB.rolis.cards = [];
      try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } catch (e) {}
      try { showTab(currentTab || "pochta"); } catch (e) {}
      try { toast("Данные обновлены с облака"); } catch (e) {}
    })
    .subscribe();
}

function dmChannelFor(otherId) {
  const me = window.__sbSession && window.__sbSession.user && window.__sbSession.user.id;
  if (!me || !otherId) return null;
  const a = [me, otherId].sort();
  return "dm:" + a[0] + ":" + a[1];
}

function loadChatUnreadMap() {
  try { return JSON.parse(localStorage.getItem(CHAT_UNREAD_KEY) || "{}") || {}; } catch (e) { return {}; }
}
function saveChatUnreadMap(m) {
  try { localStorage.setItem(CHAT_UNREAD_KEY, JSON.stringify(m || {})); } catch (e) {}
}
function bumpChatUnread(channel) {
  if (!channel || channel === window.__chatChannel && currentTab === "chat") return;
  const m = loadChatUnreadMap();
  m[channel] = (m[channel] || 0) + 1;
  saveChatUnreadMap(m);
  updateChatTabBadge();
}
function clearChatUnread(channel) {
  const m = loadChatUnreadMap();
  if (m[channel]) { delete m[channel]; saveChatUnreadMap(m); }
  updateChatTabBadge();
}
function totalChatUnread() {
  const m = loadChatUnreadMap();
  let n = 0;
  for (const k of Object.keys(m)) n += Number(m[k]) || 0;
  return n;
}
function updateChatTabBadge() {
  const btn = document.querySelector('#nav button[data-tab="chat"]');
  const n = totalChatUnread();
  if (btn) btn.textContent = n > 0 ? ("Чат (" + n + ")") : "Чат";
}

async function loadChatMessages(channel) {
  const sb = initSupabaseClient();
  if (!sb || !isLoggedIn()) return [];
  const { data, error } = await sb.from("chat_messages")
    .select("id, channel, sender_id, body, created_at")
    .eq("channel", channel)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw error;
  window.__chatMessages = data || [];
  return window.__chatMessages;
}

async function sendChatMessage(text) {
  const sb = initSupabaseClient();
  if (!sb || !isLoggedIn()) throw new Error("no_session");
  const body = String(text || "").trim();
  if (!body) return;
  const { error } = await sb.from("chat_messages").insert({
    channel: window.__chatChannel || "general",
    sender_id: window.__sbSession.user.id,
    body,
  });
  if (error) throw error;
}

function subscribeChatRealtime() {
  const sb = initSupabaseClient();
  if (!sb || !isLoggedIn()) return;
  if (window.__chatSub) {
    try { sb.removeChannel(window.__chatSub); } catch (e) {}
    window.__chatSub = null;
  }
  window.__chatSub = sb.channel("chat_messages_all")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
      const row = payload.new;
      if (!row) return;
      if (row.channel === window.__chatChannel) {
        window.__chatMessages = (window.__chatMessages || []).concat([row]);
        if (currentTab === "chat") {
          try { renderChatMessagesIntoDom(); } catch (e) {}
          clearChatUnread(row.channel);
        } else {
          bumpChatUnread(row.channel);
          try { playMailNotifySound().catch(() => {}); } catch (e) {}
        }
      } else {
        bumpChatUnread(row.channel);
        if (currentTab !== "chat") {
          try { playMailNotifySound().catch(() => {}); } catch (e) {}
        } else {
          updateChatTabBadge();
        }
      }
    })
    .subscribe();
}

function profileName(id) {
  const p = (window.__sbProfiles || []).find(x => x.id === id);
  if (p && p.display_name) return p.display_name;
  if (window.__sbSession && window.__sbSession.user && window.__sbSession.user.id === id) return "Вы";
  return (id || "").slice(0, 8);
}

function renderChatMessagesIntoDom() {
  const box = document.getElementById("chat-messages");
  if (!box) return;
  const me = window.__sbSession && window.__sbSession.user && window.__sbSession.user.id;
  const rows = window.__chatMessages || [];
  box.innerHTML = rows.map(m => {
    const mine = m.sender_id === me;
    const t = m.created_at ? new Date(m.created_at).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "";
    return `<div class="chat-bubble${mine ? " mine" : ""}">
      <div class="chat-meta">${esc(profileName(m.sender_id))} · ${esc(t)} МСК</div>
      <div class="chat-text">${esc(m.body)}</div>
    </div>`;
  }).join("") || `<p class="muted">Пока нет сообщений</p>`;
  box.scrollTop = box.scrollHeight;
}

function renderChat() {
  const profiles = window.__sbProfiles || [];
  const me = window.__sbSession && window.__sbSession.user && window.__sbSession.user.id;
  const others = profiles.filter(p => p.id !== me);
  const ch = window.__chatChannel || "general";
  let side = `<button type="button" class="chat-chan${ch === "general" ? " active" : ""}" data-chat-ch="general">Общий</button>`;
  for (const p of others) {
    const c = dmChannelFor(p.id);
    const unread = loadChatUnreadMap()[c] || 0;
    side += `<button type="button" class="chat-chan${ch === c ? " active" : ""}" data-chat-ch="${esc(c)}">${esc(p.display_name || "Сотрудник")}${unread ? ` <span class="chip badge-new">${unread}</span>` : ""}</button>`;
  }
  let staffHtml = "";
  if (isOwner()) {
    const list = profiles.map(p =>
      `<div class="src"><strong>${esc(p.display_name || "")}</strong> · ${p.role === "owner" ? "владелец" : "сотрудник"} · <span class="mono">${esc((p.id || "").slice(0, 8))}</span></div>`
    ).join("") || `<p class="muted">Пока только вы</p>`;
    staffHtml = `<div class="card" style="margin-top:16px">
      <h2>Сотрудники</h2>
      ${list}
      <div class="toolbar" style="margin-top:10px">
        <div class="field"><label>Email</label><input id="staff-email" type="email" placeholder="email@example.com"></div>
        <div class="field"><label>Имя</label><input id="staff-name" type="text" placeholder="Имя"></div>
        <div class="field"><label>Пароль</label><input id="staff-pass" type="password" placeholder="мин. 8 символов"></div>
        <button type="button" class="btn" id="btn-create-staff">Создать сотрудника</button>
      </div>
      <p class="muted">Создание идёт через защищённую функцию (без service-ключа в программе).</p>
    </div>`;
  }
  return `<h1>Чат</h1>
  <div class="chat-layout">
    <div class="card chat-side">${side}</div>
    <div class="card chat-main">
      <div id="chat-messages" class="chat-messages"></div>
      <div class="chat-compose">
        <input id="chat-input" type="text" maxlength="4000" placeholder="Сообщение…">
        <button type="button" class="btn" id="btn-chat-send">Отправить</button>
      </div>
    </div>
  </div>
  ${staffHtml}`;
}

function bindChatHandlers() {
  document.querySelectorAll("[data-chat-ch]").forEach(b => {
    b.onclick = async () => {
      window.__chatChannel = b.dataset.chatCh;
      clearChatUnread(window.__chatChannel);
      showTab("chat");
    };
  });
  const send = async () => {
    const inp = document.getElementById("chat-input");
    const text = inp ? inp.value : "";
    try {
      await sendChatMessage(text);
      if (inp) inp.value = "";
      await loadChatMessages(window.__chatChannel);
      renderChatMessagesIntoDom();
    } catch (e) {
      toast("Не удалось отправить: " + (e.message || e));
    }
  };
  const btn = document.getElementById("btn-chat-send");
  if (btn) btn.onclick = send;
  const inp = document.getElementById("chat-input");
  if (inp) inp.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); send(); }
  });
  const createBtn = document.getElementById("btn-create-staff");
  if (createBtn) createBtn.onclick = async () => {
    const email = (document.getElementById("staff-email") || {}).value || "";
    const name = (document.getElementById("staff-name") || {}).value || "";
    const pass = (document.getElementById("staff-pass") || {}).value || "";
    try {
      const sb = initSupabaseClient();
      const { data, error } = await sb.functions.invoke("create-staff-user", {
        body: { email, password: pass, display_name: name, role: "staff" },
      });
      if (error) throw error;
      if (data && data.error) throw new Error(data.detail || data.error);
      toast("Сотрудник создан");
      await loadAllProfiles();
      showTab("chat");
    } catch (e) {
      toast("Ошибка: " + (e.message || e));
    }
  };
  loadChatMessages(window.__chatChannel || "general").then(() => {
    renderChatMessagesIntoDom();
    clearChatUnread(window.__chatChannel || "general");
  }).catch(e => toast("Чат недоступен: " + (e.message || e)));
}

async function doLogout() {
  const sb = initSupabaseClient();
  try {
    if (sb) await sb.auth.signOut();
  } catch (e) {}
  window.__sbSession = null;
  window.__sbProfile = null;
  showLoginScreen(true);
  setLoginError("");
  updateUserChip();
}

async function afterLoginSuccess() {
  setLoginError("");
  showLoginScreen(false);
  updateUserChip();
  try {
    await loadProfile();
    if (!window.__sbProfile) {
      setLoginError("Нет доступа: аккаунт не добавлен владельцем. Обратитесь к Константину.");
      await doLogout();
      return;
    }
    updateUserChip();
    await loadAllProfiles();
    const pull = await pullStoreFromCloud({ rerender: false });
    if (!pull.ok && pull.reason) {
      window.__cloudOffline = true;
      toast("Облако недоступно — работаю с локальной копией (только чтение облака)");
    } else {
      window.__cloudOffline = false;
    }
    subscribeStoreRealtime();
    subscribeChatRealtime();
    updateChatTabBadge();
    if (!handleHash()) showTab("pochta");
    try { startMailAutoRefresh(); } catch (e) {}
  } catch (e) {
    console.error(e);
    setLoginError("Ошибка загрузки профиля: " + (e.message || e));
    showLoginScreen(true);
  }
}

async function doLogin(email, password) {
  setLoginError("");
  try {
    await ensureSupabaseJs();
  } catch (e) {
    setLoginError("Не удалось загрузить библиотеку входа (CDN). Проверьте интернет или откройте офлайн.");
    return;
  }
  const sb = initSupabaseClient();
  if (!sb) {
    setLoginError("Не удалось загрузить библиотеку входа. Проверьте интернет и обновите страницу.");
    return;
  }
  try {
    const { data, error } = await sb.auth.signInWithPassword({
      email: String(email || "").trim(),
      password: String(password || ""),
    });
    if (error) throw error;
    window.__sbSession = data.session;
    await afterLoginSuccess();
  } catch (e) {
    const msg = String(e && e.message || e);
    if (/fetch|network|Failed to fetch|Load failed|timeout/i.test(msg)) {
      setLoginError("Сервер недоступен (возможно, блокировка или медленный интернет). Можно открыть локальную копию без входа — только просмотр.");
    } else {
      setLoginError("Неверный логин или пароль");
    }
  }
}

function bindLoginUi() {
  const form = document.getElementById("login-form");
  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault();
      const email = (document.getElementById("login-email") || {}).value;
      const pass = (document.getElementById("login-password") || {}).value;
      doLogin(email, pass);
    };
  }
  const offline = document.getElementById("btn-offline-local");
  if (offline) offline.onclick = () => {
    window.__cloudOffline = true;
    window.__sbSession = null;
    showLoginScreen(false);
    updateUserChip();
    toast("Офлайн: только локальные данные, без синхронизации и чата");
    if (!handleHash()) showTab("pochta");
  };
  const out = document.getElementById("btn-logout");
  if (out) out.onclick = () => { doLogout(); };
}

async function bootCloudAuth() {
  bindLoginUi();
  showLoginScreen(true);
  try {
    await ensureSupabaseJs();
  } catch (e) {
    setLoginError("Не удалось загрузить библиотеку входа (CDN). Проверьте интернет или откройте офлайн.");
    return;
  }
  const sb = initSupabaseClient();
  if (!sb) {
    setLoginError("Нет связи с сервером входа. Проверьте интернет или откройте офлайн.");
    return;
  }
  try {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    if (data && data.session) {
      window.__sbSession = data.session;
      await afterLoginSuccess();
    } else {
      showLoginScreen(true);
    }
    sb.auth.onAuthStateChange((event, session) => {
      window.__sbSession = session;
      if (!session) {
        showLoginScreen(true);
        updateUserChip();
      }
    });
  } catch (e) {
    const msg = String(e && e.message || e);
    if (/fetch|network|Failed to fetch|Load failed|timeout/i.test(msg)) {
      setLoginError("Сервер недоступен. Можно работать офлайн с локальной копией.");
    } else {
      setLoginError("Ошибка входа: " + msg);
    }
    showLoginScreen(true);
  }
}

window.bootCloudAuth = bootCloudAuth;
window.renderChat = renderChat;
window.bindChatHandlers = bindChatHandlers;
window.doLogout = doLogout;
window.saveStore = saveStore;
window.updateChatTabBadge = updateChatTabBadge;


/* === Update sources 1.1.3: Supabase REST (no query bust) + jsDelivr + raw, parallel, highest version === */
function isSupabaseUpdateUrl(url) {
  return /\/rest\/v1\/app_updates/i.test(String(url || ""));
}
function updateHostLabel(url) {
  try {
    const u = new URL(url);
    if (isSupabaseUpdateUrl(url)) return "Supabase";
    if (u.hostname.indexOf("jsdelivr") >= 0) return "jsDelivr";
    if (u.hostname.indexOf("githubusercontent") >= 0) return "GitHub raw";
    return u.hostname;
  } catch (e) { return String(url || "").slice(0, 40); }
}
async function fetchUpdateText(url, headers) {
  const host = updateHostLabel(url);
  // PostgREST treats unknown query params as column filters → HTTP 400.
  // Never append cache-bust params to Supabase REST URLs; cache:"no-store" is enough.
  const bust = isSupabaseUpdateUrl(url)
    ? url
    : (url + (String(url).indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now());
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const ms = (typeof UPDATE_FETCH_TIMEOUT_MS === "number" ? UPDATE_FETCH_TIMEOUT_MS : 8000);
  const timer = setTimeout(() => { try { if (ctrl) ctrl.abort(); } catch (e) {} }, ms);
  try {
    const r = await fetch(bust, {
      cache: "no-store",
      mode: "cors",
      signal: ctrl ? ctrl.signal : undefined,
      headers: headers || undefined
    });
    if (!r.ok) throw new Error("HTTP " + r.status + " @ " + host);
    return await r.text();
  } catch (e) {
    const name = (e && e.name) || "";
    const msg = String((e && e.message) || e);
    if (name === "AbortError" || msg.indexOf("timeout") >= 0) throw new Error("timeout @ " + host);
    throw new Error(msg + (msg.indexOf(host) >= 0 ? "" : (" @ " + host)));
  } finally {
    clearTimeout(timer);
  }
}
function supabaseUpdateHeaders() {
  const key = (typeof SUPABASE_ANON_KEY === "string" && SUPABASE_ANON_KEY) ? SUPABASE_ANON_KEY : "";
  return {
    apikey: key,
    Authorization: "Bearer " + key,
    Accept: "application/json"
  };
}
function manifestFromSupabaseRow(row) {
  if (!row) throw new Error("empty supabase row");
  const base = (row.manifest && typeof row.manifest === "object") ? JSON.parse(JSON.stringify(row.manifest)) : {};
  base.version = String(row.version || base.version || "");
  base.code = Object.assign({}, base.code || {});
  // Inline columns win; strip URL fields so applyManifest does not re-fetch GitHub
  if (row.js) {
    base.code.js = row.js;
    delete base.code.js_url;
  }
  if (row.css) {
    base.code.css = row.css;
    delete base.code.css_url;
  }
  const mail = row.mail;
  const quotes = row.quotes;
  base.data = Object.assign({}, base.data || {});
  if (mail != null) {
    if (Array.isArray(mail)) base.data.mail_inline = mail;
    else if (mail && Array.isArray(mail.items)) base.data.mail_inline = mail.items;
    if (mail && mail.generated_at) base.data.mail_generated_at = mail.generated_at;
    delete base.data.mail_url;
    delete base.data.mail;
  }
  if (quotes != null) {
    if (Array.isArray(quotes)) base.data.quotes_inline = quotes;
    else if (quotes && Array.isArray(quotes.quotes)) base.data.quotes_inline = quotes.quotes;
    delete base.data.quotes_url;
    delete base.data.quotes;
  }
  return base;
}
async function fetchUpdateCandidate(url) {
  const host = updateHostLabel(url);
  if (isSupabaseUpdateUrl(url)) {
    const text = await fetchUpdateText(url, supabaseUpdateHeaders());
    const data = JSON.parse(text);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("no row @ " + host);
    const manifest = manifestFromSupabaseRow(row);
    if (row.mail && row.mail.generated_at) window.__mailFeedGeneratedAt = row.mail.generated_at;
    return { url: url, host: host, version: String(manifest.version || ""), manifest: manifest, source: "supabase" };
  }
  const text = await fetchUpdateText(url);
  const manifest = JSON.parse(text);
  return { url: url, host: host, version: String(manifest.version || ""), manifest: manifest, source: "manifest" };
}
function updateUrlListAll() {
  const list = [];
  try {
    list.push(getSupabaseUpdateRestUrl());
  } catch (e) {}
  if (typeof UPDATE_URLS !== "undefined" && Array.isArray(UPDATE_URLS)) {
    for (const u of UPDATE_URLS) if (u) list.push(u);
  }
  if (typeof UPDATE_URL === "string" && UPDATE_URL) list.push(UPDATE_URL);
  const seen = {};
  const out = [];
  for (const u of list) {
    if (!u || seen[u]) continue;
    seen[u] = 1;
    out.push(u);
  }
  return out;
}
async function checkForUpdatesAllSources(opts) {
  opts = opts || {};
  // Prefer shell helpers when present
  const setStatus = (typeof setUpdateStatus === "function") ? setUpdateStatus : function () {};
  const setVer = (typeof setVersionLabel === "function") ? setVersionLabel : function () {};
  const cmp = (typeof cmpVer === "function") ? cmpVer : function (a, b) {
    const aa = String(a || "0").split(/[^\d]+/).filter(Boolean).map(n => parseInt(n, 10) || 0);
    const bb = String(b || "0").split(/[^\d]+/).filter(Boolean).map(n => parseInt(n, 10) || 0);
    const n = Math.max(aa.length, bb.length);
    for (let i = 0; i < n; i++) {
      const x = aa[i] || 0, y = bb[i] || 0;
      if (x > y) return 1;
      if (x < y) return -1;
    }
    return 0;
  };
  const btn = document.getElementById("btn-update");
  if (btn) btn.disabled = true;
  setVer();
  setStatus(opts.manual ? "Проверяю обновления…" : "Проверка обновлений…", "");
  try {
    const urls = updateUrlListAll();
    if (!urls.length) {
      setStatus("Источник обновлений не задан", "warn");
      return;
    }
    const settled = await Promise.all(urls.map(u =>
      fetchUpdateCandidate(u).then(
        c => ({ ok: true, c: c }),
        e => ({ ok: false, url: u, host: updateHostLabel(u), msg: String((e && e.message) || e) })
      )
    ));
    const ok = settled.filter(x => x.ok).map(x => x.c);
    const errors = settled.filter(x => !x.ok).map(x => ({ host: x.host, msg: x.msg }));
    if (!ok.length) {
      const offline = (typeof navigator !== "undefined" && navigator.onLine === false);
      const detail = errors.map(e => e.host + ": " + e.msg).join("; ");
      const msg = offline
        ? "Нет интернета — работаю офлайн"
        : ("Сервер обновлений недоступен — попробуйте позже. " + detail);
      setStatus(msg, "warn");
      if (opts.manual && typeof toast === "function") toast(msg);
      return;
    }
    ok.sort((a, b) => cmp(b.version, a.version));
    const best = ok[0];
    if (typeof applyManifest !== "function") {
      throw new Error("applyManifest недоступен");
    }
    // For Supabase, manifest already has inline js/css/mail/quotes — applyManifest uses them
    const result = await applyManifest(best.manifest, best.url);
    result.usedHost = best.host;
    setVer();
    if (result.codeUpdated) {
      const msg = "Обновлено до " + result.remoteVer + " (" + (best.host || best.source || "mirror") + ") — перезагрузка…";
      setStatus(msg, "ok");
      if (typeof toast === "function") toast(msg);
      setTimeout(() => location.reload(), 600);
      return;
    }
    if (cmp(result.remoteVer, result.cur) <= 0) {
      const bits = [];
      if (result.quotesAdded) bits.push("ставок +" + result.quotesAdded);
      if (result.mailAdded) bits.push("почта +" + result.mailAdded);
      const extra = bits.length ? (" · " + bits.join(" · ")) : "";
      const msg = "У вас последняя версия " + result.cur + extra + " · " + (best.host || best.source || "mirror");
      setStatus(msg, "ok");
      if (opts.manual && typeof toast === "function") toast(msg);
    } else {
      const msg = "Обновлено до " + result.remoteVer + " (данные · " + (best.host || best.source || "mirror") + ")";
      setStatus(msg, "ok");
      if (opts.manual && typeof toast === "function") toast(msg);
    }
    if (opts.manual) {
      try { window.__mailLastRefreshAt = new Date(); } catch (e) {}
    }
    if (opts.manual || result.quotesAdded || result.mailAdded || (result.importSummary && result.importSummary.length)) {
      try { if (typeof updateHomeTabBadge === "function") updateHomeTabBadge(); } catch (e) {}
      try { if (typeof showTab === "function") showTab(currentTab || "pochta"); } catch (e) {}
    }
    try {
      if (typeof UPDATE_CHECK_KEY === "string") localStorage.setItem(UPDATE_CHECK_KEY, new Date().toISOString());
    } catch (e) {}
  } catch (e) {
    const offline = (typeof navigator !== "undefined" && navigator.onLine === false);
    const detail = String((e && e.message) || e || "");
    const msg = offline ? "Нет интернета — работаю офлайн" : ("Сервер обновлений недоступен — попробуйте позже. " + detail);
    setStatus(msg, "warn");
    if (opts.manual && typeof toast === "function") toast(msg);
  } finally {
    if (btn) btn.disabled = false;
    setVer();
  }
}

function installSupabaseAwareUpdater() {
  try {
    preferUpdateMirrors();
  } catch (e) {}
  try {
    window.checkForUpdates = checkForUpdatesAllSources;
    // Also assign bare binding for classic scripts that resolved the name early
    try { checkForUpdates = checkForUpdatesAllSources; } catch (e) {}
  } catch (e) {}
  const btn = document.getElementById("btn-update");
  if (btn) btn.onclick = () => checkForUpdatesAllSources({ manual: true });
}

(function scheduleUpdaterOverride() {
  let n = 0;
  const tick = () => {
    n++;
    installSupabaseAwareUpdater();
    if (n < 30) setTimeout(tick, 200);
  };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tick);
    else tick();
  }
})();

/* === Грайл — ИИ-помощник (1.1.9) ===
   Wrapped so new bindings cannot collide with shell-level const (that blanked the app before). */
(function initGrailChat() {
  var GRAIL_STORE_KEY = "ip_kasyanov_grail_v1";
  var GRAIL_CHAT_URL = "https://vourhkrahnbuugwfdgmt.supabase.co/functions/v1/grail-chat";
  var GRAIL_HINT = "Чтобы научить Грайла: начните сообщение со слов „Запомни:“ или „Нет, …“";
  var grailPending = false;
  var grailError = "";
  var grailReqGen = 0;

  function grailAnonKey() {
    try {
      if (typeof SUPABASE_ANON_KEY === "string" && SUPABASE_ANON_KEY) return SUPABASE_ANON_KEY;
    } catch (e) {}
    return "";
  }

  function grailNewSessionId() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    } catch (e) {}
    return "grail-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
  }

  function grailDefaultState() {
    return { session_id: grailNewSessionId(), mode: "chat", messages: [] };
  }

  function grailLoad() {
    try {
      var raw = localStorage.getItem(GRAIL_STORE_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && typeof d.session_id === "string" && d.session_id) {
          if (d.mode !== "ad") d.mode = "chat";
          if (!Array.isArray(d.messages)) d.messages = [];
          return d;
        }
      }
    } catch (e) {}
    var fresh = grailDefaultState();
    grailSave(fresh);
    return fresh;
  }

  function grailSave(d) {
    try { localStorage.setItem(GRAIL_STORE_KEY, JSON.stringify(d)); } catch (e) {}
  }

  function grailHttpError(status) {
    if (status === 400) return "Не удалось отправить сообщение. Проверьте текст и попробуйте ещё раз.";
    if (status === 500) return "Грайл временно недоступен. Попробуйте позже.";
    if (status === 502) return "Грайл не смог ответить. Попробуйте ещё раз через минуту.";
    return "Не удалось получить ответ Грайла. Попробуйте ещё раз.";
  }

  function grailFail(message) {
    var err = new Error(message);
    err.grailFriendly = true;
    return err;
  }

  async function grailRequest(sessionId, message, mode) {
    var key = grailAnonKey();
    var res;
    try {
      res = await fetch(GRAIL_CHAT_URL, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: "Bearer " + key,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          session_id: sessionId,
          message: message,
          mode: mode === "ad" ? "ad" : "chat"
        })
      });
    } catch (e) {
      throw grailFail("Нет связи с Грайлом. Проверьте интернет и попробуйте ещё раз.");
    }
    if (!res.ok) throw grailFail(grailHttpError(res.status));
    try { return await res.json(); } catch (e) { return {}; }
  }

  function grailMessagesHtml(st) {
    var html = "";
    var msgs = (st && st.messages) || [];
    if (!msgs.length && !grailPending) {
      html += '<p class="muted grail-empty">Спросите ставку или попросите текст объявления.</p>';
    }
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      if (!m) continue;
      var isUser = m.role === "user";
      var copyBtn = (!isUser && m.mode === "ad")
        ? '<div class="grail-actions"><button type="button" class="btn small ghost" data-grail-copy="' + i + '">Копировать</button></div>'
        : "";
      var badge = (!isUser && m.rule_saved != null)
        ? '<div class="chip grail-rule">✓ Правило сохранено</div>'
        : "";
      html += '<div class="grail-row ' + (isUser ? "user" : "assistant") + '">' +
        '<div class="grail-bubble">' +
          '<div class="grail-meta">' + (isUser ? "Вы" : "Грайл") + "</div>" +
          '<div class="grail-text">' + esc(m.text || "") + "</div>" +
          badge + copyBtn +
        "</div></div>";
    }
    if (grailPending) {
      html += '<div class="grail-row assistant"><div class="grail-bubble grail-thinking">' +
        '<div class="grail-meta">Грайл</div><div class="grail-text">Грайл думает…</div>' +
        "</div></div>";
    }
    return html;
  }

  function renderGrail() {
    var st = grailLoad();
    var chatOn = st.mode !== "ad";
    var placeholder = chatOn
      ? "Спросите про ставку, маршрут, контейнер…"
      : "Опишите объявление: маршрут, контейнер, условия…";
    return '<h1>Грайл</h1>' +
      '<div class="card grail-card">' +
        '<div class="grail-toolbar">' +
          '<button type="button" class="btn small' + (chatOn ? "" : " ghost") + '" id="grail-mode-chat" aria-pressed="' + (chatOn ? "true" : "false") + '">Вопрос</button>' +
          '<button type="button" class="btn small' + (chatOn ? " ghost" : "") + '" id="grail-mode-ad" aria-pressed="' + (chatOn ? "false" : "true") + '">Объявление</button>' +
          '<button type="button" class="btn small ghost" id="grail-new">Новый диалог</button>' +
        "</div>" +
        '<div id="grail-messages" class="grail-messages" aria-live="polite">' + grailMessagesHtml(st) + "</div>" +
        '<div id="grail-error" class="grail-error"' + (grailError ? "" : " hidden") + ">" + esc(grailError) + "</div>" +
        '<div class="grail-compose">' +
          '<textarea id="grail-input" rows="2" maxlength="4000" placeholder="' + esc(placeholder) + '"' + (grailPending ? " disabled" : "") + "></textarea>" +
          '<button type="button" class="btn" id="grail-send"' + (grailPending ? " disabled" : "") + ">Отправить</button>" +
        "</div>" +
        '<p class="note grail-hint">' + GRAIL_HINT + "</p>" +
      "</div>";
  }

  function grailPaint() {
    var box = document.getElementById("grail-messages");
    if (!box) return;
    box.innerHTML = grailMessagesHtml(grailLoad());
    box.scrollTop = box.scrollHeight;
    var err = document.getElementById("grail-error");
    if (err) {
      err.textContent = grailError || "";
      err.hidden = !grailError;
    }
    var send = document.getElementById("grail-send");
    var ta = document.getElementById("grail-input");
    if (send) send.disabled = !!grailPending;
    if (ta) ta.disabled = !!grailPending;
  }

  function grailSetMode(mode) {
    var st = grailLoad();
    st.mode = mode === "ad" ? "ad" : "chat";
    grailSave(st);
    var chatOn = st.mode !== "ad";
    var chatBtn = document.getElementById("grail-mode-chat");
    var adBtn = document.getElementById("grail-mode-ad");
    if (chatBtn) {
      chatBtn.className = "btn small" + (chatOn ? "" : " ghost");
      chatBtn.setAttribute("aria-pressed", chatOn ? "true" : "false");
    }
    if (adBtn) {
      adBtn.className = "btn small" + (chatOn ? " ghost" : "");
      adBtn.setAttribute("aria-pressed", chatOn ? "false" : "true");
    }
    var ta = document.getElementById("grail-input");
    if (ta) {
      ta.placeholder = chatOn
        ? "Спросите про ставку, маршрут, контейнер…"
        : "Опишите объявление: маршрут, контейнер, условия…";
    }
  }

  function grailNewDialog() {
    grailReqGen++;
    grailPending = false;
    grailError = "";
    var st = grailLoad();
    grailSave({
      session_id: grailNewSessionId(),
      mode: st.mode === "ad" ? "ad" : "chat",
      messages: []
    });
    var ta = document.getElementById("grail-input");
    if (ta) { ta.disabled = false; ta.value = ""; }
    var send = document.getElementById("grail-send");
    if (send) send.disabled = false;
    if (document.getElementById("grail-messages")) grailPaint();
  }

  async function grailCopyText(text) {
    var value = String(text || "");
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        var area = document.createElement("textarea");
        area.value = value;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      if (typeof toast === "function") toast("Скопировано");
    } catch (e) {
      if (typeof toast === "function") toast("Не удалось скопировать");
    }
  }

  async function grailSend() {
    if (grailPending) return;
    var ta = document.getElementById("grail-input");
    var text = ta ? String(ta.value || "").trim() : "";
    if (!text) return;
    if (text.length > 4000) text = text.slice(0, 4000);
    var st = grailLoad();
    var mode = st.mode === "ad" ? "ad" : "chat";
    var sessionId = st.session_id;
    st.messages.push({ role: "user", text: text, mode: mode });
    if (st.messages.length > 200) st.messages = st.messages.slice(-200);
    grailSave(st);
    grailError = "";
    var gen = ++grailReqGen;
    grailPending = true;
    if (ta) ta.value = "";
    grailPaint();
    try {
      var data = await grailRequest(sessionId, text, mode);
      if (gen !== grailReqGen) return;
      var cur = grailLoad();
      if (!cur || cur.session_id !== sessionId) return;
      var reply = (data && data.reply != null) ? String(data.reply) : "";
      if (!reply.trim()) reply = "Грайл прислал пустой ответ. Попробуйте переформулировать вопрос.";
      cur.messages.push({
        role: "assistant",
        text: reply,
        mode: mode,
        rule_saved: (data && data.rule_saved != null) ? data.rule_saved : null
      });
      if (cur.messages.length > 200) cur.messages = cur.messages.slice(-200);
      grailSave(cur);
    } catch (e) {
      if (gen !== grailReqGen) return;
      var cur2 = grailLoad();
      if (cur2 && cur2.session_id === sessionId) {
        var last = cur2.messages[cur2.messages.length - 1];
        if (last && last.role === "user" && last.text === text) cur2.messages.pop();
        grailSave(cur2);
        var input = document.getElementById("grail-input");
        if (input && !String(input.value || "").trim()) input.value = text;
      }
      grailError = (e && e.grailFriendly && e.message)
        ? e.message
        : "Не удалось получить ответ Грайла. Попробуйте ещё раз.";
    } finally {
      if (gen === grailReqGen) {
        grailPending = false;
        if (document.getElementById("grail-messages")) grailPaint();
      }
    }
  }

  function bindGrailHandlers() {
    var chatBtn = document.getElementById("grail-mode-chat");
    var adBtn = document.getElementById("grail-mode-ad");
    if (chatBtn) chatBtn.onclick = function () { grailSetMode("chat"); };
    if (adBtn) adBtn.onclick = function () { grailSetMode("ad"); };
    var neu = document.getElementById("grail-new");
    if (neu) neu.onclick = function () { grailNewDialog(); };
    var send = document.getElementById("grail-send");
    if (send) send.onclick = function () { grailSend(); };
    var ta = document.getElementById("grail-input");
    if (ta) {
      ta.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          grailSend();
        }
      });
    }
    var box = document.getElementById("grail-messages");
    if (box && !box._grailCopyBound) {
      box.addEventListener("click", function (e) {
        var t = e.target;
        var b = t && t.closest ? t.closest("[data-grail-copy]") : null;
        if (!b) return;
        var idx = Number(b.getAttribute("data-grail-copy"));
        var st = grailLoad();
        var m = st.messages[idx];
        if (m && m.text) grailCopyText(m.text);
      });
      box._grailCopyBound = true;
    }
    grailPaint();
  }

  function ensureGrailNavButton() {
    var nav = document.getElementById("nav");
    if (!nav || nav.querySelector('button[data-tab="grail"]')) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-tab", "grail");
    btn.textContent = "Грайл";
    var stavki = nav.querySelector('button[data-tab="stavki"]');
    if (!stavki) {
      var buttons = nav.querySelectorAll("button");
      for (var i = 0; i < buttons.length; i++) {
        var label = (buttons[i].textContent || "").replace(/\s+/g, " ").trim();
        if (label.indexOf("Ставки") === 0) { stavki = buttons[i]; break; }
      }
    }
    if (stavki && stavki.parentNode) {
      if (stavki.nextSibling) stavki.parentNode.insertBefore(btn, stavki.nextSibling);
      else stavki.parentNode.appendChild(btn);
    } else {
      nav.appendChild(btn);
    }
  }

  window.renderGrail = renderGrail;
  window.bindGrailHandlers = bindGrailHandlers;
  window.ensureGrailNavButton = ensureGrailNavButton;

  function bootGrailNav() {
    try { ensureGrailNavButton(); } catch (e) {}
  }
  bootGrailNav();
  var grailNavTries = 0;
  var grailNavTimer = setInterval(function () {
    grailNavTries++;
    bootGrailNav();
    if (grailNavTries >= 20 || document.querySelector('#nav button[data-tab="grail"]')) {
      clearInterval(grailNavTimer);
    }
  }, 300);
  if (typeof document !== "undefined" && document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootGrailNav);
  }
})();
