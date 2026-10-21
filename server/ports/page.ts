/** Cursor pagination (SPEC: `?cursor=`). The cursor is an opaque string — only hand back exactly what the repository returned. */
export type PageRequest = { limit: number; cursor?: string | null };
/** `nextCursor = null` = last page. */
export type Page<T> = { items: T[]; nextCursor: string | null };
