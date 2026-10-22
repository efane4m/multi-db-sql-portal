import { useEffect, useRef, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { operatorsFor } from './schema';
import { KIND_LABELS } from './kinds';

const OPERATOR_LABELS = {
  BETWEEN: 'между',
  'IS NULL': 'не задано',
  'IS NOT NULL': 'задано',
};
const NULL_OPS = ['IS NULL', 'IS NOT NULL'];

const SUGGEST_DELAY_MS = 250;

function ValueInput({ kind, value, onChange, placeholder, suggest, listId }) {
  const [options, setOptions] = useState([]);
  const timer = useRef(null);
  const asked = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (kind === 'boolean') {
    return (
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">выберите…</option>
        <option value="true">Да</option>
        <option value="false">Нет</option>
      </select>
    );
  }

  const canSuggest = Boolean(suggest) && (kind === 'text' || kind === 'number');
  // Ответ принимаем только на последний вопрос, чтобы старый не перезаписал новый
  const ask = prefix => {
    if (!canSuggest) return;
    clearTimeout(timer.current);
    const token = ++asked.current;
    timer.current = setTimeout(() => {
      suggest(prefix).then(list => { if (token === asked.current) setOptions(list); });
    }, SUGGEST_DELAY_MS);
  };

  const type = kind === 'date' ? 'date' : kind === 'number' ? 'number' : 'text';
  return (
    <>
      <input
        type={type}
        step={kind === 'number' ? 'any' : undefined}
        value={value}
        placeholder={placeholder}
        list={canSuggest ? listId : undefined}
        onFocus={() => ask(value)}
        onChange={e => { onChange(e.target.value); ask(e.target.value); }}
      />
      {canSuggest && (
        <datalist id={listId}>
          {options.map(o => <option key={o} value={o} />)}
        </datalist>
      )}
    </>
  );
}

function ConditionView({ node, actions }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `node:${node.id}`,
    data: { type: 'node', nodeId: node.id },
  });
  const needsValue = !NULL_OPS.includes(node.operator);
  const empty = needsValue && (node.value === '' || (node.operator === 'BETWEEN' && node.value2 === ''));
  const cls = ['qc-condition', empty && 'is-empty', isDragging && 'is-dragging'].filter(Boolean).join(' ');

  return (
    <div ref={setNodeRef} className={cls}>
      <span className="qc-handle" title="Перетащить" {...listeners} {...attributes}>⋮⋮</span>
      <span className={`qc-kind is-${node.kind}`}>{KIND_LABELS[node.kind]}</span>
      <span className="qc-condition-field">{node.field}</span>
      <select title="Как сравнивать значение" value={node.operator} onChange={e => actions.update(node.id, { operator: e.target.value })}>
        {operatorsFor(node.kind).map(op => (
          <option key={op} value={op}>{OPERATOR_LABELS[op] ?? op}</option>
        ))}
      </select>
      {needsValue && (
        <ValueInput kind={node.kind} value={node.value} placeholder="значение"
          suggest={actions.suggest && (prefix => actions.suggest(node.field, prefix))} listId={`sg-${node.id}-a`}
          onChange={value => actions.update(node.id, { value })} />
      )}
      {node.operator === 'BETWEEN' && (
        <>
          <span className="qc-and">и</span>
          <ValueInput kind={node.kind} value={node.value2} placeholder="значение"
            suggest={actions.suggest && (prefix => actions.suggest(node.field, prefix))} listId={`sg-${node.id}-b`}
            onChange={value2 => actions.update(node.id, { value2 })} />
        </>
      )}
      <button className="qc-icon-btn is-danger" title="Удалить условие" aria-label="Удалить условие" onClick={() => actions.remove(node.id)}>×</button>
    </div>
  );
}

function GroupView({ node, actions, isRoot }) {
  const drop = useDroppable({ id: `group:${node.id}` });
  const drag = useDraggable({ id: `node:${node.id}`, data: { type: 'node', nodeId: node.id }, disabled: isRoot });
  const setRef = el => { drop.setNodeRef(el); drag.setNodeRef(el); };
  const isOr = node.op === 'OR';
  const cls = [
    'qc-group', isOr ? 'is-or' : 'is-and', node.not && 'is-not', isRoot && 'is-root',
    drop.isOver && 'is-over', drag.isDragging && 'is-dragging',
  ].filter(Boolean).join(' ');

  return (
    <div ref={setRef} className={cls}>
      <div className="qc-group-bar">
        {!isRoot && <span className="qc-handle" title="Перетащить группу" {...drag.listeners} {...drag.attributes}>⋮⋮</span>}
        <div className="qc-seg">
          <button title="И: должны выполняться все условия группы" className={!isOr ? 'is-on' : ''} onClick={() => actions.update(node.id, { op: 'AND' })}>И</button>
          <button title="ИЛИ: достаточно любого условия группы" className={isOr ? 'is-on' : ''} onClick={() => actions.update(node.id, { op: 'OR' })}>ИЛИ</button>
        </div>
        <button title="НЕ: перевернуть группу, найти строки, где условия не выполняются" aria-pressed={node.not} className={`qc-toggle${node.not ? ' is-on' : ''}`} onClick={() => actions.update(node.id, { not: !node.not })}>
          НЕ
        </button>
        <span className="qc-spacer" />
        <button className="qc-btn is-small" title="Добавить вложенную группу в скобках" onClick={() => actions.addGroup(node.id)}>+ Группа</button>
        {!isRoot && (
          <button className="qc-icon-btn is-danger" title="Удалить группу" aria-label="Удалить группу" onClick={() => actions.remove(node.id)}>×</button>
        )}
      </div>
      <div className="qc-children">
        {node.children.length === 0 && (
          <div className="qc-empty">Перетащите поле сюда, чтобы добавить условие</div>
        )}
        {node.children.map(child => (
          child.type === 'group'
            ? <GroupView key={child.id} node={child} actions={actions} isRoot={false} />
            : <ConditionView key={child.id} node={child} actions={actions} />
        ))}
      </div>
    </div>
  );
}

export default function ConditionTree({ tree, actions }) {
  return (
    <section className="qc-card qc-tree">
      <h2>Условия</h2>
      <GroupView node={tree} actions={actions} isRoot />
    </section>
  );
}
