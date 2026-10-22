import { useEffect, useMemo, useRef, useState } from 'react';
import AppHeader from '../AppHeader';
import { dbLabel, fetchDatabases, fetchSchema, fetchSuggestions, fetchUsername } from './api';
import {
  DndContext, DragOverlay, PointerSensor, pointerWithin, useSensor, useSensors,
} from '@dnd-kit/core';
import { addChild, createCondition, createGroup, moveNode, removeNode, updateNode } from './tree';
import { canRedo, canUndo, createHistory, push, redo, undo } from './history';
import { deleteTemplate, listTemplates, saveTemplate } from './templates';
import FieldPanel from './FieldPanel';
import { KIND_LABELS } from './kinds';
import ConditionTree from './ConditionTree';
import HelpPanel from './HelpPanel';
import TemplatesPanel from './TemplatesPanel';
import ParamsDialog from './ParamsDialog';
import SqlStep from './SqlStep';
import ResultStep from './ResultStep';
import { buildSql, extractParams, substituteParams } from './sql';
import './constructor.css';

// Из всех зон под курсором берём самую маленькую, то есть самую вложенную группу
function innermostCollision(args) {
  const hits = pointerWithin(args);
  const area = id => {
    const r = args.droppableRects.get(id);
    return r ? r.width * r.height : Infinity;
  };
  return [...hits].sort((a, b) => area(a.id) - area(b.id));
}

const STEPS = ['Условия', 'SQL', 'Результат'];
const STEP_HINTS = [
  'Перетащите поля слева в дерево условий. Внутри группы условия связаны через И (нужны все) или ИЛИ (достаточно одного).',
  'Так выглядит запрос к базе. Проверьте его и при необходимости измените лимит строк.',
  'Клик по заголовку колонки сортирует таблицу. «Обновить» выполняет запрос заново, не используя кэш.',
];
const HELP_KEY = 'qc_help_hidden';
const COALESCE_MS = 800; // набор значения одной буквой за раз считаем одним действием для отмены

function safeListTemplates(username) {
  try { return listTemplates(username); } catch { return []; }
}

export default function ConstructorPage() {
  const [dbs, setDbs] = useState(null);
  const [db, setDb] = useState('');
  const [schema, setSchema] = useState(null);
  const [table, setTable] = useState('');
  const [hist, setHist] = useState(() => createHistory(createGroup()));
  const [limit, setLimit] = useState(1000);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(null);
  const [helpOpen, setHelpOpen] = useState(() => {
    try { return localStorage.getItem(HELP_KEY) !== '1'; } catch { return true; }
  });
  const [username, setUsername] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [activeTemplateId, setActiveTemplateId] = useState(null);
  const [askParams, setAskParams] = useState(false);
  const [paramValues, setParamValues] = useState({});
  const [dragging, setDragging] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const pendingTemplate = useRef(null); // шаблон из другой базы ждёт загрузки её схемы
  const lastEdit = useRef({ id: null, at: 0 });

  const tree = hist.present;
  const params = useMemo(() => extractParams(tree), [tree]);
  const runTree = useMemo(
    () => (params.length ? substituteParams(tree, paramValues) : tree),
    [tree, params, paramValues],
  );

  useEffect(() => {
    fetchDatabases()
      .then(list => { setDbs(list); if (list.length) setDb(list[0]); })
      .catch(e => { setDbs([]); setError(e.message); });
    fetchUsername().then(name => { setUsername(name); setTemplates(safeListTemplates(name)); });
  }, []);

  useEffect(() => {
    if (!db) return;
    let cancelled = false;
    fetchSchema(db)
      .then(s => {
        if (cancelled) return;
        setSchema(s);
        setError('');
        const tpl = pendingTemplate.current;
        pendingTemplate.current = null;
        if (tpl && tpl.db === db && s[tpl.table]) {
          setTable(tpl.table);
          setHist(createHistory(tpl.tree));
        } else {
          setTable(Object.keys(s)[0] || '');
          setHist(createHistory(createGroup()));
          if (tpl) setFlash({ text: `В базе нет таблицы ${tpl.table}, шаблон открыть нельзя.` });
        }
        setStep(1);
      })
      .catch(e => { if (!cancelled) { setSchema({}); setError(e.message); } });
    return () => { cancelled = true; };
  }, [db]);

  // Ctrl+Z и Ctrl+Y на шаге условий; в полях ввода работает обычная отмена браузера
  useEffect(() => {
    if (step !== 1) return;
    const onKey = e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return;
      if (e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); setHist(undo); }
      else if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) { e.preventDefault(); setHist(redo); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  const toggleHelp = open => {
    setHelpOpen(open);
    try { localStorage.setItem(HELP_KEY, open ? '0' : '1'); } catch { /* без хранилища просто не запоминаем */ }
  };

  const changeDb = name => {
    setActiveTemplateId(null);
    setFlash(null);
    setDb(name);
  };

  const changeTable = name => {
    setActiveTemplateId(null);
    setFlash(null);
    setTable(name);
    setHist(createHistory(createGroup()));
    setStep(1);
  };

  // Каждое изменение дерева попадает в историю; пустые изменения пропускаем
  const change = fn => setHist(h => {
    const next = fn(h.present);
    return next === h.present ? h : push(h, next);
  });

  const actions = {
    update: (id, patch) => {
      const isValueEdit = 'value' in patch || 'value2' in patch;
      const now = Date.now();
      const coalesce = isValueEdit && lastEdit.current.id === id && now - lastEdit.current.at < COALESCE_MS;
      lastEdit.current = isValueEdit ? { id, at: now } : { id: null, at: 0 };
      setHist(h => {
        const next = updateNode(h.present, id, patch);
        return coalesce ? { ...h, present: next } : push(h, next);
      });
    },
    remove: id => change(t => removeNode(t, id)),
    addGroup: id => change(t => addChild(t, id, createGroup('OR'))),
    suggest: (field, prefix) => fetchSuggestions(db, table, field, prefix),
  };
  const addField = (field, groupId = tree.id) =>
    change(t => addChild(t, groupId, createCondition(field)));

  const onDragEnd = ({ active, over }) => {
    setDragging(null);
    if (!over || !String(over.id).startsWith('group:')) return;
    const groupId = String(over.id).slice('group:'.length);
    const data = active.data.current;
    if (data.type === 'field') addField(data.field, groupId);
    else change(t => moveNode(t, data.nodeId, groupId));
  };

  // --- Шаблоны ---
  const refreshTemplates = () => setTemplates(safeListTemplates(username));

  const saveCurrent = ({ name, description, asNew }) => {
    try {
      const saved = saveTemplate(username, {
        id: asNew ? undefined : activeTemplateId ?? undefined,
        name, description, db, table, tree,
      });
      refreshTemplates();
      setActiveTemplateId(saved.id);
      setFlash({ text: asNew || !activeTemplateId ? 'Шаблон сохранён.' : 'Изменения сохранены.', ok: true });
    } catch {
      setFlash({ text: 'Не удалось сохранить шаблон: браузер не разрешает записать данные.' });
    }
  };

  const openTemplate = tpl => {
    setFlash(null);
    if (!dbs.includes(tpl.db)) {
      setFlash({ text: `База «${dbLabel(tpl.db)}» сейчас недоступна, шаблон открыть нельзя.` });
      return;
    }
    setActiveTemplateId(tpl.id);
    setStep(1);
    if (tpl.db !== db) {
      pendingTemplate.current = tpl;
      setDb(tpl.db);
    } else if (schema?.[tpl.table]) {
      setTable(tpl.table);
      setHist(createHistory(tpl.tree));
    } else {
      setFlash({ text: `В базе нет таблицы ${tpl.table}, шаблон открыть нельзя.` });
    }
  };

  const removeTemplate = id => {
    try {
      deleteTemplate(username, id);
      refreshTemplates();
      if (id === activeTemplateId) setActiveTemplateId(null);
    } catch {
      setFlash({ text: 'Не удалось удалить шаблон: браузер не разрешает записать данные.' });
    }
  };

  // На шаге результата сначала спрашиваем значения параметров, если они есть
  const goStep = n => {
    if (n === 3 && params.length) { setAskParams(true); return; }
    setStep(n);
  };
  const submitParams = values => {
    setParamValues(values);
    setAskParams(false);
    setStep(3);
  };

  const tables = schema ? Object.keys(schema) : [];
  const fields = table && schema ? schema[table] : [];
  const ready = Boolean(table);
  const built = ready ? buildSql({ table, tree, limit }) : { sql: '', skipped: 0 };

  let notice = null;
  if (dbs && dbs.length === 0) notice = 'Администратор ещё не выдал вам доступ к базам.';
  else if (schema && tables.length === 0) notice = 'В этой базе нет таблиц для выборки.';

  return (
    <div className="qc">
      <AppHeader />
      <div className="qc-body">
      <header className="qc-header">
        <div className="qc-title">
          <h1>Конструктор выборок</h1>
          <button
            className={`qc-help-btn${helpOpen ? ' is-on' : ''}`}
            aria-expanded={helpOpen}
            title={helpOpen ? 'Скрыть справку' : 'Показать справку: как собрать выборку'}
            onClick={() => toggleHelp(!helpOpen)}
          >
            <span className="qc-help-mark" aria-hidden="true">?</span>
            {helpOpen ? 'Скрыть справку' : 'Как пользоваться'}
          </button>
        </div>
        <div className="qc-pickers">
          <label>
            База
            <select value={db} onChange={e => changeDb(e.target.value)} disabled={!dbs?.length}>
              {(dbs || []).map(name => <option key={name} value={name}>{dbLabel(name)}</option>)}
            </select>
          </label>
          <label>
            Таблица
            <select value={table} onChange={e => changeTable(e.target.value)} disabled={!tables.length}>
              {tables.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        </div>
      </header>

      <nav className="qc-steps">
        {STEPS.map((title, i) => {
          const n = i + 1;
          const cls = ['qc-step', step === n && 'is-active', step > n && 'is-done'].filter(Boolean).join(' ');
          return (
            <button key={title} className={cls} disabled={n > 1 && !ready} onClick={() => goStep(n)}>
              <span className="qc-step-n">{n}</span>{title}
            </button>
          );
        })}
      </nav>

      {helpOpen && <HelpPanel onClose={() => toggleHelp(false)} />}
      {ready && <p className="qc-step-hint">{STEP_HINTS[step - 1]}</p>}

      {error && <div className="qc-alert is-error">{error}</div>}
      {notice && <div className="qc-alert">{notice}</div>}
      {flash && <div className={`qc-alert${flash.ok ? ' is-ok' : ''}`} role="status">{flash.text}</div>}
      {!dbs || (db && !schema) ? <div className="qc-card">Загрузка…</div> : null}

      {ready && step === 1 && (
        <>
          <DndContext
            sensors={sensors}
            collisionDetection={innermostCollision}
            onDragStart={e => setDragging(e.active.data.current)}
            onDragEnd={onDragEnd}
            onDragCancel={() => setDragging(null)}
          >
            <div className="qc-toolbar">
              <button className="qc-btn is-small" disabled={!canUndo(hist)} onClick={() => setHist(undo)}
                title="Отменить последнее действие (Ctrl+Z)">
                Отменить
              </button>
              <button className="qc-btn is-small" disabled={!canRedo(hist)} onClick={() => setHist(redo)}
                title="Вернуть отменённое действие (Ctrl+Y)">
                Повторить
              </button>
            </div>
            <div className="qc-builder">
              <FieldPanel fields={fields} onAdd={addField} />
              <ConditionTree tree={tree} actions={actions} />
            </div>
            <DragOverlay dropAnimation={null}>
              {dragging?.type === 'field' && (
                <div className="qc-field is-overlay">
                  <span className="qc-kind">{KIND_LABELS[dragging.field.kind]}</span>
                  <span className="qc-field-name">{dragging.field.name}</span>
                </div>
              )}
              {dragging?.type === 'node' && <div className="qc-field is-overlay">Условие</div>}
            </DragOverlay>
          </DndContext>

          <TemplatesPanel
            key={activeTemplateId ?? 'new'}
            templates={templates}
            activeId={activeTemplateId}
            onSave={saveCurrent}
            onOpen={openTemplate}
            onDelete={removeTemplate}
          />
        </>
      )}
      {ready && step === 2 && (
        <SqlStep sql={built.sql} skipped={built.skipped} params={params} limit={limit} onLimitChange={setLimit} />
      )}
      {ready && step === 3 && <ResultStep db={db} table={table} tree={runTree} limit={limit} />}

      {ready && (
        <footer className="qc-footer">
          <button className="qc-btn" disabled={step === 1} onClick={() => goStep(step - 1)}>Назад</button>
          <button className="qc-btn is-primary" disabled={step === 3} onClick={() => goStep(step + 1)}>Далее</button>
        </footer>
      )}

      {askParams && (
        <ParamsDialog names={params} onSubmit={submitParams} onCancel={() => setAskParams(false)} />
      )}
      </div>
    </div>
  );
}
