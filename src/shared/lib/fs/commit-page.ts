/**
 * How many commits one history / graph page carries.
 *
 * Shared so the client cannot drift from the page size the server serves. The
 * client's `hasMore` fallback fires only for a response that carries no
 * `hasMore` flag (a stub, or an older payload), and a fallback that disagrees
 * with the real page size ends infinite scroll after the first page — silently,
 * because a short page and a finished history look identical.
 */
export const COMMIT_PAGE_SIZE = 50;
