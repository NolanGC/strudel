import * as WebSdk from '@effect/opentelemetry/WebSdk'
import {
  ConsoleLogRecordExporter,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs'
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base'
import { Effect, Layer } from 'effect'

const consoleTelemetryEnabled = (): boolean =>
  import.meta.env.VITE_OTEL_CONSOLE === 'true' ||
  (import.meta.env.DEV && import.meta.env.VITE_OTEL_CONSOLE !== 'false')

const serviceVersion = import.meta.env.VITE_APP_VERSION

export const TelemetryLive = WebSdk.layer(() => ({
  resource: {
    serviceName: 'strudel',
    ...(serviceVersion === undefined ? {} : { serviceVersion }),
    attributes: {
      'deployment.environment': import.meta.env.MODE,
      'app.runtime': 'browser',
    },
  },
  ...(consoleTelemetryEnabled()
    ? {
        spanProcessor: new SimpleSpanProcessor(new ConsoleSpanExporter()),
        logRecordProcessor: new SimpleLogRecordProcessor(
          new ConsoleLogRecordExporter(),
        ),
      }
    : {}),
}))

export const TelemetryStartupLive = Layer.effectDiscard(
  Effect.logInfo('Strudel telemetry initialized').pipe(
    Effect.withSpan('app.telemetry.startup'),
  ),
)
