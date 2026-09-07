export const XTERM_THEME = {
  background: '#141310',
  foreground: '#f4f1ea',
  cursor: '#f4f1ea',
  cursorAccent: '#141310',
  selectionBackground: '#3a3832',
  black: '#141310',
  red: '#c8321e',
  green: '#10b981',
  yellow: '#f59e0b',
  blue: '#3b82f6',
  magenta: '#ec4899',
  cyan: '#06b6d4',
  white: '#f4f1ea',
  brightBlack: '#48453d',
  brightRed: '#ef4444',
  brightGreen: '#34d399',
  brightYellow: '#fbbf24',
  brightBlue: '#60a5fa',
  brightMagenta: '#f472b6',
  brightCyan: '#38bdf8',
  brightWhite: '#ffffff',
};

export const XTERM_FONT_FAMILY = "'IBM Plex Mono', Menlo, Monaco, 'Courier New', monospace";

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
