const BOM = '﻿';

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows) {
  if (rows.length === 0) return '';
  const keys = Object.keys(rows[0]);
  const lines = [keys.map(csvCell).join(',')];
  for (const row of rows) lines.push(keys.map(k => csvCell(row[k])).join(','));
  // BOM нужен, чтобы Excel правильно прочитал кириллицу
  return BOM + lines.join('\r\n');
}

export function toJson(rows) {
  return JSON.stringify(rows, null, 2);
}

export function downloadFile(filename, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
