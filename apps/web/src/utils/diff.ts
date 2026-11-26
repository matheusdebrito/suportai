export interface DiffResult {
  removed: string;
  added: string;
  unchanged: boolean;
}

export function textDiff(before: string, after: string): DiffResult {
  const a = before.replace(/\r\n/g, '\n').split('\n');
  const b = after.replace(/\r\n/g, '\n').split('\n');
  let prefix = 0;

  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }

  const oldText = a.slice(prefix, a.length - suffix).join('\n');
  const newText = b.slice(prefix, b.length - suffix).join('\n');

  return {
    removed: oldText.slice(0, 4000),
    added: newText.slice(0, 4000),
    unchanged: oldText === newText,
  };
}