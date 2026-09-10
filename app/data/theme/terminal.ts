export const XTERM_LIGHT_THEME = {
  background: '#f4f1ea',
  foreground: '#141310',
  cursor: '#141310',
  cursorAccent: '#f4f1ea',
  selectionBackground: '#ded8ce',
  selectionForeground: '#141310',
  black: '#141310',
  red: '#c8321e',
  green: '#047857',
  yellow: '#b45309',
  blue: '#1d4ed8',
  magenta: '#9333ea',
  cyan: '#0284c7',
  white: '#faf8f3',
  brightBlack: '#78716c',
  brightRed: '#dc2626',
  brightGreen: '#059669',
  brightYellow: '#d97706',
  brightBlue: '#2563eb',
  brightMagenta: '#a855f7',
  brightCyan: '#0ea5e9',
  brightWhite: '#292524',
};

export const XTERM_DARK_THEME = {
  background: '#21252b',
  foreground: '#abb2bf',
  cursor: '#528bff',
  cursorAccent: '#21252b',
  selectionBackground: '#3e4451',
  selectionForeground: '#abb2bf',
  black: '#282c34',
  red: '#e06c75',
  green: '#98c379',
  yellow: '#e5c07b',
  blue: '#61afef',
  magenta: '#c678dd',
  cyan: '#56b6c2',
  white: '#abb2bf',
  brightBlack: '#5c6370',
  brightRed: '#e06c75',
  brightGreen: '#98c379',
  brightYellow: '#e5c07b',
  brightBlue: '#61afef',
  brightMagenta: '#c678dd',
  brightCyan: '#56b6c2',
  brightWhite: '#ffffff',
};

export function getXtermTheme(isDark: boolean) {
  return isDark ? XTERM_DARK_THEME : XTERM_LIGHT_THEME;
}

export const XTERM_THEME = XTERM_DARK_THEME;

export const XTERM_FONT_FAMILY = "'Fira Code', Menlo, Monaco, 'Courier New', monospace";

export function safePatchFitAddon(FitAddonClass: any) {
  try {
    const fitProto = FitAddonClass?.prototype;
    if (fitProto && !fitProto.__safePatched) {
      fitProto.__safePatched = true;
      const origPropose = fitProto.proposeDimensions;
      fitProto.proposeDimensions = function () {
        try {
          const core = this._terminal?._core;
          if (!core?._renderService) return undefined;
          const dims = core._renderService.dimensions;
          if (!dims?.css?.cell?.width || !dims?.css?.cell?.height) return undefined;
          return origPropose?.call(this);
        } catch {
          return undefined;
        }
      };
    }
  } catch {}
}

const DEFAULT_DIMENSIONS = {
  device: { char: { width: 9, height: 17, left: 0, top: 0 }, cell: { width: 9, height: 17 }, canvas: { width: 0, height: 0 } },
  css: { canvas: { width: 0, height: 0 }, cell: { width: 9, height: 17 } }
};

export function safePatchRenderService(term: any) {
  try {
    const core = term?._core;
    if (core?._renderService) {
      const proto = Object.getPrototypeOf(core._renderService);
      const desc = Object.getOwnPropertyDescriptor(proto, 'dimensions');
      if (desc?.get && !proto.__safePatched) {
        proto.__safePatched = true;
        const origGet = desc.get;
        Object.defineProperty(proto, 'dimensions', {
          get() {
            try {
              if (!this._renderer?.value) return DEFAULT_DIMENSIONS;
              return origGet.call(this);
            } catch {
              return DEFAULT_DIMENSIONS;
            }
          },
          configurable: true,
          enumerable: true
        });
      }
    }
  } catch {}
}

let terminalSessionOutput = '';

export function getTerminalSessionOutput(): string {
  return terminalSessionOutput;
}

export function appendTerminalSessionOutput(chunk: string): void {
  terminalSessionOutput += chunk;
  if (terminalSessionOutput.length > 250000) {
    terminalSessionOutput = terminalSessionOutput.slice(-200000);
  }
}

export function clearTerminalSessionOutput(): void {
  terminalSessionOutput = '';
}

const TERMINAL_OUTPUT_SNAPSHOT_LIMIT = 8000;

export function getTerminalOutputSnapshot(): string {
  if (terminalSessionOutput.length <= TERMINAL_OUTPUT_SNAPSHOT_LIMIT) return terminalSessionOutput;
  return terminalSessionOutput.slice(-TERMINAL_OUTPUT_SNAPSHOT_LIMIT);
}

export function setTerminalOutputSnapshot(value: string): void {
  terminalSessionOutput = value;
}
