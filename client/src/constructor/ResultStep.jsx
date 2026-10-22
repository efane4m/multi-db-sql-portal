import { useCallback, useEffect, useMemo, useState } from 'react';
import { runQuery } from './api';
import { buildSql } from './sql';
import { formatCell, paginate, sortRows } from './result';
import { downloadFile, toCsv, toJson } from './export';

export default function ResultStep({ db, table, tree, limit }) {
  const [state, setState] = useState({ status: 'loading', rows: [], cached: false, error: '' });
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(1);

  const load = useCallback(stamp => {
    const { sql } = buildSql({ table, tree, limit, refreshStamp: stamp });
    return runQuery(db, sql).then(
      ({ data, cached }) => ({ status: 'done', rows: data, cached, error: '' }),
      e => ({ status: 'error', rows: [], cached: false, error: e.message }),
    );
  }, [db, table, tree, limit]);

  // При входе на шаг сразу выполняем запрос
  useEffect(() => {
    let cancelled = false;
    load().then(s => { if (!cancelled) setState(s); });
    return () => { cancelled = true; };
  }, [load]);

  const rerun = stamp => {
    setState(s => ({ ...s, status: 'loading' }));
    setPage(1);
    load(stamp).then(setState);
  };

  const { status, rows, cached, error } = state;
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

  return (
    <section className="qc-card">
      <div className="qc-result-bar">
        <h2>Результат {cached && <span className="qc-cached">(из кэша)</span>}</h2>
        <span className="qc-spacer" />
        <button className="qc-btn is-primary" disabled={status === 'loading'} onClick={() => rerun()}>
          {status === 'loading' ? 'Выполняется…' : 'Выполнить'}
        </button>
        <button className="qc-btn" disabled={status === 'loading'} onClick={() => rerun(Date.now())}
          title="Выполнить заново, не используя кэш">
          Обновить
        </button>
        <button className="qc-btn" disabled={status !== 'done' || rows.length === 0}
          onClick={() => downloadFile(`${table}.csv`, toCsv(rows), 'text/csv;charset=utf-8')}
          title="Скачать все строки результата в формате CSV (открывается в Excel)">
          Скачать CSV
        </button>
        <button className="qc-btn" disabled={status !== 'done' || rows.length === 0}
          onClick={() => downloadFile(`${table}.json`, toJson(rows), 'application/json')}
          title="Скачать все строки результата в формате JSON">
          Скачать JSON
        </button>
      </div>

      {status === 'error' && <div className="qc-alert is-error">{error}</div>}
      {status === 'loading' && <p className="qc-hint">Загрузка…</p>}

      {status === 'done' && rows.length === 0 && (
        <div className="qc-empty">По условиям ничего не найдено</div>
      )}

      {status === 'done' && rows.length > 0 && (
        <>
          <p className="qc-hint">
            Строк: {rows.length}
            {rows.length >= limit && ` (достигнут лимит ${limit}, часть строк может быть не показана)`}
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
      )}
    </section>
  );
}
