// ============================================================
// OpenTelemetry Configuration
// Implements tracing for Express, SQLite, HTTP, and metrics
// ============================================================

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { AzureMonitorTraceExporter } = require('@azure/monitor-opentelemetry-exporter');
const { metrics } = require('@opentelemetry/api');

// Expose Prometheus metrics, but prevent it from starting its own HTTP server
// Render strictly allows only one open port per Web Service
const metricReader = new PrometheusExporter({ preventServerStart: true });

const otlpExporter = new OTLPTraceExporter({
  url: process.env.OTLP_TRACE_URL || 'http://localhost:4318/v1/traces',
});

// Use Azure Monitor trace exporter if configured
const traceExporter = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING 
  ? new AzureMonitorTraceExporter({ connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING })
  : otlpExporter;

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
