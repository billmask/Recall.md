import readline from 'node:readline';
import { stripVTControlCharacters } from 'node:util';
import { ensure } from './core.js';

const segments = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' });
export const clean = value => stripVTControlCharacters(String(value ?? '')).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
const cells = s => [...segments.segment(s)].map(x => x.segment);
function cellWidth(c) {
  if (/^[\p{Mark}\u200d\ufe0f]+$/u.test(c)) return 0;
  const cp = c.codePointAt(0);
  return /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(c) || cp >= 0x1100 && (cp <= 0x115f || cp >= 0x2e80 && cp <= 0xa4cf || cp >= 0xac00 && cp <= 0xd7a3 || cp >= 0xf900 && cp <= 0xfaff || cp >= 0xfe10 && cp <= 0xfe6f || cp >= 0xff01 && cp <= 0xff60 || cp >= 0xffe0 && cp <= 0xffe6 || cp >= 0x20000) ? 2 : 1;
}
export const widthOf = value => cells(clean(value)).reduce((n, c) => n + cellWidth(c), 0);
export function fit(value, width, pad = true) {
  let out = '', n = 0;
  for (const c of cells(clean(value).replace(/[\r\n\t]/g, ' '))) { const w = cellWidth(c); if (n + w > width) break; out += c; n += w; }
  return out + (pad ? ' '.repeat(Math.max(0, width - n)) : '');
}
export function wrap(value, width) {
  const lines = [];
  for (const paragraph of clean(value).replace(/\r/g, '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && widthOf(line + ' ' + word) <= width) { line += ' ' + word; continue; }
      if (line) { lines.push(line); line = ''; }
      for (const c of cells(word)) { if (widthOf(line + c) > width && line) { lines.push(line); line = ''; } line += c; }
    }
    lines.push(line);
  }
  return lines;
}
export const color = (value, style) => `\x1b[${{ title: '1;36', selected: '1;30;46', muted: '90', success: '32', warning: '33' }[style] || '0'}m${value}\x1b[0m`;

/** Owns terminal modes/listeners only. Product state and writes live in TuiApp/Store. */
export function runTerminal(app, { input = process.stdin, output = process.stdout, signals = process } = {}) {
  ensure(input.isTTY && output.isTTY && typeof input.setRawMode === 'function', 'A TUI precisa de um terminal interativo. Use recall unit list --json em scripts.');
  return new Promise((resolve, reject) => {
    const raw = !!input.isRaw, flowing = input.readableFlowing;
    let finished = false;
    function stop(error) {
      if (finished) return; finished = true;
      input.off('keypress', keypress); input.off('end', end); input.off('error', fail);
      output.off('resize', draw); output.off('error', fail);
      for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) signals.off(s, exit);
      try { input.setRawMode(raw); if (flowing !== true) input.pause(); output.write('\x1b[?2004l\x1b[0m\x1b[?25h\x1b[?1049l'); }
      catch (e) { error ||= e; }
      if (error) reject(error); else resolve();
    }
    function draw() {
      if (finished) return;
      try { output.write('\x1b[H' + app.render(output.columns || 80, output.rows || 24) + '\x1b[J'); }
      catch (e) { stop(e); }
    }
    function keypress(str, key = {}) {
      if (key.ctrl && key.name === 'c') { stop(); return; }
      if ((output.columns || 80) < 50 || (output.rows || 24) < 14) return;
      try { app.handle(str, key); if (app.closed) stop(); else draw(); } catch (e) { stop(e); }
    }
    const exit = () => stop(), end = () => stop(), fail = error => stop(error);
    try {
      readline.emitKeypressEvents(input);
      input.setRawMode(true); input.resume();
      output.write('\x1b[?1049h\x1b[?25l\x1b[?2004h\x1b[2J');
      input.on('keypress', keypress); input.once('end', end); input.on('error', fail);
      output.on('resize', draw); output.on('error', fail);
      for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) signals.on(s, exit);
      draw();
    } catch (e) { stop(e); }
  });
}
