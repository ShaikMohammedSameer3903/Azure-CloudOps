import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

export function initTelemetry() {
  // Exporter disabled locally to prevent ERR_CONNECTION_REFUSED
  // const exporter = new OTLPTraceExporter({
  //   url: 'http://127.0.0.1:4318/v1/traces', // Requires a local OTEL collector to receive web traces
  // });

  const provider = new WebTracerProvider({
    // spanProcessors: [new BatchSpanProcessor(exporter)]
  });

  provider.register({
    contextManager: new ZoneContextManager(),
  });

  registerInstrumentations({
    instrumentations: [
      getWebAutoInstrumentations({
        // Prevent tracing every single React render to reduce noise
        '@opentelemetry/instrumentation-document-load': {},
        '@opentelemetry/instrumentation-user-interaction': {
          enabled: false,
        },
        '@opentelemetry/instrumentation-fetch': {
          clearTimingResources: true,
        },
        '@opentelemetry/instrumentation-xml-http-request': {
          clearTimingResources: true,
        },
      }),
    ],
  });

  console.log('[Telemetry] Frontend OpenTelemetry initialized.');
}
