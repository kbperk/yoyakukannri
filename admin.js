/* =========================================================
 * admin.js (GitHub Pages 用) — 管理画面UI 完全コピー動作版
 * 方式:
 * - GAS WebApp /exec を JSONP（scriptタグ）で叩く（CORS不要）
 * - action + payload を GET で送る
 *
 * 必須: API_EXEC_URL をあなたの /exec URL に置換
 * ========================================================= */

const API_EXEC_URL = 'https://script.google.com/macros/s/AKfycbxTbAzdXMPY5xTLP3c3VN9SPFxa1TQLk1M86JAkHh6an1_L-BL1xIoqp3ljdEkXZQid/exec';

// 営業時間（UI表示）
const OPEN_HOUR = 9;
const CLOSE_HOUR = 20;

let _currentDateStr = '';
let _lastData = null;
// ----------------- JSONP（CORS回避） -----------------
function jsonp_(action, payload, opt){
  return new Promise((resolve, reject)=>{
    if(!API_EXEC_URL || !API_EXEC_URL.includes('/exec')){
      reject(new Error('API_EXEC_URL が未設定です（/exec URL にしてください）'));
      return;
    }

    const options = opt || {};
    const timeoutMs = Math.max(1000, Number(options.timeoutMs || 15000));
    const requestId = String(options.requestId || '');
    const cb = '__cb_' + Date.now() + '_' + Math.floor(Math.random()*1e6);

    let done = false;
    let timer = null;
    let script = null;

    const cleanup = ()=>{
      if(done) return;
      done = true;
      if(timer){ clearTimeout(timer); timer = null; }
      try{ delete window[cb]; }catch(_){ window[cb]=undefined; }
      if(script && script.parentNode) script.parentNode.removeChild(script);
    };

    window[cb] = (resp)=>{
      if(done) return;
      if(requestId && window.__ADMIN_LAST_REQ_ID && requestId !== window.__ADMIN_LAST_REQ_ID){
        cleanup();
        return;
      }
      cleanup();
      resolve(resp);
    };

    const q = new URLSearchParams();
    q.set('callback', cb);
    q.set('action', action);
    q.set('payload', JSON.stringify(payload||{}));

    script = document.createElement('script');
    script.src = API_EXEC_URL + '?' + q.toString();
    script.onerror = ()=>{
      cleanup();
      reject(new Error('JSONP 通信に失敗しました（URL/デプロイ/公開設定を確認）'));
    };
    document.head.appendChild(script);

    timer = setTimeout(()=>{
      cleanup();
      reject(new Error('タイムアウト（API応答なし）'));
    }, timeoutMs);
  });
}

async function api_(action, payload, opt){
  const p = payload || {};
  
  if (sessionStorage.getItem('kb_admin_ensured')) {
    p.skip_ensure = true;
  }

  const options = opt || {};
  const reqId = 'r_' + Date.now() + '_' + Math.floor(Math.random()*1e6);
  window.__ADMIN_LAST_REQ_ID = reqId;

  const resp = await jsonp_(action, p, { timeoutMs: options.timeoutMs, requestId: reqId });
  if(!resp) throw new Error('APIレスポンスが空です');
  if(resp.status === 'error' || resp.ok === false){
    throw new Error(resp.error || 'API Error');
  }
  
  sessionStorage.setItem('kb_admin_ensured', '1');

  return (typeof resp.data !== 'undefined') ? resp.data : resp;
}

// ----------------- UI helpers -----------------
function qs(id){ return document.getElementById(id); }
function showBanner(msg){
  const b = qs('banner');
  b.style.display = 'block';
  b.textContent = msg;
}
function hideBanner(){ const b=qs('banner'); b.style.display='none'; b.textContent=''; }

let __overlayWatchTimer = null;
let __overlayShownAt = 0;
function __overlayWatchStart_(){
  __overlayShownAt = Date.now();
  if(__overlayWatchTimer) clearTimeout(__overlayWatchTimer);
  __overlayWatchTimer = setTimeout(()=>{
    try{
      hideOverlay();
      showBanner('通信が不安定です（タイムアウト復旧）。電波状況を確認して再操作してください。');
    }catch(_){}
  }, 20000);
}
function __overlayWatchStop_(){
  if(__overlayWatchTimer) clearTimeout(__overlayWatchTimer);
  __overlayWatchTimer = null;
  __overlayShownAt = 0;
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
  qs('modalClose').addEventListener('click', closeModal);
  qs('modal').addEventListener('click', (e)=>{ if(e.target && e.target.id==='modal') closeModal(); });
}

function fmtJP(dateStr){
  if(!dateStr) return '----';
  return dateStr.replace(/-/g,'/');
}

function sleepMs_(ms){ return new Promise(r=>setTimeout(r, ms)); }

function getDeviceId_(){
  try{
    const k = 'kbperk_device_id';
    let v = localStorage.getItem(k);
    if(!v){
      v = (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('did_' + Date.now() + '_' + Math.floor(Math.random()*1e9));
      localStorage.setItem(k, v);
    }
    return v;
  }catch(_){
    return 'did_' + Date.now();
  }
}

// ----------------- Month summary calendar (予約一覧) -----------------
async function openMonthSummaryModal_(){
  const base = _currentDateStr || new Date().toISOString().slice(0,10);
  const y = Number(base.slice(0,4));
  const m = Number(base.slice(5,7));
  await showMonth_(y, m);
}

// ----------------- Day details (当日詳細) -----------------
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
      <div class="list-item" style="display:block;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <div style="font-weight:800;">${escapeHtml_(it.time||'--:--')} / ${name}</div>
          <div style="text-align:right;min-width:120px;">
            <div style="font-weight:800;">${head}人</div>
            <div class="muted">${fmtYen(amt)}円</div>
          </div>
        </div>
        <div class="muted" style="margin-top:6px;">${contact}${contact? ' / ' : ''}${st}${created? ' / '+created : ''}</div>
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
    <div style="overflow:auto;margin-top:10px;">
      <table style="width:100%;border-collapse:collapse;min-width:520px;">
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
    showBanner(e && e.message ? e.message : String(e));
    setTimeout(hideBanner, 4000);
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
  grid.style.gap = '8px';

  weekLabels.forEach(w=>{
    const h = document.createElement('div');
    h.textContent = w;
    h.style.textAlign = 'center';
    h.style.fontWeight = '800';
    h.style.padding = '6px 0';
    grid.appendChild(h);
  });

  const totalCells = 42;
  for(let i=0;i<totalCells;i++){
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'press';
    cell.style.border = '1px solid #e8e8e8';
    cell.style.borderRadius = '14px';
    cell.style.background = '#fff';
    cell.style.minHeight = '62px';
    cell.style.padding = '8px';
    cell.style.display = 'flex';
    cell.style.flexDirection = 'column';
    cell.style.alignItems = 'flex-start';
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
      <div style="font-weight:900;font-size:18px;">${dayNum}</div>
      <div style="width:100%;display:flex;justify-content:flex-end;">
        ${people>0 ? `<span style="border:1px solid #ddd;border-radius:999px;padding:4px 10px;font-weight:800;">${people}人</span>` : `<span class="muted"> </span>`}
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

// ----------------- Data load/render -----------------
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
  grid.style.gridTemplateColumns = '1fr 0.35fr 0.35fr 1fr 0.35fr 0.35fr';
  grid.style.gap = '10px';
  grid.style.alignItems = 'stretch';

  function mkCell(tag, cls, text){
    const el = document.createElement(tag);
    el.className = cls || '';
    el.textContent = text || '';
    return el;
  }

  for(let i=0;i<times.length;i+=2){
    const t1 = times[i];
    const t2 = times[i+1];

    [t1,t2].forEach((t,idx)=>{
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
  }

  root.appendChild(grid);
}

function renderRemain_(slots){
  const times = slots.filter(s=> (s.open && (s.reserved||0)>0));
  if(times.length===0){
    qs('admTimes').innerHTML = '<div class="muted">（本日、予約はありません）</div>';
    return;
  }
  const html = `
    <div class="remain-badges">
      ${times.map(s=>{
        const remain = Math.max(0, (s.cap||0)-(s.reserved||0));
        const cls = remain<=0 ? 'alert' : (remain<=2 ? 'warn' : 'ok');
        return `<div class="remain-badge ${cls}">
          <span class="t">${s.time}</span>
          <span class="m">${remain}/${s.cap}</span>
        </div>`;
      }).join('')}
    </div>`;
  qs('admTimes').innerHTML = html;
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

    if(String(r.status).toLowerCase()==='noshow') row.classList.add('is-noshow');
    if(String(r.status).toLowerCase()==='paid_on_site' || String(r.status).toLowerCase()==='checked_in') row.classList.add('is-checkedin');

    row.innerHTML = `
      <div class="row-main">
        <div class="left">
          <span class="chip">${r.time}</span>
          <span class="chip">${r.head_count||0}名</span>
          <span class="chip">¥${Number(r.amount||0).toLocaleString()}</span>
        </div>
      </div>
      <div class="row-sub">
        <div class="meta">
          <span class="kv">${(r.name||'')}</span>
          <span class="kv">${(r.phone||'')}</span>
        </div>
        <div class="ops" style="display:flex; gap:6px;">
          <button class="btn-inline btn-in press" style="flex:1; min-width:50px; text-align:center; font-size:1em; padding:8px 4px;">IN</button>
          <button class="btn-inline btn-noshow press" style="flex:1; min-width:50px; text-align:center; font-size:1em; padding:8px 4px;">来ず</button>
          <button class="btn-inline btn-edit press" style="flex:1; min-width:50px; text-align:center; font-size:1em; padding:8px 4px; background:#EAB308; color:#fff; border:none; border-radius:8px;">変更</button>
        </div>
      </div>
    `;

    const inBtn = row.querySelector('.btn-in');
    const nsBtn = row.querySelector('.btn-noshow');
    const editBtn = row.querySelector('.btn-edit');

    inBtn.addEventListener('click', async ()=>{
      try{
        await api_('adminUpdateStatus', { data:{ id:r.id, status:'paid_on_site', date:_currentDateStr } });
        await loadAndRender_();
      }catch(e){
        showBanner(e.message||String(e));
        setTimeout(hideBanner, 3000);
      }
    });
    
    nsBtn.addEventListener('click', async ()=>{
      try{
        await api_('adminUpdateStatus', { data:{ id:r.id, status:'noshow', date:_currentDateStr } });
        await loadAndRender_();
      }catch(e){
        showBanner(e.message||String(e));
        setTimeout(hideBanner, 3000);
      }
    });

    editBtn.addEventListener('click', () => {
      openModal('人数変更', `
        <div style="text-align:center; padding: 10px;">
          <p style="margin-bottom:15px; font-weight:bold; font-size:1em;">合計何名へ変更しますか？</p>
          <input type="tel" id="editHeadCount" inputmode="numeric" value="${r.head_count||0}" style="width:100%; max-width:200px; font-size:1.5em; text-align:center; padding:10px; border:2px solid #ccc; border-radius:8px; outline:none;" autofocus>
        </div>
      `, `
        <div style="display:flex; gap:10px; width:100%;">
          <button class="btn-outline press" style="flex:1; font-size:1em;" onclick="closeModal()">キャンセル</button>
          <button class="btn press" style="flex:1; background:#2563EB; color:#fff; font-size:1em; border:none;" id="doEditHeadCount">更新</button>
        </div>
      `);
      
      setTimeout(() => {
        const input = document.getElementById('editHeadCount');
        if(input) {
          input.focus();
          const val = input.value;
          input.value = '';
          input.value = val;
        }
      }, 100);

      document.getElementById('doEditHeadCount').addEventListener('click', async () => {
        const newHead = Number(document.getElementById('editHeadCount').value);
        if (isNaN(newHead) || newHead < 1) {
          alert('正しい人数（1名以上）を入力してください');
          return;
        }
        closeModal();
        try {
          showOverlay('更新中...');
          await api_('adminUpdateStatus', { 
            data: { 
              id: r.id, 
              date: _currentDateStr,
              update_type: 'head_count',
              head_count: newHead
            } 
          });
          await loadAndRender_(); 
          showBanner('人数を変更しました');
          setTimeout(hideBanner, 3000);
        } catch(e) {
          showBanner(e.message || String(e));
          setTimeout(hideBanner, 3000);
        } finally {
          hideOverlay();
        }
      });
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
    line.innerHTML = `<input type="checkbox" id="${id}" data-email="${d.email}"> ${d.email} <span class="muted">(${d.last_incident_at||''})</span>`;
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

    // ★ キャンペーン値を含む各種設定値の読み込みをUIに反映
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
      showOverlay('書き込み中');
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
      setOverlayText('反映しました');
      setTimeout(()=>{ hideOverlay(); }, 1000);
    }catch(e){
      hideOverlay();
      showBanner(e.message||String(e));
      setTimeout(hideBanner, 4000);
    }
  });

  qs('admForce').addEventListener('click', ()=>{
    openModal('緊急閉鎖', `<div>選択中の日付（${fmtJP(_currentDateStr)}）を緊急閉鎖します。よろしいですか？</div>`,
      `<button class="btn-outline press" id="__fcCancel">キャンセル</button>
       <button class="btn-warn press" id="__fcOk">緊急閉鎖する</button>`);
    setTimeout(()=>{
      qs('__fcCancel').onclick = closeModal;
      qs('__fcOk').onclick = async ()=>{
        try{
          closeModal();
          await api_('adminForceClose', { date:_currentDateStr });
          await loadAndRender_();
          showBanner('緊急閉鎖しました');
          setTimeout(hideBanner, 2000);
        }catch(e){
          showBanner(e.message||String(e));
          setTimeout(hideBanner, 4000);
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
      for(const c of checks){
        const email = c.dataset.email;
        await api_('adminResolveDebt', { email });
      }
      await loadAndRender_();
      showBanner('解除しました');
      setTimeout(hideBanner, 1500);
    }catch(e){
      showBanner(e.message||String(e));
      setTimeout(hideBanner, 4000);
    }
  });

  qs('baseToggleBtn').addEventListener('click', ()=>{ const b=qs('baseBox'); b.hidden=!b.hidden; });
  
  // ★ 変更箇所: 保存時にキャンペーン設定も合わせてGASに送信
  qs('saveBase').addEventListener('click', async ()=>{
    try{
      const cutoffHours = Number(qs('cutoffHours').value||0)||0;
      const campaign_start = qs('campStart').value || '';
      const campaign_end = qs('campEnd').value || '';
      const campaign_discount = Number(qs('campDiscount').value||0)||0;

      await api_('adminCommit', { 
        data:{ 
          date:_currentDateStr, 
          toggles:collectToggles_(), 
          settings:{ 
            cutoffHours,
            campaign_start,
            campaign_end,
            campaign_discount
          } 
        } 
      });
      showBanner('設定を保存しました');
      setTimeout(hideBanner, 1500);
    }catch(e){
      showBanner(e.message||String(e));
      setTimeout(hideBanner, 4000);
    }
  });

  qs('admHelpBulk').addEventListener('click', ()=>{
    openModal('使い方（定員一括）',
      `<div>「定員」欄に数字を入れて「定員一括変更」を押すと、全時間の定員入力に反映します。最後に「決定（反映）」で保存します。</div>`,
      `<button class="btn press" onclick="document.getElementById('modal').style.display='none'">閉じる</button>`);
  });
  const admHelpSlotsBtn = qs('admHelpSlots');
  if(admHelpSlotsBtn) {
    admHelpSlotsBtn.addEventListener('click', ()=>{
      openModal('使い方（時間枠）',
        `<div>時間ボタンを押すとON/OFFが切り替わります（ON=黒）。予約がある時間はOFFにできません。定員は右の入力欄で調整し、「決定（反映）」で保存します。</div>`,
        `<button class="btn press" onclick="document.getElementById('modal').style.display='none'">閉じる</button>`);
    });
  }
}

// ----------------- init -----------------
window.addEventListener('error', ()=>{
  try{
    hideOverlay();
  }catch(_){}
});
window.addEventListener('unhandledrejection', ()=>{
  try{
    hideOverlay();
  }catch(_){}
});

document.addEventListener('DOMContentLoaded', async ()=>{
  onModalClose();
  wireActions_(); 
  const today = new Date();
  const y = today.getFullYear();
  const m = ('0'+(today.getMonth()+1)).slice(-2);
  const d = ('0'+today.getDate()).slice(-2);
  await setDate_(`${y}-${m}-${d}`);
});

(function attachPricingUI_(){
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
      const cur = await api_('admin_pricing_get', {}, { timeoutMs:15000 });
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
      const r = await api_('admin_pricing_set', payload, { timeoutMs:15000 });
      if(r && r.ok){
        alert('料金設定を保存しました');
      }else{
        alert('保存に失敗しました: ' + (r && r.error ? r.error : 'unknown'));
      }
    }catch(err){
      alert('料金設定エラー: ' + (err && err.message ? err.message : err));
    }
  }

  btn.addEventListener('click', openPricing_);
  document.addEventListener('DOMContentLoaded', ()=>{ document.body.appendChild(btn); });
})();

// ==========================================
// QRコード読み取りと自動チェックイン(IN)処理
// ==========================================
(function attachQRScannerUI_(){
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
    overlay.style.width = '100%'; overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.8)';
    overlay.style.zIndex = '10000';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    
    const readerDiv = document.createElement('div');
    readerDiv.id = 'qr-reader';
    readerDiv.style.width = '90%';
    readerDiv.style.maxWidth = '400px';
    readerDiv.style.background = '#fff';
    readerDiv.style.padding = '10px';
    readerDiv.style.borderRadius = '12px';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '閉じる';
    closeBtn.className = 'btn press';
    closeBtn.style.marginTop = '20px';
    closeBtn.style.background = '#EF4444';
    closeBtn.style.color = '#fff';
    closeBtn.style.padding = '10px 20px';
    closeBtn.style.borderRadius = '12px';
    
    overlay.appendChild(readerDiv);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);

    let html5QrcodeScanner = null;

    btn.addEventListener('click', () => {
      overlay.style.display = 'flex';
      html5QrcodeScanner = new Html5QrcodeScanner(
        "qr-reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
      
      html5QrcodeScanner.render(async (decodedText, decodedResult) => {
        html5QrcodeScanner.clear();
        overlay.style.display = 'none';
        
        try {
          showOverlay('来店受付中...');
          const res = await api_('admin_scan_qr', { member_id: decodedText, date: _currentDateStr });
          
          let msg = `${res.member_name} 様の来店を受付しました！\n（累計来店: ${res.new_count}回）`;
          if (res.checked_in_count > 0) {
            msg += `\n本日（${_currentDateStr}）の予約 ${res.checked_in_count} 件を「IN」に更新しました。`;
          } else {
            msg += `\n※本日（${_currentDateStr}）の予約が見つかりませんでした。`;
          }
          
          showBanner(msg);
          await loadAndRender_();
          setTimeout(hideBanner, 6000);
        } catch(e) {
          showBanner('エラー: ' + (e.message || String(e)));
          setTimeout(hideBanner, 5000);
        } finally {
          hideOverlay();
        }
      }, (error) => {
        // スキャン中は定期的にエラー（未検出）が出るため無視
      });
    });
    
    closeBtn.addEventListener('click', () => {
      if(html5QrcodeScanner) html5QrcodeScanner.clear();
      overlay.style.display = 'none';
    });
  };
  document.head.appendChild(script);
})();