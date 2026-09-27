# Bundled font: Symbols Nerd Font Mono

`symbols-nerd-font-mono.woff2` is a subset of **SymbolsNerdFontMono-Regular.ttf**
from [Nerd Fonts](https://github.com/ryanoasis/nerd-fonts) **v3.5.1**, built by
`scripts/nerd-symbols-font.mjs`. It is the fallback face for the terminal's
private-use glyphs (powerline separators, devicons, Font Awesome, Material
Design icons); see `nerd-symbols.css` for why it is needed and how it is scoped.

Subset coverage — the private-use areas plus the handful of Nerd-specific
codepoints outside them:

    U+E000-F8FF      BMP private use
    U+F0000-FFFFD    Supplementary private use area-A (Material Design Icons)
    U+23FB-23FE, U+2630, U+2665, U+26A1, U+276C-2771, U+2B58

## Licences

The font is a patched build combining several upstream icon sets. Each is
redistributed here under its own licence, unchanged in substance (the subset
keeps the glyph outlines verbatim; only `layout-features` and hinting are
dropped, which are not licence terms).

| Icon set                 | Upstream                                              | Licence     |
|--------------------------|-------------------------------------------------------|-------------|
| Codicons                 | https://github.com/microsoft/vscode-codicons          | CC BY 4.0   |
| Devicons                 | https://github.com/devicons/devicon                   | MIT         |
| extraglyphs              | https://github.com/source-foundry/Hack                | MIT         |
| Font Awesome             | https://github.com/FortAwesome/Font-Awesome           | CC BY 4.0   |
| Font Awesome Extension   | https://github.com/AndreLZGava/font-awesome-extension | MIT         |
| Font Logos               | https://github.com/lukas-w/font-logos                 | unlicensed  |
| Material Design Icons    | https://github.com/Templarian/MaterialDesign-Font     | Apache 2.0  |
| Octicons                 | https://github.com/primer/octicons                    | MIT         |
| Seti and original        | https://github.com/jesseweed/seti-ui                  | MIT         |
| Pomicons                 | https://github.com/gabrielelana/pomicons              | OFL 1.1 RFN |
| Powerline Extra Symbols  | https://github.com/ryanoasis/powerline-extra-symbols  | MIT         |
| Powerline Symbols        | https://github.com/powerline/powerline                | MIT         |

The Nerd Fonts project itself (the patching, the font metadata and the
non-icon glyphs) is MIT, Copyright (c) 2014 Ryan L McIntyre. Its licence text
accompanies the upstream release at
https://github.com/ryanoasis/nerd-fonts/blob/master/LICENSE.

"Font Logos" is marked unlicensed upstream; it ships inside the Nerd Fonts
release that this subset is taken from, and is redistributed on that basis.
