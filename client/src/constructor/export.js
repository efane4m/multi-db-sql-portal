import { zipSync, strToU8 } from 'fflate';

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

// data: строка или Uint8Array
export function downloadFile(filename, data, mime) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

function xmlEscape(value) {
  return String(value)
    // символы, недопустимые в XML 1.0 (кроме tab, CR, LF)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnLetter(index) {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function xlsxCell(ref, value, style) {
  if (value === null || value === undefined) return '';
  const s = style ? ` s="${style}"` : '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"${s}><v>${value}</v></c>`;
  }
  if (typeof value === 'boolean') {
    return `<c r="${ref}"${s} t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
}

export function toXlsx(rows) {
  const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
  const xmlRows = [];
  if (keys.length > 0) {
    const header = keys.map((k, i) => xlsxCell(`${columnLetter(i)}1`, k, 1)).join('');
    xmlRows.push(`<row r="1">${header}</row>`);
    rows.forEach((row, r) => {
      const n = r + 2;
      const cells = keys.map((k, i) => xlsxCell(`${columnLetter(i)}${n}`, row[k], 0)).join('');
      xmlRows.push(`<row r="${n}">${cells}</row>`);
    });
  }
  const sheet = `${XML_HEAD}<worksheet xmlns="${NS_MAIN}"><sheetData>${xmlRows.join('')}</sheetData></worksheet>`;

  const files = {
    '[Content_Types].xml': `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '</Types>',
    '_rels/.rels': `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}">`
      + `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>`
      + '</Relationships>',
    'xl/workbook.xml': `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">`
      + '<sheets><sheet name="Результат" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}">`
      + `<Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/>`
      + `<Relationship Id="rId2" Type="${NS_REL}/styles" Target="styles.xml"/>`
      + '</Relationships>',
    'xl/styles.xml': `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}">`
      + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
      + '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
      + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>',
    'xl/worksheets/sheet1.xml': sheet,
  };
  const zipInput = {};
  for (const [name, xml] of Object.entries(files)) zipInput[name] = strToU8(xml);
  return zipSync(zipInput);
}
