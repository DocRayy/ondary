export function normalizeApiId(value: unknown): number | null {
  if (typeof value === 'string' && !value.trim()) {
    return null;
  }

  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function createInvalidApiIdError(label = 'id'): Error {
  return new Error(`Invalid ${label}.`);
}
