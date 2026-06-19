// ============================================================
// OpenTelemetry Configuration
// Implements tracing for Express, SQLite, HTTP, and metrics
// ============================================================

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { AzureMonitorTraceExporter } = require('@azure/monitor-opentelemetry-exporter');
const { metrics, diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');

// Suppress OpenTelemetry 4318 connection errors and duplicate registration logs
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.NONE);
const originalError = console.error;
console.error = (...args) => {
  const errMsg = args[0] ? (typeof args[0] === 'string' ? args[0] : (args[0].message || args[0].toString() || '')) : '';
  if (errMsg.includes('ECONNREFUSED') && errMsg.includes('4318')) {
    return;
  }
  if (errMsg.includes('Attempted duplicate registration of API') || errMsg.includes('duplicate registration')) {
    return;
  }
  originalError.apply(console, args);
};

// Expose Prometheus metrics, but prevent it from starting its own HTTP server
// Render strictly allows only one open port per Web Service
const metricReader = new PrometheusExporter({ preventServerStart: true });

// Use Azure Monitor trace exporter if configured, or OTLP if configured, otherwise undefined (noop)
let traceExporter = undefined;
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  traceExporter = new AzureMonitorTraceExporter({ connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING });
} else if (process.env.OTLP_TRACE_URL) {
  traceExporter = new OTLPTraceExporter({ url: process.env.OTLP_TRACE_URL });
}

const sdk = new NodeSDK({
  traceExporter,
  metricReader,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable noisy instrumentations if needed
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
  serviceName: 'cloudops-backend',
});

sdk.start();

// Custom Metrics Setup
const meter = metrics.getMeter('cloudops-backend');

const apiLatencyHistogram = meter.createHistogram('api_latency', {
  description: 'Measures the latency of API requests',
  unit: 'ms',
});

const cloudApiLatencyHistogram = meter.createHistogram('cloud_api_latency', {
  description: 'Measures the latency of underlying Cloud Provider SDK requests',
  unit: 'ms',
});

const wsEventCounter = meter.createCounter('ws_events_total', {
  description: 'Counts the total number of WebSocket events emitted',
});

process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('[Telemetry] Tracing terminated'))
    .catch((error) => console.error('[Telemetry] Error terminating tracing', error))
    .finally(() => process.exit(0));
});

module.exports = { 
  sdk,
  apiLatencyHistogram,
  cloudApiLatencyHistogram,
  wsEventCounter
};
