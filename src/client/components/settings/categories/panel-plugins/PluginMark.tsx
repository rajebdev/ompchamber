/**
 * A plugin's mark.
 *
 * `icon` is OPTIONAL in the manifest, so a plugin may ship none — and a grid of
 * equally-sized cards makes an absent icon look like a broken one rather than a
 * choice. The fallback is therefore a real mark: the plugin's INITIALS, which
 * read as "this plugin has no icon" instead of "something failed to load".
 *
 * Every surface that draws a plugin — the activity bar, the navbar, the editor
 * tab, the store and installed cards — draws through this one component, so a
 * plugin cannot be a puzzle piece in one place and a letter in another. The
 * initials follow the same rule as the provider marks (`providerInitials`): one
 * per word, lowercased, closed with a dot, at most two — `Session Info` → `si.`.
 *
 * The image is drawn at a fixed box regardless of what the plugin shipped. An
 * SVG with its own `width`/`height` attributes would otherwise take that size
 * and break the layout, so the element is constrained rather than the file
 * trusted.
 */

import { providerInitials } from '@/shared/lib/models/provider/glyph';

interface PluginMarkProps {
  name: string;
  /** The registry's content-addressed icon URL, when the plugin declares one. */
  iconUrl?: string;
  size?: number;
  /** Filled background behind the fallback, for a card that wants a tile. */
  tile?: boolean;
}

export function PluginMark({ name, iconUrl, size = 16, tile = false }: PluginMarkProps) {
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt=""
        aria-hidden="true"
        style={{ width: size, height: size }}
        className="flex-shrink-0 object-contain"
      />
    );
  }

  // The badge is a PILL, not a square, for the same reason the provider marks
  // are: `si.` is far wider than it is tall, so a square column would force a
  // font size whose ink is half its neighbours'. `aria-hidden` because the
  // plugin's name is always rendered beside it.
  return (
    <span
      aria-hidden="true"
      className={`inline-flex flex-shrink-0 items-center justify-center font-semibold lowercase leading-none text-ink/45 ${
        tile ? 'rounded bg-ink/5' : ''
      }`}
      style={{
        height: size,
        minWidth: size,
        paddingInline: Math.max(1, Math.round(size * 0.12)),
        fontSize: Math.round(size * (tile ? 1.2 : 0.85)),
      }}
    >
      {providerInitials(name)}
    </span>
  );
}
