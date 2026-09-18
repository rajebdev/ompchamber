import { json } from '@/server/lib/remix-compat';

/**
 * Chrome DevTools / browser debuggers probe this well-known endpoint to detect
 * app-specific capabilities. A valid empty JSON body keeps the console clean.
 */
export async function loader() {
  return json({});
}
