(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const micBtn = $('btn-mic');
  const stopBtn = $('btn-stop');
  const newBtn = $('btn-new');
  const transcript = $('transcript');
  const emptyState = $('empty-state');
  const statusEl = $('status');
  const autoBtn = $('btn-autospeak');
  const autoLabel = $('autospeak-label');
  const form = $('text-form');
  const composer = form;
  const input = $('text-input');
  const sendBtn = $('btn-send');
  const clearBtn = $('btn-clear');
  const voiceSelect = $('voice-select');
  const rateInput = $('rate');

  let sessionId = crypto.randomUUID();
  let state = 'idle'; // idle | listening | thinking | speaking
  let recognition = null;
  let voices = [];

  // ---------- Tự đọc ----------
  let autoSpeakOn = localStorage.getItem('autospeak') !== 'off';
  function setAutoSpeak(on) {
    autoSpeakOn = on;
    localStorage.setItem('autospeak', on ? 'on' : 'off');
    autoBtn.setAttribute('aria-pressed', String(on));
    autoLabel.textContent = on ? 'Tự đọc: Bật' : 'Tự đọc: Tắt';
    if (!on) stopSpeaking();
  }

  // ---------- Ngôn ngữ ----------
  const LANGS = {
    vi: { bcp: 'vi-VN', prefix: 'vi', preferred: /linh/i, name: 'tiếng Việt', listening: 'Đang nghe tiếng Việt…' },
    en: { bcp: 'en-US', prefix: 'en', preferred: /samantha|ava|allison|alex/i, name: 'tiếng Anh', listening: 'Listening in English…' },
  };
  let lang = localStorage.getItem('lang') === 'en' ? 'en' : 'vi';
  const segBtns = document.querySelectorAll('.seg-btn');
  function applyLang(next, announce) {
    lang = next;
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;
    segBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.lang === lang)));
    loadVoices();
    if (announce) setStatus(`Đã chuyển sang ${LANGS[lang].name}`);
  }
  segBtns.forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.lang === lang) return;
    stopSpeaking();
    if (state === 'listening') cancelListening();
    applyLang(b.dataset.lang, true);
  }));
  // Mũi tên trái/phải trong nhóm radio
  segBtns.forEach((b) => b.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const other = [...segBtns].find((x) => x !== b);
    other.focus();
    other.click();
  }));

  // ---------- UI state ----------
  const LABELS = {
    idle: ['Sẵn sàng', 'Bắt đầu nói'],
    listening: ['Đang nghe… bấm micro lần nữa để dừng', 'Dừng nghe'],
    thinking: ['Claude đang suy nghĩ…', 'Đang xử lý'],
    speaking: ['Đang đọc… bấm micro để ngắt và nói tiếp', 'Ngắt và nói tiếp'],
  };
  function setState(next, msg) {
    state = next;
    micBtn.dataset.state = next;
    micBtn.setAttribute('aria-pressed', String(next === 'listening'));
    micBtn.setAttribute('aria-label', LABELS[next][1]);
    micBtn.disabled = next === 'thinking';
    stopBtn.disabled = !speechSynthesis.speaking && next !== 'speaking';
    sendBtn.disabled = next === 'thinking' || !input.value.trim();
    setStatus(msg || LABELS[next][0]);
  }
  function setStatus(msg, isError = false) {
    statusEl.textContent = msg;
    statusEl.classList.toggle('is-error', isError);
  }

  // ---------- Transcript ----------
  function addMessage(role, text) {
    emptyState?.remove();
    const wrap = document.createElement('article');
    wrap.className = `msg msg-${role}`;
    const roleEl = document.createElement('span');
    roleEl.className = 'msg-role';
    roleEl.textContent = role === 'user' ? 'Bạn' : 'Claude';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (text) bubble.textContent = text;
    wrap.append(roleEl, bubble);
    transcript.append(wrap);
    scrollToEnd();
    return { wrap, bubble };
  }
  function addReplayButton(wrap, text) {
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-mini';
    btn.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.4 18.4a9 9 0 0 0 0-12.8"/></svg> Đọc lại';
    btn.addEventListener('click', () => {
      speechSynthesis.cancel();
      splitSentences(text).forEach(speak);
    });
    actions.append(btn);
    wrap.append(actions);
  }
  function scrollToEnd() {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: document.body.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  }

  // ---------- TTS (giọng hệ thống, macOS: "Linh") ----------
  function loadVoices() {
    voices = speechSynthesis.getVoices();
    const L = LANGS[lang];
    const saved = localStorage.getItem(`voice-${lang}`);
    const vi = voices.filter((v) => v.lang?.toLowerCase().replace('_', '-').startsWith(L.prefix));
    const list = vi.length ? [...vi, ...voices.filter((v) => !vi.includes(v))] : voices;
    voiceSelect.innerHTML = '';
    for (const v of list) {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang})${v.localService ? '' : ' · online'}`;
      voiceSelect.append(opt);
    }
    const preferred =
      list.find((v) => v.name === saved) ||
      vi.find((v) => L.preferred.test(v.name) && v.localService && v.lang.replace('_', '-') === L.bcp) ||
      vi.find((v) => L.preferred.test(v.name) && v.localService) ||
      vi.find((v) => v.localService && v.lang.replace('_', '-') === L.bcp) ||
      vi.find((v) => v.localService) ||
      vi[0];
    if (preferred) voiceSelect.value = preferred.name;
    if (voices.length && !vi.length) setStatus(`Không tìm thấy giọng ${L.name} trên máy. Vào System Settings → Accessibility → Spoken Content để tải thêm giọng.`, true);
  }
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
  voiceSelect.addEventListener('change', () => localStorage.setItem(`voice-${lang}`, voiceSelect.value));
  rateInput.value = localStorage.getItem('rate') || '1';
  rateInput.addEventListener('change', () => localStorage.setItem('rate', rateInput.value));

  let pendingUtterances = 0;
  function speak(text) {
    const clean = text.replace(/[*_#`>|~]/g, '').trim();
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean);
    const v = voices.find((x) => x.name === voiceSelect.value);
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = LANGS[lang].bcp; }
    u.rate = Number(rateInput.value) || 1;
    pendingUtterances++;
    const finish = () => {
      pendingUtterances = Math.max(0, pendingUtterances - 1);
      if (pendingUtterances === 0 && state === 'speaking') setState('idle');
    };
    u.onend = finish;
    u.onerror = finish;
    speechSynthesis.speak(u);
    stopBtn.disabled = false;
    if (state !== 'listening') setState('speaking');
  }
  function stopSpeaking() {
    pendingUtterances = 0;
    speechSynthesis.cancel();
    if (state === 'speaking') setState('idle');
    stopBtn.disabled = true;
  }
  function splitSentences(text) {
    return text.match(/[^.!?…\n]+[.!?…]*[\s]*|\n+/g)?.map((s) => s.trim()).filter(Boolean) || [];
  }

  // ---------- Hỏi Claude (stream NDJSON) ----------
  async function ask(text) {
    text = text.trim();
    if (!text || state === 'thinking') return;
    stopSpeaking();
    addMessage('user', text);
    const { wrap, bubble } = addMessage('bot', '');
    bubble.innerHTML = '<span class="typing" aria-label="Đang trả lời"><span></span><span></span><span></span></span>';
    setState('thinking');

    let full = '';
    let speakBuf = '';
    let gotFirst = false;
    const flushSentences = (final) => {
      if (!autoSpeakOn) return;
      // Cắt tại dấu kết câu theo sau là khoảng trắng để đọc dần trong lúc stream.
      const re = /[\s\S]*?(?:[.!?…]+(?=\s)|\n)/y;
      let m;
      let consumed = 0;
      re.lastIndex = 0;
      while ((m = re.exec(speakBuf)) !== null) {
        speak(m[0]);
        consumed = re.lastIndex;
      }
      speakBuf = speakBuf.slice(consumed);
      if (final && speakBuf.trim()) { speak(speakBuf); speakBuf = ''; }
    };

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sessionId, lang }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Lỗi máy chủ (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let errorMsg = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const msg = JSON.parse(line);
          if (msg.type === 'delta') {
            if (!gotFirst) { gotFirst = true; bubble.textContent = ''; }
            full += msg.text;
            speakBuf += msg.text;
            bubble.textContent = full;
            flushSentences(false);
            scrollToEnd();
          } else if (msg.type === 'error') {
            errorMsg = msg.message;
          }
        }
      }
      if (errorMsg && !full) throw new Error(errorMsg);
      flushSentences(true);
      if (full) addReplayButton(wrap, full);
      if (state === 'thinking') setState(pendingUtterances ? 'speaking' : 'idle');
      if (errorMsg) setStatus(errorMsg, true);
    } catch (err) {
      wrap.classList.add('is-error');
      bubble.textContent = err.message || String(err);
      setState('idle');
      setStatus('Có lỗi, thử lại nhé.', true);
    }
  }

  // ---------- Ô soạn ----------
  function autoResize() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
  }
  function updateComposer() {
    const has = input.value.trim().length > 0;
    sendBtn.disabled = !has || state === 'thinking';
    clearBtn.hidden = !input.value;
    autoResize();
  }
  input.addEventListener('input', updateComposer);
  input.addEventListener('keydown', (e) => {
    // Enter gửi, Shift+Enter xuống dòng. Bỏ qua khi bộ gõ (Telex/VNI) đang ghép chữ.
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  clearBtn.addEventListener('click', () => {
    if (state === 'listening') cancelListening();
    input.value = '';
    updateComposer();
    input.focus();
  });

  // ---------- Thu âm (Web Speech API): chỉ điền chữ vào ô soạn, KHÔNG tự gửi ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let baseText = '';

  function startListening() {
    if (!SR) {
      setStatus('Trình duyệt này không hỗ trợ nhận giọng nói. Hãy dùng Chrome hoặc Safari, hoặc gõ câu hỏi.', true);
      return;
    }
    stopSpeaking();
    // Nói tiếp sẽ nối thêm vào nội dung đang có trong ô
    baseText = input.value.trim() ? input.value.replace(/\s*$/, ' ') : '';
    let finalText = '';
    const rec = new SR();
    recognition = rec;
    rec.lang = LANGS[lang].bcp;
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      if (recognition !== rec) return;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript.trim() + ' ';
        else interim += r[0].transcript;
      }
      input.value = (baseText + finalText + interim).replace(/\s+$/, interim ? '' : ' ');
      updateComposer();
    };
    rec.onerror = (e) => {
      const map = {
        'not-allowed': 'Chưa cho phép micro. Bấm biểu tượng ổ khoá trên thanh địa chỉ để cấp quyền.',
        'no-speech': 'Không nghe thấy gì, thử lại nhé.',
        'network': 'Lỗi mạng khi nhận giọng nói (Chrome cần Internet cho tính năng này).',
        'audio-capture': 'Không tìm thấy micro.',
      };
      if (e.error !== 'aborted') setStatus(map[e.error] || `Lỗi nhận giọng: ${e.error}`, true);
    };
    rec.onend = () => {
      if (recognition !== rec) return;
      recognition = null;
      endListeningUi();
    };

    try {
      rec.start();
      input.readOnly = true;
      composer.classList.add('is-listening');
      setState('listening', `${LANGS[lang].listening} Bấm micro lần nữa để dừng`);
    } catch (err) {
      recognition = null;
      setStatus(`Không bật được micro: ${err.message}`, true);
    }
  }

  function endListeningUi() {
    input.readOnly = false;
    composer.classList.remove('is-listening');
    input.value = input.value.trim();
    updateComposer();
    const hadError = statusEl.classList.contains('is-error');
    if (state === 'listening') {
      setState('idle', hadError ? statusEl.textContent : (input.value ? 'Xem lại nội dung rồi bấm Gửi (Enter)' : undefined));
      if (hadError) statusEl.classList.add('is-error');
    }
    if (input.value) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
  // Dừng nghe, giữ chữ đã nhận
  function stopListening() { recognition?.stop(); }
  // Huỷ lượt nghe hiện tại, trả ô soạn về như trước khi nói
  function cancelListening() {
    const rec = recognition;
    if (!rec) return;
    recognition = null;
    rec.abort();
    input.value = baseText.trim();
    endListeningUi();
  }
  // Ngắt micro ngay nhưng giữ nội dung đang hiển thị (dùng khi bấm Gửi lúc đang nghe)
  function detachListening() {
    const rec = recognition;
    if (!rec) return;
    recognition = null;
    rec.abort();
    endListeningUi();
  }

  micBtn.addEventListener('click', () => {
    if (state === 'listening') stopListening();
    else if (state !== 'thinking') startListening();
  });
  stopBtn.addEventListener('click', stopSpeaking);
  autoBtn.addEventListener('click', () => setAutoSpeak(!autoSpeakOn));
  newBtn.addEventListener('click', () => {
    stopSpeaking();
    cancelListening();
    sessionId = crypto.randomUUID();
    transcript.innerHTML = '';
    const p = document.createElement('div');
    p.className = 'empty';
    p.innerHTML = '<p class="empty-title">Cuộc trò chuyện mới</p><p class="empty-sub">Claude sẽ không nhớ nội dung trước đó.</p>';
    transcript.append(p);
    setState('idle');
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state === 'thinking') return;
    if (state === 'listening') detachListening();
    const t = input.value.trim();
    if (!t) return;
    input.value = '';
    updateComposer();
    ask(t);
  });

  document.addEventListener('keydown', (e) => {
    const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName) && !input.readOnly;
    if (e.key === 'Escape') { stopSpeaking(); if (state === 'listening') cancelListening(); }
    if (e.code === 'Space' && !typing && !['BUTTON', 'SUMMARY'].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      micBtn.click();
    }
  });

  setState('idle');
  setAutoSpeak(autoSpeakOn);
  applyLang(lang, false);
  updateComposer();
  document.body.dataset.ready = '1';
})();
