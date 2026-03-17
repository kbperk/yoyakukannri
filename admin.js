/* =========================================================
 * admin.js (GitHub Pages 用) — 管理画面UI 完全コピー動作版
 * ========================================================= */

const API_EXEC_URL = 'https://script.google.com/macros/s/AKfycbwkkj4vp6v9gfjLZIxsLN-1aaUjyQebngxfTuMDPz62x_xg4dCadey920wmL3IYtS82kA/exec';

const OPEN_HOUR = 9;
const CLOSE_HOUR = 20;

let _currentDateStr = '';
let _lastData = null;

// ----------------- JSONP（CORS回避） -----------------
function jsonp_(action, payload, opt){
  return new Promise((resolve, reject)=>{
    if(!API_EXEC_URL || !API_EXEC_URL.includes('/exec')){
      reject(new Error('API_EXEC_URL が未設定です'));
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
      reject(new Error('通信に失敗しました'));
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
  
  const token = sessionStorage.getItem('kb_admin_token');
  if(token) p.token = token;

  if (sessionStorage.getItem('kb_admin_ensured')) {
    p.skip_ensure = true;
  }

  const options = opt || {};
  const reqId = 'r_' + Date.now() + '_' + Math.floor(Math.random()*1e6);
  window.__ADMIN_LAST_REQ_ID = reqId;

  const resp = await jsonp_(action, p, { timeoutMs: options.timeoutMs, requestId: reqId });
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
      const res = await jsonp_('verify_magic_link', { key: key }, { timeoutMs: 15000 });
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

// ★ 手動の「IN」「来ず」ボタンを確実に動作させるための修正
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
        <div class="left" style="flex-wrap:wrap;">
          <span class="chip">${r.time}</span>
          <span class="chip">${r.head_count||0}名</span>
          <span class="chip">¥${Number(r.amount||0).toLocaleString()}</span>
        </div>
      </div>
      <div class="row-sub" style="flex-direction:column; align-items:flex-start; gap:10px;">
        <div class="meta" style="width:100%;">
          <span class="kv font-bold">${escapeHtml_(r.name||'')}</span>
          <span class="kv" style="font-size:0.9em;">${escapeHtml_(r.phone||'')}</span>
        </div>
        <div class="ops" style="display:flex; gap:6px; width:100%; flex-wrap:wrap;">
          <button class="btn-inline btn-in press" style="flex:1; padding:10px 4px; font-size:1em;">IN</button>
          <button class="btn-inline btn-noshow press" style="flex:1; padding:10px 4px; font-size:1em;">来ず</button>
          <button class="btn-inline btn-edit press" style="flex:1; padding:10px 4px; font-size:1em; background:#EAB308; color:#fff; border:none; border-radius:8px;">変更</button>
          <button class="btn-inline btn-detail press" style="flex:1; padding:10px 4px; font-size:1em; background:#6B7280; color:#fff; border:none; border-radius:8px;">詳細</button>
        </div>
      </div>
    `;

    const inBtn = row.querySelector('.btn-in');
    const nsBtn = row.querySelector('.btn-noshow');
    const editBtn = row.querySelector('.btn-edit');
    const detailBtn = row.querySelector('.btn-detail'); 

    // ★ INボタン処理：通信中画面を表示して確実にバックエンドへ渡す
    inBtn.addEventListener('click', async ()=>{
      try{
        showOverlay('来店受付中...');
        await api_('adminUpdateStatus', { data:{ id:r.id, status:'paid_on_site', date:_currentDateStr, member_id: r.member_id } });
        await loadAndRender_();
        showBanner('✅ 来店受付 (IN) しました', true);
        setTimeout(hideBanner, 3000);
      }catch(e){
        showBanner(e.message||String(e));
        setTimeout(hideBanner, 4000);
      }finally{
        hideOverlay();
      }
    });
    
    // ★ 来ずボタン処理：通信中画面を表示して無断キャンセルとして処理
    nsBtn.addEventListener('click', async ()=>{
      try{
        showOverlay('キャンセル処理中...');
        await api_('adminUpdateStatus', { data:{ id:r.id, status:'noshow', date:_currentDateStr, member_id: r.member_id } });
        await loadAndRender_();
        showBanner('⚠️ 無断キャンセルとして処理しました', true);
        setTimeout(hideBanner, 3000);
      }catch(e){
        showBanner(e.message||String(e));
        setTimeout(hideBanner, 4000);
      }finally{
        hideOverlay();
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
          
          openModal(
            '完了', 
            '<div style="text-align:center; padding: 20px; font-size: 1.2em; font-weight: bold; color: #10B981;">✨ 人数を変更しました</div>', 
            '<div style="width:100%; display:flex;"><button class="btn press" style="flex:1; font-size:1em;" onclick="closeModal()">OK</button></div>'
          );

        } catch(e) {
          showBanner(e.message || String(e));
          setTimeout(hideBanner, 4000);
        } finally {
          hideOverlay();
        }
      });
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
    line.innerHTML = `<input type="checkbox" id="${id}" data-email="${d.email}"> ${d.email} <br><span class="muted" style="font-size:0.85em;">(${d.last_incident_at||''})</span>`;
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
          showBanner('✨ 緊急閉鎖しました', true);
          setTimeout(hideBanner, 4000);
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
      showBanner(e.message||String(e));
      setTimeout(hideBanner, 4000);
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
          settings:{ 
            cutoffHours,
            campaign_start,
            campaign_end,
            campaign_discount
          } 
        } 
      });
      hideOverlay();
      
      openModal(
        '完了', 
        '<div style="text-align:center; padding: 20px; font-size: 1.2em; font-weight: bold; color: #10B981;">✨ 設定を保存しました</div>', 
        '<div style="width:100%; display:flex;"><button class="btn press" style="flex:1; font-size:1em;" onclick="closeModal()">OK</button></div>'
      );

    }catch(e){
      hideOverlay();
      showBanner(e.message||String(e));
      setTimeout(hideBanner, 4000);
    }
  });

  const helpBtn = qs('admHelpMain');
  if(helpBtn){
    helpBtn.addEventListener('click', ()=>{
      const content = `
        <div style="font-size: 0.95em; line-height: 1.6; max-height: 60vh; overflow-y: auto; padding-right: 10px; text-align: left; color:#333;">
          <h3 style="color:#2563EB; margin-top:0; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;">📅 日付の選択</h3>
          <p style="margin-top:5px;">日付部分をタップして、管理したい日を選びます。</p>

          <h3 style="color:#2563EB; margin-top:20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;">⏰ 開放設定（枠の開け閉め・定員）</h3>
          <ul style="padding-left: 20px; margin-top:5px;">
            <li style="margin-bottom:5px;"><b>時間ボタン</b>: タップでON(黒)/OFF(白) 切替。予約がある時間はOFFにできません。</li>
            <li style="margin-bottom:5px;"><b>定員入力</b>: 右側の数字で各時間の定員を設定します。</li>
            <li style="margin-bottom:5px;"><b>定員一括変更</b>: 左上の入力欄に数字を入れて「定員一括変更」を押すと全時間帯に反映されます。</li>
            <li style="color:#E60012; font-weight:bold;">※変更後は必ず「決定（反映）」ボタンを押して保存してください！</li>
          </ul>

          <h3 style="color:#2563EB; margin-top:20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;">👤 予約の受付・人数変更</h3>
          <ul style="padding-left: 20px; margin-top:5px;">
            <li style="margin-bottom:5px;"><b>IN</b>: 来店時に押します（チェックイン完了）。</li>
            <li style="margin-bottom:5px;"><b>来ず</b>: 無断キャンセル時に押すと「未回収対象」に自動登録されます。</li>
            <li style="margin-bottom:5px;"><b>変更</b>: 当日の急な人数増減時に使用します。料金も自動再計算されます。</li>
            <li style="margin-bottom:5px;"><b>詳細</b>: お客様の住所や累計来店回数などを確認できます。</li>
          </ul>

          <h3 style="color:#2563EB; margin-top:20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;">📸 QRで来店受付（飛び込み対応）</h3>
          <p style="margin-top:5px;">お客様のスマホのQRを読み取ります。当日の日付が表示され、入力した人数に応じて即座に予定料金を計算します。「IN」を押すと来店回数が加算され、料金が確定します。</p>

          <h3 style="color:#2563EB; margin-top:20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;">💰 料金・基本・キャンペーン設定</h3>
          <ul style="padding-left: 20px; margin-top:5px;">
            <li style="margin-bottom:5px;"><b>料金設定</b>: 右下の青いボタンから、基本単価（平日/土日祝）を設定します。</li>
            <li style="margin-bottom:5px;"><b>基本設定</b>: キャンペーン期間と値引き額を設定できます。</li>
            <li style="margin-bottom:5px;"><b>未回収対象</b>: 後日支払い待ちリストです。回収済になったら「選択を解除」を押します。</li>
          </ul>
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
  document.body.appendChild(btn); 
}

// ★ カンマ区切りのQRデータを解析し、モーダルに詳細情報を表示するよう修正
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

          let targetRes = null;
          if (scannedResId && _lastData && _lastData.summary && _lastData.summary.reservations) {
            targetRes = _lastData.summary.reservations.find(r => r.id === scannedResId || r.reservation_id === scannedResId);
          }

          let resInfoHtml = '';
          let inputHtml = '';
          let initialHead = 1;

          const settings = _lastData ? _lastData.settings : {};
          const d = new Date();
          const todayStr = _currentDateStr || (d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2));

          const calcAmount = (head) => {
            if (!settings || String(settings.pricingEnabled).toLowerCase() !== 'true') return 0;
            const dt = new Date(todayStr);
            const dow = dt.getDay();
            const isWeekend = (dow === 0 || dow === 6);
            const unit = isWeekend ? Number(settings.priceWeekend||0) : Number(settings.priceWeekday||0);
            let amt = head * unit;
            const cDisc = Number(settings.campaign_discount||0);
            if (cDisc > 0 && settings.campaign_start && settings.campaign_end && todayStr >= settings.campaign_start && todayStr <= settings.campaign_end) {
              amt = Math.max(0, amt - (cDisc * head));
            }
            return amt;
          };

          if (targetRes) {
            // 予約あり：日時・人数・金額をハッキリ表示
            const dateFmt = targetRes.date || todayStr;
            const timeFmt = targetRes.time || '--:--';
            const headFmt = targetRes.head_count || 0;
            const amtFmt = Number(targetRes.amount || 0).toLocaleString();
            initialHead = headFmt;

            resInfoHtml = `
              <p style="font-weight:bold; color:#10B981; margin-bottom:10px; font-size:1.1em;">✅ 事前予約あり</p>
              <div style="background:#E6F4EA; padding:10px; border-radius:8px; margin-bottom:15px; text-align:left; border: 1px solid #10B981;">
                <p style="margin-bottom:4px;"><strong>予約日時:</strong> ${dateFmt} ${timeFmt}</p>
                <p style="margin-bottom:4px;"><strong>予約人数:</strong> ${headFmt} 名</p>
                <p style="margin-bottom:0;"><strong>お支払金額:</strong> <span style="color:#E60012; font-weight:bold; font-size:1.2em;">${amtFmt} 円</span></p>
              </div>
            `;
            inputHtml = `
              <div style="background:#F3F4F6; padding:15px; border-radius:12px; margin-bottom:15px;">
                <p style="font-weight:bold; margin-bottom:10px;">実際の来店人数を確認・入力</p>
                <input type="number" id="qrHeadCount" value="${headFmt}" min="1" inputmode="numeric" style="width:100px; font-size:1.5em; text-align:center; padding:8px; border:2px solid #ccc; border-radius:8px; margin-bottom:5px;">
                <p style="font-size:0.8em; color:#666;">※人数を変更して確定した場合、料金は自動で再計算されます</p>
              </div>
            `;
          } else {
            // 予約なし（飛び込み）
            resInfoHtml = `<p style="font-weight:bold; color:#F59E0B; margin-bottom:10px; font-size:1.1em;">⚠️ 予約なし (飛び込み)</p>`;
            inputHtml = `
              <div style="background:#F3F4F6; padding:15px; border-radius:12px; margin-bottom:15px;">
                <p style="font-weight:bold; margin-bottom:10px;">当日の来店人数を入力</p>
                <input type="number" id="qrHeadCount" value="1" min="1" inputmode="numeric" style="width:100px; font-size:1.5em; text-align:center; padding:8px; border:2px solid #ccc; border-radius:8px; margin-bottom:10px;">
                <p style="font-size:0.9em; color:#666;">（予定料金: <strong id="qrEstAmount" style="color:#E60012;">${calcAmount(1).toLocaleString()}</strong> 円）</p>
                <p style="font-size:0.8em; color:#666; margin-top:5px;">※事前予約がある場合は、その予約時の料金が優先されます</p>
              </div>
            `;
          }

          openModal('スキャン成功', `
            <div style="text-align:center; padding:10px;">
              <p style="font-weight:bold; color:#2563EB; font-size:1.1em; margin-bottom:10px;">本日の日付: ${todayStr}</p>
              ${resInfoHtml}
              <p style="font-size:0.9em; color:#666; margin-bottom:15px;">会員ID: <span style="font-family:monospace; font-weight:bold;">${scannedMemberId}</span></p>
              ${inputHtml}
            </div>
          `, `
            <div style="display:flex; gap:10px; width:100%;">
              <button class="btn-outline press" style="flex:1;" onclick="closeModal()">キャンセル</button>
              <button class="btn press" id="qrInBtn" style="flex:1; background:#10B981; color:#fff; border:none;">IN (確定)</button>
            </div>
          `);

          document.getElementById('qrHeadCount').addEventListener('input', (e) => {
            const h = Number(e.target.value) || 0;
            const amtEl = document.getElementById('qrEstAmount');
            if (amtEl) {
               amtEl.textContent = calcAmount(h).toLocaleString();
            }
          });

          document.getElementById('qrInBtn').addEventListener('click', async () => {
            const head = Number(document.getElementById('qrHeadCount').value) || 0;
            closeModal();
            try {
              showOverlay('来店受付中...');
              
              const res = await api_('admin_scan_qr', { 
                  member_id: scannedMemberId, 
                  reservation_id: scannedResId,
                  head_count: head, 
                  date: todayStr 
              });
              
              let msg = `${res.member_name} 様の来店を受付しました！<br>（累計来店: <strong style="color:#2563EB;">${res.new_count}回</strong>）`;
              if (res.checked_in_count > 0) {
                msg += `<br><br>確定料金: <strong style="color:#E60012; font-size:1.3em;">${Number(res.amount||0).toLocaleString()}円</strong>`;
              } else {
                msg += `<br><span style="color:#d32f2f;">※予約の処理に失敗しました。</span>`;
              }
              
              openModal(
                '受付完了', 
                `<div style="text-align:center; padding: 10px; font-size: 1.1em; line-height: 1.5;">${msg}</div>`, 
                '<div style="width:100%; display:flex;"><button class="btn press" style="flex:1; font-size:1em;" onclick="closeModal()">OK</button></div>'
              );
              await loadAndRender_();
            } catch(e) {
              showBanner('エラー: ' + (e.message || String(e)));
              setTimeout(hideBanner, 5000);
            } finally {
              hideOverlay();
            }
          });

        });
      }, (err) => {
      }).catch(err => {
        alert('カメラの起動に失敗しました。スマホの設定でカメラへのアクセスを許可してください。');
        overlay.style.display = 'none';
      });
    });
    
    closeBtn.addEventListener('click', () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(() => {
          overlay.style.display = 'none';
        }).catch(() => {
          overlay.style.display = 'none';
        });
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
  
  try {
    await initAuth_();
    
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