import { useDraggable } from '@dnd-kit/core';
import { KIND_LABELS } from './kinds';

function FieldCard({ field, onAdd }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `field:${field.name}`,
    data: { type: 'field', field },
  });
  return (
    <div ref={setNodeRef} className={`qc-field${isDragging ? ' is-dragging' : ''}`}>
      <span className="qc-handle" title="Перетащить" {...listeners} {...attributes}>⋮⋮</span>
      <span className={`qc-kind is-${field.kind}`}>{KIND_LABELS[field.kind]}</span>
      <span className="qc-field-name">{field.name}</span>
      <button className="qc-icon-btn" title="Добавить условие в корень дерева" aria-label="Добавить условие" onClick={() => onAdd(field)}>+</button>
    </div>
  );
}

export default function FieldPanel({ fields, onAdd }) {
  return (
    <aside className="qc-card qc-fields">
      <h2>Поля</h2>
      <p className="qc-hint">Перетащите поле в дерево справа или нажмите «+».</p>
      {fields.map(f => <FieldCard key={f.name} field={f} onAdd={onAdd} />)}
    </aside>
  );
}
