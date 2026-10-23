// Joins class names, leaving out the false ones: `cx('toast', isErr && 'is-err')`.
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}
