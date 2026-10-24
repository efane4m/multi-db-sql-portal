import { useMemo, useState } from 'react';
import { filterRows, formatCell, paginate, sortRows } from './result';
import { downloadFile, toCsv, toJson, toXlsx } from './export';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Кнопки скачивания всех строк результата
export function ExportButtons({ rows, fileName, disabled }) {
  const off = disabled || rows.length === 0;
  return (
    <>
      <button className="qc-btn" disabled={off} title="Скачать все строки в формате CSV"
        onClick={() => downloadFile(`${fileName}.csv`, toCsv(rows), 'text/csv;charset=utf-8')}>
        Скачать CSV
      </button>
      <button className="qc-btn" disabled={off} title="Скачать все строки в формате Excel (.xlsx)"
        onClick={() => downloadFile(`${fileName}.xlsx`, toXlsx(rows), XLSX_MIME)}>
        Скачать Excel
      </button>
      <button className="qc-btn" disabled={off} title="Скачать все строки в формате JSON"
        onClick={() => downloadFile(`${fileName}.json`, toJson(rows), 'application/json')}>
        Скачать JSON
      </button>
    </>
  );
}

// Поиск применяется ко всем полученным строкам до сортировки и разбивки на страницы.
// Родитель задаёт key, чтобы при новом результате настройки таблицы сбрасывались.
export default function ResultTable({ rows, limit }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const columns = rows.length ? Object.keys(rows[0]) : [];
  const filtered = useMemo(() => filterRows(rows, query), [rows, query]);
  const sorted = useMemo(
    () => (sort ? sortRows(filtered, sort.column, sort.direction) : filtered),
    [filtered, sort],
  );
  const view = paginate(sorted, page, pageSize);
  const firstRow = filtered.length ? (view.page - 1) * pageSize + 1 : 0;
  const lastRow = firstRow ? firstRow + view.rows.length - 1 : 0;

  const changeQuery = value => {
    setQuery(value);
    setPage(1);
  };

  const toggleSort = column => {
    setPage(1);
    setSort(s => (s?.column === column && s.direction === 'asc'
      ? { column, direction: 'desc' }
      : { column, direction: 'asc' }));
  };

  if (rows.length === 0) return <div className="qc-empty">По условиям ничего не найдено</div>;

  return (
    <>
      <div className="qc-result-controls">
        <label className="qc-result-search">
          Поиск по результатам
          <input
            type="search"
            placeholder="Введите текст или число"
            value={query}
            onChange={e => changeQuery(e.target.value)}
          />
        </label>
        <button className="qc-btn" disabled={!query} onClick={() => changeQuery('')}>Сбросить поиск</button>
        <label className="qc-result-size">
          Строк на странице
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
            {[10, 25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>
      <p className="qc-hint">Поиск по всем столбцам полученного результата. Экспорт сохраняет весь результат запроса.</p>
      <p className="qc-hint" role="status">
        Всего строк: {rows.length}
        {query.trim() && ` · Найдено: ${filtered.length}`}
        {limit && rows.length >= limit && ` (достигнут лимит ${limit}, часть строк может быть не показана)`}
      </p>
      {filtered.length === 0 ? (
        <div className="qc-empty">По вашему поиску ничего не найдено. Измените текст или сбросьте поиск.</div>
      ) : (
        <div className="qc-table-wrap">
          <table className="qc-table">
            <thead>
              <tr>
                {columns.map(c => (
                  <th key={c} onClick={() => toggleSort(c)}>
                    {c}
                    {sort?.column === c && <span className="qc-sort">{sort.direction === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row, i) => (
                <tr key={i}>
                  {columns.map(c => <td key={c}>{formatCell(row[c])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="qc-pager">
        <span className="qc-page-range">Показано {firstRow}–{lastRow} из {filtered.length}</span>
        <button className="qc-btn is-small" disabled={view.page <= 1} onClick={() => setPage(view.page - 1)}>Назад</button>
        <span>Страница {view.page} из {view.pageCount}</span>
        <button className="qc-btn is-small" disabled={view.page >= view.pageCount} onClick={() => setPage(view.page + 1)}>Вперёд</button>
      </div>
    </>
  );
}
