let study = null;
const $ = s => document.querySelector(s);
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const enc = encodeURIComponent;
let state, page = 'board', selected = null, tab = 'material', search = '', deckFilter = '', editing = null, materialType = null, reviewCards = [], reviewIndex = 0, reviewActive = false, toastTimer, refreshing = false;
const quizDrafts = new Map();
const devProject = document.querySelector('meta[name="recall-dev-reload"]')?.content;
const devKey = devProject && `recall-dev-session:${devProject}`;
const draftQuestions = new Map();
function readDevSession() {
  try { return devKey ? JSON.parse(sessionStorage.getItem(devKey) || 'null') : null; } catch { return null; }
}
function saveDevSession() {
  if (!devKey) return;
  try { sessionStorage.setItem(devKey, JSON.stringify({ selected, tab, drafts: [...quizDrafts].map(([id, values]) => [id, { values, questions: draftQuestions.get(id) }]) })); } catch {}
}
function reloadDevelopment() { captureQuizDraft(); saveDevSession(); location.reload(); }
if (devProject) {
  const events = new EventSource('/api/dev-reload');
  let boot;
  events.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'reload') reloadDevelopment();
    else if (msg.type === 'boot') {
      let previous = boot;
      try { sessionStorage.setItem(`${devKey}:boot`, msg.id); } catch {}
      boot = msg.id;
      if (previous && previous !== msg.id) reloadDevelopment();
    }
  };
  window.addEventListener('pagehide', () => { captureQuizDraft(); saveDevSession(); });
  document.addEventListener('input', e => { if (e.target.closest('#quiz-form')) { captureQuizDraft(); saveDevSession(); } });
}
async function restoreDevSession() {
  const saved = readDevSession();
  if (!saved || !Array.isArray(saved.drafts)) return;
  for (const entry of saved.drafts) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [id, draft] = entry, u = state.units.find(item => item.id === id);
    if (!u || !draft?.values || !draft.questions) continue;
    const values = Object.fromEntries(u.questions.filter(q => draft.questions[q.id] === JSON.stringify(q) && Object.hasOwn(draft.values, q.id)).map(q => [q.id, draft.values[q.id]]));
    if (Object.keys(values).length) { quizDrafts.set(id, values); draftQuestions.set(id, Object.fromEntries(u.questions.map(q => [q.id, JSON.stringify(q)]))); }
  }
  if (state.units.some(u => u.id === saved.selected)) {
    tab = ['material', 'quiz', 'cards', 'history'].includes(saved.tab) ? saved.tab : 'quiz';
    await openUnit(saved.selected, true);
  }
}
async function api(url, method = 'GET', body) {
  if (study && method !== 'GET' && !url.startsWith('/api/sessions')) { const session = await study.touch(studyContext()); if (session?.status === 'pending') throw new Error('Finalize a sessão anterior no painel antes de continuar.'); }
  const r = await fetch(url, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Não foi possível completar a operação.');
  if (study && method !== 'GET' && !url.startsWith('/api/sessions')) {
    const parts = url.split('/'), id = parts[3];
    const unitId = parts[2] === 'attempts' ? state.attempts.find(a => a.id === id)?.unit : id || data.unit?.id;
    const u = data.unit || state.units.find(u => u.id === unitId);
    const current = studyContext();
    const context = current?.unitId === unitId ? current : u ? unitContext(u) : null;
    const action = parts[4] === 'attempts' ? 'quiz_completed' : parts[4] === 'reviews' ? `flashcard_rated:${body.card}:${body.rating}` : parts[4] === 'assess' ? `quiz_assessed:${body.question}:${body.correct}` : parts[4] === 'cards' ? `flashcard_created:${body.question}` : parts[4] === 'sync' ? 'links_synced' : body?.status ? `move:${body.status}` : body?.questions ? 'questions_saved' : body?.cards ? 'cards_saved' : 'unit_saved';
    try { await study.record(context, action, data.transactionAt); } catch (e) { toast('A alteração foi salva; falha no registro da sessão: ' + e.message); }
  }
  return data;
}
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5000); }
function applyState(next) { state = next; $('#project-name').textContent = state.name; $('#due-count').textContent = state.cards.filter(due).length; }
async function load() { applyState(await api('/api/state')); }
function captureQuizDraft() {
  const form = $('#quiz-form'), u = selected && state?.units.find(item => item.id === selected);
  if (!form || form.dataset.submitted || !u) return;
  const questions = form.draftQuestions || u.questions;
  const values = Object.fromEntries(questions.map(q => {
    const fields = [...form.elements].filter(field => field.name === q.id), checked = fields.find(field => field.checked);
    return [q.id, q.type === 'choice' ? (checked ? Number(checked.value) : null) : fields[0]?.value ?? ''];
  }));
  if (Object.values(values).some(value => value !== null && value !== '')) { quizDrafts.set(u.id, values); draftQuestions.set(u.id, Object.fromEntries(questions.map(q => [q.id, JSON.stringify(q)]))); } else { quizDrafts.delete(u.id); draftQuestions.delete(u.id); }
}
function hasQuizDraft() {
  const form = $('#quiz-form');
  if (!form) return false;
  if (form.dataset.submitted) return !!$('#quiz-feedback')?.textContent;
  return [...form.querySelectorAll('textarea')].some(field => field.value) || [...form.querySelectorAll('input[type="radio"]')].some(field => field.checked);
}
async function refreshView() {
  if ($('#detail').open) {
    if (selected && !$('#editor').open && !$('#material-editor').open && !hasQuizDraft()) await openUnit(selected, true, true);
    return;
  }
  if (page === 'board') renderLanes();
  else if (page === 'history') history();
  else if (page === 'sessions') await sessionsView();
  else if (page === 'review' && !reviewActive) reviewHome();
}
async function synchronizeView() {
  if (refreshing || document.visibilityState === 'hidden' || !state) return;
  refreshing = true;
  try {
    const previous = state;
    const next = await api('/api/state');
    if (state !== previous) return;
    const changed = JSON.stringify(next) !== JSON.stringify(previous);
    applyState(next);
    if (changed) {
      const sameAttemptView = $('#detail').open && ['quiz', 'history'].includes(tab)
        && next.units.find(unit => unit.id === selected)?.version === previous.units.find(unit => unit.id === selected)?.version
        && JSON.stringify(next.attempts.filter(item => item.unit === selected))
          === JSON.stringify(previous.attempts.filter(item => item.unit === selected));
      if (sameAttemptView) refreshAssessmentFeedback();
      else await refreshView();
    }
  } catch {} finally { refreshing = false; }
}
function due(c) { return !c.due || Date.parse(c.due) <= Date.now(); }
function decks() { return [...new Set([...state.units.map(u => u.deck), ...state.cards.map(c => c.deck)])].sort(); }
function heading(title, desc, action = '') { return `<div class="page-heading"><div><span class="eyebrow">APRENDA COM INTENÇÃO</span><h1>${title}</h1><p>${desc}</p></div>${action}</div>`; }
function render() {
  $('#breadcrumb').textContent = { board: 'Quadro de estudos', review: 'Flashcards', history: 'Histórico', sessions: 'Sessões de estudos' }[page];
  document.querySelectorAll('[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  if (page === 'board') board(); else if (page === 'review') reviewHome(); else if (page === 'sessions') perform(sessionsView); else history();
}
function board() {
  $('#view').innerHTML = heading('Quadro de estudos', 'Um passo de cada vez, do primeiro contato à revisão.', '<button class="button primary" data-action="create"><span>＋</span> Nova etapa</button>') +
    `<div class="stats"><div class="stat"><span class="stat-icon">▦</span><div><strong>${state.units.length}</strong><small>Etapas de estudo</small></div></div><div class="stat"><span class="stat-icon">▱</span><div><strong>${state.cards.filter(due).length}</strong><small>Cartões para revisar</small></div></div><div class="stat"><span class="stat-icon">✓</span><div><strong>${state.attempts.length}</strong><small>Quizzes respondidos</small></div></div></div>` +
    (!state.units.length ? '<div class="empty-banner"><div><h3>O que você quer entender melhor?</h3><p>Crie uma etapa, reúna seu material e transforme o aprendizado em prática.</p></div><button class="button secondary" data-action="create">Criar primeira etapa ↗</button></div>' : '') +
    `<div class="toolbar"><div class="search-wrap"><span>⌕</span><input id="search" class="search" aria-label="Buscar etapas" placeholder="Buscar etapas de estudo..." value="${escape(search)}"></div><select id="deck-filter" aria-label="Filtrar deck"><option value="">Todos os decks</option>${decks().map(d => `<option ${d === deckFilter ? 'selected' : ''}>${escape(d)}</option>`).join('')}</select></div><div id="board" class="board"></div>`;
  renderLanes();
  $('#search').addEventListener('input', e => { search = e.target.value; renderLanes(); });
  $('#deck-filter').addEventListener('change', e => { deckFilter = e.target.value; renderLanes(); });
}
function renderLanes() {
  const units = state.units.filter(u => (!deckFilter || u.deck === deckFilter) && `${u.title} ${u.description} ${u.id}`.toLowerCase().includes(search.toLowerCase()));
  $('#board').innerHTML = state.statuses.map(status => {
    const list = units.filter(u => u.status === status);
    return `<section class="lane" data-status="${escape(status)}"><div class="lane-heading"><span class="lane-dot"></span>${escape(status)} <span class="count">${list.length}</span></div>${list.map(u => `<button class="study-card" data-unit="${escape(u.id)}" draggable="true"><div class="card-id"><span>${escape(u.id)}</span><span>⋮</span></div><div class="card-title">${escape(u.title)}</div><div class="card-description">${escape(u.description || 'Adicione material para esta etapa.')}</div><span class="deck-tag">${escape(u.deck)}</span><div class="card-bottom"><span>◎ ${(u.questions || []).length} questões</span><span>▱ ${(u.cards || []).length} cartões</span></div></button>`).join('')}<button class="lane-add" data-create-status="${escape(status)}">＋ Adicionar etapa</button></section>`;
  }).join('');
  document.querySelectorAll('.study-card').forEach(c => c.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', c.dataset.unit)));
  document.querySelectorAll('.lane').forEach(l => {
    l.addEventListener('dragover', e => { e.preventDefault(); l.classList.add('drag-over'); });
    l.addEventListener('dragleave', () => l.classList.remove('drag-over'));
    l.addEventListener('drop', async e => { e.preventDefault(); l.classList.remove('drag-over'); const id = e.dataTransfer.getData('text/plain'); if (!state.units.some(u => u.id === id)) return; await perform(async () => { await api(`/api/units/${enc(id)}`, 'PATCH', { status: l.dataset.status }); await load(); render(); }); });
  });
}
async function perform(fn) { try { await fn(); } catch (e) { toast(e.message); } }
function openEditor(unit = null, status = state.statuses[0]) {
  editing = unit; const form = $('#edit-form'); form.reset(); form.querySelector('.form-error').textContent = '';
  $('#editor-heading').textContent = unit ? 'Editar etapa de estudo' : 'Nova etapa de estudo';
  $('#editor-status').innerHTML = state.statuses.map(s => `<option ${s === (unit?.status || status) ? 'selected' : ''}>${escape(s)}</option>`).join('');
  for (const k of ['title', 'deck', 'description', 'file']) form.elements[k].value = unit?.[k] || (k === 'deck' ? 'Geral' : '');
  form.elements.file.disabled = !!unit; form.elements.sources.value = (unit?.sources || []).join('\n');
  $('#editor').showModal();
}
$('#edit-form').addEventListener('submit', async e => {
  e.preventDefault(); const form = e.target; const data = Object.fromEntries(new FormData(form)); data.sources = data.sources.split('\n').map(s => s.trim()).filter(Boolean); if (!data.file) delete data.file; if (editing) data.version = editing.version;
  form.querySelector('button[type="submit"]').disabled = true;
  try { const result = await api(editing ? `/api/units/${enc(editing.id)}` : '/api/units', editing ? 'PATCH' : 'POST', data); $('#editor').close(); await load(); render(); if (selected) await openUnit(result.unit.id); toast(result.warning || 'Etapa salva.'); }
  catch (err) { form.querySelector('.form-error').textContent = err.message; }
  finally { form.querySelector('button[type="submit"]').disabled = false; }
});
async function openUnit(id, keepTab = false, background = false) {
  const expectedTab = tab;
  captureQuizDraft();
  selected = id; if (!keepTab) tab = 'material'; const u = state.units.find(u => u.id === id); if (!u) return;
  let ctx; try { ctx = await api(`/api/units/${enc(id)}/context`); } catch (e) { ctx = { state: 'error', error: e.message }; }
  if (background && (selected !== id || tab !== expectedTab || hasQuizDraft() || $('#editor').open || $('#material-editor').open)) return;
  $('#detail-content').innerHTML = `<div class="detail-top"><div class="dialog-heading"><div><span class="eyebrow">${escape(u.id)} · ${escape(u.deck)}</span><h2>${escape(u.title)}</h2></div><button class="icon-button close-dialog" aria-label="Fechar">×</button></div><div class="toolbar"><span class="pill">${escape(u.status)}</span><button class="button secondary" data-action="edit-unit">Editar etapa</button></div></div><div class="detail-grid"><div class="detail-main"><div class="tabs">${[['material', 'Material'], ['quiz', 'Quiz'], ['cards', 'Flashcards'], ['history', 'Tentativas']].map(([key, name]) => `<button class="tab ${key === tab ? 'active' : ''}" data-tab="${key}">${name}</button>`).join('')}</div><div id="unit-body"></div></div><aside class="detail-aside"><span class="eyebrow">CONTEXTO DA TAREFA</span>${['linked', 'pending'].includes(ctx.state) ? `<span class="pill">${escape(ctx.id)} · ${escape(ctx.status)}</span><h3>${escape(ctx.title)}</h3><p>${escape(ctx.description || 'Sem descrição na tarefa.')}</p>${ctx.acceptance ? `<details><summary>Critérios de aceite</summary><div class="prose">${escape(ctx.acceptance)}</div></details>` : ''}<p><a href="/api/units/${enc(id)}/source" target="_blank" rel="noopener">Abrir tarefa original ↗</a></p><small>${escape(ctx.file)}</small>${ctx.state === 'pending' ? '<p><button class="button secondary" data-action="sync">Criar links</button></p>' : '<p><small>↔ Vínculo nos dois sentidos</small></p>'}` : `<p>${escape(ctx.error || (ctx.state === 'missing' ? 'A tarefa vinculada não está mais no caminho esperado.' : 'Nenhuma tarefa correspondente no Backlog.md. Esta etapa funciona de forma independente.'))}</p>`}</aside></div>`;
  renderUnitBody(); if (!$('#detail').open) { if (typeof $('#detail').show === 'function') $('#detail').show(); else $('#detail').open = true; }
  if (study && !background) await study.touch(studyContext());
}
function renderUnitBody() {
  captureQuizDraft();
  const u = state.units.find(u => u.id === selected), draft = quizDrafts.get(u.id) || {};
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'material') $('#unit-body').innerHTML = `<div class="panel-title"><h3>Material de estudo</h3></div><div class="prose">${escape(u.description || 'Edite esta etapa para adicionar seu material de estudo.')}</div>${u.sources?.length ? `<h3 class="sources-heading">Referências</h3>${u.sources.map(s => `<p class="prose">${escape(s)}</p>`).join('')}` : ''}`;
  if (tab === 'quiz') $('#unit-body').innerHTML = `<div class="panel-title"><h3>Pratique o que aprendeu</h3><button class="button secondary" data-action="add-question">＋ Questão</button></div>${u.questions.length ? `<form id="quiz-form">${u.questions.map((q, i) => `<div class="question"><small>QUESTÃO ${i + 1} · ${q.type === 'choice' ? 'MÚLTIPLA ESCOLHA' : 'TEXTO LIVRE'}</small><h3>${escape(q.prompt)}</h3>${q.type === 'choice' ? q.options.map((o, n) => `<label class="option"><input type="radio" name="${escape(q.id)}" value="${n}" ${draft[q.id] === n ? 'checked' : ''} required>${escape(o)}</label>`).join('') : `<textarea name="${escape(q.id)}" rows="3" required aria-label="Sua resposta: ${escape(q.prompt)}" placeholder="Explique com suas palavras...">${escape(draft[q.id] ?? '')}</textarea>`}${q.source ? `<div class="source">Fonte: ${escape(q.source)}</div>` : ''}</div>`).join('')}<div class="toolbar"><button type="submit" class="button primary">Conferir respostas ↗</button><button type="button" class="button secondary" data-tab="history">Conferir suas tentativas anteriores</button></div></form><div id="quiz-feedback"></div>` : '<div class="empty">Adicione uma questão ou importe material pela CLI.</div>'}`;
  if (tab === 'cards') $('#unit-body').innerHTML = `<div class="panel-title"><h3>Flashcards desta etapa</h3><button class="button secondary" data-action="add-card">＋ Cartão</button></div>${u.cards.map(c => `<div class="content-card"><strong>${escape(c.front)}</strong><details data-study-card="${escape(c.id)}"><summary>Ver resposta</summary><p>${escape(c.back)}</p></details><span class="deck-tag">${escape(c.deck)}</span></div>`).join('') || '<div class="empty">Crie cartões manualmente ou a partir do gabarito de um quiz.</div>'}`;
  if (tab === 'history') $('#unit-body').innerHTML = `<h3>Tentativas preservadas</h3>${state.attempts.filter(a => a.unit === u.id).map((a, i) => [a, i]).sort((x, y) => new Date(y[0].created) - new Date(x[0].created) || y[1] - x[1]).map(([a]) => `<details class="content-card"><summary>${new Date(a.created).toLocaleString('pt-BR')} · ${a.results.length} questões</summary>${feedback(a)}</details>`).join('') || '<div class="empty">Suas tentativas aparecerão aqui depois de responder ao quiz.</div>'}`;
  if ($('#quiz-form')) $('#quiz-form').draftQuestions = u.questions;
  $('#quiz-form')?.addEventListener('submit', async e => {
    e.preventDefault(); const form = e.target, submit = form.querySelector('button[type="submit"],button:not([type])'); submit.disabled = true;
    try { const f = new FormData(form), answers = Object.fromEntries(u.questions.map(q => [q.id, q.type === 'choice' ? Number(f.get(q.id)) : f.get(q.id)])); const a = await api(`/api/units/${enc(u.id)}/attempts`, 'POST', { answers }); quizDrafts.delete(u.id); draftQuestions.delete(u.id); form.dataset.submitted = 'true'; saveDevSession(); await load(); $('#quiz-feedback').innerHTML = `<h3 class="sources-heading">Sua tentativa</h3>${feedback(a)}`; toast('Tentativa registrada.'); }
    catch (err) { toast(err.message); } finally { submit.disabled = false; }
  });
}
function feedbackStatus(correct, assessed) {
  const message = correct === true ? '✓ Correta' : correct === false ? '↻ Retomar este conceito' : 'Compare sua resposta com a referência';
  return message + (assessed ? ' · autoavaliação' : '');
}

function refreshAssessmentFeedback(attemptId, questionId) {
  for (const row of document.querySelectorAll('#unit-body [data-result-attempt]')) {
    const { resultAttempt, resultQuestion } = row.dataset;
    if (attemptId && (resultAttempt !== attemptId || resultQuestion !== questionId)) continue;
    const attempt = state.attempts.find(item => item.id === resultAttempt);
    const result = attempt?.results.find(item => item.question === resultQuestion);
    if (!result) continue;
    const assessment = state.assessments.findLast(entry => entry.attempt === attempt.id && entry.question === result.question);
    const correct = result.correct ?? assessment?.correct;
    row.classList.toggle('wrong', correct === false);
    row.querySelector('[data-result-status]').textContent = feedbackStatus(correct, assessment);
  }
}

async function assessAnswer(button) {
  const { assess: attempt, question, correct } = button.dataset;
  const buttons = button.closest('[data-result-attempt]').querySelectorAll('[data-assess]');
  if (button.disabled) return;
  for (const control of buttons) control.disabled = true;
  try {
    const saved = await api('/api/attempts/' + enc(attempt) + '/assess', 'POST', { question, correct: correct === 'true' });
    if (!state.assessments.some(item => item.id === saved.id)) {
      state = { ...state, assessments: [...state.assessments, saved] };
    }
    refreshAssessmentFeedback(attempt, question);
    toast('Autoavaliação registrada.');
  } finally {
    for (const control of buttons) control.disabled = false;
  }
}

function feedback(a) {
  return a.results.map(r => {
    const assessed = state.assessments.filter(e => e.attempt === a.id && e.question === r.question).at(-1);
    const correct = r.correct ?? assessed?.correct;
    return `<div class="result ${correct === false ? 'wrong' : ''}" data-result-attempt="${escape(a.id)}" data-result-question="${escape(r.question)}"><strong>${escape(r.prompt)}</strong><p data-result-status aria-live="polite">${feedbackStatus(correct, assessed)}</p><p>Sua resposta: ${escape(r.options ? r.options[r.answer] : r.answer)}</p><p>Referência: ${escape(r.reference)}</p>${r.explanation ? `<p>${escape(r.explanation)}</p>` : ''}<div class="question-actions">${r.type === 'text' ? `<button class="button secondary" data-assess="${escape(a.id)}" data-question="${escape(r.question)}" data-correct="true">Entendi corretamente</button><button class="button secondary" data-assess="${escape(a.id)}" data-question="${escape(r.question)}" data-correct="false">Preciso retomar</button>` : ''}<button class="button secondary" data-from-question="${escape(r.question)}" data-owner="${escape(a.unit)}">Criar flashcard do gabarito atual</button></div></div>`;
  }).join('');
}
function openMaterial(type) {
  materialType = type; const form = $('#material-form'); form.reset(); form.querySelector('.form-error').textContent = '';
  $('#material-heading').textContent = type === 'question' ? 'Nova questão' : 'Novo flashcard';
  $('#material-fields').innerHTML = type === 'question' ? `<label>Formato<select name="type" id="question-type"><option value="choice">Múltipla escolha</option><option value="text">Texto livre</option></select></label><label>Enunciado<textarea name="prompt" rows="2" required></textarea></label><div id="choice-fields"><label>Alternativas (uma por linha)<textarea name="options" rows="4" placeholder="Primeira alternativa&#10;Segunda alternativa"></textarea></label><label>Número da alternativa correta<input name="choiceAnswer" type="number" min="1" value="1"></label></div><label id="text-answer-label" hidden>Resposta de referência<textarea name="textAnswer" rows="3"></textarea></label><label>Explicação<textarea name="explanation" rows="2"></textarea></label><label>Fonte<input name="source" placeholder="Arquivo, revisão ou referência"></label>` : `<label>Frente<textarea name="front" rows="3" required></textarea></label><label>Verso<textarea name="back" rows="3" required></textarea></label><label>Deck<input name="deck" required value="${escape(state.units.find(u => u.id === selected).deck)}"></label><label>Fonte<input name="source"></label>`;
  $('#question-type')?.addEventListener('change', e => { $('#choice-fields').hidden = e.target.value !== 'choice'; $('#text-answer-label').hidden = e.target.value !== 'text'; });
  $('#material-editor').showModal();
}
$('#material-form').addEventListener('submit', async e => {
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
  try {
    const u = await api(`/api/units/${enc(selected)}/edit`);
    let patch;
    if (materialType === 'question') { const question = { type: f.type, prompt: f.prompt, answer: f.type === 'choice' ? Number(f.choiceAnswer) - 1 : f.textAnswer, explanation: f.explanation, ...(f.source ? { source: f.source } : {}), ...(f.type === 'choice' ? { options: f.options.split('\n').map(s => s.trim()).filter(Boolean) } : {}) }; patch = { questions: [...u.questions, question], version: u.version }; }
    else patch = { cards: [...u.cards, { front: f.front, back: f.back, deck: f.deck, ...(f.source ? { source: f.source } : {}) }], version: u.version };
    const result = await api(`/api/units/${enc(selected)}`, 'PATCH', patch); $('#material-editor').close(); await load(); await openUnit(selected, true); toast(result.warning || 'Material adicionado.');
  } catch (err) { e.target.querySelector('.form-error').textContent = err.message; }
});
function reviewHome() {
  $('#view').innerHTML = heading('Volte para lembrar', 'Reencontre seus conceitos, um cartão de cada vez.') + `<div class="deck-grid">${decks().map(d => {
    const cards = state.cards.filter(c => c.deck === d), count = cards.filter(due).length;
    return `<button class="deck-card" data-review-deck="${escape(d)}"><span class="stat-icon">▱</span><h3>${escape(d)}</h3><small>${cards.length} cartões · ${count} para revisar</small><p class="muted">Revisar deck →</p></button>`;
  }).join('') || '<div class="empty">Seus decks aparecerão quando você criar etapas e flashcards.</div>'}</div>`;
}
function startReview(deck) { reviewActive = true; reviewCards = state.cards.filter(c => c.deck === deck && due(c)); reviewIndex = 0; showReview(); }
function showReview() {
  queueMicrotask(() => study?.focus(studyContext(), true).catch(e => toast(e.message)));
  if (reviewIndex >= reviewCards.length) { $('#view').innerHTML = heading('Revisão em dia', 'Os cartões desta sessão foram revisados.') + `<div class="review-box"><div class="flashcard"><span class="eyebrow">ATÉ A PRÓXIMA</span><p>${reviewCards.length ? 'Mais uma etapa para lembrar melhor.' : 'Nenhum cartão pendente neste deck.'}</p><small>Você pode voltar ao material quando precisar.</small></div><button class="button primary" data-page="review">Voltar aos decks</button></div>`; return; }
  const c = reviewCards[reviewIndex];
  $('#view').innerHTML = heading(escape(c.deck), `${reviewIndex + 1} de ${reviewCards.length} cartões nesta sessão`, '<button class="button secondary" data-page="review">Encerrar revisão</button>') + `<div class="review-box"><small>${escape(c.title)}</small><div class="flashcard"><span class="eyebrow">TENTE LEMBRAR ANTES DE REVELAR</span><p>${escape(c.front)}</p><div id="card-back" class="back" hidden>${escape(c.back)}</div></div><button class="button primary" id="reveal">Mostrar resposta</button><div id="ratings" class="ratings" hidden>${[['again', 'Repetir', '10 minutos'], ['hard', 'Difícil', '1 dia'], ['good', 'Lembrei', `${Math.max(2, c.interval * 2)} dias`], ['easy', 'Fácil', `${Math.max(4, c.interval * 3)} dias`]].map(([value, label, interval]) => `<button class="button secondary" data-rating="${value}">${label}<small>${interval}</small></button>`).join('')}</div></div>`;
  $('#reveal').addEventListener('click', () => { $('#card-back').hidden = false; $('#ratings').hidden = false; $('#reveal').hidden = true; study?.record(studyContext(), 'flashcard_revealed').catch(e => toast(e.message)); });
}
function history() {
  $('#view').innerHTML = heading('Seu caminho até aqui', 'Tentativas registradas para acompanhar o que você está aprendendo.') + `<div class="panel">${[...state.attempts].reverse().map(a => `<div class="history-item"><div><strong>${escape(state.units.find(u => u.id === a.unit)?.title || a.unit)}</strong><small>${new Date(a.created).toLocaleString('pt-BR')} · ${a.results.length} questões</small></div><button class="button secondary" data-history-unit="${escape(a.unit)}">Ver tentativa ↗</button></div>`).join('') || '<div class="empty">Responda ao primeiro quiz para começar seu histórico.</div>'}</div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  perform(async () => {
    if (b.classList.contains('close-dialog')) { b.closest('dialog').close(); return; }
    if (b.dataset.page) { if ($('#detail').open) $('#detail').close(); page = b.dataset.page; selected = null; reviewActive = false; render(); await study?.focus(null); }
    if (b.dataset.action === 'create' || b.dataset.createStatus) openEditor(null, b.dataset.createStatus);
    if (b.dataset.unit) await openUnit(b.dataset.unit);
    if (b.dataset.tab) { tab = b.dataset.tab; renderUnitBody(); await study?.record(studyContext(), `tab:${tab}`); }
    if (b.dataset.action === 'edit-unit') openEditor(await api(`/api/units/${enc(selected)}/edit`));
    if (b.dataset.action === 'add-question') openMaterial('question');
    if (b.dataset.action === 'add-card') openMaterial('card');
    if (b.dataset.action === 'sync') { await api(`/api/units/${enc(selected)}/sync`, 'POST', {}); await load(); await openUnit(selected, true); toast('Links criados.'); }
    if (b.dataset.assess) await assessAnswer(b);
    if (b.dataset.fromQuestion) { await api(`/api/units/${enc(b.dataset.owner)}/cards`, 'POST', { question: b.dataset.fromQuestion }); await load(); await openUnit(b.dataset.owner, true); toast('Flashcard criado a partir do gabarito atual.'); }
    if (b.dataset.reviewDeck) startReview(b.dataset.reviewDeck);
    if (b.dataset.rating) { const c = reviewCards[reviewIndex]; b.disabled = true; try { await api(`/api/units/${enc(c.unit)}/reviews`, 'POST', { card: c.id, rating: b.dataset.rating }); reviewIndex++; await load(); showReview(); } finally { b.disabled = false; } }
    if (b.dataset.historyUnit) { await openUnit(b.dataset.historyUnit); tab = 'history'; renderUnitBody(); }
  });
});
$('#detail').addEventListener('close', () => { if ($('#detail').open) return; captureQuizDraft(); selected = null; if (page === 'board' && $('#board')) renderLanes(); study?.focus(studyContext()).catch(e => toast(e.message)); });
function studyActionLabel(action) {
  const [type,target] = action.split(':');
  if (type === 'move') return `Estado alterado para ${target}`;
  if (type === 'tab') return `Aba ${ {material:'Material',quiz:'Quiz',cards:'Flashcards',history:'Tentativas'}[target] || 'de estudo' } aberta`;
  return {open:'Card aberto',close:'Card fechado',hidden:'Visualização pausada',visible:'Visualização retomada',close_inferred:'Fechamento estimado',quiz_completed:'Quiz enviado',unit_saved:'Card salvo',questions_saved:'Questões atualizadas',cards_saved:'Flashcards atualizados',flashcard_revealed:'Resposta do flashcard revelada',flashcard_rated:'Flashcard avaliado',flashcard_created:'Flashcard criado',quiz_assessed:'Resposta autoavaliada',links_synced:'Vínculo atualizado'}[type] || 'Ação registrada';
}
let studyViewMode = 'sessions', studyViewId = null;
const studyDuration = ms => {const sec=Math.floor(ms/1000);return `${Math.floor(sec/3600)}h ${Math.floor(sec/60)%60}m ${sec%60}s`;};
function studyHref(unitId, tabName = 'material', cardId = null) {
  return `#study/${enc(unitId)}/${tabName}${cardId ? '?card='+enc(cardId) : ''}`;
}
function activityLink(unitId, title, tabName = 'material', cardId = null) {
  const available = state.units.some(u=>u.id===unitId) && (!cardId || state.cards.some(c=>c.unit===unitId && c.id===cardId));
  return available ? `<a class="button secondary" data-study-link href="${studyHref(unitId,tabName,cardId)}">${escape(title)} ↗</a>` : `<span class="muted">${escape(title)} — atividade indisponível</span>`;
}
function savedEntityHtml(unitId, entity, kind) {
  return `<article class="content-card"><h3>${escape(entity.title)}</h3><p><strong>${studyDuration(entity.durationMs)}</strong> · ${entity.actions.open?.length||0} aberturas · ${entity.actions.close?.length||0} fechamentos</p>${activityLink(unitId,'Voltar à atividade','material',kind==='flashcard'?entity.id:null)}<dl>${Object.entries(entity.actions).map(([action,times])=>`<dt>${escape(studyActionLabel(action))}</dt><dd>${times.map(t=>new Date(t).toLocaleString('pt-BR')).join('<br>')}${activityLink(unitId,'Abrir contexto',action.startsWith('quiz')?'history':action.startsWith('flashcard')?'cards':'material',kind==='flashcard'?entity.id:null)}</dd>`).join('')}</dl></article>`;
}
async function sessionsView() {
  const records = await api('/api/sessions'); if(page!=='sessions')return;
  const current=records.find(s=>s.id===studyViewId);
  const tabs=`<div class="tabs"><button type="button" class="tab ${studyViewMode==='sessions'?'active':''}" data-study-mode="sessions">Sessões de estudos</button><button type="button" class="tab ${studyViewMode==='time'?'active':''}" data-study-mode="time">Tempo de estudo</button></div>`;
  const details = s => `<section class="panel"><h2>${new Date(s.startedAt).toLocaleString('pt-BR')}</h2><p>Encerramento: ${new Date(s.endedAt).toLocaleString('pt-BR')} · ${escape({manual:'Manual',inactivity:'Inatividade',limit:'Limite de 8 horas'}[s.reason]||s.reason)}</p>${Object.entries(s.decks).map(([name,d])=>`<h3>Deck ${escape(name)} · ${studyDuration(d.durationMs)}</h3>${Object.entries(d.cards).map(([id,e])=>savedEntityHtml(id,e,'card')).join('')}${Object.entries(d.flashcards).map(([key,e])=>{const [unitId,id]=JSON.parse(key);return savedEntityHtml(unitId,{...e,id},'flashcard');}).join('')}`).join('')||'<p>Nenhum card alcançou 10 segundos nesta sessão.</p>'}</section>`;
  $('#view').innerHTML=heading(studyViewMode==='time'?'Tempo de estudo':'Sessões de estudos','Registros confirmados. O tempo pertence aos cards; as ações têm horários.')+tabs+(studyViewMode==='time'? records.map(details).join('') : current?`<button type="button" class="button secondary" data-study-session="">Voltar à lista</button>${details(current)}`:`<div class="panel">${records.map(s=>`<div class="history-item"><div><strong>${new Date(s.startedAt).toLocaleString('pt-BR')}</strong><small>${Object.keys(s.decks).length} decks · ${escape({manual:'Manual',inactivity:'Inatividade',limit:'Limite de 8 horas'}[s.reason]||s.reason)}</small></div><button type="button" class="button secondary" data-study-session="${escape(s.id)}">Ver sessão</button></div>`).join('')||'<p>Nenhuma sessão salva. Registros provisórios e descartados não aparecem aqui.</p>'}</div>`);
  if(studyViewMode==='time'&&!records.length)$('#view').insertAdjacentHTML('beforeend','<div class="empty">Nenhum tempo de estudo confirmado.</div>');
}
async function routeStudy() {
  const match=/^#study\/([^/]+)\/(material|quiz|cards|history)(?:\?card=([^&]+))?$/.exec(location.hash);
  if(!match)return;
  const id=decodeURIComponent(match[1]),u=state.units.find(u=>u.id===id);
  if(!u){toast('Esta unidade não está mais disponível.');return;}
  if($('#detail').open)$('#detail').close();
  if(match[3]) {
    const card=state.cards.find(c=>c.unit===id&&c.id===decodeURIComponent(match[3]));
    if(!card){toast('Este flashcard não está mais disponível.');return;}
    page='review';selected=null;reviewActive=true;reviewCards=[card];reviewIndex=0;render();showReview();
    $('#breadcrumb').textContent='Flashcards';
  } else {page='board';render();await openUnit(id);tab=match[2];renderUnitBody();}
}
document.addEventListener('click',e=>{
  const link=e.target.closest('a[data-study-link]');
  if(link){e.preventDefault();window.history.replaceState(null,'',link.getAttribute('href'));perform(routeStudy);return;}
  const mode=e.target.closest('[data-study-mode]'),record=e.target.closest('[data-study-session]');
  if(mode){studyViewMode=mode.dataset.studyMode;perform(sessionsView);}
  if(record){studyViewId=record.dataset.studySession||null;perform(sessionsView);}
});
window.addEventListener('hashchange',()=>perform(routeStudy));

function unitContext(u) { return { kind: 'card', id: u.id, unitId: u.id, title: u.title, deck: u.deck }; }
function studyContext() {
  if (selected && $('#detail').open) { const u = state.units.find(u => u.id === selected); return u && unitContext(u); }
  if (reviewActive && reviewCards[reviewIndex]) { const c = reviewCards[reviewIndex]; return { kind: 'flashcard', id: c.id, unitId: c.unit, title: c.front.slice(0,500), deck: c.deck }; }
  return null;
}
document.addEventListener('toggle', e => { if (e.target.dataset?.studyCard && e.target.open) study?.record(studyContext(), `flashcard_revealed:${e.target.dataset.studyCard}`).catch(e => toast(e.message)); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#detail').open && !$('#editor').open && !$('#material-editor').open) $('#detail').close(); });
await perform(async () => { await load(); render(); await restoreDevSession(); });
if (globalThis.indexedDB && state?.projectId) await perform(async () => {
  const { setupStudyUI } = await import('/study-ui.js');
  study = await setupStudyUI({ projectId: state.projectId, getContext: studyContext, toast, api, labelAction: studyActionLabel, onSaved: () => { if (page === 'sessions') perform(sessionsView); } });
});
if (!globalThis.indexedDB && state?.projectId) toast('Registro de sessão indisponível: este navegador não oferece IndexedDB. O estudo continua disponível.');
setInterval(synchronizeView, 1000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') synchronizeView(); });
window.addEventListener('focus', synchronizeView);

await perform(routeStudy);
