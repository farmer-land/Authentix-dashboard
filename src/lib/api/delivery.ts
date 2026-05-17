/**
 * DELIVERY DOMAIN API
 *
 * Email delivery integrations, templates, sending, and message history.
 */

import { apiRequest, API_BASE_URL, extractApiError, ApiError, type ApiResponse } from "./core";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  use_platform_default?: boolean;
}

export interface TestSendDto {
  test_email: string;
  template_id?: string;
  integration_id?: string;
  subject_override?: string;
  from_name_override?: string;
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
  }): Promise<{ contacts: EmailContact[]; total: number }> => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    if (params?.search) qs.set("search", params.search);
    if (params?.unsubscribed !== undefined) qs.set("unsubscribed", String(params.unsubscribed));
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

  importContactsBatch: async (rows: Array<Record<string, string>>): Promise<{ imported: number; skipped: number; errors: string[] }> => {
    const response = await apiRequest<{ imported: number; skipped: number; errors: string[] }>(
      "/delivery/contacts/import-batch",
      { method: "POST", body: JSON.stringify({ rows }) },
    );
    return response.data!;
  },

  deleteContact: async (id: string): Promise<void> => {
    await apiRequest(`/delivery/contacts/${id}`, { method: "DELETE" });
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
};
