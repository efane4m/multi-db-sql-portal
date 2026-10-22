import { useMemo, useState } from 'react';
import { formatCell, paginate, sortRows } from './result';
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

// Таблица результата: сортировка по клику на заголовок и страницы по 50 строк.
// Родитель задаёт key, чтобы при новом результате сортировка и страница сбрасывались.
export default function ResultTable({ rows, limit }) {
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(1);

  const columns = rows.length ? Object.keys(rows[0]) : [];
  const sorted = useMemo(
    () => (sort ? sortRows(rows, sort.column, sort.direction) : rows),
    [rows, sort],
  );
  const view = paginate(sorted, page);

  const toggleSort = column => {
    setPage(1);
    setSort(s => (s?.column === column && s.direction === 'asc'
      ? { column, direction: 'desc' }
      : { column, direction: 'asc' }));
  };

  if (rows.length === 0) return <div className="qc-empty">По условиям ничего не найдено</div>;

  return (
    <>
      <p className="qc-hint">
        Строк: {rows.length}
        {limit && rows.length >= limit && ` (достигнут лимит ${limit}, часть строк может быть не показана)`}
      </p>
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
      <div className="qc-pager">
        <button className="qc-btn is-small" disabled={view.page <= 1} onClick={() => setPage(view.page - 1)}>Назад</button>
        <span>Страница {view.page} из {view.pageCount}</span>
        <button className="qc-btn is-small" disabled={view.page >= view.pageCount} onClick={() => setPage(view.page + 1)}>Вперёд</button>
      </div>
    </>
  );
}
