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
    if (zayavkaExists(src.number, src.date, inn || (found && found.inn), cSnap.full_name || (found && found.full_name))) continue;
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
applyVersionedImports();
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
let currentTab = "home", editingZayavkaId = null, previewZayavkaId = null;
document.getElementById("nav").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  showTab(btn.dataset.tab);
});
function showTab(tab, opts) {
  currentTab = tab; opts = opts || {};
  document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  const main = document.getElementById("main");
  if (tab === "home") main.innerHTML = renderHome();
  else if (tab === "zayavki") main.innerHTML = renderZayavki(opts);
  else if (tab === "stavki") main.innerHTML = renderStavki();
  else if (tab === "karta") main.innerHTML = renderKarta();
  else if (tab === "reisy") main.innerHTML = renderReisy();
  else if (tab === "sprav") main.innerHTML = renderSprav();
  else if (tab === "backup") main.innerHTML = renderBackup();
  bindTabHandlers(tab);
}
function renderHome() {
  const z = DB.zayavki.length, t = DB.trips.length, c = DB.carriers.length;
  const q = BASE_QUOTES.length + (DB.quotes_extra||[]).length;
  return `<h1>Рабочее место</h1>
  <div class="warn-box">Ни одну ставку клиенту не отправлять без вашего «да».</div>
  <div class="grid stats">
    <div class="card stat"><div class="num">${z}</div><div class="lbl">Заявок</div></div>
    <div class="card stat"><div class="num">${t}</div><div class="lbl">Рейсов</div></div>
    <div class="card stat"><div class="num">${c}</div><div class="lbl">Перевозчиков</div></div>
    <div class="card stat"><div class="num">${q}</div><div class="lbl">Ставок в базе</div></div>
  </div>
  <div class="card">
    <h2>Как пользоваться</h2>
    <p>Откройте этот файл двойным щелчком в Chrome, Edge или Яндекс.Браузере. Интернет не нужен для заявок и ставок. Вкладка «Карта» и автообновление требуют интернет.</p>
    <p class="muted">Данные хранятся в этом браузере на этом компьютере. Сделайте «Резервную копию», если переходите на другой ПК.</p>
    <div class="toolbar" style="margin-top:12px">
      <button class="btn" onclick="showTab('zayavki',{mode:'new'})">Новая заявка</button>
      <button class="btn secondary" onclick="showTab('stavki')">Подобрать ставку</button>
      <button class="btn ghost" onclick="showTab('reisy')">Рейсы</button>
      <button class="btn ghost" onclick="showTab('karta')">Карта</button>
    </div>
  </div>`;
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
        <button class="btn small ghost" data-copy="${z.id}">Копировать</button></td></tr>`;
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
    <div class="row"><div class="field wide"><label>Марка, №тягача, №п/п</label><input id="z-truck" value="${esc(z.truck)}"></div></div>
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
  if (!z.number) { alert("Укажите номер заявки"); return; }
  if (z.id) {
    const i = DB.zayavki.findIndex(x => x.id === z.id);
    if (i >= 0) DB.zayavki[i] = z;
  } else { z.id = DB.next.zayavka++; DB.zayavki.push(z); }
  if (z.carrier.full_name && z.carrier.inn) {
    let found = DB.carriers.find(c => c.inn === z.carrier.inn);
    if (found) { Object.assign(found, z.carrier); z.carrier_id = found.id; }
    else { const nc = Object.assign({id: DB.next.carrier++}, z.carrier); DB.carriers.push(nc); z.carrier_id = nc.id; }
  }
  saveStore(DB); toast("Заявка сохранена"); editingZayavkaId = z.id;
  if (andPreview) { previewZayavkaId = z.id; showTab("zayavki", {mode:"preview", id: z.id}); }
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
  "плп":"плп","петролеспорт":"спб","бронка":"спб","пкт":"спб",
  "новороссийск":"новороссийск","ново":"новороссийск","нврск":"новороссийск","порт ново":"новороссийск",
  "нврс":"новороссийск","нутеп":"нутеп","нутэп":"нутеп","нмтп":"нмтп","нтл":"новороссийск","раевская":"новороссийск",
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
  "нутеп":"нутеп","нутэп":"нутеп","нмтп":"нмтп","новоморснаб":"новороссийск",
  "юкк":"новороссийск","рускон":"новороссийск","нк-депо":"новороссийск","нк депо":"новороссийск",
  "терминал плп":"плп"
};

const DEST_REGION = {
  "нахабино":"москва-запад","красногорск":"москва-запад","дзержинский":"москва-восток",
  "томилино":"москва-восток","солнцево":"москва","долгопрудный":"москва","домодедово":"москва",
  "пушкино":"москва","фрязино":"москва","черная грязь":"москва","юг мо":"москва","москва":"москва",
  "климовск":"москва","серпухов":"москва-юг","горки":"москва","химки":"москва","котельники":"москва",
  "бритово":"москва","покров":"москва-восток","киржач":"москва-восток",
  "спб":"спб","гатчина":"спб","новороссийск":"новороссийск","анапа":"новороссийск","геленджик":"новороссийск",
  "ростов":"ростов","таганрог":"ростов","казань":"казань","саратов":"саратов","краснодар":"краснодар",
  "тимашевск":"краснодар","пятигорск":"пятигорск","чегем":"пятигорск","сочи":"сочи","адлер":"сочи","нутеп":"новороссийск","нмтп":"новороссийск","плп":"спб"
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
/** Реальная точка выгрузки (не сдача порожнего). Кругорейсы «порожний Ново → город → СПб» не считать Ново→СПб. */
function quoteEndpoints(q) {
  const rf = String(q.route_from || "");
  const rt = String(q.route_to || "");
  const blob = (q.quote_raw || "") + " " + (q.conditions || "") + " " + (q.return_empty || "");
  let from = q.from_norm || normalizePlace(rf);
  let to = q.to_norm || normalizePlace(rt);
  let is_roundtrip = false;
  let is_empty_only = false;

  if (/порожн/i.test(rf) && /→|->/.test(rf)) {
    is_roundtrip = true;
    const m = rf.match(/(?:→|->)\s*(.+)$/);
    if (m) {
      to = normalizePlace(m[1]);
      from = normalizePlace(rf.split(/→|->/)[0]) || from;
    }
  } else if (/\(\s*1\s*\)/.test(rf) && /\(\s*2\s*\)/.test(rf) && /→|->/.test(rf)) {
    /* «(1) Ново; (2) СПб → Котельники → СПб» — выгрузка в Котельниках */
    is_roundtrip = true;
    const m = rf.match(/(?:→|->)\s*([^→\->]+)/);
    if (m) to = normalizePlace(m[1]);
  }

  if (!is_roundtrip && /вывоз порожн|порожние|порожних|порожний контейнер/i.test(blob)) {
    is_empty_only = true;
  }
  if (!from) from = normalizePlace(rf);
  if (!to) to = normalizePlace(rt);
  return {from, to, is_roundtrip, is_empty_only, delivery_raw: to};
}
function scoreMatch(qFrom, qTo, rowFrom, rowTo) {
  const rf = (rowFrom || "").toLowerCase();
  const rt = (rowTo || "").toLowerCase();
  let fromScore = 0, toScore = 0;
  if (qFrom && rf) {
    if (qFrom === rf) fromScore = 50;
    else if (qFrom.includes(rf) || rf.includes(qFrom)) fromScore = 25;
    else if (destRegion(qFrom) && destRegion(qFrom) === destRegion(rf)) fromScore = 25;
  }
  if (qTo && rt) {
    if (qTo === rt) toScore = 50;
    else if (qTo.includes(rt) || rt.includes(qTo)) toScore = 25;
    else if (destRegion(qTo) && destRegion(qTo) === destRegion(rt)) toScore = 25;
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
function fmtPair(a,b,est) {
  const p = est ? "≈ " : "";
  if (a && b) return p + Math.round(a/1000) + "/" + Math.round(b/1000);
  if (a) return p + Math.round(a/1000) + " (только 20')";
  if (b) return p + Math.round(b/1000) + " (только 40')";
  return null;
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
  if (heavy || longHaul) return "≈ 5 000–8 000 ₽/т (ориентир для 27–28 т / дальних плеч)";
  if (roadKmVal != null && roadKmVal < 200) return "≈ 1 000–1 500 ₽/т (ориентир, ближнее плечо)";
  return "≈ 3 000–3 500 ₽/т (ориентир по зоне; точного нет в базе)";
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
    method: "оценка по расстоянию (≈" + Math.round(rd.km) + " км), не точная"
  };
}
function suggestRate(routeFrom, routeTo, weightT, returnEmpty, secondUnload) {
  const nf = normalizePlace(routeFrom);
  const nt = normalizePlace(routeTo);
  const rd = roadKm(nf, nt);
  const scored = [];
  for (const q of allQuotes()) {
    if (q.price_20 == null && q.price_40 == null) continue;
    const ep = quoteEndpoints(q);
    if (ep.is_empty_only) continue; /* порожние рефы и т.п. — не для гружёного */
    let sc = scoreMatch(nf, nt, ep.from, ep.to);
    if (sc.total < 50) {
      const sc2 = scoreMatch(nf, nt, (q.from_norm||""), (q.to_norm||""));
      /* sc2 только если это НЕ кругорейс с чужой выгрузкой */
      if (!ep.is_roundtrip && sc2.total > sc.total) sc = sc2;
    }
    if (sc.fromScore >= 25 && sc.toScore >= 25) {
      scored.push(Object.assign({}, q, {
        _score: sc.total, _from: sc.fromScore, _to: sc.toScore,
        _ep: ep, _roundtrip: ep.is_roundtrip
      }));
    }
  }
  scored.sort((a,b) => b._score - a._score || String(b.date||"").localeCompare(String(a.date||"")));

  /* Рынок перевозчиков: origin из sample_raw */
  const laneHits = [];
  for (const L of BASE_LANES) {
    const lFrom = inferLaneOrigin(L);
    const lTo = normalizePlace(L.route_to || "");
    const sc = scoreMatch(nf, nt, lFrom, lTo);
    let ok = sc.toScore >= 25;
    if (lFrom) ok = ok && sc.fromScore >= 25;
    else {
      const raw = String(L.sample_raw || "").toLowerCase().replace(/ё/g,"е");
      if (nf === "новороссийск") ok = ok && /новорос|ново\s*-|ново\s|нврск|нврс|раевск|терминал ново/.test(raw);
      else if (nf === "спб") ok = ok && /(^|[^а-я])спб|питер|санкт|плп|бронка/.test(raw) && !/новорос|нврск|раевск/.test(raw.split(/→|->|—/)[0] || raw);
      else ok = false;
    }
    if (ok) laneHits.push(Object.assign({}, L, {_score: sc.total || sc.toScore, _from:lFrom || nf}));
  }
  laneHits.sort((a,b) => (b._score||0) - (a._score||0) || (b.n||0) - (a.n||0));

  let pool = scored.filter(q => q._score >= 100 && !q._roundtrip);
  if (!pool.length) pool = scored.filter(q => q._score >= 100);
  if (!pool.length) pool = scored.filter(q => q._score >= 75 && !q._roundtrip);
  if (!pool.length) pool = scored.filter(q => q._score >= 75);
  if (!pool.length) pool = scored.filter(q => !q._roundtrip).slice(0, 8);
  if (!pool.length) pool = scored.slice(0, 8);
  /* близкие (регион) — в источники, но не в медиану пары, если уже есть точные */
  const exactPool = pool.filter(q => q._score >= 100 && !q._roundtrip);
  const closeExtra = scored.filter(q => q._score >= 75 && q._score < 100 && !q._roundtrip);

  if (returnEmpty) {
    const re = normalizePlace(returnEmpty);
    const filtered = pool.filter(q =>
      (q.return_empty||"").toLowerCase().includes(re) ||
      (q.conditions||"").toLowerCase().includes(re) ||
      (q.quote_raw||"").toLowerCase().includes(re));
    if (filtered.length) pool = filtered;
  }
  if (weightT != null && pool.length > 1) {
    const pref = pool.filter(q => q.weight_t == null || Math.abs(Number(q.weight_t) - weightT) <= 5);
    if (pref.length) pool = pref;
  }

  const prices20 = pool.map(q => q.price_20).filter(Boolean);
  const prices40 = pool.map(q => q.price_40).filter(Boolean);
  const overweights = pool.map(q => q.overweight).filter(Boolean);
  const exact = scored.some(q => q._score >= 100 && !q._roundtrip);
  const similarEnough = pool.length > 0 && (prices20.length + prices40.length) > 0;

  let p20 = similarEnough ? median(prices20) : null;
  let p40 = similarEnough ? median(prices40) : null;
  if (p20 && p40 && p20 < p40) p20 = p40;

  const isEstimate = !exact;
  let confidence = exact ? "точная" : (scored.some(q=>q._score>=75 && !q._roundtrip) ? "близкая" : (similarEnough ? "частичная" : "нет данных"));
  let ow = overweights[0] || null;
  if (!ow) ow = defaultOverweight(weightT, rd && rd.km);

  const extras = [];
  if (secondUnload) extras.push("+5 000 ₽ за 2-ю точку выгрузки (рабочая практика)");
  const variants = [];
  if (!returnEmpty) variants.push("Дайте два варианта: сдача порожнего в СПб и в Новороссийске — цена сильно отличается.");

  const sources = pool.slice(0,8).map(q => ({
    date: q.date, source: q.source,
    route: (q.route_from||"") + " → " + (q.route_to||""),
    pair: fmtPair(q.price_20, q.price_40, false),
    vat: q.vat, overweight: q.overweight, raw: q.quote_raw,
    return_empty: q.return_empty, score: q._score,
    note: q._roundtrip ? "кругорейс (выгрузка не в конечном пункте сдачи)" : ""
  }));
  if (exactPool.length && closeExtra.length) {
    for (const q of closeExtra.slice(0, 4)) {
      sources.push({
        date: q.date, source: q.source,
        route: (q.route_from||"") + " → " + (q.route_to||""),
        pair: fmtPair(q.price_20, q.price_40, false),
        vat: q.vat, overweight: q.overweight, raw: q.quote_raw,
        return_empty: q.return_empty, score: q._score,
        note: "близкий регион (не в расчёте пары)"
      });
    }
  }

  let pairText, warning, method, distInfo = null, has_proposal = false;

  if (similarEnough && (p20 || p40)) {
    pairText = fmtPair(p20, p40, isEstimate);
    warning = "Ни одну ставку клиенту не отправлять без вашего «да»." +
      (isEstimate ? " Цифры помечены ≈ — точного совпадения маршрута в базе нет." : "");
    method = exact ? "точные совпадения в вашей базе" : "близкие маршруты из вашей базы";
    has_proposal = true;
  } else {
    /* Оценка по расстоянию */
    distInfo = estimateByDistance(nf, nt, weightT);
    if (distInfo.ok) {
      p20 = distInfo.price_20;
      p40 = distInfo.price_40;
      if (p20 && p40 && p20 < p40) p20 = p40;
      pairText = fmtPair(p20, p40, true);
      method = distInfo.method;
      confidence = "оценка по км";
      warning = "Ни одну ставку клиенту не отправлять без вашего «да». " +
        "Это оценка по расстоянию (≈" + distInfo.km + " км), не точная ставка. " +
        "Считается из ваших прошлых ставок: цена ≈ a + b·км" +
        (distInfo.fit40 ? (" (40': a=" + Math.round(distInfo.fit40.fit.a) + ", b=" + distInfo.fit40.fit.b.toFixed(1) + " ₽/км, n=" + distInfo.fit40.n + ", " + distInfo.fit40.scope + ")") : "") +
        ".";
      has_proposal = !!(p20 || p40);
      /* аналоги по расстоянию как источники */
      for (const a of distInfo.analogs) {
        sources.push({
          date: a.q.date, source: a.q.source,
          route: (a.q.route_from||"") + " → " + (a.q.route_to||""),
          pair: a.pair, vat: a.q.vat, overweight: a.q.overweight,
          raw: a.q.quote_raw, return_empty: a.q.return_empty, score: null,
          note: "аналог ≈" + Math.round(a.km) + " км (Δ " + Math.round(a.dKm) + " км)"
        });
      }
    } else {
      pairText = "в базе нет похожих маршрутов";
      method = "нет данных";
      warning = "Ни одну ставку клиенту не отправлять без вашего «да». " +
        (distInfo.message || "По этому направлению похожих ваших ставок нет — цифру не предлагаю.");
      has_proposal = false;
    }
  }

  const carrier_lanes = laneHits.slice(0,5).map(L => ({
    route: (L._from || L.route_from || "?") + " → " + (L.route_to||""),
    container: L.container, weight_band: L.weight_band, n: L.n,
    min: L.min_price, median: L.median_price, max: L.max_price,
    dates: (L.date_from||"") + "…" + (L.date_to||"")
  }));

  let market_median_note = null;
  if (carrier_lanes.length) {
    let meds = carrier_lanes.filter(L => (L.n||0) >= 2).map(L => L.median).filter(Boolean);
    if (!meds.length) meds = carrier_lanes.map(L => L.median).filter(Boolean);
    if (meds.length) market_median_note = median(meds);
  }

  return {
    pair_text: pairText, price_20: p20, price_40: p40, vat: "+5% НДС",
    overweight: ow || "—", confidence, is_estimate: isEstimate || !exact,
    extras, variants_note: variants, sources,
    carrier_lanes, market_median_note,
    warning, has_proposal, method,
    distance_km: rd ? Math.round(rd.km) : (distInfo && distInfo.km) || null,
    dist_info: distInfo && distInfo.ok ? distInfo : null,
    unknown_city: distInfo && !distInfo.ok ? distInfo.unknown : null
  };
}
function renderStavki() {
  return `<h1>Калькулятор ставок</h1>
  <div class="warn-box">Ни одну ставку клиенту не отправлять без вашего «да». Калькулятор показывает источники и помечает ориентиры знаком ≈.</div>
  <div class="card">
    <div class="row">
      <div class="field"><label>Откуда</label><input id="s-from" placeholder="СПб"></div>
      <div class="field"><label>Куда</label><input id="s-to" placeholder="Казань"></div>
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
      <div class="field" style="max-width:100px"><label>20'</label><input id="aq-20" placeholder="265000"></div>
      <div class="field" style="max-width:100px"><label>40'</label><input id="aq-40" placeholder="250000"></div>
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
function showStavkiResult() {
  const from = document.getElementById("s-from").value.trim();
  const to = document.getElementById("s-to").value.trim();
  if (!from || !to) { alert("Укажите откуда и куда"); return; }
  const w = parseFloat(document.getElementById("s-w").value) || null;
  const ret = document.getElementById("s-ret").value.trim();
  const su = document.getElementById("s-2u").checked;
  const r = suggestRate(from, to, w, ret, su);
  let html = `<div class="card"><h2>Предложение</h2>`;
  if (r.has_proposal) {
    html += `<div class="pair">${esc(r.pair_text)} <span style="font-size:1rem;font-weight:600">${esc(r.vat)}</span></div>
      <p>Перевес: <strong>${esc(r.overweight)}</strong> · Уверенность: <span class="chip ${r.is_estimate?"warn":""}">${esc(r.confidence)}</span>
      ${r.distance_km?` · ≈${r.distance_km} км`:""}</p>`;
    if (r.method) html += `<p class="muted">${esc(r.method)}</p>`;
  } else {
    html += `<div class="pair" style="color:var(--warn)">${esc(r.pair_text)}</div>`;
    if (r.unknown_city && r.unknown_city.length) {
      html += `<p>Не знаю город: <strong>${esc(r.unknown_city.join(", "))}</strong>. Укажите рядом крупный город (Казань, Москва, СПб, Екатеринбург…).</p>`;
    }
  }
  for (const e of r.extras) html += `<div class="chip">${esc(e)}</div>`;
  for (const v of r.variants_note) html += `<p class="muted">${esc(v)}</p>`;
  html += `<div class="warn-box">${esc(r.warning)}</div>`;
  html += `<h3>Источники — ваши прошлые ставки клиенту</h3><div class="sources">`;
  if (r.sources.length) {
    for (const s of r.sources) {
      html += `<div class="src"><strong>${esc(fmtDate(s.date))}</strong> · ${esc(s.source||"")} · ${esc(s.route)}
        → <strong>${esc(s.pair||"")}</strong> ${esc(s.vat||"")}
        ${s.overweight?`<span class="muted">· перевес ${esc(s.overweight)}</span>`:""}
        ${s.note?`<div class="chip warn">${esc(s.note)}</div>`:""}
        ${s.return_empty?`<div class="muted">сдача: ${esc(s.return_empty)}</div>`:""}
        ${s.raw?`<div class="muted mono">${esc((s.raw||"").slice(0,180))}${(s.raw||"").length>180?"…":""}</div>`:""}
      </div>`;
    }
  } else html += `<p class="muted">Близких клиентских ставок не найдено.</p>`;
  html += `</div>`;
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
  const q = {
    date: document.getElementById("aq-date").value || new Date().toISOString().slice(0,10),
    source: "вручную", who: "owner",
    client: document.getElementById("aq-client").value.trim(), contact: "",
    route_from: from, route_to: to,
    from_norm: normalizePlace(from), to_norm: normalizePlace(to),
    return_empty: "", container: "20/40", cont_norm: "20/40", cargo: "",
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
function renderReisy() {
  const month = (window._tripMonth) || new Date().toISOString().slice(0,7);
  const trips = DB.trips.filter(t => !month || (t.date||"").startsWith(month));
  let sumClient = 0, sumCarrier = 0, sumMargin = 0;
  for (const t of trips) {
    sumClient += Number(t.client_rate)||0;
    sumCarrier += Number(t.carrier_rate)||0;
    sumMargin += (Number(t.client_rate)||0) - (Number(t.carrier_rate)||0);
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
  </div>
  <div class="card" id="trip-form-wrap" style="display:none">
    <h2>Новый рейс</h2>
    <div class="row">
      <div class="field" style="max-width:150px"><label>Дата</label><input type="date" id="t-date"></div>
      <div class="field"><label>Клиент</label><input id="t-client"></div>
      <div class="field wide"><label>Маршрут</label><input id="t-route"></div>
    </div>
    <div class="row">
      <div class="field"><label>Перевозчик</label><input id="t-carrier"></div>
      <div class="field"><label>Водитель</label><input id="t-driver"></div>
      <div class="field"><label>Ставка клиенту</label><input id="t-cr" type="number"></div>
      <div class="field"><label>Ставка перевозчику</label><input id="t-car" type="number"></div>
    </div>
    <div class="row">
      <div class="field"><label>Оплата клиент</label><select id="t-pay-c"><option>не оплачено</option><option>частично</option><option>оплачено</option></select></div>
      <div class="field"><label>Оплата перевозчик</label><select id="t-pay-car"><option>не оплачено</option><option>частично</option><option>оплачено</option></select></div>
      <div class="field"><label>Заявка</label>
        <select id="t-zid"><option value="">—</option>
          ${DB.zayavki.map(z=>`<option value="${z.id}">№${esc(z.number)} ${esc((z.carrier&&z.carrier.full_name)||"")}</option>`).join("")}
        </select></div>
      <div class="field wide"><label>Документы / заметка</label><input id="t-note"></div>
    </div>
    <button class="btn" id="btn-save-trip">Сохранить рейс</button>
  </div>
  <div class="card"><table><thead><tr>
    <th>Дата</th><th>Клиент</th><th>Маршрут</th><th>Перевозчик</th><th>Клиенту</th><th>Перевозчику</th><th>Маржа</th><th>Оплаты</th><th></th>
  </tr></thead><tbody>`;
  if (!trips.length) html += `<tr><td colspan="9" class="muted">Рейсов за месяц нет</td></tr>`;
  for (const t of trips.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)))) {
    const margin = (Number(t.client_rate)||0) - (Number(t.carrier_rate)||0);
    html += `<tr>
      <td>${esc(fmtDate(t.date))}</td><td>${esc(t.client)}</td><td>${esc(t.route)}</td>
      <td>${esc(t.carrier)}<div class="muted">${esc(t.driver||"")}</div></td>
      <td>${money(t.client_rate)}</td><td>${money(t.carrier_rate)}</td><td><strong>${money(margin)}</strong></td>
      <td><span class="chip">${esc(t.pay_client)}</span> / <span class="chip">${esc(t.pay_carrier)}</span>
        ${t.note?`<div class="muted">${esc(t.note)}</div>`:""}
        ${t.zayavka_id?`<div><a href="#" data-view="${t.zayavka_id}">заявка</a></div>`:""}</td>
      <td><button class="btn small ghost" data-del-trip="${t.id}">Удалить</button></td></tr>`;
  }
  return html + `</tbody></table></div>`;
}
function saveTrip() {
  const t = {
    id: DB.next.trip++,
    date: document.getElementById("t-date").value || new Date().toISOString().slice(0,10),
    client: document.getElementById("t-client").value.trim(),
    route: document.getElementById("t-route").value.trim(),
    carrier: document.getElementById("t-carrier").value.trim(),
    driver: document.getElementById("t-driver").value.trim(),
    client_rate: Number(document.getElementById("t-cr").value)||0,
    carrier_rate: Number(document.getElementById("t-car").value)||0,
    pay_client: document.getElementById("t-pay-c").value,
    pay_carrier: document.getElementById("t-pay-car").value,
    zayavka_id: document.getElementById("t-zid").value ? Number(document.getElementById("t-zid").value) : null,
    note: document.getElementById("t-note").value.trim()
  };
  DB.trips.push(t); saveStore(DB); toast("Рейс сохранён"); showTab("reisy");
}
function exportTripsCSV() {
  const month = window._tripMonth || "";
  const trips = DB.trips.filter(t => !month || (t.date||"").startsWith(month));
  const header = ["Дата","Клиент","Маршрут","Перевозчик","Водитель","Ставка клиенту","Ставка перевозчику","Маржа","Оплата клиент","Оплата перевозчик","Заметка","Заявка"];
  const lines = [header.join(";")];
  for (const t of trips) {
    const margin = (Number(t.client_rate)||0) - (Number(t.carrier_rate)||0);
    const z = t.zayavka_id ? (DB.zayavki.find(x=>x.id===t.zayavka_id)||{}) : {};
    const row = [fmtDate(t.date), t.client, t.route, t.carrier, t.driver, t.client_rate, t.carrier_rate, margin, t.pay_client, t.pay_carrier, t.note, z.number||""]
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
function renderSprav() {
  let html = `<h1>Справочник</h1>
  <div class="card"><div class="field wide"><label>Поиск по ФИО</label>
    <input id="sprav-search" type="search" placeholder="Например: Другов или Керим" oninput="filterSprav(this.value)" autocomplete="off"></div>
    <p class="muted" id="sprav-found"></p></div>
  <div class="card"><h2>Перевозчики</h2>
  <div class="toolbar"><button class="btn small" onclick="editCarrier(null)">+ Добавить перевозчика</button></div>
  <div id="carrier-edit"></div>
  <table><thead><tr><th>Тип</th><th>ФИО / название</th><th>ИНН</th><th>Телефон</th><th>Рейсы</th><th>Банк</th><th>р/с</th><th></th></tr></thead><tbody>`;
  for (const c of DB.carriers) {
    const trips = tripsOfCarrier(c);
    const noteShort = c.notes ? `<div class="muted" style="font-size:.8rem">${esc(String(c.notes).slice(0,80))}${String(c.notes).length>80?"…":""}</div>` : "";
    html += `<tr class="sprav-row" data-fio="${esc((c.full_name||"")+" "+(c.short_name||"")+" "+(c.signatory||""))}"><td>${esc(c.type)}</td><td>${esc(c.full_name)}${noteShort}</td><td>${esc(c.inn)}</td><td>${esc(c.phone)}</td><td>${renderTripsCell(trips)}</td><td>${esc(c.bank)}</td><td class="mono">${esc(c.rs)}</td><td><button class="btn small ghost" onclick="editCarrier(${c.id})">Изменить</button></td></tr>`;
  }
  html += `</tbody></table></div>
  <div class="card"><h2>Водители</h2>
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
  html += `</tbody></table></div>
  <div class="card"><h2>Машины</h2><table><thead><tr><th>Строка в заявке</th><th>Тягач</th><th>Прицеп</th></tr></thead><tbody>`;
  for (const t of DB.trucks) {
    const owner = sprvTruckOwner(t);
    html += `<tr class="sprav-row" data-fio="${esc(owner)}"><td>${esc(t.line||t.notes)}</td><td>${esc(t.brand)} ${esc(t.tractor_number)}</td><td>${esc(t.trailer_brand)} ${esc(t.trailer_number)}</td></tr>`;
  }
  return html + `</tbody></table>
  <p class="note">Новых перевозчиков программа запоминает сама, когда вы сохраняете заявку с ИНН. Рейсы считаются из вкладки «Рейсы» и из заявок.</p></div>`;
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
      saveStore(DB); applyVersionedImports(); toast("Копия загружена"); showTab("home");
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
    const back = document.getElementById("btn-back-z");
    if (back) back.onclick = () => { editingZayavkaId=null; previewZayavkaId=null; showTab("zayavki",{mode:"list"}); };
    const save = document.getElementById("btn-save-z");
    if (save) save.onclick = () => saveZayavka(false);
    const sp = document.getElementById("btn-save-preview");
    if (sp) sp.onclick = () => saveZayavka(true);
    const cf = document.getElementById("z-copy-from");
    if (cf) cf.onchange = () => { if (cf.value) applyCopyFrom(cf.value); };
    const cp = document.getElementById("z-carrier-pick");
    if (cp) cp.onchange = () => {
      const c = DB.carriers.find(x => x.id === Number(cp.value));
      if (c) {
        fillCarrierFields(c);
        const d = DB.drivers.find(x => x.carrier_id === c.id);
        const t = DB.trucks.find(x => x.carrier_id === c.id);
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
        if (t) document.getElementById("z-truck").value = t.line || t.notes || "";
      }
    };
    const pr = document.getElementById("btn-print-z");
    if (pr) pr.onclick = () => { const z = DB.zayavki.find(x => x.id === previewZayavkaId); if (z) printZayavka(z); };
    const wd = document.getElementById("btn-word-z");
    if (wd) wd.onclick = () => { const z = DB.zayavki.find(x => x.id === previewZayavkaId); if (z) downloadWord(z); };
  }
  if (tab === "karta") {
    bindKartaHandlers();
  }
  if (tab === "stavki") {
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
    document.getElementById("btn-new-trip").onclick = () => { document.getElementById("trip-form-wrap").style.display = "block"; };
    const st = document.getElementById("btn-save-trip");
    if (st) st.onclick = saveTrip;
    document.getElementById("btn-export-trips").onclick = exportTripsCSV;
    document.querySelectorAll("[data-del-trip]").forEach(b => b.onclick = () => {
      if (!confirm("Удалить рейс?")) return;
      DB.trips = DB.trips.filter(t => t.id !== Number(b.dataset.delTrip));
      saveStore(DB); showTab("reisy");
    });
    document.querySelectorAll("[data-view]").forEach(b => b.onclick = (e) => {
      e.preventDefault(); previewZayavkaId = Number(b.dataset.view);
      showTab("zayavki",{mode:"preview", id: previewZayavkaId});
    });
  }
  if (tab === "backup") {
    document.getElementById("btn-export-bak").onclick = exportBackup;
    document.getElementById("btn-import-bak").onchange = (e) => { if (e.target.files[0]) importBackup(e.target.files[0]); };
    document.getElementById("btn-reset").onclick = () => {
      if (!confirm("Сбросить все данные к исходным (Стец, Другов, Мамбетшаев)?")) return;
      localStorage.removeItem(STORE_KEY); DB = loadStore(); applyVersionedImports(); toast("Сброшено"); showTab("home");
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
window.addEventListener("hashchange", () => { if (!handleHash()) showTab(currentTab); });
if (!handleHash()) showTab("home");

/* === Карта (Leaflet + OSM + OSRM) === */
const _LEAFLET_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAApCAYAAADAk4LOAAAFgUlEQVR4Aa1XA5BjWRTN2oW17d3YaZtr2962HUzbDNpjszW24mRt28p47v7zq/bXZtrp/lWnXr337j3nPCe85NcypgSFdugCpW5YoDAMRaIMqRi6aKq5E3YqDQO3qAwjVWrD8Ncq/RBpykd8oZUb/kaJutow8r1aP9II0WmLKLIsJyv1w/kqw9Ch2MYdB++12Onxee/QMwvf4/Dk/Lfp/i4nxTXtOoQ4pW5Aj7wpici1A9erdAN2OH64x8OSP9j3Ft3b7aWkTg/Fm91siTra0f9on5sQr9INejH6CUUUpavjFNq1B+Oadhxmnfa8RfEmN8VNAsQhPqF55xHkMzz3jSmChWU6f7/XZKNH+9+hBLOHYozuKQPxyMPUKkrX/K0uWnfFaJGS1QPRtZsOPtr3NsW0uyh6NNCOkU3Yz+bXbT3I8G3xE5EXLXtCXbbqwCO9zPQYPRTZ5vIDXD7U+w7rFDEoUUf7ibHIR4y6bLVPXrz8JVZEql13trxwue/uDivd3fkWRbS6/IA2bID4uk0UpF1N8qLlbBlXs4Ee7HLTfV1j54APvODnSfOWBqtKVvjgLKzF5YdEk5ewRkGlK0i33Eofffc7HT56jD7/6U+qH3Cx7SBLNntH5YIPvODnyfIXZYRVDPqgHtLs5ABHD3YzLuespb7t79FY34DjMwrVrcTuwlT55YMPvOBnRrJ4VXTdNnYug5ucHLBjEpt30701A3Ts+HEa73u6dT3FNWwflY86eMHPk+Yu+i6pzUpRrW7SNDg5JHR4KapmM5Wv2E8Tfcb1HoqqHMHU+uWDD7zg54mz5/2BSnizi9T1Dg4QQXLToGNCkb6tb1NU+QAlGr1++eADrzhn/u8Q2YZhQVlZ5+CAOtqfbhmaUCS1ezNFVm2imDbPmPng5wmz+gwh+oHDce0eUtQ6OGDIyR0uUhUsoO3vfDmmgOezH0mZN59x7MBi++WDL1g/eEiU3avlidO671bkLfwbw5XV2P8Pzo0ydy4t2/0eu33xYSOMOD8hTf4CrBtGMSoXfPLchX+J0ruSePw3LZeK0juPJbYzrhkH0io7B3k164hiGvawhOKMLkrQLyVpZg8rHFW7E2uHOL888IBPlNZ1FPzstSJM694fWr6RwpvcJK60+0HCILTBzZLFNdtAzJaohze60T8qBzyh5ZuOg5e7uwQppofEmf2++DYvmySqGBuKaicF1blQjhuHdvCIMvp8whTTfZzI7RldpwtSzL+F1+wkdZ2TBOW2gIF88PBTzD/gpeREAMEbxnJcaJHNHrpzji0gQCS6hdkEeYt9DF/2qPcEC8RM28Hwmr3sdNyht00byAut2k3gufWNtgtOEOFGUwcXWNDbdNbpgBGxEvKkOQsxivJx33iow0Vw5S6SVTrpVq11ysA2Rp7gTfPfktc6zhtXBBC+adRLshf6sG2RfHPZ5EAc4sVZ83yCN00Fk/4kggu40ZTvIEm5g24qtU4KjBrx/BTTH8ifVASAG7gKrnWxJDcU7x8X6Ecczhm3o6YicvsLXWfh3Ch1W0k8x0nXF+0fFxgt4phz8QvypiwCCFKMqXCnqXExjq10beH+UUA7+nG6mdG/Pu0f3LgFcGrl2s0kNNjpmoJ9o4B29CMO8dMT4Q5ox8uitF6fqsrJOr8qnwNbRzv6hSnG5wP+64C7h9lp30hKNtKdWjtdkbuPA19nJ7Tz3zR/ibgARbhb4AlhavcBebmTHcFl2fvYEnW0ox9xMxKBS8btJ+KiEbq9zA4RthQXDhPa0T9TEe69gWupwc6uBUphquXgf+/FrIjweHQS4/pduMe5ERUMHUd9xv8ZR98CxkS4F2n3EUrUZ10EYNw7BWm9x1GiPssi3GgiGRDKWRYZfXlON+dfNbM+GgIwYdwAAAAASUVORK5CYII=";
const _LEAFLET_ICON_2X = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAABSCAMAAAAhFXfZAAAC91BMVEVMaXEzeak2f7I4g7g3g7cua5gzeKg8hJo3grY4g7c3grU0gLI2frE0daAubJc2gbQwd6QzeKk2gLMtd5sxdKIua5g1frA2f7IydaM0e6w2fq41fK01eqo3grgubJgta5cxdKI1f7AydaQydaMxc6EubJgvbJkwcZ4ubZkwcJwubZgubJcydqUydKIxapgubJctbJcubZcubJcvbJYubJcvbZkubJctbJctbZcubJg2f7AubJcrbZcubJcubJcua5g3grY0fq8ubJcubJdEkdEwhsw6i88vhswuhcsuhMtBjMgthMsrg8srgss6is8qgcs8i9A9iMYtg8spgcoogMo7hcMngMonf8olfso4gr8kfck5iM8jfMk4iM8he8k1fro7itAgesk2hs8eecgzfLcofssdeMg0hc4cd8g2hcsxeLQbdsgZdcgxeLImfcszhM0vda4xgckzhM4xg84wf8Yxgs4udKsvfcQucqhUndROmdM1fK0wcZ8vb5w0eqpQm9MzeKhXoNVcpdYydKNWn9VZotVKltJFjsIwcJ1Rms9OlslLmtH///8+kc9epdYzd6dbo9VHkMM2f7FHmNBClM8ydqVcpNY9hro3gLM9hLczealQmcw3fa46f7A8gLMxc6I3eagyc6FIldJMl9JSnNRSntNNl9JPnNJFi75UnM9ZodVKksg8kM45jc09e6ZHltFBk883gbRBh7pDk9EwcaBzn784g7dKkcY2i81Om9M7j85Llc81is09g7Q4grY/j9A0eqxKmdFFltBEjcXf6fFImdBCiLxJl9FGlNFBi78yiMxVndEvbpo6js74+vx+psPP3+o/ks5HkcpGmNCjwdZCkNDM3ehYoNJEls+lxNkxh8xHks0+jdC1zd5Lg6r+/v/H2ufz9/o3jM3t8/edvdM/k89Th61OiLBSjbZklbaTt9BfptdjmL1AicBHj8hGk9FAgK1dkLNTjLRekrdClc/k7fM0icy0y9tgp9c4jc2NtM9Dlc8zicxeXZn3AAAAQ3RSTlMAHDdTb4yPA+LtnEQmC4L2EmHqB7XA0d0sr478x4/Yd5i1zOfyPkf1sLVq4Nh3FvjxopQ2/STNuFzUwFIwxKaejILpIBEV9wAABhVJREFUeF6s1NdyFEcYBeBeoQIhRAkLlRDGrhIgY3BJL8CVeKzuyXFzzjkn5ZxzzuScg3PO8cKzu70JkO0LfxdTU//pM9vTu7Xgf6KqOVTb9X7toRrVEfBf1HTVjZccrT/2by1VV928Yty9ZbVuucdz90frG8DBjl9pVApbOstvmMuvVgaNXSfAAd6pGxpy6yxf5ph43pS/4f3uoaGm2rdu72S9xzOvMymkZFq/ptDrk90mhW7e4zl7HLzhxGWPR20xmSxJ/VqldG5m9XhaVOA1DadsNh3Pu5L2N6QtPO/32JpqQBVVk20oy/Pi2s23WEvyfHbe1thadVQttvm7Llf65gGmXK67XtupyoM7HQhmXdLS8oGWJNeOJ3C5fG5XCEJnkez3/oFdsvgJ4l2ANZwhrJKk/7OSXa+3Vw2WJMlKnGkobouYk6T0TyX30klOUnTD9HJ5qpckL3EW/w4XF3Xd0FGywXUrstrclVsqz5Pd/sXFYyDnPdrLcQODmGOK47IZb4CmibmMn+MYRzFZ5jg33ZL/EJrWcszHmANy3ARBK/IXtciJy8VsitPSdE3uuHxzougojcUdr8/32atnz/ev3f/K5wtpxUTpcaI45zusVDpYtZi+jg0oU9b3x74h7+n9ABvYEZeKaVq0sh0AtLKsFtqNBdeT0MrSzwwlq9+x6xAO4tgOtSzbCjrNQQiNvQUbUEubvzBUeGw26yDCsRHCoLkTHDa7IdOLIThs/gHvChszh2CimE8peRs47cxANI0lYNB5y1DljpOF0IhzBDPOZnDOqYYbeGKECbPzWnXludPphw5c2YBq5zlwXphIbO4VDCZ0gnPfUO1TwZoYwAs2ExPCedAu9DAjfQUjzITQb3jNj0KG2Sgt6BHaQUdYzWz+XmBktOHwanXjaSTcwwziBcuMOtwBmqPrTOxFQR/DRKKPqyur0aiW6cULYsx6tBm0jXpR/AUWR6HRq9WVW6MRhIq5jLyjbaCTDCijyYJNpCajdyobP/eTw0iexBAKkJ3gA5KcQb2zBXsIBckn+xVv8jkZSaEFHE+jFEleAEfayRU0MouNoBmB/L50Ai/HSLIHxcrpCvnhSQAuakKp2C/YbCylJjXRVy/z3+Kv/RrNcCo+WUzlVEhzKffnTQnxeN9fWF88fiNCUdSTsaufaChKWInHeysygfpIqagoakW+vV20J8uyl6TyNKEZWV4oRSPyCkWpgOLSbkCObT8o2r6tlG58HQquf6O0v50tB7JM7F4EORd2dx/K0w/KHsVkLPaoYrwgP/y7krr3SSMA4zj+OBgmjYkxcdIJQyQRKgg2viX9Hddi9UBb29LrKR7CVVEEEXWojUkXNyfTNDE14W9gbHJNuhjDettN3ZvbOvdOqCD3Jp/9l+/wJE+9PkYGjx/fqkys3S2rMozM/o2106rfMUINo6hVqz+eu/hd1c4xTg0TAfy5kV+4UG6+IthHTU9woWmxuKNbTfuCSfovBCxq7EtHqvYL4Sm6F8GVxsSXHMQ07TOi1DKtZxjWaaIyi4CXWjxPccUw8WVbMYY5wxC1mzEyXMJWkllpRloi+Kkoq69sxBTlElF6aAxYUbjXNlhlDZilDnM4U5SlN5biRsRHnbx3mbeWjEh4mEyiuJDl5XcWVmX5GvNkFgLWZM5qwsop4/AWfLhU1cR7k1VVvcYCWRkOI6Xy5gmnphCYIkvzuNYzHzosq2oNk2RtSs8khfUOfHIDgR6ysYBaMpl4uEgk2U/oJTs9AaTSwma7dT69geAE2ZpEjUsn2ieJNHeKfrI3EcAGJ2ZaNgVuC8EBctCLc57P5u5led6IOBkIYkuQMrmmjChs4VkfOerHqSBkPzZlhe06RslZ3zMjk2sscqKwY0RcjKK+LWbzd7KiHhkncs/siFJ+V5eXxD34B8nVuJEpGJNmxN2gH3vSvp7J70tF+D1Ej8qUJD1TkErAND2GZwTFg/LubvmgiBG3SOvdlsqFQrkEzJCL1rstlnVFROixZoDDSuXQFHESwVGlcuQcMb/b42NgjLowh5MTDFE3vNB5qStRIErdCQEh6pLPR92anSUb/wAIhldAaDMpGgAAAABJRU5ErkJggg==";
const _LEAFLET_SHADOW = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACkAAAApCAQAAAACach9AAACMUlEQVR4Ae3ShY7jQBAE0Aoz/f9/HTMzhg1zrdKUrJbdx+Kd2nD8VNudfsL/Th///dyQN2TH6f3y/BGpC379rV+S+qqetBOxImNQXL8JCAr2V4iMQXHGNJxeCfZXhSRBcQMfvkOWUdtfzlLgAENmZDcmo2TVmt8OSM2eXxBp3DjHSMFutqS7SbmemzBiR+xpKCNUIRkdkkYxhAkyGoBvyQFEJEefwSmmvBfJuJ6aKqKWnAkvGZOaZXTUgFqYULWNSHUckZuR1HIIimUExutRxwzOLROIG4vKmCKQt364mIlhSyzAf1m9lHZHJZrlAOMMztRRiKimp/rpdJDc9Awry5xTZCte7FHtuS8wJgeYGrex28xNTd086Dik7vUMscQOa8y4DoGtCCSkAKlNwpgNtphjrC6MIHUkR6YWxxs6Sc5xqn222mmCRFzIt8lEdKx+ikCtg91qS2WpwVfBelJCiQJwvzixfI9cxZQWgiSJelKnwBElKYtDOb2MFbhmUigbReQBV0Cg4+qMXSxXSyGUn4UbF8l+7qdSGnTC0XLCmahIgUHLhLOhpVCtw4CzYXvLQWQbJNmxoCsOKAxSgBJno75avolkRw8iIAFcsdc02e9iyCd8tHwmeSSoKTowIgvscSGZUOA7PuCN5b2BX9mQM7S0wYhMNU74zgsPBj3HU7wguAfnxxjFQGBE6pwN+GjME9zHY7zGp8wVxMShYX9NXvEWD3HbwJf4giO4CFIQxXScH1/TM+04kkBiAAAAAElFTkSuQmCC";
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving/";
let _mapInstances = {};
let _mapSelectedId = null;

function leafletReady() {
  return typeof L !== "undefined";
}
function setupLeafletIcons() {
  if (!leafletReady() || L.Icon.Default.prototype._ipkFixed) return;
  L.Icon.Default.mergeOptions({
    iconUrl: _LEAFLET_ICON,
    iconRetinaUrl: _LEAFLET_ICON_2X,
    shadowUrl: _LEAFLET_SHADOW
  });
  L.Icon.Default.prototype._ipkFixed = true;
}
function mapOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}
function destroyMap(id) {
  const m = _mapInstances[id];
  if (m) {
    try { m.remove(); } catch (e) {}
    delete _mapInstances[id];
  }
}
function createMap(containerId, opts) {
  opts = opts || {};
  destroyMap(containerId);
  const el = document.getElementById(containerId);
  if (!el || !leafletReady()) return null;
  setupLeafletIcons();
  const map = L.map(el, { zoomControl: true, attributionControl: true });
  const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  });
  tiles.on("tileerror", () => {
    const banner = document.getElementById(containerId + "-offline");
    if (banner) banner.hidden = false;
  });
  tiles.addTo(map);
  map.setView(opts.center || [55.75, 37.62], opts.zoom || 5);
  _mapInstances[containerId] = map;
  setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 80);
  return map;
}
function parseRouteEndpoints(routeStr) {
  const s = String(routeStr || "").trim();
  if (!s) return null;
  const parts = s.split(/\s*(?:→|->|—|–)\s*/).map(x => x.trim()).filter(Boolean);
  if (parts.length >= 2) return { from: parts[0], to: parts[parts.length - 1] };
  return null;
}
function endpointsForZayavka(z) {
  const from = z.loading_address || "";
  const to = z.unloading_address || "";
  if (from && to) return { from, to };
  return parseRouteEndpoints([from, to].filter(Boolean).join(" → "));
}
function endpointsForTrip(t) {
  return parseRouteEndpoints(t.route || "");
}
function formatMapRate(v) {
  if (v == null || v === "") return "—";
  if (typeof formatTripRate === "function") return formatTripRate(v);
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  if (!isNaN(n) && n > 0) return money(n) + " ₽";
  return String(v);
}
async function fetchOsrmLatLngs(a, b) {
  // a,b are [lat,lon]
  const url = OSRM_URL + a[1] + "," + a[0] + ";" + b[1] + "," + b[0] + "?overview=full&geometries=geojson";
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
  try {
    const r = await fetch(url, { mode: "cors", signal: ctrl ? ctrl.signal : undefined });
    if (!r.ok) throw new Error("osrm " + r.status);
    const data = await r.json();
    const route = data.routes && data.routes[0];
    if (!route || !route.geometry || !route.geometry.coordinates) throw new Error("no geom");
    const latlngs = route.geometry.coordinates.map(c => [c[1], c[0]]);
    return { latlngs, km: (route.distance || 0) / 1000, source: "osrm" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function resolveRoutePath(fromName, toName) {
  const a = resolveCity(fromName), b = resolveCity(toName);
  if (!a || !b) {
    return { ok: false, unknown: [!a && fromName, !b && toName].filter(Boolean) };
  }
  const straightKm = haversineKm(a.coords, b.coords) * 1.2;
  const fallback = {
    ok: true,
    fromKey: a.key, toKey: b.key,
    fromCoords: a.coords, toCoords: b.coords,
    latlngs: [a.coords, b.coords],
    km: straightKm,
    source: "straight"
  };
  if (!mapOnline()) return fallback;
  try {
    const osrm = await fetchOsrmLatLngs(a.coords, b.coords);
    return {
      ok: true,
      fromKey: a.key, toKey: b.key,
      fromCoords: a.coords, toCoords: b.coords,
      latlngs: osrm.latlngs,
      km: osrm.km || straightKm,
      source: "osrm"
    };
  } catch (e) {
    return fallback;
  }
}
function collectMapItems() {
  const items = [];
  for (const z of (DB.zayavki || [])) {
    const ep = endpointsForZayavka(z);
    if (!ep) continue;
    items.push({
      id: "z-" + z.id,
      kind: "zayavka",
      title: "Заявка №" + (z.number || z.id),
      from: ep.from, to: ep.to,
      date: z.date || z.created_at || "",
      driver: z.driver || "",
      rate: z.rate,
      carrier: (z.carrier && z.carrier.full_name) || "",
      raw: z
    });
  }
  for (const t of (DB.trips || [])) {
    const ep = endpointsForTrip(t);
    if (!ep) continue;
    items.push({
      id: "t-" + t.id,
      kind: "trip",
      title: "Рейс " + (t.client || t.id),
      from: ep.from, to: ep.to,
      date: t.date || "",
      driver: t.driver || t.carrier || "",
      rate: t.client_rate || t.carrier_rate || "",
      carrier: t.carrier || "",
      raw: t
    });
  }
  items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return items;
}
function popupHtml(item, path) {
  const km = path && path.km ? (" · ≈" + Math.round(path.km) + " км") : "";
  const src = path && path.source === "osrm" ? " (по дорогам)" : (path && path.source === "straight" ? " (оценка)" : "");
  return `<strong>${esc(item.title)}</strong><br>
    ${esc(item.from)} → ${esc(item.to)}${km}${src}<br>
    Дата: <strong>${esc(fmtDate(item.date))}</strong><br>
    Водитель: <strong>${esc(item.driver || "—")}</strong><br>
    Ставка: <strong>${esc(formatMapRate(item.rate))}</strong>` +
    (item.carrier ? `<br>Перевозчик: ${esc(item.carrier)}` : "");
}
async function drawItemOnMap(map, item, opts) {
  opts = opts || {};
  const path = await resolveRoutePath(item.from, item.to);
  if (!path.ok) return null;
  const color = item.kind === "trip" ? "#2563eb" : "#059669";
  const line = L.polyline(path.latlngs, {
    color: color,
    weight: opts.selected ? 6 : 4,
    opacity: opts.selected ? 0.95 : 0.7
  }).addTo(map);
  const m1 = L.marker(path.fromCoords).addTo(map);
  const m2 = L.marker(path.toCoords).addTo(map);
  const html = popupHtml(item, path);
  line.bindPopup(html); m1.bindPopup(html); m2.bindPopup(html);
  if (opts.open) line.openPopup();
  return { line, m1, m2, path, group: L.featureGroup([line, m1, m2]) };
}
function renderKarta() {
  const online = mapOnline();
  return `<h1>Карта</h1>
  <div class="warn-box">${online
    ? "Маршруты заявок и рейсов. Тайлы карты и построение по дорогам требуют интернет."
    : "Карта требует интернет — показаны только сохранённые координаты городов, тайлы недоступны офлайн."}</div>
  <div class="map-toolbar">
    <label class="check"><input type="checkbox" id="map-show-z" checked> Заявки</label>
    <label class="check"><input type="checkbox" id="map-show-t" checked> Рейсы</label>
    <button class="btn secondary" id="btn-map-fit">Показать все</button>
    <span class="muted" id="map-status"></span>
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
async function refreshKartaMap() {
  if (!leafletReady()) {
    const st = document.getElementById("map-status");
    if (st) st.textContent = "Leaflet не загружен";
    return;
  }
  const showZ = document.getElementById("map-show-z")?.checked !== false;
  const showT = document.getElementById("map-show-t")?.checked !== false;
  const listEl = document.getElementById("map-list");
  const status = document.getElementById("map-status");
  const offline = document.getElementById("karta-map-offline");
  if (offline) offline.hidden = mapOnline();

  const map = createMap("karta-map", { center: [55.0, 40.0], zoom: 5 });
  if (!map) return;

  const items = collectMapItems().filter(it =>
    (it.kind === "zayavka" && showZ) || (it.kind === "trip" && showT)
  );
  const layers = [];
  let drawn = 0, skipped = 0;
  if (listEl) listEl.innerHTML = "";
  for (const item of items) {
    const a = resolveCity(item.from), b = resolveCity(item.to);
    const canPlot = !!(a && b);
    if (listEl) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "map-item" + (_mapSelectedId === item.id ? " active" : "");
      btn.dataset.mapId = item.id;
      btn.innerHTML = `<strong>${esc(item.title)}</strong> · ${esc(fmtDate(item.date))}
        <div>${esc(item.from)} → ${esc(item.to)}</div>
        <div class="meta">Водитель: ${esc(item.driver || "—")} · Ставка: ${esc(formatMapRate(item.rate))}${canPlot ? "" : " · <span style=color:#b45309>город не в таблице</span>"}</div>`;
      btn.onclick = () => selectMapItem(item.id);
      listEl.appendChild(btn);
    }
    if (!canPlot) { skipped++; continue; }
    const drawnItem = await drawItemOnMap(map, item, { selected: _mapSelectedId === item.id, open: _mapSelectedId === item.id });
    if (drawnItem) { layers.push(drawnItem.group); drawn++; }
  }
  if (layers.length) {
    const g = L.featureGroup(layers);
    try { map.fitBounds(g.getBounds().pad(0.15)); } catch (e) {}
  }
  if (status) status.textContent = `На карте: ${drawn}` + (skipped ? ` · без координат: ${skipped}` : "");
  window._kartaLayers = layers;
}
async function selectMapItem(id) {
  _mapSelectedId = id;
  await refreshKartaMap();
}
function bindKartaHandlers() {
  const z = document.getElementById("map-show-z");
  const t = document.getElementById("map-show-t");
  if (z) z.onchange = () => refreshKartaMap();
  if (t) t.onchange = () => refreshKartaMap();
  const fit = document.getElementById("btn-map-fit");
  if (fit) fit.onclick = () => refreshKartaMap();
  refreshKartaMap();
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
    <div class="map-wrap">
      <div id="stavki-map" style="height:100%;width:100%"></div>
      <div class="map-offline" id="stavki-map-offline" ${online ? "hidden" : ""}>Карта требует интернет</div>
    </div>`;
  if (!leafletReady()) {
    document.getElementById("stavki-map-meta").textContent = "Карта недоступна";
    return;
  }
  const path = await resolveRoutePath(from, to);
  const meta = document.getElementById("stavki-map-meta");
  if (!path.ok) {
    meta.textContent = "Не знаю координаты: " + (path.unknown || []).join(", ");
    return;
  }
  const srcLabel = path.source === "osrm" ? "по дорогам (OSRM)" : "прямая × 1.2 (оценка)";
  meta.textContent = `${path.fromKey} → ${path.toKey} · ≈${Math.round(path.km)} км · ${srcLabel}`;
  const map = createMap("stavki-map", { center: path.fromCoords, zoom: 6 });
  if (!map) return;
  const line = L.polyline(path.latlngs, { color: "#7c3aed", weight: 5, opacity: 0.9 }).addTo(map);
  L.marker(path.fromCoords).addTo(map).bindPopup("Откуда: " + esc(from));
  L.marker(path.toCoords).addTo(map).bindPopup("Куда: " + esc(to));
  try { map.fitBounds(line.getBounds().pad(0.2)); } catch (e) {}
  const off = document.getElementById("stavki-map-offline");
  if (off) off.hidden = mapOnline();
}
