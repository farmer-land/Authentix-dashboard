'use client';

/**
 * DELIVERY QUERY HOOKS
 *
 * Covers integrations, email templates, messages.
 * Mutations invalidate relevant query keys automatically.
 */

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useOrgSlug } from '@/lib/org';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import type { CreateDeliveryTemplateDto, CreateIntegrationDto, SendEmailDto, TestSendDto, UpdatePlatformDefaultSettingsDto, CreateSegmentDto, CreateBroadcastDto, CreateCampaignDto, UpdateCampaignDto, CampaignStatus, CreateApiKeyDto, CreateWebhookEndpointDto, WebhookEventType } from '@/lib/api/client';

export const deliveryKeys = {
  all: (slug: string) => ['org', slug, 'delivery'] as const,
  integrations: (slug: string) => [...deliveryKeys.all(slug), 'integrations'] as const,
  templates: (slug: string) => [...deliveryKeys.all(slug), 'templates'] as const,
  platformSettings: (slug: string) => [...deliveryKeys.all(slug), 'platform-settings'] as const,
  messages: (slug: string, params?: Record<string, unknown>) => [...deliveryKeys.all(slug), 'messages', params ?? {}] as const,
  messagesByJob: (slug: string, jobId: string) => [...deliveryKeys.all(slug), 'messages-by-job', jobId] as const,
  contacts: (slug: string, params?: Record<string, unknown>) => [...deliveryKeys.all(slug), 'contacts', params ?? {}] as const,
  segments: (slug: string) => [...deliveryKeys.all(slug), 'segments'] as const,
  broadcasts: (slug: string) => [...deliveryKeys.all(slug), 'broadcasts'] as const,
  emailEvents: (slug: string, params?: Record<string, unknown>) => [...deliveryKeys.all(slug), 'email-events', params ?? {}] as const,
  campaigns: (slug: string, params?: Record<string, unknown>) => [...deliveryKeys.all(slug), 'campaigns', params ?? {}] as const,
  campaign: (slug: string, id: string) => [...deliveryKeys.all(slug), 'campaign', id] as const,
  campaignRuns: (slug: string, campaignId: string) => [...deliveryKeys.all(slug), 'campaign-runs', campaignId] as const,
};

// ── Integrations ──────────────────────────────────────────────────────────────

export function useDeliveryIntegrations() {
  const slug = useOrgSlug();
  const query = useQuery({
    queryKey: deliveryKeys.integrations(slug),
    queryFn: () => api.delivery.listIntegrations(),
    staleTime: 5 * 60 * 1000, // integrations rarely change
  });
  return {
    integrations: query.data ?? [],
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useCreateIntegration() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: (dto: CreateIntegrationDto) => api.delivery.createIntegration(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveryKeys.integrations(slug) }),
  });
}

export function useUpdateIntegration() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<CreateIntegrationDto> }) =>
      api.delivery.updateIntegration(id, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveryKeys.integrations(slug) }),
  });
}

export function useDeleteIntegration() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: (id: string) => api.delivery.deleteIntegration(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveryKeys.integrations(slug) }),
  });
}

// ── Templates ─────────────────────────────────────────────────────────────────

export function useDeliveryTemplates() {
  const slug = useOrgSlug();
  const query = useQuery({
    queryKey: deliveryKeys.templates(slug),
    queryFn: () => api.delivery.listTemplates(),
    staleTime: 2 * 60 * 1000,
  });
  return {
    templates: query.data ?? [],
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useCreateDeliveryTemplate() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: (dto: CreateDeliveryTemplateDto) => api.delivery.createTemplate(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveryKeys.templates(slug) }),
  });
}

export function useUpdateDeliveryTemplate() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<CreateDeliveryTemplateDto> }) =>
      api.delivery.updateTemplate(id, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveryKeys.templates(slug) }),
  });
}

export function useDeleteDeliveryTemplate() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: (id: string) => api.delivery.deleteTemplate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveryKeys.templates(slug) }),
  });
}

export function useDuplicateDeliveryTemplate() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: (id: string) => api.delivery.duplicateTemplate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveryKeys.templates(slug) }),
  });
}

// ── Platform default settings ──────────────────────────────────────────────────

export function useDeliveryPlatformSettings() {
  const slug = useOrgSlug();
  return useQuery({
    queryKey: deliveryKeys.platformSettings(slug),
    queryFn: () => api.delivery.getPlatformDefaultSettings(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateDeliveryPlatformSettings() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: (dto: UpdatePlatformDefaultSettingsDto) =>
      api.delivery.updatePlatformDefaultSettings(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deliveryKeys.platformSettings(slug) });
      queryClient.invalidateQueries({ queryKey: deliveryKeys.integrations(slug) });
      queryClient.invalidateQueries({ queryKey: deliveryKeys.templates(slug) });
    },
  });
}

// ── Send ──────────────────────────────────────────────────────────────────────

export function useSendJobEmails() {
  return useMutation({
    mutationFn: (dto: SendEmailDto) => api.delivery.sendJobEmails(dto),
  });
}

export function useTestSend() {
  return useMutation({
    mutationFn: (dto: TestSendDto) => api.delivery.testSend(dto),
  });
}

// ── Messages ──────────────────────────────────────────────────────────────────

export function useDeliveryMessages(params?: { limit?: number; offset?: number }) {
  const slug = useOrgSlug();
  return useQuery({
    queryKey: deliveryKeys.messages(slug, params as Record<string, unknown>),
    queryFn: () => api.delivery.listMessages(params),
    staleTime: 30 * 1000,
  });
}

export function useDeliveryMessagesByJob(jobId: string | null | undefined) {
  const slug = useOrgSlug();
  return useQuery({
    queryKey: deliveryKeys.messagesByJob(slug, jobId ?? ''),
    queryFn: () => api.delivery.listMessagesByJob(jobId!),
    enabled: !!jobId,
    staleTime: 30 * 1000,
  });
}

// ── Contacts ──────────────────────────────────────────────────────────────────

export function useEmailContacts(params?: { limit?: number; offset?: number; search?: string; unsubscribed?: boolean; source_ref?: string }) {
  const slug = useOrgSlug();
  const query = useQuery({
    queryKey: deliveryKeys.contacts(slug, params as Record<string, unknown>),
    queryFn: () => api.delivery.listContacts(params),
    staleTime: 30 * 1000,
  });
  return {
    contacts: query.data?.contacts ?? [],
    total: query.data?.total ?? 0,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useImportContacts() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: (file: File) => api.delivery.importContacts(file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveryKeys.contacts(slug) }),
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: (id: string) => api.delivery.deleteContact(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveryKeys.contacts(slug) }),
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: { unsubscribed?: boolean; first_name?: string; last_name?: string } }) =>
      api.delivery.updateContact(id, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveryKeys.contacts(slug) }),
  });
}

// ── Segments ──────────────────────────────────────────────────────────────────

export function useEmailSegments() {
  const slug = useOrgSlug();
  const query = useQuery({
    queryKey: deliveryKeys.segments(slug),
    queryFn: () => api.delivery.listSegments(),
    staleTime: 2 * 60 * 1000,
  });
  return {
    segments: query.data?.segments ?? [],
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useCreateSegment() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: (dto: CreateSegmentDto) => api.delivery.createSegment(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveryKeys.segments(slug) }),
  });
}

export function useUpdateSegment() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<CreateSegmentDto> }) =>
      api.delivery.updateSegment(id, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveryKeys.segments(slug) }),
  });
}

export function useDeleteSegment() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: (id: string) => api.delivery.deleteSegment(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveryKeys.segments(slug) }),
  });
}

// ── Broadcasts ────────────────────────────────────────────────────────────────

export function useEmailBroadcasts() {
  const slug = useOrgSlug();
  const query = useQuery({
    queryKey: deliveryKeys.broadcasts(slug),
    queryFn: () => api.delivery.listBroadcasts(),
    staleTime: 20 * 1000,
  });
  return {
    broadcasts: query.data?.broadcasts ?? [],
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useCreateBroadcast() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: (dto: CreateBroadcastDto) => api.delivery.createBroadcast(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveryKeys.broadcasts(slug) }),
  });
}

export function useUpdateBroadcast() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<CreateBroadcastDto> }) =>
      api.delivery.updateBroadcast(id, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveryKeys.broadcasts(slug) }),
  });
}

export function useSendBroadcast() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt?: string }) =>
      api.delivery.sendBroadcast(id, scheduledAt),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveryKeys.broadcasts(slug) }),
  });
}

export function useDeleteBroadcast() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: (id: string) => api.delivery.deleteBroadcast(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveryKeys.broadcasts(slug) }),
  });
}

// ── Email Events ──────────────────────────────────────────────────────────────

export function useEmailEvents(params?: { limit?: number; offset?: number; event_type?: string; provider?: string }) {
  const slug = useOrgSlug();
  return useQuery({
    queryKey: deliveryKeys.emailEvents(slug, params as Record<string, unknown>),
    queryFn: () => api.delivery.listEmailEvents(params),
    staleTime: 10 * 1000,
  });
}

// ── Campaigns ─────────────────────────────────────────────────────────────────

export function useCampaigns(params?: { limit?: number; offset?: number; status?: CampaignStatus; channel?: 'email' | 'whatsapp' }) {
  const slug = useOrgSlug();
  const query = useQuery({
    queryKey: deliveryKeys.campaigns(slug, params as Record<string, unknown>),
    queryFn: () => api.delivery.listCampaigns(params),
    staleTime: 20 * 1000,
  });
  return {
    campaigns: query.data?.campaigns ?? [],
    total: query.data?.total ?? 0,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useCampaign(id: string | null | undefined) {
  const slug = useOrgSlug();
  return useQuery({
    queryKey: deliveryKeys.campaign(slug, id ?? ''),
    queryFn: () => api.delivery.getCampaign(id!),
    enabled: !!id,
    staleTime: 20 * 1000,
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: (dto: CreateCampaignDto) => api.delivery.createCampaign(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveryKeys.campaigns(slug) }),
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateCampaignDto }) =>
      api.delivery.updateCampaign(id, dto),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: deliveryKeys.campaigns(slug) });
      queryClient.invalidateQueries({ queryKey: deliveryKeys.campaign(slug, id) });
    },
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: (id: string) => api.delivery.deleteCampaign(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveryKeys.campaigns(slug) }),
  });
}

export function useSendCampaign() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt?: string }) =>
      api.delivery.sendCampaign(id, scheduledAt),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: deliveryKeys.campaigns(slug) });
      queryClient.invalidateQueries({ queryKey: deliveryKeys.campaign(slug, id) });
      queryClient.invalidateQueries({ queryKey: deliveryKeys.campaignRuns(slug, id) });
    },
  });
}

export function useCampaignRuns(campaignId: string | null | undefined) {
  const slug = useOrgSlug();
  return useQuery({
    queryKey: deliveryKeys.campaignRuns(slug, campaignId ?? ''),
    queryFn: () => api.delivery.listCampaignRuns(campaignId!),
    enabled: !!campaignId,
    staleTime: 10 * 1000,
  });
}


// ── API Keys ──────────────────────────────────────────────────────────────────

export function useApiKeys() {
  const slug = useOrgSlug();
  const query = useQuery({
    queryKey: [...deliveryKeys.all(slug), 'api-keys'] as const,
    queryFn: () => api.delivery.listApiKeys(),
    staleTime: 2 * 60 * 1000,
  });
  return {
    apiKeys: query.data ?? [],
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: (dto: CreateApiKeyDto) => api.delivery.createApiKey(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...deliveryKeys.all(slug), 'api-keys'] }),
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: (id: string) => api.delivery.revokeApiKey(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...deliveryKeys.all(slug), 'api-keys'] }),
  });
}

// ── Customer Webhooks ─────────────────────────────────────────────────────────

export function useWebhookEndpoints() {
  const slug = useOrgSlug();
  const query = useQuery({
    queryKey: [...deliveryKeys.all(slug), 'webhook-endpoints'] as const,
    queryFn: () => api.delivery.listWebhookEndpoints(),
    staleTime: 30 * 1000,
  });
  return {
    endpoints: query.data ?? [],
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}

export function useCreateWebhookEndpoint() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: (dto: CreateWebhookEndpointDto) => api.delivery.createWebhookEndpoint(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...deliveryKeys.all(slug), 'webhook-endpoints'] }),
  });
}

export function useUpdateWebhookEndpoint() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<CreateWebhookEndpointDto> & { is_active?: boolean; event_types?: WebhookEventType[] } }) =>
      api.delivery.updateWebhookEndpoint(id, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...deliveryKeys.all(slug), 'webhook-endpoints'] }),
  });
}

export function useDeleteWebhookEndpoint() {
  const queryClient = useQueryClient();
  const slug = useOrgSlug();
  return useMutation({
    mutationFn: (id: string) => api.delivery.deleteWebhookEndpoint(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...deliveryKeys.all(slug), 'webhook-endpoints'] }),
  });
}

export function useWebhookDeliveryLogs(endpointId: string | null | undefined) {
  const slug = useOrgSlug();
  return useQuery({
    queryKey: [...deliveryKeys.all(slug), 'webhook-logs', endpointId ?? ''] as const,
    queryFn: () => api.delivery.listWebhookDeliveryLogs(endpointId!),
    enabled: !!endpointId,
    staleTime: 10 * 1000,
  });
}
