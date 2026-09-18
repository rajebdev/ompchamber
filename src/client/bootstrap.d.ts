export interface OmpChamberBootstrap {
  initialIsMobile: boolean;
  appSettings: Record<string, unknown>;
}

declare global {
  interface Window {
    __OMP_BOOTSTRAP__?: OmpChamberBootstrap;
  }
}

export {};
