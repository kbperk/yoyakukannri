/* =========================================================
 * admin.js (GitHub Pages 用) — 管理画面UI 完全動作・ポイント対応版
 * ========================================================= */

const API_EXEC_URL = 'https://script.google.com/macros/s/AKfycbwkkj4vp6v9gfjLZIxsLN-1aaUjyQebngxfTuMDPz62x_xg4dCadey920wmL3IYtS82kA/exec';

const OPEN_HOUR = 9;
const CLOSE_HOUR = 20;

let _currentDateStr = '';
let _lastData = null;

// ★ 新規: アプリ設定のキャッシュ用
let _appSettingsCache = {};

// ----------------- POST通信（Google複数アカウント問題 回避版） -----------------
async function postApi_(action, payload, opt){
  if(!API_EXEC_URL || !API_EXEC_URL.includes('/exec')){
    throw new Error('API_EXEC_URL が未設定です');
  }

  const options = opt || {};
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 15000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const bodyData = { action: action, ...payload };

  try {
    const response = await fetch(API_EXEC_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(bodyData),
      signal: controller.signal
    });
    
    clearTimeout(timer);
    const json = await response.json();
    return json;
  } catch(e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      throw new Error('タイムアウト（API応答なし）');
    }
    throw new Error('通信に失敗しました。');
  }
}

async function api_(action, payload, opt){
  const p = payload || {};
  const token = sessionStorage.getItem('kb_admin_token');
  if(token) p.token = token;
  if (sessionStorage.getItem('kb_admin_ensured')) {
    p.skip_ensure = true;
  }
  const resp = await postApi_(action, p, { timeoutMs: opt?.timeoutMs });
  if(!resp) throw new Error('APIレスポンスが空です');
  
  if(resp.status === 'error' || resp.ok === false){
    const errMsg = resp.error || 'API Error';
    if (errMsg === 'SessionExpired' || errMsg === 'AuthFailed') {
      sessionStorage.removeItem('kb_admin_token');
      document.body.innerHTML = '<div style="padding:30px;text-align:center;color:#EF4444;font-weight:bold;font-size:1.2em;margin-top:50px;">セッションの有効期限が切れました。<br><br>セキュリティのため、ブックマークから再度画面を開き直してください。</div>';
      throw new Error('セッション期限切れ');
    }
    throw new Error(errMsg);
  }
  
  sessionStorage.setItem('kb_admin_ensured', '1');
  return (typeof resp.data !== 'undefined') ? resp.data : resp;
}

// ----------------- マジックリンク認証初期化 -----------------
async function initAuth_() {
  const urlParams = new URLSearchParams(window.location.search);
  const key = urlParams.get('key');

  if (key) {
    showOverlay('鍵を認証中...');
    try {
      const res = await postApi_('verify_magic_link', { key: key }, { timeoutMs: 15000 });
      if (res && res.data && res.data.token) {
        sessionStorage.setItem('kb_admin_token', res.data.token);
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      } else {
        throw new Error("AuthFailed");
      }
    } catch(e) {
      hideOverlay();
      document.body.innerHTML = '<div style="padding:30px;text-align:center;color:#EF4444;font-weight:bold;font-size:1.2em;margin-top:50px;">認証に失敗しました。<br><br>URLが間違っているか、鍵が古くなっています。<br>正しい合鍵URL（ブックマーク）からアクセスしてください。</div>';
      throw new Error("Auth Failed");
    }
  }

  const token = sessionStorage.getItem('kb_admin_token');
  if (!token) {
    document.body.innerHTML = '<div style="padding:30px;text-align:center;color:#EF4444;font-weight:bold;font-size:1.2em;margin-top:50px;">URLが不正です。<br><br>管理者用の正しいブックマーク（合鍵付きURL）からアクセスしてください。</div>';
    throw new Error("No Token");
  }
}

// ----------------- アプリ設定のロード (裏側で実行) -----------------
async function loadAppSettings_() {
  try {
    const token = sessionStorage.getItem('kb_admin_token');
    if (!token) return;
    const res = await postApi_('admin_app_settings_get', { token: token }, { timeoutMs: 10000 });
    _appSettingsCache = res.data || res || {};
  } catch(e) {
    console.warn("AppSettings load error", e);
  }
}

// ----------------- UI helpers -----------------
function qs(id){ return document.getElementById(id); }

function showBanner(msg, isSuccess = false){
  const b = qs('banner');
  if(!b) return;
  b.style.display = 'block';
  b.textContent = msg;
  if(isSuccess) {
    b.style.backgroundColor = '#10B981'; 
    b.style.color = '#fff';
  } else {
    b.style.backgroundColor = '#EF4444'; 
    b.style.color = '#fff';
  }
}
function hideBanner(){ const b=qs('banner'); if(b){ b.style.display='none'; b.textContent=''; } }

let __overlayWatchTimer = null;
function __overlayWatchStart_(){
  if(__overlayWatchTimer) clearTimeout(__overlayWatchTimer);
  __overlayWatchTimer = setTimeout(()=>{
    try{ hideOverlay(); showBanner('通信が不安定です。再操作してください。'); }catch(_){}
  }, 20000);
}
function __overlayWatchStop_(){
  if(__overlayWatchTimer) clearTimeout(__overlayWatchTimer);
  __overlayWatchTimer = null;
}

function showOverlay(msg){
  const o = qs('overlay');
  const t = qs('overlayText');
  if(t) t.textContent = msg || '読み込み中';
  if(o) o.style.display = 'flex';
  __overlayWatchStart_();
}
function setOverlayText(msg){
  const t = qs('overlayText');
  if(t) t.textContent = msg || '';
}
function hideOverlay(){
  const o = qs('overlay');
  if(o) o.style.display = 'none';
  __overlayWatchStop_();
}

function openModal(title, bodyHtml, footerHtml){
  qs('modalTitle').textContent = title || '';
  qs('modalBody').innerHTML = bodyHtml || '';
  qs('modalFooter').innerHTML = footerHtml || '';
  qs('modal').style.display = 'flex';
}
function closeModal(){ qs('modal').style.display = 'none'; }
function onModalClose(){
  const mc = qs('modalClose');
  if(mc) mc.addEventListener('click', closeModal);
  const m = qs('modal');
  if(m) m.addEventListener('click', (e)=>{ if(e.target && e.target.id==='modal') closeModal(); });
}

function fmtJP(dateStr){
  if(!dateStr) return '----';
  return dateStr.replace(/-/g,'/');
}

async function openMonthSummaryModal_(){
  const base = _currentDateStr || new Date().toISOString().slice(0,10);
  const y = Number(base.slice(0,4));
  const m = Number(base.slice(5,7));
  await showMonth_(y, m);
}

async function openDayDetailsModal_(dateStr){
  const d = await api_('adminDayDetails', { date: dateStr }, { timeoutMs: 20000 });
  const totals = d && d.totals ? d.totals : { peopleTotal:0, amountTotal:0, byTime:{} };
  const byTime = totals.byTime || {};
  const warnings = Array.isArray(d && d.warnings ? d.warnings : null) ? d.warnings : [];

  const fmtYen = (n)=>{
    const x = Number(n||0)||0;
    try{ return x.toLocaleString('ja-JP'); }catch(_){ return String(x); }
  };

  let warnHtml = '';
  if(warnings.length>0){
    warnHtml = `<div class="banner" style="display:block;margin:10px 0;">${warnings.map(w=>escapeHtml_(w)).join('<br>')}</div>`;
  }

  const rows=[];
  for(let hh=OPEN_HOUR; hh<=CLOSE_HOUR; hh++){
    const t=('0'+hh).slice(-2)+':00';
    const b = byTime[t] || { people:0, amount:0, count:0 };
    rows.push(`<tr><td>${t}</td><td style="text-align:right;">${b.people}</td><td style="text-align:right;">${fmtYen(b.amount)}</td><td style="text-align:right;">${b.count}</td></tr>`);
  }

  const items = Array.isArray(d && d.items ? d.items : null) ? d.items : [];
  items.sort((a,b)=>{
    const ta = String(a.time||'');
    const tb = String(b.time||'');
    if(ta!==tb) return ta.localeCompare(tb);
    const ca = String(a.created_at||'');
    const cb = String(b.created_at||'');
    return ca.localeCompare(cb);
  });

  const itemHtml = items.map(it=>{
    const name = escapeHtml_(it.name||'');
    const contact = escapeHtml_(it.phone || it.email || '');
    const st = escapeHtml_(it.status||'');
    const head = Number(it.head_count||0)||0;
    const amt = Number(it.amount||0)||0;
    const detail = (it.details_text ? escapeHtml_(it.details_text) : '');
    const created = escapeHtml_(it.created_at||'');
    return `
      <div class="list-item" style="display:block; max-width:100%;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <div style="font-weight:800;">${escapeHtml_(it.time||'--:--')} / ${name}</div>
          <div style="text-align:right;min-width:90px;">
            <div style="font-weight:800;">${head}人</div>
            <div class="muted">${fmtYen(amt)}円</div>
          </div>
        </div>
        <div class="muted" style="margin-top:6px; word-break:break-all;">${contact}${contact? ' / ' : ''}${st}${created? ' / '+created : ''}</div>
        ${detail? `<div style="margin-top:6px;white-space:pre-wrap;">${detail}</div>` : ''}
      </div>`;
  }).join('');

  const body = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;">
      <div><strong>${escapeHtml_(dateStr)}</strong></div>
      <div style="text-align:right;">
        <div style="font-weight:800;">合計 ${totals.peopleTotal||0} 人</div>
        <div class="muted">合計 ${fmtYen(totals.amountTotal||0)} 円</div>
      </div>
    </div>
    ${warnHtml}
    <div class="table-responsive" style="margin-top:10px;">
      <table style="width:100%;border-collapse:collapse;min-width:300px;">
        <thead><tr><th style="text-align:left;">時間</th><th style="text-align:right;">人数</th><th style="text-align:right;">金額</th><th style="text-align:right;">件数</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>
    <hr style="margin:12px 0;border:none;border-top:1px solid rgba(0,0,0,.15);" />
    <div>${itemHtml || '<div class="muted">予約がありません</div>'}</div>
  `;

  openModal('当日詳細', body, `<div class="actions"><button class="btn press" onclick="closeModal()">閉じる</button></div>`);
}

function escapeHtml_(s){
  return String(s||'').replace(/[&<>'"]/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;' }[c] || c));
}

async function showMonth_(year, month){
  showOverlay('読み込み中');
  try{
    const data = await api_('adminMonthSummary', { year, month });
    hideOverlay();

    const monthLabel = `${year}年 ${('0'+month).slice(-2)}月`;
    const html = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <button class="btn-outline press" id="__mPrev">＜</button>
        <div style="font-weight:900;font-size:22px;">${monthLabel}</div>
        <button class="btn-outline press" id="__mNext">＞</button>
      </div>
      <div id="__mGrid" style="margin-top:10px;"></div>
    `;
    openModal('予約一覧', html, `<button class="btn press" id="__mClose">閉じる</button>`);
    renderMonthGrid_(year, month, (data && data.daily) ? data.daily : {}, '__mGrid');

    setTimeout(()=>{
      const c = qs('__mClose'); if(c) c.onclick = closeModal;
      const p = qs('__mPrev'); if(p) p.onclick = async ()=>{
        const d = new Date(year, month-2, 1);
        await showMonth_(d.getFullYear(), d.getMonth()+1);
      };
      const n = qs('__mNext'); if(n) n.onclick = async ()=>{
        const d = new Date(year, month, 1);
        await showMonth_(d.getFullYear(), d.getMonth()+1);
      };
    },0);

  }catch(e){
    hideOverlay();
    openModal('⚠️ エラー', `<div style="text-align:center; padding:20px; color:#E60012; font-weight:bold; font-size:1.1em; line-height:1.6; white-space:pre-wrap;">${escapeHtml_(e.message || String(e))}</div>`, `<div style="width:100%; display:flex;"><button class="btn press" style="flex:1; background:#6B7280; color:#fff; border:none;" onclick="closeModal()">閉じる</button></div>`);
  }
}

function renderMonthGrid_(year, month, dailyMap, mountId){
  const mount = (typeof mountId==='string') ? qs(mountId) : mountId;
  if(!mount) return;

  const first = new Date(year, month-1, 1);
  const firstDow = first.getDay(); 
  const last = new Date(year, month, 0);
  const lastDate = last.getDate();

  const weekLabels = ['日','月','火','水','木','金','土'];

  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
  grid.style.gap = '4px';

  weekLabels.forEach(w=>{
    const h = document.createElement('div');
    h.textContent = w;
    h.style.textAlign = 'center';
    h.style.fontWeight = '800';
    h.style.padding = '6px 0';
    h.style.fontSize = '0.9em';
    grid.appendChild(h);
  });

  const totalCells = 42;
  for(let i=0;i<totalCells;i++){
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'press';
    cell.style.border = '1px solid #e8e8e8';
    cell.style.borderRadius = '10px';
    cell.style.background = '#fff';
    cell.style.minHeight = '50px';
    cell.style.padding = '4px';
    cell.style.display = 'flex';
    cell.style.flexDirection = 'column';
    cell.style.alignItems = 'center';
    cell.style.justifyContent = 'space-between';

    const dayNum = i - firstDow + 1;
    if(dayNum < 1 || dayNum > lastDate){
      cell.disabled = true;
      cell.style.opacity = '0.35';
      cell.innerHTML = `<div style="font-weight:800;"> </div><div></div>`;
      grid.appendChild(cell);
      continue;
    }

    const dd = ('0'+dayNum).slice(-2);
    const mm = ('0'+month).slice(-2);
    const dateStr = `${year}-${mm}-${dd}`;
    const people = Number(dailyMap[dateStr]||0) || 0;

    cell.innerHTML = `
      <div style="font-weight:900;font-size:16px;">${dayNum}</div>
      <div style="width:100%;display:flex;justify-content:center;">
        ${people>0 ? `<span style="background:#E60012;color:#fff;border-radius:999px;padding:2px 6px;font-weight:800;font-size:12px;">${people}</span>` : `<span class="muted"> </span>`}
      </div>
    `;

    if(_currentDateStr === dateStr){
      cell.style.border = '2px solid #000';
    }

    cell.addEventListener('click', async ()=>{
      closeModal();
      await setDate_(dateStr);
    });

    grid.appendChild(cell);
  }

  mount.innerHTML = '';
  mount.appendChild(grid);
}

async function setDate_(dateStr){
  _currentDateStr = dateStr;
  qs('admDateText').textContent = fmtJP(dateStr);
  showOverlay('日付読み込み中');
  await loadAndRender_();
}

function buildTimeList_(){
  const list=[];
  for(let h=OPEN_HOUR; h<=CLOSE_HOUR; h++){
    list.push(('0'+h).slice(-2)+':00');
  }
  return list;
}

function normalizeSlots_(slots){
  return (slots||[]).map(s=>({
    time: s.time,
    open: (typeof s.open!=='undefined') ? !!s.open : ((typeof s.is_open!=='undefined') ? !!s.is_open : !!s.isOpen),
    cap: Number((typeof s.cap!=='undefined') ? s.cap : ((typeof s.capacity!=='undefined') ? s.capacity : (typeof s.capacity_max!=='undefined' ? s.capacity_max : s.capacityMax))) || 0,
    reserved: Number(s.reserved||0)||0
  }));
}

function renderSlots_(slots){
  const root = qs('admToggles');
  root.innerHTML = '';

  const times = buildTimeList_();
  const map = new Map(slots.map(s=>[s.time, s]));

  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '1fr 0.3fr 0.4fr';
  grid.style.gap = '8px';
  grid.style.alignItems = 'stretch';

  function mkCell(tag, cls, text){
    const el = document.createElement(tag);
    el.className = cls || '';
    el.textContent = text || '';
    return el;
  }

  times.forEach((t)=>{
    const s = map.get(t) || {time:t, open:false, cap:0, reserved:0};

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toggle press';
    btn.textContent = t;
    btn.dataset.time = t;
    btn.dataset.open = s.open ? '1':'0';
    if(s.open) btn.classList.add('on');

    const reserved = mkCell('div','toggle', String(s.reserved||0));
    reserved.style.background = '#fff';
    reserved.style.pointerEvents = 'none';

    const cap = document.createElement('input');
    cap.type = 'number';
    cap.min = '0';
    cap.inputMode = 'numeric';
    cap.value = String(s.cap||0);
    cap.className = 'toggle';
    cap.dataset.time = t;
    cap.dataset.cap = '1';
    cap.style.textAlign = 'center';
    cap.style.padding = '0';

    btn.addEventListener('click', ()=>{
      const open = btn.dataset.open === '1';
      const hasRes = Number(s.reserved||0) > 0;
      if(open && hasRes){
        showBanner(`予約がある時間はOFFにできません：${t}`);
        setTimeout(hideBanner, 2500);
        return;
      }
      btn.dataset.open = open ? '0':'1';
      btn.classList.toggle('on', !open);
    });

    cap.addEventListener('change', ()=>{
      let v = Number(cap.value||0);
      if(!isFinite(v) || v<0) v=0;
      cap.value = String(v);
    });

    grid.appendChild(btn);
    grid.appendChild(reserved);
    grid.appendChild(cap);
  });

  root.appendChild(grid);
}

function renderRemain_(slots){
  const times = slots.filter(s=> (s.open && (s.reserved||0)>0));
  if(times.length===0){
    qs('admTimes').innerHTML = '<div class="muted">（本日、予約はありません）</div>';
    return;
  }
  const html = times.map(s=>{
    const remain = Math.max(0, (s.cap||0)-(s.reserved||0));
    const cls = remain<=0 ? 'alert' : (remain<=2 ? 'warn' : 'ok');
    return `<div class="remain-badge ${cls}">
      <span class="t">${s.time}</span>
      <span class="m">${remain}/${s.cap}</span>
    </div>`;
  }).join('');
  qs('admTimes').innerHTML = html;
}

// ★ 新規追加機能：2軸ポイント表示と割引メニューの排他制御を組み込んだ受付モーダル
function buildAndShowCheckInModal(qrData, scannedMemberId, finalResId, todayStr) {
  const memberName = qrData.member ? qrData.member.name : '不明なユーザー';
  const targetRes = qrData.reservation;
  const settings = qrData.settings || {};
  const duplicateWarning = qrData.duplicate_warning === true;
  const unconsumedReservation = qrData.unconsumed_reservation || null;
  const m = qrData.member || {};
  const todayUnitPrice = Number(qrData.today_unit_price || 0);

  let isReserved = (targetRes && targetRes.status === 'reserved');
  let initialHead = isReserved ? (targetRes.head_count || 1) : 1;

  let isCamp = false;
  let cDisc = Number(settings.campaign_discount || 0);
  if (cDisc > 0 && settings.campaign_start && settings.campaign_end && todayStr >= settings.campaign_start && todayStr <= settings.campaign_end) {
      isCamp = true;
  }
  const baseUnit = isCamp ? (todayUnitPrice + cDisc) : todayUnitPrice;

  // 割引オプション（ラジオボタン）HTMLの構築
  let optionsHtml = '';
  if (isCamp) {
    optionsHtml += `
      <label style="display:flex; align-items:center; gap:8px; padding:10px; background:#fff; border:2px solid #E60012; border-radius:8px; margin-bottom:8px; cursor:pointer;">
        <input type="radio" name="discount_type" value="campaign" checked style="transform:scale(1.2);">
        <span style="font-weight:bold; color:#E60012;">🎁 キャンペーン適用 (-${cDisc}円/人)</span>
      </label>
    `;
  } else {
    optionsHtml += `
      <label style="display:flex; align-items:center; gap:8px; padding:10px; background:#fff; border:1px solid #ccc; border-radius:8px; margin-bottom:8px; cursor:pointer;">
        <input type="radio" name="discount_type" value="none" checked style="transform:scale(1.2);">
        <span style="font-weight:bold; color:#333;">割引なし（通常料金）</span>
      </label>
    `;
  }

  for (let i=1; i<=3; i++) {
    const reqPt = Number(_appSettingsCache[`ex_pt_${i}`] || 0);
    const discAmt = Number(_appSettingsCache[`ex_discount_${i}`] || 0);
    const text = _appSettingsCache[`ex_text_${i}`] || '';
    if (reqPt > 0) {
      const disabled = (m.current_point || 0) < reqPt;
      const opacity = disabled ? '0.5' : '1';
      optionsHtml += `
        <label style="display:flex; align-items:center; gap:8px; padding:10px; background:#fff; border:1px solid #ccc; border-radius:8px; margin-bottom:8px; cursor:${disabled ? 'not-allowed' : 'pointer'}; opacity:${opacity};">
          <input type="radio" name="discount_type" value="point_${i}" ${disabled ? 'disabled' : ''} style="transform:scale(1.2);">
          <span style="font-weight:bold; color:#2563EB;">✨ ${text} (${reqPt}pt消費)</span>
        </label>
      `;
    }
  }
  
  let warnHtml = '';
  if(duplicateWarning) warnHtml += `<p style="color:#E60012; font-weight:bold; margin-bottom:10px; background:#FFE5E5; padding:8px; border-radius:6px;">⚠️ 本日すでにINの記録があります（二重受付の可能性）</p>`;
  if(unconsumedReservation) warnHtml += `<p style="color:#E60012; font-weight:bold; margin-bottom:10px; background:#FFE5E5; padding:8px; border-radius:6px;">⚠️ 本日 ${unconsumedReservation.time} に別の予約（${unconsumedReservation.head}名）が残っています</p>`;

  const html = `
    <div style="text-align:left;">
      ${warnHtml}
      <p style="margin-bottom:10px;">会員: <strong style="font-size:1.2em;">${escapeHtml_(memberName)}</strong> 様</p>
      ${targetRes ? `<p style="margin-bottom:10px; color:#2563EB; font-weight:bold;">予約あり: ${targetRes.slot_id.slice(11,16)} (${targetRes.head_count}名)</p>` : '<p style="margin-bottom:10px; color:#E60012; font-weight:bold;">※予約なし（飛び込み）</p>'}
      
      <div style="margin:15px 0; padding:15px; background:#F0FFF4; border:2px solid #32D74B; border-radius:12px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px dashed #ccc; padding-bottom:10px;">
          <div style="text-align:center; flex:1; border-right:1px dashed #ccc;">
            <p style="font-size:0.8em; color:#32D74B; font-weight:bold;">保有ポイント</p>
            <p style="font-size:1.6em; font-weight:900; color:#333;">${m.current_point || 0}<span style="font-size:0.6em;">pt</span></p>
          </div>
          <div style="text-align:center; flex:1;">
            <p style="font-size:0.8em; color:#2563EB; font-weight:bold;">累計来店回数</p>
            <p style="font-size:1.6em; font-weight:900; color:#333;">${m.visit_count || 0}<span style="font-size:0.6em;">回</span></p>
          </div>
        </div>
        <p style="font-size:0.9em; font-weight:bold; color:#666; margin-bottom:8px;">▼ 割引メニューの選択（併用不可）</p>
        <div id="discountOptionsArea" style="background:#f9f9f9; padding:10px; border-radius:8px;">
          ${optionsHtml}
        </div>
      </div>

      <div style="display:flex; align-items:center; justify-content:space-between; background:#f4f4f4; padding:10px; border-radius:8px; margin-bottom:15px;">
        <p style="font-weight:bold;">来店人数</p>
        <input type="number" id="qrHeadCount" value="${initialHead}" min="1" style="width:100px; padding:8px; border:2px solid #ccc; border-radius:6px; font-size:1.2em; font-weight:bold; text-align:center;">
      </div>

      <div style="text-align:right; font-size:1.2em; font-weight:bold; padding:10px 0;">
        お会計目安: <span id="qrFinalAmount" style="color:#E60012; font-size:1.8em; font-weight:900;">0</span> 円
      </div>
    </div>
  `;

  openModal('受付内容の確認', html, `
    <div style="display:flex; gap:10px; width:100%;">
      <button id="qrCancelBtn" class="btn-outline press" style="flex:1; padding:15px; font-weight:bold;">キャンセル</button>
      <button id="qrCommitBtn" class="btn press" style="flex:1; background-color:#10B981; color:#fff; padding:15px; font-weight:bold; font-size:1.1em; border:none;">IN 確定</button>
    </div>
  `);

  const headInput = document.getElementById('qrHeadCount');
  const amountSpan = document.getElementById('qrFinalAmount');
  const radios = document.querySelectorAll('input[name="discount_type"]');

  const updateCalc = () => {
    const head = parseInt(headInput.value) || 1;
    let total = head * baseUnit;
    const selectedRadio = document.querySelector('input[name="discount_type"]:checked');
    if(selectedRadio){
       const selected = selectedRadio.value;
       if (selected === 'campaign' && isCamp) {
         total -= (cDisc * head);
       } else if (selected.startsWith('point_')) {
         const idx = selected.split('_')[1];
         const disc = Number(_appSettingsCache[`ex_discount_${idx}`] || 0);
         total -= disc; // ポイント割引は1会計1回
       }
    }
    total = Math.max(0, total);
    amountSpan.textContent = total.toLocaleString();
  };

  headInput.addEventListener('input', updateCalc);
  radios.forEach(rd => rd.addEventListener('change', updateCalc));
  updateCalc(); 

  document.getElementById('qrCancelBtn').onclick = () => closeModal();
  
  document.getElementById('qrCommitBtn').onclick = async () => {
    const head = parseInt(headInput.value) || 1;
    if (head < 1) {
      alert('人数は1名以上にしてください');
      return;
    }
    
    let total = head * baseUnit;
    let consumePt = 0;
    let noteText = '';
    const selected = document.querySelector('input[name="discount_type"]:checked').value;

    if (selected === 'campaign' && isCamp) {
      total -= (cDisc * head);
      noteText = 'キャンペーン適用';
    } else if (selected.startsWith('point_')) {
      const idx = selected.split('_')[1];
      const reqPt = Number(_appSettingsCache[`ex_pt_${idx}`] || 0);
      const disc = Number(_appSettingsCache[`ex_discount_${idx}`] || 0);
      const text = _appSettingsCache[`ex_text_${idx}`] || '';
      total -= disc;
      consumePt = reqPt;
      noteText = `ポイント利用: ${text} (-${disc}円)`;
    }
    total = Math.max(0, total);

    showOverlay('確定処理中...');
    try {
      const res2 = await api_('adminUpdateStatus', {
        data: {
          update_type: 'qr_commit',
          date: todayStr,
          member_id: scannedMemberId,
          reservation_id: finalResId || '',
          head_count: head,
          final_amount: total,
          consumed_point: consumePt,
          discount_note: noteText
        }
      });
      hideOverlay();
      closeModal();
      
      let msg = `${escapeHtml_(res2.member_name)} 様の受付が完了しました！<br>（累計来店: <strong style="color:#2563EB;">${res2.new_count}回</strong>）`;
      if (consumePt > 0) {
          msg += `<br><br>※ポイントを <strong style="color:#E60012;">${consumePt}pt</strong> 消費しました。<br>`;
      }
      msg += `<br>確定料金: <strong style="color:#E60012; font-size:1.3em;">${total.toLocaleString()}円</strong>`;

      openModal(
        '受付完了', 
        `<div style="text-align:center; padding: 10px; font-size: 1.1em; line-height: 1.5;">${msg}</div>`, 
        '<div style="width:100%; display:flex;"><button class="btn press" style="flex:1; font-size:1em;" onclick="closeModal()">OK</button></div>'
      );
      await loadAndRender_();
    } catch (err) {
      hideOverlay();
      openModal('⚠️ エラー', `<div style="color:#E60012; font-weight:bold; white-space:pre-wrap;">${escapeHtml_(err.message || String(err))}</div>`, `<button class="btn press" onclick="closeModal()" style="width:100%;">閉じる</button>`);
    }
  };
}

function renderList_(reservations){
  const root = qs('admList');
  root.innerHTML = '';
  if(!reservations || reservations.length===0){
    return;
  }
  reservations.sort((a,b)=> String(a.time).localeCompare(String(b.time)));

  reservations.forEach(r=>{
    const row = document.createElement('div');
    row.className = 'row';

    const stLower = String(r.status).toLowerCase();
    if(stLower==='noshow') row.classList.add('is-noshow');
    if(stLower==='paid_on_site' || stLower==='checked_in') row.classList.add('is-checkedin');

    let nameStyle = '';
    if(stLower === 'paid_on_site' || stLower === 'checked_in') {
      nameStyle = 'background-color: #2563EB; color: #fff; padding: 2px 6px; border-radius: 6px; display: inline-block;';
    } else if(stLower === 'noshow') {
      nameStyle = 'background-color: #EF4444; color: #fff; padding: 2px 6px; border-radius: 6px; display: inline-block;';
    }

    row.innerHTML = `
      <div class="row-main">
        <div class="left" style="flex-wrap:wrap;">
          <span class="chip">${escapeHtml_(r.time)}</span>
          <span class="chip">${r.head_count||0}名</span>
          <span class="chip">¥${Number(r.amount||0).toLocaleString()}</span>
        </div>
      </div>
      <div class="row-sub" style="flex-direction:column; align-items:flex-start; gap:10px;">
        <div class="meta" style="width:100%;">
          <span class="kv font-bold" style="${nameStyle}">${escapeHtml_(r.name||'')}</span>
          <span class="kv" style="font-size:0.9em;">${escapeHtml_(r.phone||'')}</span>
        </div>
        <div class="ops" style="display:flex; gap:6px; width:100%; flex-wrap:wrap;">
          <button class="btn-inline btn-in press" style="flex:1; padding:10px 4px; font-size:1em;">IN</button>
          <button class="btn-inline btn-noshow press" style="flex:1; padding:10px 4px; font-size:1em;">来ず</button>
          <button class="btn-inline btn-detail press" style="flex:1; padding:10px 4px; font-size:1em; background:#6B7280; color:#fff; border:none; border-radius:8px;">詳細</button>
        </div>
      </div>
    `;

    const inBtn = row.querySelector('.btn-in');
    const nsBtn = row.querySelector('.btn-noshow');
    const detailBtn = row.querySelector('.btn-detail'); 

    inBtn.addEventListener('click', async ()=>{
      try {
        showOverlay('データ照会中...');
        const qrData = await api_('adminUpdateStatus', {
          data: { update_type: 'qr_check', member_id: r.member_id, reservation_id: r.id, date: _currentDateStr }
        });
        hideOverlay();
        buildAndShowCheckInModal(qrData, r.member_id, r.id, _currentDateStr);
      } catch(e) {
        hideOverlay();
        openModal('⚠️ エラー', `<div style="text-align:center; padding:20px; color:#E60012; font-weight:bold; font-size:1.1em; line-height:1.6; white-space:pre-wrap;">${escapeHtml_(e.message || String(e))}</div>`, `<div style="width:100%; display:flex;"><button class="btn press" style="flex:1; background:#6B7280; color:#fff; border:none;" onclick="closeModal()">閉じる</button></div>`);
      }
    });
    
    nsBtn.addEventListener('click', async ()=>{
      try{
        showOverlay('キャンセル処理中...');
        await api_('adminUpdateStatus', { data:{ id:r.id, status:'noshow', date:_currentDateStr, member_id: r.member_id } });
        await loadAndRender_();
        showBanner('⚠️ 無断キャンセルとして処理しました', true);
        setTimeout(hideBanner, 3000);
      }catch(e){
        hideOverlay();
        openModal('⚠️ エラー', `<div style="text-align:center; padding:20px; color:#E60012; font-weight:bold; font-size:1.1em; line-height:1.6; white-space:pre-wrap;">${escapeHtml_(e.message || String(e))}</div>`, `<div style="width:100%; display:flex;"><button class="btn press" style="flex:1; background:#6B7280; color:#fff; border:none;" onclick="closeModal()">閉じる</button></div>`);
      }
    });

    detailBtn.addEventListener('click', () => {
      openModal('顧客詳細', `
        <table style="width:100%; text-align:left; border-collapse: collapse; font-size: 1.05em; line-height:1.5;">
          <tr style="border-bottom:1px solid #eee;"><th style="padding:10px 0;width:35%;color:#666;">氏名</th><td style="font-weight:bold;">${escapeHtml_(r.name)}</td></tr>
          <tr style="border-bottom:1px solid #eee;"><th style="padding:10px 0;color:#666;">会員ID</th><td style="font-weight:bold; font-family:monospace;">${escapeHtml_(r.member_id)}</td></tr>
          <tr style="border-bottom:1px solid #eee;"><th style="padding:10px 0;color:#666;">電話番号</th><td>${escapeHtml_(r.phone)}</td></tr>
          <tr style="border-bottom:1px solid #eee;"><th style="padding:10px 0;color:#666;">メール</th><td style="word-break:break-all;">${escapeHtml_(r.email)}</td></tr>
          <tr style="border-bottom:1px solid #eee;"><th style="padding:10px 0;color:#666;">住所</th><td>${escapeHtml_(r.address || '未登録')}</td></tr>
          <tr><th style="padding:10px 0;color:#666;">来店回数</th><td style="font-weight:bold; color:#E60012;">${Number(r.visit_count||0)} 回</td></tr>
        </table>
      `, '<div style="width:100%; display:flex;"><button class="btn press" style="flex:1;" onclick="closeModal()">閉じる</button></div>');
    });

    root.appendChild(row);
  });
}

function renderDebts_(debts){
  const root = qs('admDebts');
  root.innerHTML = '';
  if(!debts || debts.length===0){
    root.innerHTML = '<div class="muted">（未回収はありません）</div>';
    return;
  }
  debts.forEach(d=>{
    const id = 'debt_' + btoa(unescape(encodeURIComponent(d.email||''))).replace(/=+/g,'');
    const line = document.createElement('label');
    line.style.display = 'block';
    line.style.wordBreak = 'break-all';
    line.innerHTML = `<input type="checkbox" id="${id}" data-email="${escapeHtml_(d.email)}"> ${escapeHtml_(d.email)} <br><span class="muted" style="font-size:0.85em;">(${escapeHtml_(d.last_incident_at||'')})</span>`;
    root.appendChild(line);
  });
}

function collectToggles_(){
  const btns = Array.from(document.querySelectorAll('#admToggles button.toggle'));
  const caps = Array.from(document.querySelectorAll('#admToggles input[data-cap="1"]'));
  const capByTime = new Map(caps.map(i=>[i.dataset.time, Number(i.value||0)||0]));

  return btns.map(b=>{
    const time = b.dataset.time;
    return {
      time,
      open: b.dataset.open === '1',
      cap: capByTime.get(time) ?? 0
    };
  });
}

async function loadAndRender_(){
  try{
    const data = await api_('adminInit', { date:_currentDateStr });
    _lastData = data;

    const slots = normalizeSlots_(data.slots || []);
    renderSlots_(slots);
    renderRemain_(slots);
    renderList_((data.summary && data.summary.reservations) ? data.summary.reservations : []);
    renderDebts_(data.debts || []);

    if (data.settings) {
      if (typeof data.settings.cutoffMinutes !== 'undefined'){
        qs('cutoffHours').value = String(Math.round((Number(data.settings.cutoffMinutes)||0)/60));
      }
      if (data.settings.campaign_start) qs('campStart').value = data.settings.campaign_start;
      if (data.settings.campaign_end) qs('campEnd').value = data.settings.campaign_end;
      if (data.settings.campaign_discount) qs('campDiscount').value = data.settings.campaign_discount;
    }

    hideBanner();
  }catch(e){
    showBanner(e.message||String(e));
  }finally{
    hideOverlay();
  }
}

// ----------------- Actions -----------------
function wireActions_(){
  const _nd = qs('admDateNative');
  if(_nd){
    const onPick = async ()=>{
      const v = _nd.value;
      if(v){ await setDate_(v); }
    };
    _nd.addEventListener('change', onPick);
    _nd.addEventListener('input', onPick);
    if(_currentDateStr) _nd.value = _currentDateStr;
  }

  qs('admListBtn').addEventListener('click', async ()=>{
    showOverlay('読み込み中');
    await openMonthSummaryModal_();
  });

  const ddBtn = qs('admDayDetailsBtn');
  if(ddBtn){
    ddBtn.addEventListener('click', async ()=>{
      try{
        if(!_currentDateStr) throw new Error('日付を選択してください');
        showOverlay('読み込み中');
        await openDayDetailsModal_(_currentDateStr);
      }finally{
        hideOverlay();
      }
    });
  }

  qs('admCapBulkBtn').addEventListener('click', ()=>{
    const v = Number(qs('admCapBulk').value||0);
    if(!isFinite(v)) return;
    const inputs = Array.from(document.querySelectorAll('#admToggles input[data-cap="1"]'));
    inputs.forEach(i=> i.value = String(v));
  });

  qs('admAllOff').addEventListener('click', ()=>{
    const btns = Array.from(document.querySelectorAll('#admToggles button.toggle'));
    btns.forEach(b=>{
      const time = b.dataset.time;
      const slot = (_lastData && _lastData.slots) ? normalizeSlots_(_lastData.slots).find(s=>s.time===time) : null;
      const reserved = slot ? (slot.reserved||0) : 0;
      if(reserved>0){
        b.dataset.open = '1';
        b.classList.add('on');
      }else{
        b.dataset.open = '0';
        b.classList.remove('on');
      }
    });
  });
  qs('admOpenAll').addEventListener('click', ()=>{
    const btns = Array.from(document.querySelectorAll('#admToggles button.toggle'));
    btns.forEach(b=>{ b.dataset.open='1'; b.classList.add('on'); });
  });

  qs('admCommit').addEventListener('click', async ()=>{
    try{
      showOverlay('書き込み中...');
      const toggles = collectToggles_();
      const cutoffHours = Number(qs('cutoffHours').value||0)||0;

      await api_('adminCommit', {
        data:{
          date:_currentDateStr,
          toggles,
          settings:{ cutoffHours }
        }
      });
      await loadAndRender_();
      hideOverlay();
      
      openModal(
        '完了', 
        '<div style="text-align:center; padding: 20px; font-size: 1.2em; font-weight: bold; color: #10B981;">✨ 登録を完了しました</div>', 
        '<div style="width:100%; display:flex;"><button class="btn press" style="flex:1; font-size:1em;" onclick="closeModal()">OK</button></div>'
      );

    }catch(e){
      hideOverlay();
      openModal('⚠️ エラー', `<div style="text-align:center; padding:20px; color:#E60012; font-weight:bold; font-size:1.1em; line-height:1.6; white-space:pre-wrap;">${escapeHtml_(e.message || String(e))}</div>`, `<div style="width:100%; display:flex;"><button class="btn press" style="flex:1; background:#6B7280; color:#fff; border:none;" onclick="closeModal()">閉じる</button></div>`);
    }
  });

  qs('admForce').addEventListener('click', ()=>{
    openModal('本当に強制閉鎖を行いますか？', `<div style="text-align:center; font-weight:bold; font-size:1.1em; padding:10px 0;">選択中の日付（${fmtJP(_currentDateStr)}）を強制閉鎖します。よろしいですか？</div>`,
      `<div style="width:100%; display:flex; gap:10px;">
         <button class="btn-outline press" id="__fcCancel" style="flex:1;">いいえ</button>
         <button class="btn-warn press" id="__fcOk" style="flex:1; background:#EF4444; color:#fff; border:none;">はい</button>
       </div>`);
    setTimeout(()=>{
      qs('__fcCancel').onclick = closeModal;
      qs('__fcOk').onclick = async ()=>{
        try{
          closeModal();
          showOverlay('強制閉鎖を実行中...');
          await api_('adminForceClose', { date:_currentDateStr });
          await loadAndRender_();
          hideOverlay();
          showBanner('✨ 強制閉鎖しました', true);
          setTimeout(hideBanner, 4000);
        }catch(e){
          hideOverlay();
          openModal('⚠️ エラー', `<div style="text-align:center; padding:20px; color:#E60012; font-weight:bold; font-size:1.1em; line-height:1.6; white-space:pre-wrap;">${escapeHtml_(e.message || String(e))}</div>`, `<div style="width:100%; display:flex;"><button class="btn press" style="flex:1; background:#6B7280; color:#fff; border:none;" onclick="closeModal()">閉じる</button></div>`);
        }
      };
    },0);
  });

  qs('debtsToggleBtn').addEventListener('click', ()=>{
    const box = qs('debtsBox');
    box.hidden = !box.hidden;
  });
  qs('admClear').addEventListener('click', async ()=>{
    const checks = Array.from(qs('admDebts').querySelectorAll('input[type="checkbox"]:checked'));
    if(checks.length===0) return;
    try{
      showOverlay('解除中...');
      for(const c of checks){
        const email = c.dataset.email;
        await api_('adminResolveDebt', { email });
      }
      await loadAndRender_();
      hideOverlay();
      showBanner('✨ 解除しました', true);
      setTimeout(hideBanner, 4000);
    }catch(e){
      hideOverlay();
      openModal('⚠️ エラー', `<div style="text-align:center; padding:20px; color:#E60012; font-weight:bold; font-size:1.1em; line-height:1.6; white-space:pre-wrap;">${escapeHtml_(e.message || String(e))}</div>`, `<div style="width:100%; display:flex;"><button class="btn press" style="flex:1; background:#6B7280; color:#fff; border:none;" onclick="closeModal()">閉じる</button></div>`);
    }
  });

  qs('baseToggleBtn').addEventListener('click', ()=>{ const b=qs('baseBox'); b.hidden=!b.hidden; });
  
  qs('saveBase').addEventListener('click', async ()=>{
    try{
      showOverlay('保存中...');
      const cutoffHours = Number(qs('cutoffHours').value||0)||0;
      const campaign_start = qs('campStart').value || '';
      const campaign_end = qs('campEnd').value || '';
      const campaign_discount = Number(qs('campDiscount').value||0)||0;

      await api_('adminCommit', { 
        data:{ 
          date:_currentDateStr, 
          toggles:collectToggles_(), 
          settings:{ cutoffHours, campaign_start, campaign_end, campaign_discount } 
        } 
      });
      hideOverlay();
      openModal('完了', '<div style="text-align:center; padding: 20px; font-size: 1.2em; font-weight: bold; color: #10B981;">✨ 設定を保存しました</div>', '<div style="width:100%; display:flex;"><button class="btn press" style="flex:1; font-size:1em;" onclick="closeModal()">OK</button></div>');
    }catch(e){
      hideOverlay();
      openModal('⚠️ エラー', `<div style="text-align:center; padding:20px; color:#E60012; font-weight:bold; font-size:1.1em; line-height:1.6; white-space:pre-wrap;">${escapeHtml_(e.message || String(e))}</div>`, `<div style="width:100%; display:flex;"><button class="btn press" style="flex:1; background:#6B7280; color:#fff; border:none;" onclick="closeModal()">閉じる</button></div>`);
    }
  });

  const helpBtn = qs('admHelpMain');
  if(helpBtn){
    helpBtn.addEventListener('click', ()=>{
      const content = `
        <div style="font-size: 0.95em; line-height: 1.6; max-height: 60vh; overflow-y: auto; padding-right: 10px; text-align: left; color:#333;">
          <div style="background:#FFFBEB; border:2px solid #F59E0B; padding:10px; border-radius:8px; margin-bottom:15px;">
            <h3 style="color:#D97706; margin-top:0; margin-bottom:5px;">⚠️ 最重要：日付合わせについて</h3>
            <p style="margin:0; font-weight:bold;">管理画面での操作（予約一覧の確認、IN、来ず、QR受付）はすべて「現在選択されている日付」に対して行われます。<br>必ず画面上部の日付表示が「今日（または操作したい日）」になっていることを確認してから操作してください。</p>
          </div>
          <h3 style="color:#2563EB; margin-top:20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;">👤 予約一覧と色分けの意味</h3>
          <ul style="padding-left: 20px; margin-top:5px;">
            <li style="margin-bottom:5px;"><b>無色（デフォルト）</b>：これから来店する（予約中）のお客様です。</li>
            <li style="margin-bottom:5px;"><span style="background-color:#2563EB; color:#fff; padding:2px 6px; border-radius:6px;">青色</span>：すでに「IN（受付済）」のお客様、または「飛び込み」で受付したお客様です。</li>
            <li style="margin-bottom:5px;"><span style="background-color:#EF4444; color:#fff; padding:2px 6px; border-radius:6px;">赤色</span>：無断キャンセルとして「来ず」処理をしたお客様です。</li>
          </ul>
          <h3 style="color:#2563EB; margin-top:20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;">✅ 受付・キャンセル操作（各ボタン）</h3>
          <ul style="padding-left: 20px; margin-top:5px;">
            <li style="margin-bottom:5px;"><b>IN（手動受付）</b>: 事前予約のお客様が来店された際に押します。プランや人数の変更、料金・ポイント割引の手動修正もここで行い、確定すると「青色」になります。</li>
            <li style="margin-bottom:5px;"><b>来ず（無断キャンセル）</b>: お客様が来店されなかった場合に押します。赤色に変わり、自動的に未回収対象に追加されます。</li>
            <li style="margin-bottom:5px;"><b>詳細</b>: 住所や電話番号、累計来店回数などを確認できます。</li>
          </ul>
          <h3 style="color:#2563EB; margin-top:20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;">📸 QRで来店受付</h3>
          <p style="margin-top:5px;">事前予約のお客様の「会員証QR」、または予約なし（飛び込み）のお客様の「会員証QR」を読み取ります。<br>自動で予約状況やポイント残高をチェックし、割引メニューの選択画面が開きます。</p>
        </div>
      `;
      openModal('システムの使い方マニュアル', content, `<button class="btn press" onclick="closeModal()" style="width:100%;">閉じる</button>`);
    });
  }
}

// ----------------- UI追加機能（料金・QR） -----------------
function attachPricingUI_(){
  function el(tag, props){
    const e = document.createElement(tag);
    if(props){
      Object.keys(props).forEach(k=>{
        if(k==='style') Object.assign(e.style, props.style);
        else if(k==='text') e.textContent = props.text;
        else e.setAttribute(k, props[k]);
      });
    }
    return e;
  }

  const btn = el('button', { text:'料金設定', style:{
    position:'fixed', right:'16px', bottom:'16px', zIndex:9999,
    padding:'10px 14px', borderRadius:'12px', border:'0',
    background:'#2563EB', color:'#fff', fontWeight:'700',
    boxShadow:'0 8px 20px rgba(0,0,0,0.15)', cursor:'pointer'
  }});
  btn.title = '料金設定（settings）';

  async function openPricing_(){
    try{
      const cur = await postApi_('admin_pricing_get', {}, { timeoutMs:15000 });
      const conf = cur && cur.ok ? cur.data : cur;
      const enabled = String(prompt('料金表示をONにしますか？ true/false', String(conf.pricingEnabled))) || String(conf.pricingEnabled);
      const weekday = String(prompt('平日単価（税込）', String(conf.priceWeekday))) || String(conf.priceWeekday);
      const weekend = String(prompt('土日単価（税込）', String(conf.priceWeekend))) || String(conf.priceWeekend);
      const holiday = String(prompt('祝日単価（税込）※土日と同額なら同じ数値', String(conf.priceHoliday))) || String(conf.priceHoliday);
      const taxRate = String(prompt('税率（表示/将来拡張用）', String(conf.taxRate))) || String(conf.taxRate);
      const calId = String(prompt('祝日カレンダーID（通常は既定のままでOK）', String(conf.holidayCalendarId))) || String(conf.holidayCalendarId);

      const payload = {
        pricingEnabled: enabled,
        priceWeekday: weekday,
        priceWeekend: weekend,
        priceHoliday: holiday,
        taxRate: taxRate,
        holidayCalendarId: calId
      };
      const r = await postApi_('admin_pricing_set', payload, { timeoutMs:15000 });
      if(r && r.ok){
        openModal('完了', `<div style="text-align:center; padding:20px; color:#10B981; font-weight:bold; font-size:1.1em;">料金設定を保存しました</div>`, `<div style="width:100%; display:flex;"><button class="btn press" style="flex:1;" onclick="closeModal()">OK</button></div>`);
      }
    }catch(err){
      openModal('⚠️ エラー', `<div style="text-align:center; padding:20px; color:#E60012; font-weight:bold; line-height:1.6; white-space:pre-wrap;">料金設定エラー:\n${escapeHtml_(err.message || String(err))}</div>`, `<div style="width:100%; display:flex;"><button class="btn press" style="flex:1; background:#6B7280; color:#fff; border:none;" onclick="closeModal()">閉じる</button></div>`);
    }
  }

  btn.addEventListener('click', openPricing_);
  document.body.appendChild(btn); 
}

function attachQRScannerUI_(){
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/html5-qrcode';
  script.onload = () => {
    const btn = document.createElement('button');
    btn.textContent = 'QRで来店受付';
    btn.className = 'btn press';
    btn.style.position = 'fixed';
    btn.style.left = '16px';
    btn.style.bottom = '16px';
    btn.style.zIndex = '9999';
    btn.style.background = '#10B981';
    btn.style.color = '#fff';
    btn.style.padding = '10px 14px';
    btn.style.borderRadius = '12px';
    btn.style.boxShadow = '0 8px 20px rgba(0,0,0,0.15)';
    btn.style.fontWeight = '700';
    document.body.appendChild(btn);

    const overlay = document.createElement('div');
    overlay.style.display = 'none';
    overlay.style.position = 'fixed';
    overlay.style.top = '0'; overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.9)';
    overlay.style.zIndex = '10000';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    
    const readerDiv = document.createElement('div');
    readerDiv.id = 'qr-reader';
    readerDiv.style.width = '90%';
    readerDiv.style.maxWidth = '400px';
    readerDiv.style.background = '#000';
    readerDiv.style.borderRadius = '12px';
    readerDiv.style.overflow = 'hidden';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '閉じる';
    closeBtn.className = 'btn press';
    closeBtn.style.marginTop = '20px';
    closeBtn.style.background = '#EF4444';
    closeBtn.style.color = '#fff';
    closeBtn.style.padding = '10px 30px';
    closeBtn.style.borderRadius = '12px';
    closeBtn.style.fontSize = '18px';
    closeBtn.style.fontWeight = 'bold';
    
    overlay.appendChild(readerDiv);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);

    let html5QrCode = null;

    btn.addEventListener('click', () => {
      overlay.style.display = 'flex';
      
      if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("qr-reader");
      }
      
      const config = { fps: 10, qrbox: { width: 250, height: 250 } };
      
      html5QrCode.start({ facingMode: "environment" }, config, async (decodedText) => {
        html5QrCode.stop().then(async () => {
          overlay.style.display = 'none';

          const parts = decodedText.split(',');
          const scannedMemberId = parts[0].trim();
          const scannedResId = parts.length > 1 ? parts[1].trim() : null;
          const todayStr = _currentDateStr || (new Date().toISOString().slice(0,10));

          try {
            showOverlay('データ照会中...');
            const qrData = await api_('adminUpdateStatus', {
              data: {
                update_type: 'qr_check',
                member_id: scannedMemberId,
                reservation_id: scannedResId,
                date: todayStr
              }
            });
            hideOverlay();
            const finalResId = qrData.reservation ? qrData.reservation.id : null;
            buildAndShowCheckInModal(qrData, scannedMemberId, finalResId, todayStr);
          } catch(err) {
            hideOverlay();
            openModal('⚠️ エラー', `<div style="text-align:center; padding:20px; color:#E60012; font-weight:bold; font-size:1.1em; line-height:1.6; white-space:pre-wrap;">${escapeHtml_(err.message || String(err))}</div>`, `<div style="width:100%; display:flex;"><button class="btn press" style="flex:1; background:#6B7280; color:#fff; border:none;" onclick="closeModal()">閉じる</button></div>`);
          }

        });
      }, (err) => {}).catch(err => {
        openModal('カメラエラー', `<div style="text-align:center; padding:20px; color:#E60012; font-weight:bold;">カメラの起動に失敗しました。<br>スマホの設定でカメラへのアクセスを許可してください。</div>`, `<div style="width:100%; display:flex;"><button class="btn press" style="flex:1;" onclick="closeModal()">閉じる</button></div>`);
        overlay.style.display = 'none';
      });
    });
    
    closeBtn.addEventListener('click', () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(() => { overlay.style.display = 'none'; }).catch(() => { overlay.style.display = 'none'; });
      } else {
        overlay.style.display = 'none';
      }
    });
  };
  document.body.appendChild(script);
}

// ----------------- init -----------------
window.addEventListener('error', ()=>{
  try{ hideOverlay(); }catch(_){}
});
window.addEventListener('unhandledrejection', ()=>{
  try{ hideOverlay(); }catch(_){}
});

document.addEventListener('DOMContentLoaded', async ()=>{
  onModalClose();
  attachPricingUI_();
  attachQRScannerUI_();
  wireActions_(); 

  const customStyle = document.createElement('style');
  customStyle.innerHTML = `
    #modal .modal-card {
      max-height: calc(100dvh - 120px) !important;
      margin-bottom: 80px !important;
      overflow-y: auto !important;
    }
  `;
  document.head.appendChild(customStyle);
  
  try {
    await initAuth_();
    loadAppSettings_(); // ★ポイント用の設定キャッシュ取得
    
    const today = new Date();
    const y = today.getFullYear();
    const m = ('0'+(today.getMonth()+1)).slice(-2);
    const d = ('0'+today.getDate()).slice(-2);
    await setDate_(`${y}-${m}-${d}`);
  } catch(e) {
    console.warn("Auth process stopped:", e.message);
  }
});

let emptySince = null;
setInterval(()=>{
  const essential = qs('admToggles') || qs('admList');
  if(!essential || !document.body.contains(essential)){
    emptySince = emptySince ?? Date.now();
    if(Date.now() - emptySince > 5000){
      location.reload();
    }
  }else{
    emptySince = null;
  }
}, 2000);