# API Audit Report

This report documents the authentication, authorization, rate limiting, and error handling policies implemented across all REST API endpoints.

## 1. Authentication & Session Persistence

All protected endpoints require a valid JSON Web Token (JWT) in the `Authorization: Bearer <JWT>` header.
- **Middleware**: `validateJwt` (`server/middleware/validateJwt.js`) decodes the token and attaches user details (OID, email, roles, tenantId, sessionId) to the request object (`req.userId`, `req.userEmail`, `req.userRole`, `req.tenantId`).
- **Session verification**: Active sessions are validated against the `sessions` table (`revoked = 0`). Revoked sessions immediately reject requests with a `403 Forbidden` error.

---

## 2. Authorization & RBAC

Endpoints are protected by role-based access control middleware:
- **`adminOnly` Middleware**: Restricts access to routes such as user approval, role updates, and reporting to users with roles `Admin` or `SuperAdmin`.
- **`validateSubscriptionAccess` Middleware**: Verifies that the tenant has permission to query specific cloud resource subscriptions before routing.

---

## 3. Rate Limiting Policies

To protect against denial of service and brute-force attacks, two levels of rate limiting are active:
1. **Global API Limiter**: Enforced via `express-rate-limit` on all `/api/` endpoints (excluding health checks and streaming paths) with a high threshold (max 50,000 requests/minute) suitable for enterprise-scale dashboard consumption.
2. **Auth Endpoint Limiter**: A custom `authRateLimiter` is applied to `/api/auth/login`, `/api/auth/entra-login`, and `/api/auth/google-login` restricting attempts to 10 logins per 15-minute window per IP. Exceeding this returns an HTTP 429 `Too many authentication attempts` error.

---

## 4. Error Handling & HTTP Status Codes

Errors are classified using `errorClassifier` middleware. This detects whether an error originates from a cloud provider SDK (e.g., Azure or AWS) and maps it to appropriate client status codes:
- `400 Bad Request`: Validation failures or missing payload parameters.
- `401 Unauthorized`: Invalid credentials, expired token, or token verification failure.
- `403 Forbidden`: Role-based restriction, revoked session, or unauthorized tenant cross-access.
- `404 Not Found`: Entity not found, or route not registered.
- `429 Too Many Requests`: Rate limit exceeded.
- `502 Bad Gateway`: Transitory downstream cloud SDK failures.
- `500 Internal Server Error`: Generic database or internal execution failures.

---

## 5. Documented API Routes Inventory

All routes registered in the system are listed below. No undocumented or test endpoints exist:

| Route Path | Method | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `POST /api/auth/login` | POST | No | Local administrator authentication |
| `POST /api/auth/entra-login` | POST | No | Microsoft Entra ID OAuth assertion |
| `POST /api/auth/google-login` | POST | No | Google OAuth token verification |
| `POST /api/auth/refresh` | POST | No | Token rotation |
| `GET /api/auth/status` | GET | Yes | Retrieve session profile |
| `GET /api/auth/users` | GET | Yes (Admin) | List tenant users |
| `POST /api/auth/users/add` | POST | Yes (Admin) | Provision new user |
| `POST /api/auth/users/approve` | POST | Yes (Admin) | Approve user registration |
| `POST /api/auth/users/deactivate` | POST | Yes (Admin) | Deactivate account |
| `GET /api/resources` | GET | Yes | List tenant resources |
| `POST /api/resources/create` | POST | Yes | Deploy resource |
| `POST /api/resources/delete` | POST | Yes | Destroy resource |
| `GET /api/cloud-accounts` | GET | Yes | List registered cloud connections |
| `POST /api/cloud-accounts` | POST | Yes | Register cloud subscription |
| `GET /api/monitoring/cost/unified` | GET | Yes | Unified cost spend telemetry |
| `GET /api/monitoring/security/unified` | GET | Yes | Defender/Security unified metrics |
| `GET /api/monitoring/compliance/unified` | GET | Yes | Unified compliance framework score |
| `GET /api/monitoring/backup/unified` | GET | Yes | Backup status and recovery metrics |
| `GET /api/status` | GET | Yes | Deployment diagnostics status |
| `GET /health` | GET | No | Basic load balancer health probe |
