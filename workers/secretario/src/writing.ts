/** Preferencia permanente de Araceli. Se aplica al redactar y antes de guardar. */
export const WRITING_PREFERENCE = 'Redacta siempre en castellano natural y legible, con párrafos separados. Se permiten negrita y cursiva reales, nunca sus marcas visibles. No muestres barras de escape, almohadillas de títulos, separadores de código, tablas Markdown ni entidades HTML como &#x37;. Conserva acentos, porcentajes y el símbolo €. La marca se escribe ReforVit, con V. En actas y correos no inventes participantes, responsables, cifras, plazos, acuerdos ni acciones realizadas: usa la fuente y pregunta si falta un dato imprescindible. No afirmes haber archivado o enviado nada sin un resultado verificado.';

const entityNames: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', euro: '€' };

/** Dos pasadas toleran el doble escape sin reinterpretar HTML no confiable. */
export function normalizeWritingText(value: string): string {
  let text = String(value || '').replace(/\r\n?/g, '\n');
  for (let pass = 0; pass < 2; pass++) {
    text = text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (!code.startsWith('#')) return entityNames[code.toLowerCase()] ?? match;
      const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '';
    });
    text = text.replace(/\\([\\*_#>|\[\]().!~+\-])/g, '$1');
  }
  return text
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/\brefor(?:bit|vit)\b/gi, 'ReforVit')
    .replace(/\\?<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div)>/gi, '\n\n')
    .replace(/<\/?(?:p|div)(?:\s[^>]*)?>/gi, '')
    .replace(/<(?:strong|b)>/gi, '**').replace(/<\/(?:strong|b)>/gi, '**')
    .replace(/<(?:em|i)>/gi, '*').replace(/<\/(?:em|i)>/gi, '*')
    .replace(/^\s*(?:-{3,}|_{3,}|\*{3,})\s*$/gm, '')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Convierte tablas, incluidas las escapadas o sin barra final, en fichas. */
export function readableWriting(value: string): string {
  const lines = normalizeWritingText(value).split('\n');
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i])) { result.push(lines[i]); continue; }
    const block: string[] = [];
    while (i < lines.length && /^\s*\|/.test(lines[i])) block.push(lines[i++]);
    i--;
    const rows = block.map(line => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()));
    const hasHeader = rows.length > 1 && rows[1].every(cell => /^:?-{2,}:?$/.test(cell) || !cell);
    const headers = hasHeader ? rows[0].map(cell => cell.replace(/\*|_/g, '')) : [];
    const data = rows.filter((row, idx) => !(hasHeader && idx < 2));
    result.push(data.map((row, idx) => {
      const title = `${idx + 1}. ${headers[0] ? `${headers[0]}: ` : ''}${row[0]}`;
      return [title, ...row.slice(1).map((cell, col) => `${headers[col + 1] ? `${headers[col + 1]}: ` : ''}${cell}`)].join('\n');
    }).join('\n\n'));
  }
  return result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Genera solo etiquetas propias: nunca permite HTML arbitrario del modelo. */
function inlineHtml(text: string): string {
  return escape(text)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*{1,3}/g, '');
}

export function renderWriting(value: string): { text: string; html: string } {
  const clean = readableWriting(value)
    .replace(/^\s*```\w*\s*$/gm, '')
    .replace(/^\s*#{1,6}\s+(.+)$/gm, '**$1**')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
    .trim();
  const html = clean.split(/\n\n+/).map(block => `<p style="margin:0 0 14px;line-height:1.5">${block.split('\n').map(inlineHtml).join('<br>')}</p>`).join('\n');
  const text = clean.replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/__([^_\n]+)__/g, '$1')
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/`([^`\n]+)`/g, '$1').replace(/\*{1,3}/g, '');
  return { text, html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#202124">${html}</div>` };
}
