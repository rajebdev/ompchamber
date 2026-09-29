/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The login screen.
 *
 * Rendered by the app shell itself rather than served as a separate HTML page,
 * so it is drawn in the user's chosen theme, in the same bundle, with no second
 * artifact to keep in step with the palette catalog. The server hands an
 * unauthenticated visitor the shell with no `appSettings`, and `App` renders
 * this instead of the workspace.
 *
 * The form posts to `/api/auth/login` and reloads on success. Reloading rather
 * than flipping a flag is deliberate: the settings the shell injects are decided
 * server-side, so only a fresh document can bring the app up with the data a
 * session entitles it to.
 */

import { useState } from 'preact/hooks';
import type { FunctionComponent } from 'preact/compat';
import { KeyRound, Loader2 } from 'lucide-preact';
import { login } from '@/client/hooks/ui/auth';

export const LoginScreen: FunctionComponent = () => {
  const [password, setPassword] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: Event) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    const result = await login(password, trustDevice);
    // A success reloads the page, so reaching here means it failed.
    setBusy(false);
    if (!result.ok) {
      setPassword('');
      setError(
        result.retryAfterSec
          ? `Too many attempts. Try again in ${Math.ceil(result.retryAfterSec / 60)} minute(s).`
          : result.error ?? 'Incorrect password',
      );
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-canvas text-ink px-4">
      <form onSubmit={submit} className="w-full max-w-xs space-y-4">
        <div className="space-y-1 text-center">
          <KeyRound size={28} className="mx-auto text-ink/60" />
          {/* The sidebar header's brand, class for class: `OMP` in the
              orange→amber gradient at `text-[15px]`, `Chamber` inheriting the
              container's `text-sm` and offset by 1px. Copied verbatim rather
              than scaled — the five other instances (top navbar, both mobile
              headers, the about modal) differ in size, and "the same as the
              sidebar" means the same, including `OMP` sitting one step larger
              than `Chamber`. */}
          <h1 className="font-bold text-sm tracking-tight flex items-center justify-center">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-amber-500 font-extrabold text-[15px] tracking-tighter">OMP</span>
            <span className="ml-[1px]">Chamber</span>
          </h1>
          <p className="text-xs text-ink/60">This instance is password protected.</p>
        </div>

        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onInput={(event) => {
            setPassword(event.currentTarget.value);
            if (error) setError('');
          }}
          placeholder="Password"
          aria-label="Password"
          aria-invalid={error ? true : undefined}
          disabled={busy}
          className="w-full bg-paper border border-ink/20 rounded-lg px-3 py-2 text-sm text-ink placeholder-ink/40 focus:outline-none focus:border-ink/50 transition-colors"
        />

        <label className="flex items-center gap-2 text-xs text-ink/70">
          <input
            type="checkbox"
            checked={trustDevice}
            onChange={(event) => setTrustDevice(event.currentTarget.checked)}
            disabled={busy}
            className="size-3.5 accent-ink"
          />
          <span>Remember this device for 7 days</span>
        </label>

        <button
          type="submit"
          disabled={!password || busy}
          className="w-full flex items-center justify-center gap-2 bg-ink text-paper rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-40 transition-opacity cursor-pointer disabled:cursor-default"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          <span>{busy ? 'Signing in…' : 'Sign in'}</span>
        </button>

        {error && (
          <p role="alert" className="text-xs text-error text-center">
            {error}
          </p>
        )}
      </form>
    </div>
  );
};
