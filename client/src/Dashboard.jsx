import { useEffect, useState } from 'react';
import AppHeader from './AppHeader';
import { dbLabel, fetchDatabases, runManualQuery } from './constructor/api';
import { isMockDb } from './constructor/mock/engine';
import { MOCK_DATABASES } from './constructor/mock/data';
import ResultTable, { ExportButtons } from './constructor/ResultTable';
import './constructor/constructor.css';
import './Dashboard.css';

const EXAMPLE = {
  demo_stores: 'SELECT region, COUNT(*) AS stores\nFROM stores\nGROUP BY region\nORDER BY stores DESC;',
  demo_logistics: 'SELECT status, COUNT(*) AS deliveries\nFROM deliveries\nGROUP BY status;',
};

export default function Dashboard() {
  const [dbs, setDbs] = useState(null);
  const [db, setDb] = useState('');
  const [query, setQuery] = useState('SELECT * FROM stores_store;');
  const [state, setState] = useState({ status: 'idle', rows: [], cached: false, error: '', version: 0 });

  useEffect(() => {
    fetchDatabases()
      .then(list => {
        setDbs(list);
        if (list.length) {
          setDb(list[0]);
          setQuery(EXAMPLE[list[0]] ?? 'SELECT * FROM stores_store;');
        }
      })
      .catch(e => { setDbs([]); setState(s => ({ ...s, status: 'error', error: e.message })); });
  }, []);

  const changeDb = name => {
    setDb(name);
    if (EXAMPLE[name]) setQuery(EXAMPLE[name]);
  };

  const run = () => {
    setState(s => ({ ...s, status: 'loading' }));
    runManualQuery(db, query).then(
      ({ data, cached }) => setState(s => ({ status: 'done', rows: data, cached, error: '', version: s.version + 1 })),
      e => setState(s => ({ status: 'error', rows: [], cached: false, error: e.message, version: s.version })),
    );
  };

  const onKeyDown = e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); if (db && query.trim()) run(); }
  };

  const { status, rows, cached, error, version } = state;
  const noAccess = dbs && dbs.length === 0;

  return (
    <div className="qc">
      <AppHeader />
      <div className="qc-body">
        <header className="qc-header">
          <div>
            <h1>Ручной SQL</h1>
            <p className="qc-hint">Для тех, кто знает SQL. Разрешены только запросы SELECT.</p>
          </div>
          <div className="qc-pickers">
            <label>
              База
              <select value={db} onChange={e => changeDb(e.target.value)} disabled={!dbs?.length}>
                {(dbs || []).map(name => <option key={name} value={name}>{dbLabel(name)}</option>)}
              </select>
            </label>
          </div>
        </header>

        {noAccess && <div className="qc-alert">Администратор ещё не выдал вам доступ к базам.</div>}
        {isMockDb(db) && (
          <div className="qc-alert is-ok">
            Демо-базы выполняются прямо в браузере на SQLite. Таблицы: {Object.keys(MOCK_DATABASES[db].tables).join(', ')}.
          </div>
        )}

        <section className="qc-card">
          <h2>Запрос</h2>
          <textarea
            className="dash-editor"
            rows={7}
            spellCheck={false}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Текст SQL-запроса"
          />
          <div className="dash-actions">
            <button className="qc-btn is-primary" disabled={status === 'loading' || !db || !query.trim()} onClick={run}>
              {status === 'loading' ? 'Выполняется…' : 'Выполнить'}
            </button>
            <span className="qc-hint dash-key">Ctrl+Enter, чтобы выполнить быстро</span>
          </div>
        </section>

        {status === 'error' && <div className="qc-alert is-error dash-gap" role="alert">{error}</div>}

        {status === 'done' && (
          <section className="qc-card dash-gap">
            <div className="qc-result-bar">
              <h2>Результат {cached && <span className="qc-cached">(из кэша)</span>}</h2>
              <span className="qc-spacer" />
              <ExportButtons rows={rows} fileName="sql-result" />
            </div>
            <ResultTable key={version} rows={rows} />
          </section>
        )}
      </div>
    </div>
  );
}
