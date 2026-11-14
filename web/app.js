const $ = s => document.querySelector(s);
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const enc = encodeURIComponent;
let state, page = 'board', selected = null, tab = 'material', search = '', deckFilter = '', editing = null, materialType = null, reviewCards = [], reviewIndex = 0, toastTimer;
async function api(url, method = 'GET', body) {
  const r = await fetch(url, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Não foi possível completar a operação.');
  return data;
}
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5000); }
async function load() { state = await api('/api/state'); $('#project-name').textContent = state.name; $('#due-count').textContent = state.cards.filter(due).length; }
function due(c) { return !c.due || Date.parse(c.due) <= Date.now(); }
function decks() { return [...new Set([...state.units.map(u => u.deck), ...state.cards.map(c => c.deck)])].sort(); }
function heading(title, desc, action = '') { return `<div class="page-heading"><div><span class="eyebrow">APRENDA COM INTENÇÃO</span><h1>${title}</h1><p>${desc}</p></div>${action}</div>`; }
function render() {
  $('#breadcrumb').textContent = { board: 'Quadro de estudos', review: 'Flashcards', history: 'Histórico' }[page];
  document.querySelectorAll('[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  if (page === 'board') board(); else if (page === 'review') reviewHome(); else history();
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
async function openUnit(id, keepTab = false) {
  selected = id; if (!keepTab) tab = 'material'; const u = state.units.find(u => u.id === id); if (!u) return;
  let ctx; try { ctx = await api(`/api/units/${enc(id)}/context`); } catch (e) { ctx = { state: 'error', error: e.message }; }
  $('#detail-content').innerHTML = `<div class="detail-top"><div class="dialog-heading"><div><span class="eyebrow">${escape(u.id)} · ${escape(u.deck)}</span><h2>${escape(u.title)}</h2></div><button class="icon-button close-dialog" aria-label="Fechar">×</button></div><div class="toolbar"><span class="pill">${escape(u.status)}</span><button class="button secondary" data-action="edit-unit">Editar etapa</button></div></div><div class="detail-grid"><div class="detail-main"><div class="tabs">${[['material', 'Material'], ['quiz', 'Quiz'], ['cards', 'Flashcards'], ['history', 'Tentativas']].map(([key, name]) => `<button class="tab ${key === tab ? 'active' : ''}" data-tab="${key}">${name}</button>`).join('')}</div><div id="unit-body"></div></div><aside class="detail-aside"><span class="eyebrow">CONTEXTO DA TAREFA</span>${['linked', 'pending'].includes(ctx.state) ? `<span class="pill">${escape(ctx.id)} · ${escape(ctx.status)}</span><h3>${escape(ctx.title)}</h3><p>${escape(ctx.description || 'Sem descrição na tarefa.')}</p>${ctx.acceptance ? `<details><summary>Critérios de aceite</summary><div class="prose">${escape(ctx.acceptance)}</div></details>` : ''}<p><a href="/api/units/${enc(id)}/source" target="_blank" rel="noopener">Abrir tarefa original ↗</a></p><small>${escape(ctx.file)}</small>${ctx.state === 'pending' ? '<p><button class="button secondary" data-action="sync">Criar links</button></p>' : '<p><small>↔ Vínculo nos dois sentidos</small></p>'}` : `<p>${escape(ctx.error || (ctx.state === 'missing' ? 'A tarefa vinculada não está mais no caminho esperado.' : 'Nenhuma tarefa correspondente no Backlog.md. Esta etapa funciona de forma independente.'))}</p>`}</aside></div>`;
  renderUnitBody(); if (!$('#detail').open) $('#detail').showModal();
}
function renderUnitBody() {
  const u = state.units.find(u => u.id === selected);
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'material') $('#unit-body').innerHTML = `<div class="panel-title"><h3>Material de estudo</h3></div><div class="prose">${escape(u.description || 'Edite esta etapa para adicionar seu material de estudo.')}</div>${u.sources?.length ? `<h3 class="sources-heading">Referências</h3>${u.sources.map(s => `<p class="prose">${escape(s)}</p>`).join('')}` : ''}`;
  if (tab === 'quiz') $('#unit-body').innerHTML = `<div class="panel-title"><h3>Pratique o que aprendeu</h3><button class="button secondary" data-action="add-question">＋ Questão</button></div>${u.questions.length ? `<form id="quiz-form">${u.questions.map((q, i) => `<div class="question"><small>QUESTÃO ${i + 1} · ${q.type === 'choice' ? 'MÚLTIPLA ESCOLHA' : 'TEXTO LIVRE'}</small><h3>${escape(q.prompt)}</h3>${q.type === 'choice' ? q.options.map((o, n) => `<label class="option"><input type="radio" name="${escape(q.id)}" value="${n}" required>${escape(o)}</label>`).join('') : `<textarea name="${escape(q.id)}" rows="3" required aria-label="Sua resposta: ${escape(q.prompt)}" placeholder="Explique com suas palavras..."></textarea>`}${q.source ? `<div class="source">Fonte: ${escape(q.source)}</div>` : ''}</div>`).join('')}<button class="button primary">Conferir respostas ↗</button></form><div id="quiz-feedback"></div>` : '<div class="empty">Adicione uma questão ou importe material pela CLI.</div>'}`;
  if (tab === 'cards') $('#unit-body').innerHTML = `<div class="panel-title"><h3>Flashcards desta etapa</h3><button class="button secondary" data-action="add-card">＋ Cartão</button></div>${u.cards.map(c => `<div class="content-card"><strong>${escape(c.front)}</strong><details><summary>Ver resposta</summary><p>${escape(c.back)}</p></details><span class="deck-tag">${escape(c.deck)}</span></div>`).join('') || '<div class="empty">Crie cartões manualmente ou a partir do gabarito de um quiz.</div>'}`;
  if (tab === 'history') $('#unit-body').innerHTML = `<h3>Tentativas preservadas</h3>${state.attempts.filter(a => a.unit === u.id).reverse().map(a => `<details class="content-card"><summary>${new Date(a.created).toLocaleString('pt-BR')} · ${a.results.length} questões</summary>${feedback(a)}</details>`).join('') || '<div class="empty">Suas tentativas aparecerão aqui depois de responder ao quiz.</div>'}`;
  $('#quiz-form')?.addEventListener('submit', async e => {
    e.preventDefault(); const submit = e.target.querySelector('button[type="submit"],button:not([type])'); submit.disabled = true;
    try { const f = new FormData(e.target), answers = Object.fromEntries(u.questions.map(q => [q.id, q.type === 'choice' ? Number(f.get(q.id)) : f.get(q.id)])); const a = await api(`/api/units/${enc(u.id)}/attempts`, 'POST', { answers }); await load(); $('#quiz-feedback').innerHTML = `<h3 class="sources-heading">Sua tentativa</h3>${feedback(a)}`; toast('Tentativa registrada.'); }
    catch (err) { toast(err.message); } finally { submit.disabled = false; }
  });
}
function feedback(a) {
  return a.results.map(r => {
    const assessed = state.assessments.filter(e => e.attempt === a.id && e.question === r.question).at(-1);
    const correct = r.correct ?? assessed?.correct;
    return `<div class="result ${correct === false ? 'wrong' : ''}"><strong>${escape(r.prompt)}</strong><p>${correct === true ? '✓ Correta' : correct === false ? '↻ Retomar este conceito' : 'Compare sua resposta com a referência' }${assessed ? ' · autoavaliação' : ''}</p><p>Sua resposta: ${escape(r.options ? r.options[r.answer] : r.answer)}</p><p>Referência: ${escape(r.reference)}</p>${r.explanation ? `<p>${escape(r.explanation)}</p>` : ''}<div class="question-actions">${r.type === 'text' ? `<button class="button secondary" data-assess="${escape(a.id)}" data-question="${escape(r.question)}" data-correct="true">Entendi corretamente</button><button class="button secondary" data-assess="${escape(a.id)}" data-question="${escape(r.question)}" data-correct="false">Preciso retomar</button>` : ''}<button class="button secondary" data-from-question="${escape(r.question)}" data-owner="${escape(a.unit)}">Criar flashcard do gabarito atual</button></div></div>`;
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
function startReview(deck) { reviewCards = state.cards.filter(c => c.deck === deck && due(c)); reviewIndex = 0; showReview(); }
function showReview() {
  if (reviewIndex >= reviewCards.length) { $('#view').innerHTML = heading('Revisão em dia', 'Os cartões desta sessão foram revisados.') + `<div class="review-box"><div class="flashcard"><span class="eyebrow">ATÉ A PRÓXIMA</span><p>${reviewCards.length ? 'Mais uma etapa para lembrar melhor.' : 'Nenhum cartão pendente neste deck.'}</p><small>Você pode voltar ao material quando precisar.</small></div><button class="button primary" data-page="review">Voltar aos decks</button></div>`; return; }
  const c = reviewCards[reviewIndex];
  $('#view').innerHTML = heading(escape(c.deck), `${reviewIndex + 1} de ${reviewCards.length} cartões nesta sessão`, '<button class="button secondary" data-page="review">Encerrar sessão</button>') + `<div class="review-box"><small>${escape(c.title)}</small><div class="flashcard"><span class="eyebrow">TENTE LEMBRAR ANTES DE REVELAR</span><p>${escape(c.front)}</p><div id="card-back" class="back" hidden>${escape(c.back)}</div></div><button class="button primary" id="reveal">Mostrar resposta</button><div id="ratings" class="ratings" hidden>${[['again', 'Repetir', '10 minutos'], ['hard', 'Difícil', '1 dia'], ['good', 'Lembrei', `${Math.max(2, c.interval * 2)} dias`], ['easy', 'Fácil', `${Math.max(4, c.interval * 3)} dias`]].map(([value, label, interval]) => `<button class="button secondary" data-rating="${value}">${label}<small>${interval}</small></button>`).join('')}</div></div>`;
  $('#reveal').addEventListener('click', () => { $('#card-back').hidden = false; $('#ratings').hidden = false; $('#reveal').hidden = true; });
}
function history() {
  $('#view').innerHTML = heading('Seu caminho até aqui', 'Tentativas registradas para acompanhar o que você está aprendendo.') + `<div class="panel">${[...state.attempts].reverse().map(a => `<div class="history-item"><div><strong>${escape(state.units.find(u => u.id === a.unit)?.title || a.unit)}</strong><small>${new Date(a.created).toLocaleString('pt-BR')} · ${a.results.length} questões</small></div><button class="button secondary" data-history-unit="${escape(a.unit)}">Ver tentativa ↗</button></div>`).join('') || '<div class="empty">Responda ao primeiro quiz para começar seu histórico.</div>'}</div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  perform(async () => {
    if (b.classList.contains('close-dialog')) { b.closest('dialog').close(); return; }
    if (b.dataset.page) { page = b.dataset.page; selected = null; render(); }
    if (b.dataset.action === 'create' || b.dataset.createStatus) openEditor(null, b.dataset.createStatus);
    if (b.dataset.unit) await openUnit(b.dataset.unit);
    if (b.dataset.tab) { tab = b.dataset.tab; renderUnitBody(); }
    if (b.dataset.action === 'edit-unit') openEditor(await api(`/api/units/${enc(selected)}/edit`));
    if (b.dataset.action === 'add-question') openMaterial('question');
    if (b.dataset.action === 'add-card') openMaterial('card');
    if (b.dataset.action === 'sync') { await api(`/api/units/${enc(selected)}/sync`, 'POST', {}); await load(); await openUnit(selected, true); toast('Links criados.'); }
    if (b.dataset.assess) { await api(`/api/attempts/${enc(b.dataset.assess)}/assess`, 'POST', { question: b.dataset.question, correct: b.dataset.correct === 'true' }); await load(); tab = 'history'; renderUnitBody(); toast('Autoavaliação registrada.'); }
    if (b.dataset.fromQuestion) { await api(`/api/units/${enc(b.dataset.owner)}/cards`, 'POST', { question: b.dataset.fromQuestion }); await load(); render(); toast('Flashcard criado a partir do gabarito atual.'); }
    if (b.dataset.reviewDeck) startReview(b.dataset.reviewDeck);
    if (b.dataset.rating) { const c = reviewCards[reviewIndex]; b.disabled = true; try { await api(`/api/units/${enc(c.unit)}/reviews`, 'POST', { card: c.id, rating: b.dataset.rating }); reviewIndex++; await load(); showReview(); } finally { b.disabled = false; } }
    if (b.dataset.historyUnit) { await openUnit(b.dataset.historyUnit); tab = 'history'; renderUnitBody(); }
  });
});
$('#detail').addEventListener('close', () => { selected = null; render(); });
await perform(async () => { await load(); render(); });
