import { lazy, Suspense } from 'react';
import type { ExtensionUiDialogRequest } from '@/hooks/chat/omp';
import type { ExtensionDialogResponse } from '@/components/workspace/chat-timeline/tool-renderers/ask-dialog/index';

const AskDialogImpl = lazy(() =>
  import('@/components/workspace/chat-timeline/tool-renderers/ask-dialog/index').then((m) => ({
    default: m.AskDialog,
  }))
);

interface AskDialogProps {
  request: ExtensionUiDialogRequest;
  onRespond: (request: ExtensionUiDialogRequest, response: ExtensionDialogResponse) => void;
}

export function AskDialog(props: AskDialogProps) {
  return (
    <Suspense fallback={null}>
      <AskDialogImpl {...props} />
    </Suspense>
  );
}

export type { ExtensionDialogResponse } from '@/components/workspace/chat-timeline/tool-renderers/ask-dialog/index';
