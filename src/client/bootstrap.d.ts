export interface OmpChamberBootstrap {
  initialIsMobile: boolean;
  appSettings: Record<string, unknown>;
  /**
   * Whether this request carried a valid session. `false` means the shell was
   * served to an unauthenticated visitor: `appSettings` is empty and the client
   * renders the login screen instead of the app.
   */
  authenticated?: boolean;
}

declare global {
  interface Window {
    __OMP_BOOTSTRAP__?: OmpChamberBootstrap;
  }
}

export {};
