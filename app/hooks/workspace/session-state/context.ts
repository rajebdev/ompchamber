import { createContext, useContext } from 'react';

export interface SessionStateContextValue {
  sessionId: string;
  ready: boolean;
}

export const SessionStateContext = createContext<SessionStateContextValue | null>(null);

export function useSessionStateContext(): SessionStateContextValue {
  const ctx = useContext(SessionStateContext);
  if (!ctx) throw new Error('useSessionState used outside SessionStateProvider');
  return ctx;
}
