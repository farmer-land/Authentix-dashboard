/**
 * AUTHENTIX FRONTEND API CLIENT
 *
 * Public surface for all API calls. Assembles domain modules into the `api` object.
 * All existing call sites (api.templates.list(), api.auth.login(), etc.) continue to work.
 *
 * Domain modules live in:
 *   src/lib/api/core.ts          — shared types, request primitives, utilities
 *   src/lib/api/auth.ts          — authentication
 *   src/lib/api/templates.ts     — template management
 *   src/lib/api/certificates.ts  — certificate management
 *   src/lib/api/imports.ts       — import job management
 *   src/lib/api/billing.ts       — billing & invoices
 *   src/lib/api/verification.ts  — public certificate verification
 *   src/lib/api/catalog.ts       — certificate category catalog
 *   src/lib/api/dashboard.ts     — dashboard stats & analytics
 *   src/lib/api/organizations.ts — organization profile & settings
 *   src/lib/api/delivery.ts      — email delivery integrations & templates
 *   src/lib/api/users.ts         — user profile management
 */

// ── Re-export shared types ────────────────────────────────────────────────────

export type { ApiErrorData, ApiResponse, PaginatedResponse } from "./core";
export { ApiError } from "./core";

export type { Organization, OrganizationLogoFields } from "@/lib/types/organization";

// ── Re-export domain types ────────────────────────────────────────────────────

export type { TemplateField, RecentGeneratedTemplate, InProgressTemplate } from "./templates";
export type { Certificate } from "./certificates";
export type { ImportJob } from "./imports";
export type { VerificationEvent } from "./verification";
export type {
  DeliveryIntegration,
  DeliveryProviderType,
  DeliveryTemplate,
  DeliveryMessage,
  CreateIntegrationDto,
  CreateDeliveryTemplateDto,
  SendEmailDto,
  TestSendDto,
  SendResult,
  PlatformDefaultSettings,
  UpdatePlatformDefaultSettingsDto,
  EmailContact,
  EmailSegment,
  EmailBroadcast,
  DeliveryEmailEvent,
  FilterRule,
  FilterOperator,
  SegmentFilters,
  CreateSegmentDto,
  CreateBroadcastDto,
  BroadcastStatus,
  EmailEventType,
} from "./delivery";

// ── Domain API modules ────────────────────────────────────────────────────────

import { authApi } from "./auth";
import { templatesApi } from "./templates";
import { certificatesApi } from "./certificates";
import { importsApi } from "./imports";
import { billingApi } from "./billing";
import { verificationApi } from "./verification";
import { catalogApi } from "./catalog";
import { dashboardApi } from "./dashboard";
import { organizationsApi } from "./organizations";
import { deliveryApi } from "./delivery";
import { usersApi } from "./users";

// ── Assembled API object ──────────────────────────────────────────────────────

/**
 * Main API client. All domains accessible as api.<domain>.<method>().
 *
 * @example
 *   import { api } from "@/lib/api/client";
 *   const templates = await api.templates.list();
 *   const cert = await api.certificates.get(id);
 */
export const api = {
  auth: authApi,
  templates: templatesApi,
  certificates: certificatesApi,
  imports: importsApi,
  billing: billingApi,
  verification: verificationApi,
  catalog: catalogApi,
  dashboard: dashboardApi,
  organizations: organizationsApi,
  delivery: deliveryApi,
  users: usersApi,
};
