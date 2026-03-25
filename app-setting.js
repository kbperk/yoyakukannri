/* =========================================================
 * app-setting.js (GitHub Pages 用) — アプリ・ポイント設定専用
 * ========================================================= */

// ※すでに運用中のGAS URLを指定してください
const API_EXEC_URL = 'https://script.google.com/macros/s/AKfycbwkkj4vp6v9gfjLZIxsLN-1aaUjyQebngxfTuMDPz62x_xg4dCadey920wmL3IYtS82kA/exec';

// ----------------- 通信ヘルパー -----------------
async function apiCall_(action, payload) {
  const token = sessionStorage.getItem('kb_admin_token');
  if (!token) throw new Error('セッション切れです。管理画面から開き直してください。');

  const bodyData = { action: action, token: token, ...payload };
  
  try {
    const response = await fetch(API_EXEC_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(bodyData)
    });
    
    const json = await response.json();
    if(json.status === 'error' || json.ok === false) {
      throw new Error(json.error || 'API Error');
    }
    return json.data || json;
  } catch(e) {
    throw new Error(e.message || '通信エラーが発生しました');
  }
}

// ----------------- UI制御 -----------------
function qs(id){ return document.getElementById(id); }

function showOverlay(msg){
  qs('overlayText').textContent = msg || '読み込み中';
  qs('overlay').style.display = 'flex';
}
function hideOverlay(){ qs('overlay').style.display = 'none'; }

function openModal(title, bodyHtml, footerHtml){
  qs('modalTitle').textContent = title || '';
  qs('modalBody').innerHTML = bodyHtml || '';
  qs('modalFooter').innerHTML = footerHtml || '';
  qs('modal').style.display = 'flex';
}
function closeModal(){ qs('modal').style.display = 'none'; }
qs('modalClose').addEventListener('click', closeModal);

// ----------------- HTML動的生成 (枠3つ) -----------------
function renderSlots() {
  // 交換メニュー枠 (設定A)
  let exHtml = '';
  for(let i=1; i<=3; i++) {
    exHtml += `
      <div style="background: #fff; border: 1px solid #ddd; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
        <strong style="color: #666;">▶︎ 特典枠 ${i}</strong>
        <div class="input-row" style="margin-top: 8px;">
          <div class="input-group">
            <label>消費ポイント (pt)</label>
            <input type="number" id="ex_pt_${i}" placeholder="0">
          </div>
          <div class="input-group">
            <label>自動割引額 (円)</label>
            <input type="number" id="ex_discount_${i}" placeholder="0">
          </div>
        </div>
        <div class="input-group" style="margin-bottom: 0;">
          <label>お客様への表示テキスト</label>
          <input type="text" id="ex_text_${i}" placeholder="例: 300円引き">
        </div>
      </div>
    `;
  }
  qs('exchangeMenuContainer').innerHTML = exHtml;

  // 到達ボーナス枠 (設定B)
  let reachHtml = '';
  for(let i=1; i<=3; i++) {
    reachHtml += `
      <div style="background: #fff; border: 1px solid #ddd; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
        <strong style="color: #666;">▶︎ 到達枠 ${i}</strong>
        <div class="input-row" style="margin-top: 8px;">
          <div class="input-group">
            <label>到達回数 (回)</label>
            <input type="number" id="re_count_${i}" placeholder="0">
          </div>
          <div class="input-group">
            <label>自動割引額 (円)</label>
            <input type="number" id="re_discount_${i}" placeholder="0">
          </div>
        </div>
        <div class="input-group" style="margin-bottom: 0;">
          <label>お客様への表示テキスト</label>
          <input type="text" id="re_text_${i}" placeholder="例: 1回プレイ無料！">
        </div>
      </div>
    `;
  }
  qs('reachBonusContainer').innerHTML = reachHtml;
}

// ----------------- データ読み込み・書き込み -----------------
async function loadSettings() {
  showOverlay('設定を取得中...');
  try {
    const data = await apiCall_('admin_app_settings_get', {});
    
    // キルスイッチ & インストール数
    const isPublic = (String(data.app_public) === 'true');
    qs('appPublicToggle').checked = isPublic;
    updateToggleStatus(isPublic);
    qs('installCount').textContent = data.app_install_count || 0;

    // ボーナス・ゲリラ
    qs('bonusVisitCount').value = data.bonus_visit_count || '';
    qs('bonusAddPoint').value = data.bonus_add_point || '';
    qs('guerrillaMultiplier').value = data.guerrilla_multiplier || '';
    qs('guerrillaStart').value = data.guerrilla_start || '';
    qs('guerrillaEnd').value = data.guerrilla_end || '';

    // 枠データ
    for(let i=1; i<=3; i++) {
      qs(`ex_pt_${i}`).value = data[`ex_pt_${i}`] || '';
      qs(`ex_discount_${i}`).value = data[`ex_discount_${i}`] || '';
      qs(`ex_text_${i}`).value = data[`ex_text_${i}`] || '';
      
      qs(`re_count_${i}`).value = data[`re_count_${i}`] || '';
      qs(`re_discount_${i}`).value = data[`re_discount_${i}`] || '';
      qs(`re_text_${i}`).value = data[`re_text_${i}`] || '';
    }
  } catch (e) {
    openModal('エラー', `<p style="color:red; font-weight:bold;">${e.message}</p>`, `<button class="btn press" onclick="closeModal()">閉じる</button>`);
  } finally {
    hideOverlay();
  }
}

function updateToggleStatus(isChecked) {
  const el = qs('appPublicStatus');
  if(isChecked) {
    el.textContent = '🟢 公開中';
    el.style.color = '#10B981';
  } else {
    el.textContent = '🔴 非公開 (停止中)';
    el.style.color = '#EF4444';
  }
}

qs('appPublicToggle').addEventListener('change', (e) => {
  updateToggleStatus(e.target.checked);
});

qs('saveSettingsBtn').addEventListener('click', async () => {
  const payload = {
    app_public: qs('appPublicToggle').checked,
    bonus_visit_count: Number(qs('bonusVisitCount').value) || 0,
    bonus_add_point: Number(qs('bonusAddPoint').value) || 0,
    guerrilla_multiplier: Number(qs('guerrillaMultiplier').value) || 0,
    guerrilla_start: qs('guerrillaStart').value,
    guerrilla_end: qs('guerrillaEnd').value
  };

  for(let i=1; i<=3; i++) {
    payload[`ex_pt_${i}`] = Number(qs(`ex_pt_${i}`).value) || 0;
    payload[`ex_discount_${i}`] = Number(qs(`ex_discount_${i}`).value) || 0;
    payload[`ex_text_${i}`] = qs(`ex_text_${i}`).value || '';
    
    payload[`re_count_${i}`] = Number(qs(`re_count_${i}`).value) || 0;
    payload[`re_discount_${i}`] = Number(qs(`re_discount_${i}`).value) || 0;
    payload[`re_text_${i}`] = qs(`re_text_${i}`).value || '';
  }

  showOverlay('保存中...');
  try {
    await apiCall_('admin_app_settings_set', payload);
    openModal('完了', '<div style="text-align:center; padding: 20px; font-size: 1.2em; font-weight: bold; color: #10B981;">✨ 設定を保存しました</div>', '<button class="btn press" onclick="closeModal()">OK</button>');
  } catch (e) {
    openModal('エラー', `<p style="color:red; font-weight:bold;">${e.message}</p>`, `<button class="btn press" onclick="closeModal()">閉じる</button>`);
  } finally {
    hideOverlay();
  }
});

// 休眠顧客の抽出とプッシュ送信ボタン (※UI側モックアップ、GAS実装で本格稼働)
qs('sendPushBtn').addEventListener('click', async () => {
  const minVisits = qs('dormantVisitMin').value;
  const minDays = qs('dormantDaysMin').value;
  const msg = qs('dormantMessage').value;

  if(!msg) {
    alert('メッセージ本文を入力してください');
    return;
  }

  showOverlay('対象者を抽出中...');
  try {
    // GAS側で対象人数を計算するAPIをコール
    const res = await apiCall_('admin_dormant_check', { min_visits: minVisits, min_days: minDays });
    hideOverlay();

    if(res.target_count === 0) {
      openModal('通知', '条件に合致する休眠顧客は現在いません。', '<button class="btn press" onclick="closeModal()">閉じる</button>');
      return;
    }

    openModal('送信確認', `
      <div style="font-weight:bold; font-size:1.1em; color:#E60012;">抽出完了： ${res.target_count} 名が対象です</div>
      <p style="margin-top:10px; font-size:0.9em; color:#666;">以下のメッセージを一斉送信（メール/LINE）します。よろしいですか？</p>
      <div style="background:#f2f4f6; padding:10px; border-radius:8px; margin-top:10px; font-size:0.9em; white-space:pre-wrap;">${msg}</div>
    `, `
      <div style="display:flex; gap:10px;">
        <button class="btn-outline press" style="flex:1;" onclick="closeModal()">キャンセル</button>
        <button class="btn press" style="flex:1; background:#E60012;" onclick="executePush()">一斉送信</button>
      </div>
    `);

    window.executePush = async () => {
      closeModal();
      showOverlay('送信中...');
      try {
         await apiCall_('admin_dormant_send', { min_visits: minVisits, min_days: minDays, message: msg });
         openModal('完了', '一斉送信が完了しました！', '<button class="btn press" onclick="closeModal()">OK</button>');
      } catch(e) {
         openModal('エラー', `<p style="color:red;">${e.message}</p>`, '<button class="btn press" onclick="closeModal()">閉じる</button>');
      } finally {
         hideOverlay();
      }
    };

  } catch(e) {
    hideOverlay();
    openModal('エラー', `<p style="color:red; font-weight:bold;">${e.message}</p>`, `<button class="btn press" onclick="closeModal()">閉じる</button>`);
  }
});

// ----------------- 初期化 -----------------
document.addEventListener('DOMContentLoaded', () => {
  renderSlots();
  loadSettings();
});