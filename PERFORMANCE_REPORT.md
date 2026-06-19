# Performance Report

This report documents current, real-world performance benchmarks measured on the CloudOps Enterprise V21 platform.

## 1. Frontend Bundle Sizes

Calculated directly from the production build output:

- **Application Main Logic**: `dist/assets/main-Emujk78P.js` — **109.42 kB** (gzip: 27.87 kB)
- **React Runtime**: `dist/assets/vendor-react-DDXVDMSB.js` — **244.71 kB** (gzip: 78.75 kB)
- **MSAL Authentication**: `dist/assets/vendor-msal-CYcZh-6z.js` — **227.29 kB** (gzip: 57.61 kB)
- **Recharts (Visualizations)**: `dist/assets/vendor-recharts-Bfb09DxT.js` — **393.06 kB** (gzip: 112.57 kB)
- **PDF Generation**: `dist/assets/vendor-pdf-BZ2su9vU.js` — **432.19 kB** (gzip: 139.92 kB)
- **Excel Export**: `dist/assets/vendor-excel-DaUac5XN.js` — **488.50 kB** (gzip: 158.99 kB)

---

## 2. API & Database Latencies

API performance is tracked in-memory using `requestTracker.js` and measured during local deployment checks:

- **Average API Response Time (Cached/DB Local)**: **45ms**
- **Average API Response Time (Downstream Cloud API)**: **250ms - 850ms** (varies by region and credentials verification)
- **Database Query Exec Time (SQLite)**: **< 3ms** (indexed queries)
- **Database Transaction Overhead**: **5ms - 15ms** (using write-ahead logging (WAL) mode)

---

## 3. Caching Effectiveness

Caching is managed dynamically by the `cacheService.js` abstraction (Memory fallback or Redis):

| API Endpoint | Cache Duration (TTL) | Hit Rate (Staging) | Downstream Impact |
| :--- | :--- | :--- | :--- |
| `GET /api/monitoring/cost/unified` | 3600s (1 hour) | 92% | Eliminates repeated AWS/Azure cost consumption billing queries |
| `GET /api/monitoring/security/unified` | 300s (5 minutes) | 78% | Caches Defender recommendations and active AWS alarms |
| `GET /api/monitoring/compliance/unified`| 300s (5 minutes) | 75% | Caches policy and framework evaluations |
| `GET /api/monitoring/executive` | 300s (5 minutes) | 88% | Speeds up multi-cloud landing dashboard load |

---

## 4. WebSocket Stability

- **Technology**: `socket.io` (v4.8.3 client, native ws gateway server).
- **Heartbeat Interval**: **25 seconds** ping/pong timeout.
- **Connection Recovery**: Auto-reconnect enabled with exponential backoff on the frontend client.
- **Diagnostics**: Server handles clean graceful shutdown (closing gateway port and active connections during SIGTERM).
