/**
 * DELIVERY DOMAIN API
 *
 * Email delivery integrations, templates, sending, and message history.
 */

import { apiRequest, API_BASE_URL, extractApiError, ApiError, type ApiResponse } from "./core";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A DNS record Resend requires for a sending domain (SPF / DKIM / DMARC / MX). */
export interface ResendDomainRecord {
  record?: string;        // e.g. "SPF", "DKIM", "DMARC"
  name?: string;          // DNS host/name
  type?: string;          // "TXT" | "MX" | "CNAME"
  value?: string;         // DNS value
  ttl?: string | number;
  priority?: number;
  status?: string;        // "verified" | "pending" | "not_started" | "failed"
}

export interface ResendDomain {
  id: string;
  name: string;
  status?: string;        // "not_started" | "pending" | "verified" | "failed" | "temporary_failure"
  region?: string;
  created_at?: string;
  records?: ResendDomainRecord[];
}

export interface DeliveryIntegration {
  id: string;
  organization_id: string;
  channel: "email" | "whatsapp";
  provider: string;
  display_name: string;
  is_default: boolean;
  is_active: boolean;
  from_email: string | null;
  from_name: string | null;
  reply_to: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DeliveryTemplate {
  id: string;
  organization_id: string;
  channel: "email" | "whatsapp";
  name: string;
  is_default: boolean;
  is_active: boolean;
  email_subject: string | null;
  body: string;
  variables: string[];
  created_at: string;
  updated_at: string;
}

export interface DeliveryMessage {
  id: string;
  organization_id: string;
  generation_job_id: string | null;
  recipient_id: string | null;
  channel: string;
  to_email: string | null;
  provider: string;
  status: "queued" | "sent" | "delivered" | "read" | "failed";
  provider_message_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
}

export type DeliveryProviderType =
  | "ses"               // Authentix platform SES (legacy / no config needed)
  | "aws_ses"           // Customer-provided AWS SES credentials
  | "resend"            // Resend API key
  | "smtp"              // Custom SMTP
  | "google_workspace"  // Google Workspace App Password (smtp.gmail.com)
  | "microsoft_365";    // Microsoft 365 App Password (smtp.office365.com)

export interface CreateIntegrationDto {
  channel: "email";
  provider: DeliveryProviderType;
  display_name: string;
  is_default?: boolean;
  is_active?: boolean;
  from_email?: string;
  from_name?: string;
  reply_to?: string;
  // Resend
  email_api_key?: string;
  // SMTP / Google Workspace / Microsoft 365
  smtp_host?: string;
  smtp_port?: number;
  smtp_secure?: boolean;
  smtp_user?: string;
  smtp_password?: string;
  // AWS SES (customer-provided)
  aws_access_key_id?: string;
  aws_region?: string;
  aws_secret_access_key?: string;
}

export interface CreateDeliveryTemplateDto {
  channel: "email";
  name: string;
  is_default?: boolean;
  is_active?: boolean;
  email_subject?: string;
  body: string;
  variables?: string[];
}

export interface SendEmailDto {
  generation_job_id: string;
  integration_id?: string;
  template_id?: string;
  subject_override?: string;
  from_name_override?: string;
  from_email_override?: string;
  use_platform_default?: boolean;
}

export interface DeliverySender {
  id: string;
  organization_id: string;
  label: string;
  from_email: string;
  from_name: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSenderDto {
  label: string;
  from_email: string;
  from_name?: string | null;
  is_default?: boolean;
}

export interface TestSendDto {
  test_email: string;
  template_id?: string;
  integration_id?: string;
  subject_override?: string;
  from_name_override?: string;
  from_email_override?: string;
  use_platform_default?: boolean;
}

export interface SendResult {
  total: number;
  sent: number;
  failed: number;
  messages: Array<{
    message_id: string;
    recipient_id: string;
    to_email: string;
    status: "sent" | "failed";
    error?: string;
  }>;
}

export interface PlatformDefaultSettings {
  default_integration_id: string | null;
  default_template_id: string | null;
  default_integration: DeliveryIntegration | null;
  default_template: DeliveryTemplate | null;
}

export interface UpdatePlatformDefaultSettingsDto {
  default_integration_id?: string | null;
  default_template_id?: string | null;
}

export interface EmailContact {
  id: string;
  organization_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  unsubscribed: boolean;
  custom_properties: Record<string, string | number>;
  created_at: string;
  updated_at: string;
}

export type FilterOperator =
  | "equals" | "not_equals"
  | "contains" | "not_contains"
  | "starts_with" | "ends_with"
  | "is_empty" | "is_not_empty";

export interface FilterRule {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

export interface SegmentFilters {
  match: "all" | "any";
  rules: FilterRule[];
}

export interface EmailSegment {
  id: string;
  organization_id: string;
  name: string;
  filters: SegmentFilters;
  contact_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateSegmentDto {
  name: string;
  filters: SegmentFilters;
}

export type BroadcastStatus = "draft" | "scheduled" | "sending" | "sent" | "failed";

export interface EmailBroadcast {
  id: string;
  organization_id: string;
  name: string;
  subject: string;
  from_email: string;
  from_name: string;
  html: string;
  text: string | null;
  email_type: string;
  segment_id: string | null;
  status: BroadcastStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateBroadcastDto {
  name: string;
  subject: string;
  from_email: string;
  from_name: string;
  html: string;
  text?: string;
  email_type?: string;
  segment_id?: string | null;
  inline_recipients?: Array<{ email: string; [key: string]: string }>;
}

export type EmailEventType =
  | "sent" | "delivered" | "bounced" | "complained"
  | "opened" | "clicked" | "failed" | "scheduled" | "unknown";

export interface DeliveryEmailEvent {
  id: string;
  organization_id: string;
  provider: string;
  provider_message_id: string | null;
  event_type: EmailEventType;
  raw_payload: Record<string, unknown>;
  received_at: string;
}

// ── Campaigns ─────────────────────────────────────────────────────────────────

export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "cancelled" | "failed";
export type CampaignRunStatus = "queued" | "processing" | "completed" | "partial" | "failed";
export type CampaignAudienceType = "all_contacts" | "segment" | "manual_list" | "generation_job";
export type CampaignEmailType = "marketing" | "transactional";

export interface Campaign {
  id: string;
  organization_id: string;
  name: string;
  channel: "email" | "whatsapp";
  status: CampaignStatus;
  subject: string | null;
  template_id: string | null;
  body_override: string | null;
  audience_type: CampaignAudienceType;
  audience_ref: string | null;
  scheduled_at: string | null;
  integration_id: string | null;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  email_type: CampaignEmailType;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  failed_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CampaignRun {
  id: string;
  campaign_id: string;
  organization_id: string;
  status: CampaignRunStatus;
  background_job_id: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  started_at: string | null;
  completed_at: string | null;
  error_summary: Record<string, unknown> | null;
  created_at: string;
}

export interface CreateCampaignDto {
  name: string;
  channel: "email" | "whatsapp";
  subject?: string;
  template_id?: string | null;
  body_override?: string;
  audience_type?: CampaignAudienceType;
  audience_ref?: string | null;
  scheduled_at?: string | null;
  integration_id?: string | null;
  from_name?: string;
  from_email?: string;
  reply_to?: string;
  email_type?: CampaignEmailType;
  inline_recipients?: Array<{ email: string; name?: string; [key: string]: unknown }>;
}

export interface UpdateCampaignDto {
  name?: string;
  subject?: string;
  template_id?: string | null;
  body_override?: string;
  audience_type?: CampaignAudienceType;
  audience_ref?: string | null;
  scheduled_at?: string | null;
  integration_id?: string | null;
  from_name?: string;
  from_email?: string;
  reply_to?: string;
  email_type?: CampaignEmailType;
  inline_recipients?: Array<{ email: string; name?: string; [key: string]: unknown }>;
}

// ── API Keys (integration connections) ───────────────────────────────────────

export type ApiKeyScope =
  | "certificates:read" | "certificates:write"
  | "campaigns:read" | "campaigns:write"
  | "contacts:read" | "contacts:write"
  | "templates:read"
  | "automation:write"
  | "analytics:read";

export interface ApiKey {
  id: string;
  organization_id: string;
  connection_name: string;
  scopes: ApiKeyScope[];
  is_sandbox: boolean;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateApiKeyDto {
  connection_name: string;
  scopes: ApiKeyScope[];
  is_sandbox?: boolean;
}

// ── Customer Webhooks ─────────────────────────────────────────────────────────

export type WebhookEventType =
  | "certificate.generated"
  | "contact.created" | "contact.updated" | "contact.unsubscribed"
  | "campaign.sent" | "campaign.failed"
  | "email.delivered" | "email.bounced" | "email.complained";

export interface WebhookEndpoint {
  id: string;
  organization_id: string;
  url: string;
  description: string | null;
  event_types: WebhookEventType[];
  is_active: boolean;
  failure_count: number;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateWebhookEndpointDto {
  url: string;
  description?: string;
  event_types?: WebhookEventType[];
}

export type WebhookDeliveryStatus = "pending" | "delivered" | "failed" | "retrying";

export interface WebhookDeliveryLog {
  id: string;
  endpoint_id: string;
  organization_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempt_number: number;
  status: WebhookDeliveryStatus;
  response_status: number | null;
  response_body: string | null;
  error_message: string | null;
  delivered_at: string | null;
  next_retry_at: string | null;
  created_at: string;
}

// ── API ───────────────────────────────────────────────────────────────────────

export const deliveryApi = {
  // ── Integrations ────────────────────────────────────────────────────────────

  listIntegrations: async (): Promise<DeliveryIntegration[]> => {
    const response = await apiRequest<{ integrations: DeliveryIntegration[] }>(
      "/delivery/integrations",
    );
    return response.data!.integrations;
  },

  createIntegration: async (dto: CreateIntegrationDto): Promise<DeliveryIntegration> => {
    const response = await apiRequest<{ integration: DeliveryIntegration }>(
      "/delivery/integrations",
      { method: "POST", body: JSON.stringify(dto) },
    );
    return response.data!.integration;
  },

  updateIntegration: async (
    id: string,
    dto: Partial<CreateIntegrationDto>,
  ): Promise<DeliveryIntegration> => {
    const response = await apiRequest<{ integration: DeliveryIntegration }>(
      `/delivery/integrations/${id}`,
      { method: "PUT", body: JSON.stringify(dto) },
    );
    return response.data!.integration;
  },

  // ── Usage metering ────────────────────────────────────────────────────────────

  getUsage: async (): Promise<{ month: number; today: number; last30: number; total: number; monthStart: string; dayStart: string; last30Start: string }> => {
    const response = await apiRequest<{ month: number; today: number; last30: number; total: number; monthStart: string; dayStart: string; last30Start: string }>(
      "/delivery/usage",
    );
    return response.data!;
  },

  // ── Senders (named "From" identities) ─────────────────────────────────────────

  listSenders: async (): Promise<DeliverySender[]> => {
    const response = await apiRequest<{ senders: DeliverySender[] }>("/delivery/senders");
    return response.data!.senders;
  },

  createSender: async (dto: CreateSenderDto): Promise<DeliverySender> => {
    const response = await apiRequest<{ sender: DeliverySender }>(
      "/delivery/senders",
      { method: "POST", body: JSON.stringify(dto) },
    );
    return response.data!.sender;
  },

  updateSender: async (id: string, dto: Partial<CreateSenderDto>): Promise<DeliverySender> => {
    const response = await apiRequest<{ sender: DeliverySender }>(
      `/delivery/senders/${id}`,
      { method: "PUT", body: JSON.stringify(dto) },
    );
    return response.data!.sender;
  },

  deleteSender: async (id: string): Promise<void> => {
    await apiRequest(`/delivery/senders/${id}`, { method: "DELETE" });
  },

  // ── Resend logs / sent-email history (read-only) ───────────────────────────────

  listResendEmails: async (params?: { integrationId?: string; limit?: number }): Promise<{ data?: Array<Record<string, unknown>> }> => {
    const qs = new URLSearchParams();
    if (params?.integrationId) qs.set("integration_id", params.integrationId);
    if (params?.limit) qs.set("limit", String(params.limit));
    const response = await apiRequest<{ data?: Array<Record<string, unknown>> }>(
      `/delivery/resend/emails${qs.toString() ? `?${qs}` : ""}`,
    );
    return response.data ?? {};
  },

  // ── Resend template sync ──────────────────────────────────────────────────────

  // Import a migrating customer's existing Resend templates into our templates.
  importResendTemplates: async (integrationId: string): Promise<{ imported: number; skipped: number }> => {
    const response = await apiRequest<{ imported: number; skipped: number }>(
      "/delivery/resend/templates/import",
      { method: "POST", body: JSON.stringify({ integration_id: integrationId }) },
    );
    return response.data!;
  },

  // ── Resend domains ──────────────────────────────────────────────────────────

  listDomains: async (integrationId: string): Promise<ResendDomain[]> => {
    const response = await apiRequest<{ data?: ResendDomain[] } | ResendDomain[]>(
      `/delivery/resend/domains?integration_id=${encodeURIComponent(integrationId)}`,
    );
    const d = response.data as { data?: ResendDomain[] } | ResendDomain[] | undefined;
    if (Array.isArray(d)) return d;
    return d?.data ?? [];
  },

  getDomain: async (integrationId: string, domainId: string): Promise<ResendDomain> => {
    const response = await apiRequest<ResendDomain>(
      `/delivery/resend/domains/${domainId}?integration_id=${encodeURIComponent(integrationId)}`,
    );
    return response.data!;
  },

  createDomain: async (integrationId: string, name: string, region?: string): Promise<ResendDomain> => {
    const response = await apiRequest<ResendDomain>("/delivery/resend/domains", {
      method: "POST",
      body: JSON.stringify({ integration_id: integrationId, name, region }),
    });
    return response.data!;
  },

  verifyDomain: async (integrationId: string, domainId: string): Promise<ResendDomain> => {
    const response = await apiRequest<ResendDomain>(`/delivery/resend/domains/${domainId}/verify`, {
      method: "POST",
      body: JSON.stringify({ integration_id: integrationId }),
    });
    return response.data!;
  },

  deleteDomain: async (integrationId: string, domainId: string): Promise<void> => {
    await apiRequest(`/delivery/resend/domains/${domainId}?integration_id=${encodeURIComponent(integrationId)}`, {
      method: "DELETE",
    });
  },

  deleteIntegration: async (id: string): Promise<void> => {
    await apiRequest(`/delivery/integrations/${id}`, { method: "DELETE" });
  },

  // ── Templates ───────────────────────────────────────────────────────────────

  listTemplates: async (): Promise<DeliveryTemplate[]> => {
    const response = await apiRequest<{ templates: DeliveryTemplate[] }>("/delivery/templates");
    return response.data!.templates;
  },

  createTemplate: async (dto: CreateDeliveryTemplateDto): Promise<DeliveryTemplate> => {
    const response = await apiRequest<{ template: DeliveryTemplate }>("/delivery/templates", {
      method: "POST",
      body: JSON.stringify(dto),
    });
    return response.data!.template;
  },

  updateTemplate: async (
    id: string,
    dto: Partial<CreateDeliveryTemplateDto>,
  ): Promise<DeliveryTemplate> => {
    const response = await apiRequest<{ template: DeliveryTemplate }>(
      `/delivery/templates/${id}`,
      { method: "PUT", body: JSON.stringify(dto) },
    );
    return response.data!.template;
  },

  deleteTemplate: async (id: string): Promise<void> => {
    await apiRequest(`/delivery/templates/${id}`, { method: "DELETE" });
  },

  duplicateTemplate: async (id: string): Promise<DeliveryTemplate> => {
    const response = await apiRequest<{ template: DeliveryTemplate }>(
      `/delivery/templates/${id}/duplicate`,
      { method: "POST" },
    );
    return response.data!.template;
  },

  // ── Platform default settings ────────────────────────────────────────────

  getPlatformDefaultSettings: async (): Promise<PlatformDefaultSettings> => {
    const response = await apiRequest<PlatformDefaultSettings>(
      "/delivery/platform-default-settings",
    );
    return response.data!;
  },

  updatePlatformDefaultSettings: async (
    dto: UpdatePlatformDefaultSettingsDto,
  ): Promise<PlatformDefaultSettings> => {
    const response = await apiRequest<PlatformDefaultSettings>(
      "/delivery/platform-default-settings",
      { method: "PUT", body: JSON.stringify(dto) },
    );
    return response.data!;
  },

  // ── Send ────────────────────────────────────────────────────────────────────

  sendJobEmails: async (dto: SendEmailDto): Promise<SendResult> => {
    const response = await apiRequest<SendResult>("/delivery/send", {
      method: "POST",
      body: JSON.stringify(dto),
    });
    return response.data!;
  },

  testSend: async (dto: TestSendDto): Promise<{ sent: boolean; to_email: string }> => {
    const response = await apiRequest<{ sent: boolean; to_email: string }>("/delivery/test-send", {
      method: "POST",
      body: JSON.stringify(dto),
    });
    return response.data!;
  },

  // ── Messages ────────────────────────────────────────────────────────────────

  listMessages: async (
    params?: { limit?: number; offset?: number },
  ): Promise<{ data: DeliveryMessage[]; count: number }> => {
    const qs = params ? `?limit=${params.limit ?? 20}&offset=${params.offset ?? 0}` : "";
    const response = await apiRequest<{ data: DeliveryMessage[]; count: number }>(
      `/delivery/messages${qs}`,
    );
    return response.data!;
  },

  listMessagesByJob: async (jobId: string): Promise<{ messages: DeliveryMessage[] }> => {
    const response = await apiRequest<{ messages: DeliveryMessage[] }>(
      `/delivery/messages/job/${jobId}`,
    );
    return response.data!;
  },

  // ── Contacts ─────────────────────────────────────────────────────────────────

  listContacts: async (params?: {
    limit?: number;
    offset?: number;
    search?: string;
    unsubscribed?: boolean;
    source_ref?: string;
  }): Promise<{ contacts: EmailContact[]; total: number }> => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    if (params?.search) qs.set("search", params.search);
    if (params?.unsubscribed !== undefined) qs.set("unsubscribed", String(params.unsubscribed));
    if (params?.source_ref) qs.set("source_ref", params.source_ref);
    const response = await apiRequest<{ contacts: EmailContact[]; total: number }>(
      `/delivery/contacts${qs.toString() ? `?${qs}` : ""}`,
    );
    return response.data!;
  },

  importContacts: async (file: File): Promise<{ imported: number; skipped: number; errors: string[] }> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_BASE_URL}/delivery/contacts/import`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    const data = (await response.json()) as ApiResponse<{ imported: number; skipped: number; errors: string[] }>;
    if (!response.ok || !data.success) {
      const { code, message } = extractApiError(data.error, "Import failed");
      throw new ApiError(code, message);
    }
    return data.data!;
  },

  importContactsBatch: async (rows: Array<Record<string, string>>, source_ref?: string): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
    skipped_details: Array<{ index: number; email?: string; reason: string }>;
  }> => {
    const response = await apiRequest<{
      imported: number;
      skipped: number;
      errors: string[];
      skipped_details: Array<{ index: number; email?: string; reason: string }>;
    }>(
      "/delivery/contacts/import-batch",
      { method: "POST", body: JSON.stringify({ rows, source_ref }) },
    );
    return response.data!;
  },

  exportContacts: (format: 'json' | 'csv' | 'markdown'): void => {
    // Trigger a direct browser download — bypasses the proxy JSON wrapper
    // by appending the token and hitting the backend file endpoint.
    // We use a link click so the browser saves the file natively.
    import("@/lib/supabase/browser").then(({ createSupabaseBrowserClient }) => {
      createSupabaseBrowserClient().auth.getSession().then(({ data: { session } }) => {
        const token = session?.access_token ?? '';
        const url = `${window.location.origin}/api/proxy/delivery/contacts/export?format=${format}`;
        const a = document.createElement('a');
        a.href = url;
        a.download = `contacts.${format === 'markdown' ? 'md' : format}`;
        // Token is sent by the proxy via session cookie — no extra header needed
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        void token; // used implicitly via session cookie
      });
    });
  },

  deleteContact: async (id: string): Promise<void> => {
    await apiRequest(`/delivery/contacts/${id}`, { method: "DELETE" });
  },

  deleteContactsBySourceRef: async (source_ref: string): Promise<{ deleted: number }> => {
    const response = await apiRequest<{ deleted: number }>(
      `/delivery/contacts/batch?source_ref=${encodeURIComponent(source_ref)}`,
      { method: "DELETE" },
    );
    return response.data!;
  },

  updateContact: async (id: string, dto: { unsubscribed?: boolean; first_name?: string; last_name?: string }): Promise<EmailContact> => {
    const response = await apiRequest<{ contact: EmailContact }>(`/delivery/contacts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(dto),
    });
    return response.data!.contact;
  },

  // ── Segments ─────────────────────────────────────────────────────────────────

  listSegments: async (): Promise<{ segments: EmailSegment[] }> => {
    const response = await apiRequest<{ segments: EmailSegment[] }>("/delivery/segments");
    return response.data!;
  },

  createSegment: async (dto: CreateSegmentDto): Promise<EmailSegment> => {
    const response = await apiRequest<{ segment: EmailSegment }>("/delivery/segments", {
      method: "POST",
      body: JSON.stringify(dto),
    });
    return response.data!.segment;
  },

  updateSegment: async (id: string, dto: Partial<CreateSegmentDto>): Promise<EmailSegment> => {
    const response = await apiRequest<{ segment: EmailSegment }>(`/delivery/segments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(dto),
    });
    return response.data!.segment;
  },

  deleteSegment: async (id: string): Promise<void> => {
    await apiRequest(`/delivery/segments/${id}`, { method: "DELETE" });
  },

  // ── Broadcasts ────────────────────────────────────────────────────────────────

  listBroadcasts: async (): Promise<{ broadcasts: EmailBroadcast[] }> => {
    const response = await apiRequest<{ broadcasts: EmailBroadcast[] }>("/delivery/broadcasts");
    return response.data!;
  },

  createBroadcast: async (dto: CreateBroadcastDto): Promise<EmailBroadcast> => {
    const response = await apiRequest<{ broadcast: EmailBroadcast }>("/delivery/broadcasts", {
      method: "POST",
      body: JSON.stringify(dto),
    });
    return response.data!.broadcast;
  },

  updateBroadcast: async (id: string, dto: Partial<CreateBroadcastDto>): Promise<EmailBroadcast> => {
    const response = await apiRequest<{ broadcast: EmailBroadcast }>(`/delivery/broadcasts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(dto),
    });
    return response.data!.broadcast;
  },

  sendBroadcast: async (id: string, scheduledAt?: string): Promise<void> => {
    await apiRequest(`/delivery/broadcasts/${id}/send`, {
      method: "POST",
      body: JSON.stringify({ scheduled_at: scheduledAt }),
    });
  },

  deleteBroadcast: async (id: string): Promise<void> => {
    await apiRequest(`/delivery/broadcasts/${id}`, { method: "DELETE" });
  },

  // ── Email events ──────────────────────────────────────────────────────────────

  listEmailEvents: async (params?: {
    limit?: number;
    offset?: number;
    event_type?: string;
    provider?: string;
  }): Promise<{ events: DeliveryEmailEvent[]; total: number }> => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    if (params?.event_type) qs.set("event_type", params.event_type);
    if (params?.provider) qs.set("provider", params.provider);
    const response = await apiRequest<{ events: DeliveryEmailEvent[]; total: number }>(
      `/delivery/events${qs.toString() ? `?${qs}` : ""}`,
    );
    return response.data!;
  },

  // ── Campaigns ─────────────────────────────────────────────────────────────────

  listCampaigns: async (params?: {
    limit?: number;
    offset?: number;
    status?: CampaignStatus;
    channel?: "email" | "whatsapp";
  }): Promise<{ campaigns: Campaign[]; total: number }> => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    if (params?.status) qs.set("status", params.status);
    if (params?.channel) qs.set("channel", params.channel);
    const response = await apiRequest<{ campaigns: Campaign[]; total: number }>(
      `/campaigns${qs.toString() ? `?${qs}` : ""}`,
    );
    return response.data!;
  },

  getCampaign: async (id: string): Promise<Campaign> => {
    const response = await apiRequest<{ campaign: Campaign }>(`/campaigns/${id}`);
    return response.data!.campaign;
  },

  createCampaign: async (dto: CreateCampaignDto): Promise<Campaign> => {
    const response = await apiRequest<{ campaign: Campaign }>("/campaigns", {
      method: "POST",
      body: JSON.stringify(dto),
    });
    return response.data!.campaign;
  },

  updateCampaign: async (id: string, dto: UpdateCampaignDto): Promise<Campaign> => {
    const response = await apiRequest<{ campaign: Campaign }>(`/campaigns/${id}`, {
      method: "PUT",
      body: JSON.stringify(dto),
    });
    return response.data!.campaign;
  },

  deleteCampaign: async (id: string): Promise<void> => {
    await apiRequest(`/campaigns/${id}`, { method: "DELETE" });
  },

  sendCampaign: async (id: string, scheduledAt?: string): Promise<{ campaign_run_id: string; job_id: string }> => {
    const response = await apiRequest<{ campaign_run_id: string; job_id: string }>(
      `/campaigns/${id}/send`,
      { method: "POST", body: JSON.stringify({ scheduled_at: scheduledAt }) },
    );
    return response.data!;
  },

  listCampaignRuns: async (campaignId: string): Promise<{ runs: CampaignRun[] }> => {
    const response = await apiRequest<{ runs: CampaignRun[] }>(`/campaigns/${campaignId}/runs`);
    return response.data!;
  },

  // ── API Key management (integration connections) ──────────────────────────

  listApiKeys: async (): Promise<ApiKey[]> => {
    const response = await apiRequest<ApiKey[]>("/api/v2/keys");
    return response.data!;
  },

  createApiKey: async (dto: CreateApiKeyDto): Promise<ApiKey & { api_key: string }> => {
    const response = await apiRequest<ApiKey & { api_key: string }>("/api/v2/keys", {
      method: "POST",
      body: JSON.stringify(dto),
    });
    return response.data!;
  },

  revokeApiKey: async (id: string): Promise<void> => {
    await apiRequest(`/api/v2/keys/${id}`, { method: "DELETE" });
  },

  // ── Customer webhook management ───────────────────────────────────────────

  listWebhookEndpoints: async (): Promise<WebhookEndpoint[]> => {
    const response = await apiRequest<WebhookEndpoint[]>("/customer-webhooks");
    return response.data!;
  },

  createWebhookEndpoint: async (dto: CreateWebhookEndpointDto): Promise<WebhookEndpoint & { signing_secret: string }> => {
    const response = await apiRequest<WebhookEndpoint & { signing_secret: string }>("/customer-webhooks", {
      method: "POST",
      body: JSON.stringify(dto),
    });
    return response.data!;
  },

  updateWebhookEndpoint: async (id: string, dto: Partial<CreateWebhookEndpointDto> & { is_active?: boolean }): Promise<WebhookEndpoint> => {
    const response = await apiRequest<WebhookEndpoint>(`/customer-webhooks/${id}`, {
      method: "PUT",
      body: JSON.stringify(dto),
    });
    return response.data!;
  },

  deleteWebhookEndpoint: async (id: string): Promise<void> => {
    await apiRequest(`/customer-webhooks/${id}`, { method: "DELETE" });
  },

  listWebhookDeliveryLogs: async (endpointId: string): Promise<WebhookDeliveryLog[]> => {
    const response = await apiRequest<WebhookDeliveryLog[]>(`/customer-webhooks/${endpointId}/logs`);
    return response.data!;
  },
};
