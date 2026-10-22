const keyFor = username => `qc_templates:${username}`;

function read(username, storage) {
  try {
    const parsed = JSON.parse(storage.getItem(keyFor(username)));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(username, list, storage) {
  // Ошибки setItem (квота, приватный режим) намеренно не перехватываются.
  storage.setItem(keyFor(username), JSON.stringify(list));
}

// Новые шаблоны добавляются в начало массива, поэтому порядок "новые первыми"
// не зависит от разрешения таймера в createdAt.
export function listTemplates(username, storage = globalThis.localStorage) {
  return read(username, storage);
}

export function saveTemplate(username, data, storage = globalThis.localStorage) {
  const list = read(username, storage);
  const index = data.id ? list.findIndex(t => t.id === data.id) : -1;
  const template = {
    ...data,
    id: index >= 0 ? data.id : data.id || crypto.randomUUID(),
    createdAt: index >= 0 ? list[index].createdAt : new Date().toISOString(),
  };
  if (index >= 0) list[index] = template;
  else list.unshift(template);
  write(username, list, storage);
  return template;
}

export function deleteTemplate(username, id, storage = globalThis.localStorage) {
  write(username, read(username, storage).filter(t => t.id !== id), storage);
}
