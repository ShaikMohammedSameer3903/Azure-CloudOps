# Production Deployment Checklist

Before taking CloudOps Enterprise live to production, complete the following validation steps to ensure data integrity, security, and scalability.

## 1. Environment & Secrets Validation
- [ ] `NODE_ENV` is set to `production`.
- [ ] `APP_MODE` is set to `production` (disables all demo simulations).
- [ ] `JWT_SECRET` is rotated and securely injected (do not use default `.env` value).
- [ ] Cloud API Credentials (e.g., `AZURE_CLIENT_ID`, `AWS_ACCESS_KEY_ID`) are securely mapped from AWS Secrets Manager / Azure KeyVault instead of hardcoded environment files.

## 2. Database Migration (PostgreSQL)
- [ ] Ensure SQLite is discarded in multi-node production setups to prevent DB locks.
- [ ] Validate PostgreSQL 15+ connection pooling is configured (`pg-pool` or `pgBouncer`).
- [ ] Run `npm run db:migrate` to initialize tables.
- [ ] Seed initial Local Admin user using `npm run seed:admin`.

## 3. Network & Scaling Configuration
- [ ] **WebSockets**: Ensure Load Balancer (NGINX/ALB) supports HTTP/1.1 Upgrade headers for real-time SSE threat intelligence syncing.
- [ ] **Sticky Sessions**: Enabled if using multiple Node.js API instances to preserve SSE context.
- [ ] **Rate Limiting**: Configure upstream API Gateway (e.g., Cloudflare, WAF) rate limits to complement Express `express-rate-limit`.

## 4. Sub-Services Validation
- [ ] Redis Cache is reachable (required for session storage and discovery deduplication).
- [ ] Background `setInterval` workers in `discoveryEngine.js` are restricted to run on a dedicated Worker Node, NOT the API Web Nodes, to prevent race conditions.

## 5. Build Artifact Verification
- [ ] Frontend bundle cleanly built via `npm run build` with no development leakage.
- [ ] `VITE_API_URL` correctly points to the public TLS API domain, not `localhost:3001`.
