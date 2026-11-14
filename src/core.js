import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import YAML from 'yaml';

export const STATUSES = ['A estudar', 'Estudando', 'Praticando', 'Em revisão', 'Concluído'];
export class RecallError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function ensure(condition, message, status) { if (!condition) throw new RecallError(message, status); }
export function text(value, label, max = 20000) {
  ensure(typeof value === 'string' && value.trim() && value.length <= max, `${label} inválido.`);
  return value.trim();
}
export function inside(root, relative) {
  ensure(typeof relative === 'string' && relative.length > 0 && !relative.includes('\\') && !path.isAbsolute(relative), 'Caminho relativo inválido.');
  const target = path.resolve(root, relative);
  ensure(target.startsWith(path.resolve(root) + path.sep), 'Caminho fora do diretório permitido.');
  let current = path.resolve(root);
  ensure(!fs.existsSync(current) || !fs.lstatSync(current).isSymbolicLink(), 'Links simbólicos não são aceitos.');
  for (const part of path.relative(root, target).split(path.sep)) {
    current = path.join(current, part);
    ensure(!fs.existsSync(current) || !fs.lstatSync(current).isSymbolicLink(), 'Links simbólicos não são aceitos.');
  }
  return target;
}
export function parseMarkdown(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  ensure(match, 'Markdown precisa de frontmatter YAML entre --- .');
  const data = YAML.parse(match[1], { maxAliasCount: 20 });
  ensure(data && typeof data === 'object' && !Array.isArray(data), 'Metadados YAML inválidos.');
  return { data, body: match[2].trim() };
}
function render(data, body = '') { return `---\n${YAML.stringify(data, { lineWidth: 0 }).trim()}\n---\n\n${body.trim()}\n`; }
function atomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temp, content, { flag: 'wx' }); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function files(root, base = '') {
  if (!fs.existsSync(root)) return [];
  const result = [];
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    ensure(!e.isSymbolicLink(), 'Links simbólicos não são aceitos no armazenamento.');
    const rel = path.posix.join(base, e.name);
    if (e.isDirectory()) result.push(...files(path.join(root, e.name), rel));
    else if (e.isFile() && e.name.endsWith('.md')) result.push(rel);
  }
  return result.sort();
}
function questions(input = []) {
  ensure(Array.isArray(input), 'Questões devem ser uma lista.');
  const ids = new Set();
  return input.map(q => {
    ensure(q && typeof q === 'object', 'Questão inválida.');
    const id = text(q.id || randomUUID(), 'ID da questão', 120);
    ensure(!ids.has(id), 'IDs de questões duplicados.'); ids.add(id);
    ensure(['choice', 'text'].includes(q.type), 'Tipo de questão: choice ou text.');
    const out = { id, type: q.type, prompt: text(q.prompt, 'Enunciado'), answer: q.answer, explanation: q.explanation || '' };
    if (q.type === 'choice') {
      ensure(Array.isArray(q.options) && q.options.length >= 2, 'Múltipla escolha exige ao menos duas alternativas.');
      out.options = q.options.map(o => text(o, 'Alternativa'));
      ensure(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < out.options.length, 'Índice da alternativa correta inválido.');
    } else out.answer = text(q.answer, 'Resposta de referência');
    if (q.source) out.source = text(q.source, 'Fonte');
    return out;
  });
}
function cards(input = [], deck) {
  ensure(Array.isArray(input), 'Flashcards devem ser uma lista.');
  const ids = new Set();
  return input.map(c => {
    const id = text(c.id || randomUUID(), 'ID do cartão', 120);
    ensure(!ids.has(id), 'IDs de flashcards duplicados.'); ids.add(id);
    return { id, front: text(c.front, 'Frente'), back: text(c.back, 'Verso'), deck: text(c.deck || deck, 'Deck', 120), ...(c.source ? { source: text(c.source, 'Fonte') } : {}) };
  });
}
export class Store {
  constructor(cwd = process.cwd()) {
    this.cwd = fs.realpathSync(path.resolve(cwd));
    this.root = inside(this.cwd, 'recall');
    this.tasks = inside(this.root, 'tasks');
  }
  init() {
    fs.mkdirSync(this.root, { recursive: true });
    const config = inside(this.root, 'config.yml');
    if (!fs.existsSync(config)) fs.writeFileSync(config, YAML.stringify({ version: 1, name: path.basename(this.cwd), backlogCommand: 'backlog' }), { flag: 'wx' });
    for (const dir of ['tasks', 'attempts', 'assessments', 'reviews']) fs.mkdirSync(inside(this.root, dir), { recursive: true });
    return this.config();
  }
  config() {
    const file = inside(this.root, 'config.yml');
    ensure(fs.existsSync(file), 'Execute recall init neste diretório primeiro.');
    return YAML.parse(fs.readFileSync(file, 'utf8'));
  }
  mutate(fn) {
    this.config();
    const lock = inside(this.root, '.write-lock');
    let fd;
    try { fd = fs.openSync(lock, 'wx'); } catch (e) { if (e.code === 'EEXIST') throw new RecallError('Outra operação está gravando. Tente novamente.', 409); throw e; }
    try { return fn(); } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
  }
  list() {
    this.config();
    const list = files(this.tasks).map(file => {
      const raw = fs.readFileSync(inside(this.tasks, file), 'utf8');
      const { data, body } = parseMarkdown(raw);
      ensure(typeof data.id === 'string' && data.id, `ID ausente: ${file}`);
      ensure(STATUSES.includes(data.status), `Status inválido: ${file}`);
      return { ...data, file, description: body, version: createHash('sha256').update(raw).digest('hex') };
    });
    ensure(new Set(list.map(u => u.id)).size === list.length, 'IDs de unidades duplicados; corrija os arquivos antes de continuar.', 409);
    return list;
  }
  get(id) { const unit = this.list().find(u => u.id === id); ensure(unit, 'Unidade não encontrada.', 404); return unit; }
  save(input, id) {
    return this.mutate(() => {
      const old = id ? this.get(id) : null;
      const units = this.list();
      const nextId = old?.id || `RCL-${Math.max(0, ...units.map(u => Number(u.id.match(/^RCL-(\d+)$/)?.[1] || 0))) + 1}`;
      const title = text(input.title ?? old?.title, 'Título', 200);
      const deck = text(input.deck ?? old?.deck ?? 'Geral', 'Deck', 120);
      const status = input.status ?? old?.status ?? STATUSES[0];
      ensure(STATUSES.includes(status), 'Status inválido.');
      const description = input.description ?? old?.description ?? '';
      ensure(typeof description === 'string' && description.length <= 100000, 'Descrição inválida.');
      const file = old?.file || input.file || `${nextId.toLowerCase()} - ${title.replace(/[^\p{L}\p{N} -]/gu, '').slice(0, 90) || 'etapa'}.md`;
      ensure(file.endsWith('.md'), 'Arquivo deve terminar em .md.');
      const target = inside(this.tasks, file);
      ensure(old || !fs.existsSync(target), 'Já existe um arquivo nesse caminho.', 409);
      if (old && input.version) ensure(input.version === old.version, 'Unidade mudou. Reabra antes de salvar.', 409);
      const { file: oldFile, description: oldDescription, version: oldVersion, ...oldData } = old || {};
      const data = {
        ...oldData, id: nextId, title, status, deck,
        created: old?.created || new Date().toISOString(), updated: new Date().toISOString(),
        sources: input.sources ?? old?.sources ?? [],
        questions: questions(input.questions ?? old?.questions), cards: cards(input.cards ?? old?.cards, deck),
        ...(old?.backlog ? { backlog: old.backlog } : {})
      };
      ensure(Array.isArray(data.sources) && data.sources.every(s => typeof s === 'string'), 'Fontes devem ser uma lista de textos.');
      atomic(target, render(data, description));
      return this.get(nextId);
    });
  }
  link(id, context) {
    return this.mutate(() => {
      const { file, description, version, ...data } = this.get(id);
      data.backlog = context;
      atomic(inside(this.tasks, file), render(data, description));
      return this.get(id);
    });
  }
  events(kind, unit) {
    return files(inside(this.root, kind)).map(f => parseMarkdown(fs.readFileSync(inside(this.root, `${kind}/${f}`), 'utf8')).data)
      .filter(e => !unit || e.unit === unit).sort((a, b) => a.created.localeCompare(b.created));
  }
  event(kind, data) {
    const record = { id: randomUUID(), created: new Date().toISOString(), ...data };
    fs.writeFileSync(inside(this.root, `${kind}/${record.id}.md`), render(record), { flag: 'wx' });
    return record;
  }
  attempt(id, answers) {
    return this.mutate(() => {
      const unit = this.get(id);
      ensure(Array.isArray(unit.questions) && unit.questions.length, 'Esta unidade não possui questões.');
      ensure(answers && typeof answers === 'object' && !Array.isArray(answers), 'Respostas inválidas.');
      const result = unit.questions.map(q => {
        const value = answers[q.id];
        if (q.type === 'choice') ensure(Number.isInteger(value) && value >= 0 && value < q.options.length, `Responda: ${q.prompt}`);
        else text(value, `Resposta: ${q.prompt}`);
        return { question: q.id, prompt: q.prompt, type: q.type, answer: value,
          correct: q.type === 'choice' ? value === q.answer : null,
          reference: q.type === 'choice' ? q.options[q.answer] : q.answer,
          explanation: q.explanation || '', ...(q.options ? { options: q.options } : {}) };
      });
      return this.event('attempts', { unit: id, version: unit.version, results: result });
    });
  }
  assess(attemptId, question, correct) {
    return this.mutate(() => {
      const attempt = this.events('attempts').find(a => a.id === attemptId);
      ensure(attempt, 'Tentativa não encontrada.', 404);
      ensure(attempt.results.some(r => r.question === question && r.type === 'text'), 'Questão de texto não encontrada.');
      ensure(typeof correct === 'boolean', 'Autoavaliação deve ser true ou false.');
      return this.event('assessments', { unit: attempt.unit, attempt: attemptId, question, correct, method: 'self' });
    });
  }
  reviewQueue({ deck, due = false } = {}) {
    const reviews = this.events('reviews');
    return this.list().flatMap(u => (u.cards || []).map(c => {
      const contentVersion = createHash('sha256').update(JSON.stringify([c.front, c.back])).digest('hex');
      const previous = reviews.filter(r => r.unit === u.id && r.card === c.id && r.version === contentVersion).at(-1);
      return { ...c, unit: u.id, title: u.title, version: contentVersion, due: previous?.due || null, interval: previous?.interval || 0 };
    })).filter(c => (!deck || c.deck === deck) && (!due || !c.due || Date.parse(c.due) <= Date.now()));
  }
  review(id, cardId, rating) {
    return this.mutate(() => {
      ensure(['again', 'hard', 'good', 'easy'].includes(rating), 'Avaliação: again, hard, good ou easy.');
      const card = this.reviewQueue().find(c => c.unit === id && c.id === cardId);
      ensure(card, 'Flashcard não encontrado.', 404);
      const interval = rating === 'again' ? 0 : rating === 'hard' ? 1 : Math.max(rating === 'easy' ? 4 : 2, card.interval * (rating === 'easy' ? 3 : 2));
      const due = new Date(Date.now() + (interval ? interval * 86400000 : 600000)).toISOString();
      return this.event('reviews', { unit: id, card: cardId, version: card.version, rating, interval, due });
    });
  }
  cardFromQuestion(id, questionId) {
    const u = this.get(id), q = u.questions.find(q => q.id === questionId);
    ensure(q, 'Questão não encontrada.', 404);
    const card = { id: `q-${q.id}`, front: q.prompt, back: q.type === 'choice' ? q.options[q.answer] : q.answer, deck: u.deck, ...(q.source ? { source: q.source } : {}) };
    ensure(!u.cards.some(c => c.id === card.id), 'Já existe um flashcard para esta questão.', 409);
    return this.save({ cards: [...u.cards, card], version: u.version }, id);
  }
  publicUnit(u) { return { ...u, questions: (u.questions || []).map(({ answer, explanation, ...q }) => q) }; }
}
