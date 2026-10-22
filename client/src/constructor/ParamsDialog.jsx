import { useState } from 'react';

// Окно ввода значений для параметров шаблона ($Регион и т. п.)
export default function ParamsDialog({ names, onSubmit, onCancel }) {
  const [values, setValues] = useState(() => Object.fromEntries(names.map(n => [n, ''])));

  const submit = e => {
    e.preventDefault();
    onSubmit(values);
  };

  return (
    <div className="qc-modal" role="dialog" aria-modal="true" aria-labelledby="qc-params-title"
      onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}>
      <form className="qc-modal-box" onSubmit={submit}>
        <h2 id="qc-params-title">Заполните параметры</h2>
        <p className="qc-hint">В запросе есть параметры. Введите для каждого значение, и запрос выполнится с ним.</p>
        {names.map((name, i) => (
          <label key={name} className="qc-modal-field">
            {name}
            <input
              autoFocus={i === 0}
              value={values[name]}
              onChange={e => setValues(v => ({ ...v, [name]: e.target.value }))}
            />
          </label>
        ))}
        <div className="qc-modal-actions">
          <button type="button" className="qc-btn" onClick={onCancel}>Отмена</button>
          <button type="submit" className="qc-btn is-primary" disabled={names.some(n => values[n] === '')}>
            Выполнить
          </button>
        </div>
      </form>
    </div>
  );
}
