import { useState } from 'react';
import { dbLabel } from './api';

// Родитель задаёт key={activeId ?? 'new'}, чтобы форма заполнялась заново при открытии шаблона
export default function TemplatesPanel({ templates, activeId, onSave, onOpen, onDelete }) {
  const active = templates.find(t => t.id === activeId);
  const [name, setName] = useState(active?.name ?? '');
  const [description, setDescription] = useState(active?.description ?? '');
  const [confirmId, setConfirmId] = useState(null);

  const save = asNew => onSave({ name: name.trim(), description: description.trim(), asNew });
  const canSave = name.trim() !== '';

  return (
    <section className="qc-card qc-templates">
      <h2>Шаблоны</h2>
      <p className="qc-hint">
        Сохраните собранные условия, чтобы вернуться к ним позже. Значение вида $Регион станет параметром:
        при выполнении запроса система спросит, что в него подставить.
      </p>

      <form className="qc-tpl-form" onSubmit={e => { e.preventDefault(); if (canSave) save(false); }}>
        <label>
          Название
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Например, магазины региона" />
        </label>
        <label>
          Описание
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Необязательно" />
        </label>
        <div className="qc-tpl-actions">
          <button type="submit" className="qc-btn is-primary" disabled={!canSave}>
            {active ? 'Сохранить изменения' : 'Сохранить шаблон'}
          </button>
          {active && (
            <button type="button" className="qc-btn" disabled={!canSave} onClick={() => save(true)}>
              Сохранить как новый
            </button>
          )}
        </div>
      </form>

      {templates.length === 0 ? (
        <div className="qc-empty">Шаблонов пока нет. Соберите условия и сохраните первый.</div>
      ) : (
        <ul className="qc-tpl-list">
          {templates.map(t => (
            <li key={t.id} className={t.id === activeId ? 'is-active' : ''}>
              <div className="qc-tpl-info">
                <strong>{t.name}</strong>
                {t.description && <span className="qc-tpl-desc">{t.description}</span>}
                <span className="qc-tpl-meta">{dbLabel(t.db)}, таблица {t.table}</span>
              </div>
              <div className="qc-tpl-buttons">
                <button className="qc-btn is-small" onClick={() => onOpen(t)}>Открыть</button>
                {confirmId === t.id ? (
                  <button className="qc-btn is-small is-danger" onClick={() => { setConfirmId(null); onDelete(t.id); }}>
                    Точно удалить?
                  </button>
                ) : (
                  <button className="qc-btn is-small" onClick={() => setConfirmId(t.id)}>Удалить</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
