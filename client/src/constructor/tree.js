import { operatorsFor } from './schema';

export function createGroup(op = 'AND') {
  return { id: crypto.randomUUID(), type: 'group', op, not: false, children: [] };
}

export function createCondition(field) {
  return {
    id: crypto.randomUUID(),
    type: 'condition',
    field: field.name,
    kind: field.kind,
    operator: operatorsFor(field.kind)[0],
    value: '',
    value2: '',
  };
}

export function findNode(tree, id) {
  if (tree.id === id) return tree;
  if (tree.type !== 'group') return null;
  for (const child of tree.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

// Применяет fn к узлу с данным id, копируя только узлы вдоль пути.
// Если узел не найден, возвращает исходный объект.
function mapNode(node, id, fn) {
  if (node.id === id) return fn(node);
  if (node.type !== 'group') return node;
  let changed = false;
  const children = node.children.map(child => {
    const next = mapNode(child, id, fn);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...node, children } : node;
}

export function addChild(tree, groupId, node) {
  return mapNode(tree, groupId, group =>
    group.type === 'group' ? { ...group, children: [...group.children, node] } : group
  );
}

export function removeNode(tree, nodeId) {
  if (tree.id === nodeId) return tree;
  let changed = false;
  const walk = group => {
    const children = [];
    for (const child of group.children) {
      if (child.id === nodeId) {
        changed = true;
        continue;
      }
      children.push(child.type === 'group' ? walk(child) : child);
    }
    return { ...group, children };
  };
  const next = walk(tree);
  return changed ? next : tree;
}

export function updateNode(tree, nodeId, patch) {
  return mapNode(tree, nodeId, node => ({ ...node, ...patch, id: node.id, type: node.type }));
}

export function moveNode(tree, nodeId, targetGroupId) {
  if (nodeId === targetGroupId || tree.id === nodeId) return tree;
  const node = findNode(tree, nodeId);
  const target = findNode(tree, targetGroupId);
  if (!node || !target || target.type !== 'group') return tree;
  // Цель внутри перемещаемого узла: перенос создал бы цикл
  if (findNode(node, targetGroupId)) return tree;
  return addChild(removeNode(tree, nodeId), targetGroupId, node);
}

export function maxDepth(tree) {
  if (tree.type !== 'group') return 0;
  return 1 + tree.children.reduce((max, child) => Math.max(max, maxDepth(child)), 0);
}
