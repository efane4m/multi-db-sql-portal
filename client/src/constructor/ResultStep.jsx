import { useCallback, useEffect, useState } from 'react';
import { runQuery } from './api';
import { buildSql } from './sql';
import ResultTable, { ExportButtons } from './ResultTable';

export default function ResultStep({ db, table, tree, limit }) {
  const [state, setState] = useState({ status: 'loading', rows: [], cached: false, error: '', version: 0 });

  const load = useCallback(stamp => {
    const { sql } = buildSql({ table, tree, limit, refreshStamp: stamp });
    return runQuery(db, sql, { refresh: typeof stamp === 'number' }).then(
      ({ data, cached }) => ({ status: 'done', rows: data, cached, error: '' }),
      e => ({ status: 'error', rows: [], cached: false, error: e.message }),
    );
  }, [db, table, tree, limit]);

  // При входе на шаг сразу выполняем запрос
  useEffect(() => {
    let cancelled = false;
    load().then(s => { if (!cancelled) setState(prev => ({ ...s, version: prev.version + 1 })); });
    return () => { cancelled = true; };
  }, [load]);

  const rerun = stamp => {
    setState(s => ({ ...s, status: 'loading' }));
    load(stamp).then(s => setState(prev => ({ ...s, version: prev.version + 1 })));
  };

  const { status, rows, cached, error, version } = state;

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
        <ExportButtons rows={rows} fileName={table} disabled={status !== 'done'} />
      </div>

      {status === 'error' && <div className="qc-alert is-error">{error}</div>}
      {status === 'loading' && <p className="qc-hint">Загрузка…</p>}
      {status === 'done' && <ResultTable key={version} rows={rows} limit={limit} />}
    </section>
  );
}
