import { Suspense, lazy } from 'preact/compat';
import type { ExtensionUiDialogRequest } from '@/client/hooks/chat/omp';
import type { ExtensionDialogResponse } from '@/client/components/workspace/chat-timeline/tool-renderers/ask-dialog/index';

const AskDialogImpl = lazy(() =>
  import('@/client/components/workspace/chat-timeline/tool-renderers/ask-dialog/index').then((m) => ({
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

export type { ExtensionDialogResponse } from '@/client/components/workspace/chat-timeline/tool-renderers/ask-dialog/index';
