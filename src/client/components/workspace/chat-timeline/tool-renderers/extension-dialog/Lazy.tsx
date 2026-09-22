import { Suspense, lazy } from 'preact/compat';
import type { ExtensionUiDialogRequest } from '@/client/hooks/chat/omp';
import type { ExtensionDialogResponse } from '@/client/components/workspace/chat-timeline/tool-renderers/extension-dialog/index';

const ExtensionDialogImpl = lazy(() =>
  import('@/client/components/workspace/chat-timeline/tool-renderers/extension-dialog/index').then((m) => ({
    default: m.ExtensionDialog,
  }))
);

interface ExtensionDialogProps {
  request: ExtensionUiDialogRequest;
  onRespond: (request: ExtensionUiDialogRequest, response: ExtensionDialogResponse) => void;
}

export function ExtensionDialog(props: ExtensionDialogProps) {
  return (
    <Suspense fallback={null}>
      <ExtensionDialogImpl {...props} />
    </Suspense>
  );
}

export type { ExtensionDialogResponse } from '@/client/components/workspace/chat-timeline/tool-renderers/extension-dialog/index';
