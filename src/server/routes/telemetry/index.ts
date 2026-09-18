import { bindingsFor, type HandlerBinding } from '@/server/lib/route-adapter';
import * as telemetryContext from '@/server/routes/telemetry/context';
import * as telemetryTokens from '@/server/routes/telemetry/tokens';
import * as telemetryRawMessages from '@/server/routes/telemetry/raw-messages';

export const telemetryBindings: HandlerBinding[] = [
  ...bindingsFor(telemetryContext, '/api/telemetry/context'),
  ...bindingsFor(telemetryTokens, '/api/telemetry/tokens'),
  ...bindingsFor(telemetryRawMessages, '/api/telemetry/raw-messages'),
];
