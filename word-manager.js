'use strict';
(() => {
  const ADMIN_KEY = 'pre1-quiz-admin-v1';
  const DATA_KEY = 'pre1-quiz-word-list-v2';
  let unlocked = false, draft = null, dirty = false;
  const data = $('data');
  const panel = document.createElement('div');
  panel.innerHTML = `
    <h2>収録単語と日本語訳</h2>
    <label for="wordSearch">単語・訳を検索</label>
    <input id="wordSearch" class="word-search" type="search" placeholder="英単語または日本語訳">
    <button id="exportCsv" class="secondary">単語CSVを書き出す</button>
    <form id="adminForm" class="admin-form">
      <p id="adminHelp" class="muted"></p>
      <label for="adminPassword">管理者用パスワード</label>
      <input id="adminPassword" class="admin-password" type="password" autocomplete="current-password" required>
      <div id="passwordConfirmWrap" class="hidden"><label for="passwordConfirm">パスワード（確認）</label>
      <input id="passwordConfirm" class="admin-password" type="password" autocomplete="new-password"></div>
      <button id="unlockWords" class="secondary" type="submit">編集を解除</button>
    </form>
    <div id="editorActions" class="actions hidden"><button id="saveWords" class="primary">変更を保存</button><button id="lockWords">編集を終了</button></div>
    <p id="managerMessage" class="manager-message" role="status" aria-live="polite"></p>
    <div class="word-table-wrap"><table class="word-table"><caption id="wordListCount"></caption><thead><tr><th scope="col">英単語</th><th scope="col">日本語訳</th></tr></thead><tbody id="wordTableBody"></tbody></table></div>
    <p class="note">編集内容とパスワード設定はこのブラウザ内に保存されます。パスワードは簡易ロックです。共有サイトの元データは更新されません。パスワードを忘れた場合は、このサイトのブラウザ保存データを削除すると再設定できますが、学習履歴・編集内容も失われるため、先に書き出してください。</p>`;
  data.insertBefore(panel, data.querySelector('.homeBack'));
  const message = (text, error = false) => { $('managerMessage').textContent = text; $('managerMessage').classList.toggle('danger', error); };
  function credentials() {
    const raw = localStorage.getItem(ADMIN_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || typeof value.salt !== 'string' || typeof value.hash !== 'string') throw Error('パスワード設定を読み込めません。');
    return value;
  }
  async function digest(password, salt) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 210000, hash: 'SHA-256' }, key, 256);
    return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
  }
  function updateLock() {
    $('adminForm').classList.toggle('hidden', unlocked);
    $('editorActions').classList.toggle('hidden', !unlocked);
    $('importWords').disabled = !unlocked;
    try {
      const setup = !credentials();
      $('adminHelp').textContent = setup ? '初回は、このブラウザで使う専用パスワードを設定してください（8文字以上）。' : 'パスワードを入力すると単語と訳を編集できます。';
      $('passwordConfirmWrap').classList.toggle('hidden', !setup);
      $('passwordConfirm').required = setup;
      $('adminPassword').autocomplete = setup ? 'new-password' : 'current-password';
      $('unlockWords').textContent = setup ? 'パスワードを設定して編集' : '編集を解除';
    } catch (e) { message(e.message, true); }
  }
  function renderList() {
    const source = draft || words;
    const query = $('wordSearch').value.trim().toLocaleLowerCase();
    const fragment = document.createDocumentFragment();
    let count = 0;
    source.forEach((item, index) => {
      if (query && !`${item.word}\n${item.meaning}`.toLocaleLowerCase().includes(query)) return;
      count++;
      const row = document.createElement('tr');
      for (const field of ['word', 'meaning']) {
        const cell = document.createElement('td');
        if (unlocked) {
          const input = document.createElement(field === 'meaning' ? 'textarea' : 'input');
          input.className = 'word-editor';
          input.value = item[field];
          input.setAttribute('aria-label', `${index + 1}行目の${field === 'word' ? '英単語' : '日本語訳'}`);
          input.addEventListener('input', () => { draft[index][field] = input.value; dirty = true; message('未保存の変更があります。保存するとクイズに反映されます。'); });
          cell.append(input);
        } else cell.textContent = item[field];
        row.append(cell);
      }
      fragment.append(row);
    });
    $('wordTableBody').replaceChildren(fragment);
    $('wordListCount').textContent = `${source.length}語中 ${count}語を表示`;
  }
  function persist(updated) {
    localStorage.setItem(DATA_KEY, JSON.stringify(updated));
    words = updated;
    refresh();
  }
  $('adminForm').addEventListener('submit', async event => {
    event.preventDefault();
    $('unlockWords').disabled = true;
    try {
      if (!words.length) throw Error('単語の読み込み完了後に操作してください。');
      if (!crypto.subtle) throw Error('パスワード機能はHTTPSまたはlocalhostで利用してください。');
      const password = $('adminPassword').value;
      const saved = credentials();
      if (!saved) {
        if (password.length < 8) throw Error('パスワードは8文字以上にしてください。');
        if (password !== $('passwordConfirm').value) throw Error('確認用パスワードが一致しません。');
        const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(ADMIN_KEY, JSON.stringify({ salt, hash: await digest(password, salt) }));
      } else if (await digest(password, saved.salt) !== saved.hash) throw Error('パスワードが違います。');
      unlocked = true;
      draft = words.map(item => ({ ...item }));
      $('adminForm').reset();
      updateLock(); renderList(); message('編集できます。変更後に「変更を保存」を押してください。');
    } catch (e) { message(e.message, true); }
    finally { $('unlockWords').disabled = false; }
  });
  $('saveWords').onclick = () => {
    if (!unlocked) return;
    try {
      const updated = draft.map(item => ({ ...item, word: item.word.trim(), meaning: item.meaning.trim() }));
      if (updated.some(item => !item.word)) throw Error('英単語は空欄にできません。');
      if (new Set(updated.map(item => item.word.toLowerCase())).size !== updated.length) throw Error('英単語が重複しています。');
      persist(updated);
      draft = words.map(item => ({ ...item })); dirty = false;
      renderList(); message('このブラウザに保存しました。単語名を変更した場合、以前の名前の学習履歴はそのまま残ります。');
    } catch (e) { message('保存できません: ' + e.message, true); }
  };
  function lock() {
    if (dirty && !confirm('未保存の変更を破棄して編集を終了しますか？')) return false;
    unlocked = false; draft = null; dirty = false;
    $('adminForm').reset(); updateLock(); renderList(); message('');
    return true;
  }
  $('lockWords').onclick = lock;
  data.querySelector('.homeBack').onclick = () => { if (lock()) { refresh(); show('home'); } };
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  $('wordSearch').oninput = renderList;
  $('exportCsv').onclick = () => {
    if (!words.length) { message('単語データが読み込まれていません。', true); return; }
    // Quote delimiters/newlines and neutralize spreadsheet formula prefixes.
    const escape = value => '"' + (/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replaceAll('"', '""') + '"';
    const csv = '\uFEFF' + [['word', 'meaning'], ...words.map(item => [item.word, item.meaning])].map(row => row.map(escape).join(',')).join('\r\n') + '\r\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'english-quiz-words.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    message(dirty ? '保存済みの単語をCSVに書き出しました。未保存の変更は含まれません。' : '単語CSVを書き出しました。');
  };
  // Keep the existing JSON workflow, with the same editing lock and persistence.
  $('wordsFile').onchange = event => {
    const file = event.target.files[0]; event.target.value = '';
    if (!unlocked) { message('先にパスワードで編集を解除してください。', true); return; }
    if (dirty && !confirm('未保存の変更を破棄してJSONを読み込みますか？')) return;
    readJson(file, imported => {
      if (!unlocked) throw Error('編集がロックされています。再度読み込んでください。');
      if (!Array.isArray(imported) || !imported.every(item => item && typeof item.word === 'string' && typeof item.meaning === 'string')) throw Error('word と meaning を含む配列が必要です');
      const meanings = new Map(imported.map(item => [item.word, item.meaning]));
      const updated = words.map(item => ({ ...item, meaning: meanings.has(item.word) ? meanings.get(item.word) : item.meaning }));
      persist(updated); draft = words.map(item => ({ ...item })); dirty = false;
      renderList(); message('JSONの訳をこのブラウザに保存しました。');
    });
  };
  const originalRefresh = refresh;
  refresh = function () { originalRefresh(); if (!dirty) renderList(); };
  const originalDataClick = $('dataBtn').onclick;
  $('dataBtn').onclick = () => { originalDataClick(); updateLock(); renderList(); };
  window.restoreWordList = () => {
    try {
      const cached = JSON.parse(localStorage.getItem(DATA_KEY) || 'null');
      if (Array.isArray(cached) && cached.length && cached.every(item => item && typeof item.word === 'string' && item.word.trim() && typeof item.meaning === 'string') && new Set(cached.map(item => item.word.toLowerCase())).size === cached.length) words = cached;
    } catch { message('保存済み単語を読み込めないため、元の単語データを使用しています。', true); }
  };
  updateLock();
})();
