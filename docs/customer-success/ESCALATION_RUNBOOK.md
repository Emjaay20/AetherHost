# 🛠️ AetherHost Tier-3 Technical Escalation Runbook

**Audience:** Senior Customer Success Managers, Solutions Engineers, and Technical Account Managers  
**Scope:** Debugging frontend embed scripts (Chili Piper), CRM synchronization (Salesforce), Edge routing (Traefik/DNS), and Container runtime failures.

---

## ⚡ 1. Chili Piper Embed & Concierge Troubleshooting

When a customer reports: *"The booking modal does not appear after submitting our form."*

### Diagnostic Workflow
1. **Check Script Load & Network Tab:**
   - Verify `https://js.chilipiper.com/marketing/dist/modern/chilipiper.js` is returning HTTP `200`.
   - If HTTP `blocked:csp` appears, inspect the customer's **Content Security Policy (CSP)** header.
   - **Resolution:** Advise customer DevOps to update their `Content-Security-Policy`:
     ```http
     script-src 'self' https://js.chilipiper.com;
     connect-src 'self' https://*.chilipiper.com;
     frame-src https://*.chilipiper.com;
     ```
2. **Inspect DOM Form Event Interception:**
   - Check if another script called `event.stopImmediatePropagation()` before Chili Piper received the submit event.
   - Test directly in browser dev tools console:
     ```javascript
     ChiliPiper.submit("aetherhost", "inbound-emea-router", {
       lead: { Email: "test@company.com" }
     });
     ```
3. **Verify Z-Index & Modal Stacking Context:**
   - If the modal DOM node exists but is invisible, inspect `z-index`. Certain CSS frameworks (e.g. Tailwind `z-50` or Bootstrap modals) may overlay Chili Piper.
   - **Resolution:** Add custom CSS rule: `#chilipiper-wrapper { z-index: 999999 !important; }`.

---

## ☁️ 2. Traefik Edge & Custom Domain TLS Handshake Failures

When a customer reports: *"Our custom domain `app.customer.eu` is showing `SSL_ERROR_NO_CYPHER_OVERLAP` or 404."*

### Diagnostic Workflow
1. **Verify DNS CNAME Propagation:**
   ```bash
   dig +short CNAME app.customer.eu
   # Expected output: edge.aetherhost.io.
   ```
   If it points elsewhere or resolves to an outdated A record, DNS propagation is incomplete.
2. **Inspect Traefik ACME HTTP-01 Validation Logs:**
   ```bash
   docker logs aether-traefik | grep "acme: error"
   ```
   - Common error: `CAA record does not allow LetsEncrypt`.
   - **Resolution:** Have customer update DNS CAA record to include `issue "letsencrypt.org"`.

---

## 🔄 3. Salesforce REST API & Telemetry Sync Errors

When the CSM Command Center flags: `sfdcSyncStatus: ERROR` or `401 Unauthorized`.

### Diagnostic Workflow
1. **OAuth2 Bearer Token Expiration:**
   - Check API server logs: `apps/api/api-requests.log`.
   - If `invalid_grant` or `Session expired`, verify `SALESFORCE_CLIENT_ID` and `SALESFORCE_CLIENT_SECRET` in `.env`.
2. **Custom Field Mapping Validation:**
   - Verify that custom object `Aether_Tenant__c` and all custom fields (`Customer_Health_Score__c`, `Time_To_Value_Minutes__c`) are deployed and active in the customer's Salesforce sandbox / production org.
   - Test manual sync endpoint:
     ```bash
     curl -X POST https://api.aetherhost.io/v1/customer-success/accounts/tenant_uk/sync-sfdc \
       -H "Authorization: Bearer $ADMIN_TOKEN"
     ```

---

## 🐳 4. Container Health & Readiness Probe Timeouts

When a customer deployment hangs in `PENDING` or rolls back:

1. **Verify Health Endpoint:**
   - Ensure the container listens on port `$PORT` (default: `8080` or `3000`).
   - Ensure `GET /health` or `GET /` returns HTTP `200` within 10 seconds.
2. **Memory Limit (OOMKilled):**
   - Check if exit code is `137` (SIGKILL by Linux kernel OOM).
   - If memory limit is saturated, bump container memory allocation in workspace settings from 512MB to 1024MB.
