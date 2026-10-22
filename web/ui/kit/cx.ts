// Joins class names, leaving out the false ones: `cx('toast', isErr && 'is-err')`. The kit's own copy, so nothing of the
// new UI imports the classic web/ui/components.tsx.
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}
