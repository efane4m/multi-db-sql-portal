const MAX_PAST = 100;

export function createHistory(initial) {
  return { past: [], present: initial, future: [] };
}

export function push(h, value) {
  // Старые записи отбрасываем, чтобы история не росла бесконечно
  const past = [...h.past, h.present].slice(-MAX_PAST);
  return { past, present: value, future: [] };
}

export function undo(h) {
  if (h.past.length === 0) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
  };
}

export function redo(h) {
  if (h.future.length === 0) return h;
  return {
    past: [...h.past, h.present],
    present: h.future[0],
    future: h.future.slice(1),
  };
}

export function canUndo(h) {
  return h.past.length > 0;
}

export function canRedo(h) {
  return h.future.length > 0;
}
