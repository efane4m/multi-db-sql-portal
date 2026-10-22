import { useState } from 'react';

export default function SqlStep({ sql, skipped, params = [], limit, onLimitChange }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="qc-card">
      <h2>Сформированный SQL</h2>
      <p className="qc-hint">Проверьте запрос перед выполнением. Его можно скопировать.</p>
      {skipped > 0 && (
        <div className="qc-alert">Не заполнено условий: {skipped}. Они не попали в запрос.</div>
      )}
      {params.length > 0 && (
        <div className="qc-alert is-ok">
          В запросе есть параметры: {params.map(p => `$${p}`).join(', ')}. Значения для них спросят при переходе к результату.
        </div>
      )}
      <pre className="qc-sql">{sql}</pre>
      <div className="qc-sql-tools">
        <label>
          Лимит строк
          <input
            type="number" min="1" step="1" value={limit}
            onChange={e => onLimitChange(Number(e.target.value))}
          />
        </label>
        <button className="qc-btn" onClick={copy}>{copied ? 'Скопировано' : 'Копировать'}</button>
      </div>
    </section>
  );
}
