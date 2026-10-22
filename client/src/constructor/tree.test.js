import { describe, it, expect } from 'vitest';
import {
  createGroup,
  createCondition,
  addChild,
  removeNode,
  updateNode,
  moveNode,
  maxDepth,
  findNode,
} from './tree';

const cond = (name = 'price', kind = 'number') => createCondition({ name, kind });

describe('createGroup / createCondition', () => {
  it('создаёт группу И по умолчанию', () => {
    const g = createGroup();
    expect(g).toMatchObject({ type: 'group', op: 'AND', not: false, children: [] });
    expect(typeof g.id).toBe('string');
  });

  it('создаёт группу ИЛИ', () => {
    expect(createGroup('OR').op).toBe('OR');
  });

  it('условие получает первый оператор для типа', () => {
    const c = cond('price', 'number');
    expect(c).toMatchObject({
      type: 'condition',
      field: 'price',
      kind: 'number',
      operator: '=',
      value: '',
      value2: '',
    });
    expect(cond('name', 'text').operator).toBe('LIKE');
  });

  it('id уникальны', () => {
    expect(createGroup().id).not.toBe(createGroup().id);
  });
});

describe('addChild', () => {
  it('кладёт узел в нужную вложенную группу и не мутирует исходное дерево', () => {
    const inner = createGroup('OR');
    const root = { ...createGroup(), children: [inner] };
    const before = JSON.stringify(root);
    const c = cond();
    const next = addChild(root, inner.id, c);
    expect(JSON.stringify(root)).toBe(before);
    expect(next).not.toBe(root);
    expect(findNode(next, inner.id).children).toEqual([c]);
    expect(root.children[0].children).toEqual([]);
  });

  it('добавляет в корень', () => {
    const root = createGroup();
    const c = cond();
    expect(addChild(root, root.id, c).children).toEqual([c]);
  });
});

describe('removeNode', () => {
  it('корень удалить нельзя', () => {
    const root = { ...createGroup(), children: [cond()] };
    expect(removeNode(root, root.id)).toBe(root);
  });

  it('удаляет вложенный узел без мутации', () => {
    const c = cond();
    const inner = { ...createGroup(), children: [c] };
    const root = { ...createGroup(), children: [inner] };
    const before = JSON.stringify(root);
    const next = removeNode(root, c.id);
    expect(JSON.stringify(root)).toBe(before);
    expect(findNode(next, c.id)).toBeNull();
    expect(findNode(next, inner.id)).not.toBeNull();
  });
});

describe('updateNode', () => {
  it('обновляет поля узла без мутации', () => {
    const c = cond();
    const root = { ...createGroup(), children: [c] };
    const before = JSON.stringify(root);
    const next = updateNode(root, c.id, { value: '5', operator: '>' });
    expect(JSON.stringify(root)).toBe(before);
    expect(findNode(next, c.id)).toMatchObject({ value: '5', operator: '>' });
  });

  it('обновляет группу', () => {
    const root = createGroup();
    expect(updateNode(root, root.id, { not: true }).not).toBe(true);
  });
});

describe('moveNode', () => {
  it('переносит условие между группами', () => {
    const c = cond();
    const a = { ...createGroup(), children: [c] };
    const b = createGroup('OR');
    const root = { ...createGroup(), children: [a, b] };
    const before = JSON.stringify(root);
    const next = moveNode(root, c.id, b.id);
    expect(JSON.stringify(root)).toBe(before);
    expect(findNode(next, a.id).children).toEqual([]);
    expect(findNode(next, b.id).children).toEqual([c]);
  });

  it('группа внутрь собственного потомка: без изменений', () => {
    const deep = createGroup();
    const outer = { ...createGroup(), children: [deep] };
    const root = { ...createGroup(), children: [outer] };
    expect(moveNode(root, outer.id, deep.id)).toBe(root);
  });

  it('группа в саму себя: без изменений', () => {
    const outer = createGroup();
    const root = { ...createGroup(), children: [outer] };
    expect(moveNode(root, outer.id, outer.id)).toBe(root);
  });

  it('корень переносить нельзя', () => {
    const g = createGroup();
    const root = { ...createGroup(), children: [g] };
    expect(moveNode(root, root.id, g.id)).toBe(root);
  });

  it('несуществующая цель: без изменений', () => {
    const c = cond();
    const root = { ...createGroup(), children: [c] };
    expect(moveNode(root, c.id, 'nope')).toBe(root);
  });
});

describe('maxDepth', () => {
  it('корень = 1, условия глубину не добавляют', () => {
    expect(maxDepth({ ...createGroup(), children: [cond()] })).toBe(1);
  });

  it('5 вложенных групп дают 5', () => {
    let tree = createGroup();
    let parentId = tree.id;
    for (let i = 0; i < 4; i += 1) {
      const g = createGroup();
      tree = addChild(tree, parentId, g);
      parentId = g.id;
    }
    tree = addChild(tree, parentId, cond());
    expect(maxDepth(tree)).toBe(5);
  });
});

describe('findNode', () => {
  it('находит узел и возвращает null для отсутствующего', () => {
    const c = cond();
    const root = { ...createGroup(), children: [c] };
    expect(findNode(root, c.id)).toBe(c);
    expect(findNode(root, root.id)).toBe(root);
    expect(findNode(root, 'nope')).toBeNull();
  });
});
