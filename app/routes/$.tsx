import { json, type LoaderFunctionArgs } from '@remix-run/node';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  // Chrome DevTools / browser debuggers probe this well-known endpoint to
  // detect app-specific capabilities. Return a valid empty JSON body so the
  // router never throws "No route matches" and the console stays clean.
  if (url.pathname === '/.well-known/appspecific/com.chrome.devtools.json') {
    return json({}, { status: 200 });
  }

  return json({ error: 'Not found' }, { status: 404 });
}
