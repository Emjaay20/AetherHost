CREATE OR REPLACE VIEW analytics_mrr AS
SELECT
  date_trunc('month', "createdAt") as month,
  SUM("amountCent") as total_mrr_cent
FROM "Invoice"
WHERE status = 'paid'
GROUP BY 1
ORDER BY 1 DESC;

CREATE OR REPLACE VIEW analytics_tenant_cohorts AS
SELECT
  date_trunc('month', "createdAt") as cohort_month,
  COUNT(*) as new_tenants
FROM "Tenant"
GROUP BY 1
ORDER BY 1 DESC;

CREATE OR REPLACE VIEW analytics_ai_usage_trends AS
SELECT
  "tenantId",
  SUM("usageAiRequests") as total_requests,
  SUM("totalAiTokens") as total_tokens
FROM "TenantEntitlement"
GROUP BY 1
ORDER BY 2 DESC;
