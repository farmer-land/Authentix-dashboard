'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import Lottie from 'lottie-react';
import generatedNewAnimationData from '../assets/generated-new.json';
import finalGenerationAnimationData from '../../../../../../public/template/final-generation.json';
import { CertificateTemplate, CertificateField, ImportedData, FieldMapping } from '@/lib/types/certificate';
import { api, type DeliveryIntegration, type DeliveryTemplate, type DeliveryMessage } from '@/lib/api/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { format, isValid } from 'date-fns';
import {
  Download, Loader2, CheckCircle2, AlertCircle, Calendar, Plus, X,
  FileText, ChevronDown, ChevronUp, Settings2, Eye, ChevronLeft, ChevronRight,
  Mail, Send, ExternalLink, Bell, ArrowRight,
  FileArchive, FileCheck, Info, RefreshCw,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { type ExpiryType } from './ExpiryDateSelector';
import { type GeneratedCertificate } from './CertificateTable';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useOrg } from '@/lib/org';
import { useJobNotifications } from '@/lib/notifications/job-notifications';
import { downloadFileFromUrl } from '@/lib/utils/download';
import { useOrganization } from '@/lib/hooks/queries/organizations';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CertificateConfig {
  /** Unique key for this config within the list */
  key: string;
  template: CertificateTemplate;
  fields: CertificateField[];
  fieldMappings: FieldMapping[];
  /** Display label set by the user, e.g. "Course Completion" */
  label: string;
}

interface ExportSectionProps {
  /** Primary (first) template – required */
  template: CertificateTemplate | null;
  fields: CertificateField[];
  importedData: ImportedData | null;
  fieldMappings: FieldMapping[];
  /** Certificate template subcategory name — used as course_name fallback in email preview */
  subcategoryName?: string;
  /** All saved templates so user can pick additional ones */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  savedTemplates?: any[];
  /** Additional certificate configurations added by the user */
  additionalConfigs?: CertificateConfig[];
  onAdditionalConfigsChange?: (configs: CertificateConfig[]) => void;
  /** Called when the user changes a primary-template field mapping directly in Step 4 */
  onFieldMappingsChange?: (mappings: FieldMapping[]) => void;
  /** Manual entries appended after file rows during generation */
  additionalRows?: Record<string, unknown>[];
  /** Pass-through from page-level useEditorEvents — keeps the same session ID */
  onTrackEvent?: (eventType: string, data?: Record<string, unknown>) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Return a human-friendly time estimate for certificate generation.
 *
 * Architecture: cron fires every 1 min; each invocation processes one chunk
 * of 50 certs per template, sequentially across configs via ContinueSignal.
 *
 * Tier thresholds are intentionally rounded up — we'd rather under-promise
 * than over-promise. For very large batches we just say "processing in
 * background" since the exact time depends on server load.
 */
function estimateGenerationTime(totalRows: number, configs: CertificateConfig[]): string {
  if (totalRows === 0 || configs.length === 0) return '';
  const CHUNK = 50;
  const CRON_MIN = 1;
  const numTemplates = configs.length;
  const chunksPerTemplate = Math.ceil(totalRows / CHUNK);
  const totalMin = chunksPerTemplate * numTemplates * CRON_MIN;

  if (totalMin <= 1) return 'under 1 minute';
  if (totalMin <= 5) return 'under 5 minutes';
  if (totalMin <= 15) return 'under 15 minutes';
  if (totalMin <= 30) return 'under 30 minutes';
  if (totalMin <= 60) return 'under 1 hour';
  if (totalMin <= 120) return '1 – 2 hours';
  if (totalMin <= 240) return '2 – 4 hours';
  return 'several hours';
}

// Infer the semantic type of a column by sampling its values.
// Returns null when the sample is too small or too mixed to determine type.
function inferColumnType(values: unknown[]): 'name' | 'email' | 'date' | null {
  const sample = values.slice(0, 30).map(v => String(v ?? '').trim()).filter(Boolean);
  if (sample.length < 3) return null;

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  // Covers ISO (2024-01-15), UK/US (01/15/2024, 15-01-2024), written (Jan 15, 2024), year-only
  const dateRe = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}/i;
  // Two or more capitalized words with no digits — "John Smith", "María García"
  const nameRe = /^[A-ZÀ-ɏ][a-zÀ-ɏ'-]+(?:\s+[A-ZÀ-ɏ][a-zÀ-ɏ'-]+)+$/;

  let emailHits = 0, dateHits = 0, nameHits = 0;
  for (const s of sample) {
    if (emailRe.test(s)) emailHits++;
    else if (dateRe.test(s)) dateHits++;
    else if (nameRe.test(s)) nameHits++;
  }

  const thresh = sample.length * 0.55; // 55% consensus
  if (emailHits >= thresh) return 'email';
  if (dateHits  >= thresh) return 'date';
  if (nameHits  >= thresh) return 'name';
  return null;
}

// Score how well a header column matches a template field.
// Higher = better match. 0 = no signal.
function scoreHeaderForField(
  header: string,
  field: CertificateField,
  inferredType: ReturnType<typeof inferColumnType>,
): number {
  const h = header.toLowerCase().trim();
  let score = 0;

  // ── String heuristics ──────────────────────────────────────────────────────
  if (field.type === 'name') {
    // Guard against "Course Name" stealing the name field
    const hasCourseWord = /course|program|subject|workshop|training|award|event/.test(h);
    if (!hasCourseWord && h.includes('name')) score += 2;
    if (h === 'name' || h === 'full name' || h === 'recipient name' || h === 'student name') score += 2; // bonus for exact-ish
  }
  if (field.type === 'course') {
    if (/course|program|subject|workshop|internship|training|award|event/.test(h)) score += 2;
  }
  if (field.type === 'date') {
    if (h === 'date' || /completion|award|issued_on/.test(h)) score += 3;
    if (/date/.test(h) && !/start|end|expir|valid/.test(h)) score += 1;
  }
  if (field.type === 'start_date') {
    if (/start|issue|issu|begin|from|commencement/.test(h)) score += 2;
    if (/date/.test(h) && !/end|expir|valid|until/.test(h)) score += 1;
  }
  if (field.type === 'end_date') {
    if (/end|expir|valid|until|to\b/.test(h)) score += 2;
    if (/date/.test(h) && /end|expir|valid/.test(h)) score += 1;
  }
  if (field.type === 'place') {
    if (/place|venue|location|city|town/.test(h)) score += 3;
  }
  if (field.label.toLowerCase().includes('email') && /email|e-mail|mail/.test(h)) score += 3;

  // ── Value-inference boost ──────────────────────────────────────────────────
  // These can rescue columns with unhelpful names (e.g. "Column A", "Field 1")
  if (inferredType === 'name'  && field.type === 'name') score += 3;
  if (inferredType === 'email' && field.label.toLowerCase().includes('email')) score += 3;
  if (inferredType === 'date') {
    if (field.type === 'date')       score += 3; // plain date field gets highest boost for ambiguous dates
    if (field.type === 'start_date') score += 2;
    if (field.type === 'end_date')   score += 1;
  }

  return score;
}

// Auto-map imported data headers to a template's fields.
// Pass 1: exact label match (highest priority, claimed first).
// Pass 2: scored fuzzy match combining string heuristics + value-type inference.
// The optional sampleRows parameter enables value inference — pass importedData.rows.
export function autoMapForTemplate(
  fields: CertificateField[],
  headers: string[],
  sampleRows?: Record<string, unknown>[],
): FieldMapping[] {
  const mappings: FieldMapping[] = [];
  const usedHeaders = new Set<string>();

  // Pre-compute inferred column types from sample data
  const inferredTypes = new Map<string, ReturnType<typeof inferColumnType>>();
  if (sampleRows && sampleRows.length > 0) {
    for (const h of headers) {
      inferredTypes.set(h, inferColumnType(sampleRows.map(r => r[h])));
    }
  }

  // Pass 1: exact label matches — claimed first so fuzzy matching can't steal them.
  fields.forEach((field) => {
    const exact = headers.find(
      (h) => h.toLowerCase().trim() === field.label.toLowerCase().trim()
    );
    if (exact) {
      mappings.push({ fieldId: field.id, columnName: exact });
      usedHeaders.add(exact);
    }
  });

  // Pass 2: scored fuzzy + value-inference matching on remaining fields/headers.
  fields.forEach((field) => {
    if (mappings.some((m) => m.fieldId === field.id)) return;

    let bestHeader: string | null = null;
    let bestScore = 0;

    for (const h of headers) {
      if (usedHeaders.has(h)) continue;
      const score = scoreHeaderForField(h, field, inferredTypes.get(h) ?? null);
      if (score > bestScore) { bestScore = score; bestHeader = h; }
    }

    if (bestHeader && bestScore > 0) {
      mappings.push({ fieldId: field.id, columnName: bestHeader });
      usedHeaders.add(bestHeader);
    }
  });

  return mappings;
}

// Returns true when a mapping from srcField should propagate to targetField.
// `name` type always propagates (recipient identity is universal across templates).
// All other types only propagate when labels match exactly — prevents "Workshop Name"
// from silently overwriting "Course Name" just because both have type `course`.
function shouldPropagate(srcField: CertificateField, targetField: CertificateField): boolean {
  if (targetField.type !== srcField.type) return false;
  if (srcField.type === 'name') return true;
  return targetField.label.toLowerCase().trim() === srcField.label.toLowerCase().trim();
}

// ── Sub-component: single template config row ─────────────────────────────────

interface ConfigRowProps {
  config: CertificateConfig;
  importedData: ImportedData | null;
  index: number;
  onRemove: () => void;
  onMappingChange: (fieldId: string, column: string) => void;
}

function ConfigRow({ config, importedData, index, onRemove, onMappingChange }: ConfigRowProps) {
  const NON_MAPPABLE_CFG = new Set(['qr_code', 'custom_text', 'image']);
  const mappableFields = config.fields.filter(f => !NON_MAPPABLE_CFG.has(f.type));
  const cfgNameField = config.fields.find(f => f.type === 'name');
  const cfgNameUnmapped = !!cfgNameField && !config.fieldMappings.find(m => m.fieldId === cfgNameField.id);
  const [expanded, setExpanded] = useState(cfgNameUnmapped);
  const mappedCount = config.fieldMappings.filter(m => mappableFields.some(f => f.id === m.fieldId)).length;
  const allMapped = mappedCount === mappableFields.length && mappableFields.length > 0;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-2.5 bg-muted/20">
        <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0 flex items-center justify-center">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate leading-none">{config.template.templateName}</p>
        </div>
        {mappableFields.length > 0 && (
          <span className={`text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md ${
            allMapped
              ? 'bg-green-500/10 text-green-700 dark:text-green-400'
              : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
          }`}>
            {mappedCount}/{mappableFields.length}
          </span>
        )}
        <button
          onClick={() => setExpanded(v => !v)}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          title={expanded ? 'Collapse' : 'Edit field mappings'}
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <Settings2 className="w-3.5 h-3.5" />}
        </button>
        {index > 0 && (
          <button
            onClick={onRemove}
            className="p-1 text-muted-foreground hover:text-destructive transition-colors"
            title="Remove"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {expanded && (
        <div className="px-3 pt-2 pb-3 space-y-2 border-t border-border/50">
          {mappableFields.length === 0 ? (
            <p className="text-xs text-muted-foreground">No mappable fields on this template.</p>
          ) : mappableFields.map(field => {
            const mapped = config.fieldMappings.find(m => m.fieldId === field.id)?.columnName;
            return (
              <div key={field.id} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground min-w-[5.5rem] truncate">{field.label}</span>
                <Select value={mapped || ''} onValueChange={val => onMappingChange(field.id, val)}>
                  <SelectTrigger className={`h-7 text-xs flex-1 ${mapped ? 'border-green-500/60' : ''}`}>
                    <SelectValue placeholder="Select column…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(importedData?.headers ?? []).map(h => (
                      <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {mapped && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Template preview helpers ──────────────────────────────────────────────────

const TEMPLATE_MOCK_VARS: Record<string, string> = {
  recipient_name: 'Alex Johnson',
  organization_name: 'Your Organization',
  course_name: 'Advanced Web Development',
  certificate_number: 'CERT-2026-0001',
  issue_date: 'March 22, 2026',
  expiry_date: 'March 22, 2027',
  event_name: 'Tech Summit 2026',
  event_date: 'March 22, 2026',
  award_name: 'Excellence Award',
  training_name: 'Safety Training',
  membership_type: 'Gold Member',
  valid_until: 'December 31, 2026',
  completion_date: 'March 22, 2026',
  verification_url: 'https://verify.authentix.io/preview',
  verification_url_encoded: encodeURIComponent('https://verify.authentix.io/preview'),
};

function buildPreviewVars(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  firstRow: Record<string, any> | null,
  certImageUrl: string | null,
  subcategoryName?: string,
): Record<string, string> {
  const base: Record<string, string> = { ...TEMPLATE_MOCK_VARS };
  if (certImageUrl) base.certificate_image_url = certImageUrl;
  // Use subcategory as course_name fallback before applying row data
  if (subcategoryName) base.course_name = subcategoryName;

  if (!firstRow) return base;

  // Overlay all row values (CSV column names as keys)
  for (const [k, v] of Object.entries(firstRow)) {
    if (v != null && String(v).trim()) base[k] = String(v);
  }

  // Infer recipient_name from common column names if not already set via row data
  const nameKeys = ['recipient_name', 'Name', 'name', 'Student Name', 'Recipient Name', 'Full Name', 'full_name', 'Employee Name'];
  for (const key of nameKeys) {
    if (firstRow[key] && String(firstRow[key]).trim()) {
      base.recipient_name = String(firstRow[key]);
      break;
    }
  }

  // Infer course_name from common column names if not already set
  if (!firstRow.course_name) {
    const courseKeys = ['Course', 'course', 'Course Name', 'course_name', 'Program', 'program', 'Subject', 'subject'];
    for (const key of courseKeys) {
      if (firstRow[key] && String(firstRow[key]).trim()) {
        base.course_name = String(firstRow[key]);
        break;
      }
    }
  }

  return base;
}

function applyTemplatePreview(html: string | null | undefined, vars: Record<string, string>): string {
  // Guard against templates with no body (e.g. WhatsApp-only or partially-saved rows)
  // so the preview never crashes the whole send dialog.
  let result = html ?? '';
  // Replace src/href attribute variables first so URLs resolve before general token replace
  result = result.replace(/(src|href)="([^"]*)"/g, (_full, attr, val: string) => {
    const newVal = val.replace(/\{\{([\w.]+)\}\}/g, (_m, key) =>
      vars[key] ?? TEMPLATE_MOCK_VARS[key] ?? `[${key}]`
    );
    return `${attr}="${newVal}"`;
  });
  // Replace remaining {{variable}} tokens in text
  result = result.replace(/\{\{([\w.]+)\}\}/g, (_, key) => vars[key] ?? TEMPLATE_MOCK_VARS[key] ?? `[${key}]`);
  const certImageUrl = vars.certificate_image_url ?? null;
  if (certImageUrl) {
    result = result.replace(/src="data:image\/svg\+xml;[^"]+"/g, `src="${certImageUrl}"`);
    result = result.replace(/src="https:\/\/placehold\.co[^"]*"/g, `src="${certImageUrl}"`);
  }
  // Replace QR API calls with a neutral placeholder SVG so the preview
  // doesn't depend on network requests and doesn't break on sandbox restrictions
  const qrPlaceholder = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#f3f4f6" rx="8"/><rect x="15" y="15" width="38" height="38" rx="3" fill="none" stroke="#6b7280" stroke-width="3"/><rect x="67" y="15" width="38" height="38" rx="3" fill="none" stroke="#6b7280" stroke-width="3"/><rect x="15" y="67" width="38" height="38" rx="3" fill="none" stroke="#6b7280" stroke-width="3"/><rect x="22" y="22" width="24" height="24" rx="2" fill="#6b7280"/><rect x="74" y="22" width="24" height="24" rx="2" fill="#6b7280"/><rect x="22" y="74" width="24" height="24" rx="2" fill="#6b7280"/><rect x="67" y="67" width="10" height="10" fill="#6b7280"/><rect x="81" y="67" width="10" height="10" fill="#6b7280"/><rect x="67" y="81" width="10" height="10" fill="#6b7280"/><rect x="81" y="81" width="10" height="10" fill="#6b7280"/><rect x="95" y="81" width="10" height="10" fill="#6b7280"/><rect x="95" y="67" width="10" height="10" fill="#6b7280"/></svg>')}`;
  result = result.replace(/src="https:\/\/api\.qrserver\.com\/[^"]*"/g, `src="${qrPlaceholder}"`);
  return result;
}

// ── Send Email Modal ──────────────────────────────────────────────────────────

interface SendEmailModalProps {
  jobId: string;
  /** All cert-generation job IDs (one per template config × import file). Used for multi-template / multi-file email send. */
  allCertJobIds?: string[];
  recipientCount: number;
  certPreviewUrl?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  firstRecipientRow?: Record<string, any> | null;
  certFieldHeaders?: string[];
  subcategoryName?: string;
  orgPath: (path: string) => string;
  onClose: () => void;
  onEmailSent?: (statuses: Record<string, string>) => void;
}

type SendModalStep = 'checking' | 'no_template' | 'no_integration' | 'select_template' | 'confirm' | 'test_email' | 'sending' | 'done' | 'error';

// Synthetic ID for the platform built-in email template. When this template is selected,
// the send call omits template_id so the backend uses its own built-in default.
const BUILTIN_TEMPLATE_ID = '__builtin_default__';
const BUILTIN_EMAIL_TEMPLATE: DeliveryTemplate = {
  id: BUILTIN_TEMPLATE_ID,
  organization_id: '',
  channel: 'email',
  name: 'Default Certificate Email',
  is_default: true,
  is_active: true,
  email_subject: 'Your certificate from {{organization_name}}',
  body: 'Built-in default email — recipients receive their certificate with a verification link.',
  variables: ['recipient_name', 'organization_name', 'verification_url'],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function SendEmailModal({ jobId, allCertJobIds, recipientCount, certPreviewUrl, firstRecipientRow, certFieldHeaders, subcategoryName, orgPath, onClose, onEmailSent }: SendEmailModalProps) {
  const router = useRouter();
  const { organization, loading: orgLoading } = useOrganization();
  // Only the parent-owner org may use the Authentix default sender. Every other org must
  // configure its own email integration — we never expose our domain sender to them.
  const isPlatformOwner = !!organization?.is_platform_owner;
  const [step, setStep] = useState<SendModalStep>('checking');
  const [integrations, setIntegrations] = useState<DeliveryIntegration[]>([]);
  const [templates, setTemplates] = useState<DeliveryTemplate[]>([]);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [usePlatformDefault, setUsePlatformDefault] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<DeliveryTemplate | null>(null);
  const [subjectOverride, setSubjectOverride] = useState('');
  const [fromNameOverride, setFromNameOverride] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number } | null>(null);
  const [deliveryMessages, setDeliveryMessages] = useState<DeliveryMessage[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(true);

  const selectedIntegration = integrations.find(i => i.id === selectedIntegrationId) ?? null;
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) ?? null;

  // Wait until the org query resolves so isPlatformOwner is accurate before branching.
  useEffect(() => { if (!orgLoading) check(); }, [orgLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const check = async () => {
    setStep('checking');
    try {
      const [intList, tplList] = await Promise.all([
        api.delivery.listIntegrations(),
        api.delivery.listTemplates(),
      ]);

      const activeIntegrations = intList.filter(i => i.is_active && i.channel === 'email');
      let activeTemplates = tplList.filter(t => t.is_active && t.channel === 'email');

      setIntegrations(activeIntegrations);

      if (activeTemplates.length === 0) {
        // Parent owner is never blocked on "no template": inject a synthetic built-in
        // template. When selected, send with no template_id → backend uses its built-in
        // default. Other orgs still see the "create a template" prompt.
        if (isPlatformOwner) {
          activeTemplates = [BUILTIN_EMAIL_TEMPLATE];
        } else {
          setTemplates([]);
          setStep('no_template');
          return;
        }
      }

      setTemplates(activeTemplates);

      const defaultTpl = activeTemplates.find(t => t.is_default) ?? activeTemplates[0]!;
      setSelectedTemplateId(defaultTpl.id);

      if (activeIntegrations.length === 0) {
        // Parent owner can fall back to the Authentix default sender — no setup needed.
        // Everyone else must configure their own integration first.
        if (isPlatformOwner) {
          setUsePlatformDefault(true);
          setStep('select_template');
        } else {
          setStep('no_integration');
        }
        return;
      }

      const defaultInt = activeIntegrations.find(i => i.is_default) ?? activeIntegrations[0]!;
      setSelectedIntegrationId(defaultInt.id);
      setStep('select_template');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Failed to load configuration');
      setStep('error');
    }
  };

  const handleSend = async () => {
    if (!selectedTemplate) return;
    if (!usePlatformDefault && !selectedIntegration) return;
    setStep('sending');
    // Send emails for every cert-gen job ID (covers multi-template and multi-file batches).
    // Fall back to the primary jobId if allCertJobIds is empty or not provided.
    const jobIds = allCertJobIds && allCertJobIds.length > 0 ? allCertJobIds : [jobId];
    try {
      let totalSent = 0;
      let totalFailed = 0;
      const allMessages: Array<{ to_email?: string; status: string }> = [];
      for (const cjId of jobIds) {
        const result = await api.delivery.sendJobEmails({
          generation_job_id: cjId,
          integration_id: usePlatformDefault ? undefined : selectedIntegration!.id,
          // Built-in synthetic template → omit template_id so the backend uses its default.
          template_id: selectedTemplate.id === BUILTIN_TEMPLATE_ID ? undefined : selectedTemplate.id,
          subject_override: subjectOverride.trim() || undefined,
          from_name_override: fromNameOverride.trim() || undefined,
          use_platform_default: usePlatformDefault || undefined,
        });
        totalSent += result.sent;
        totalFailed += result.failed;
        if (result.messages) allMessages.push(...result.messages);
      }
      setSendResult({ sent: totalSent, failed: totalFailed });
      setStep('done');
      toast.success(`${totalSent} email${totalSent !== 1 ? 's' : ''} sent!`);
      if (onEmailSent) {
        const statuses: Record<string, string> = {};
        for (const m of allMessages) {
          if (m.to_email) statuses[m.to_email] = m.status;
        }
        onEmailSent(statuses);
      }
      // Fetch per-recipient delivery report for the primary job (best effort)
      try {
        const report = await api.delivery.listMessagesByJob(jobId);
        setDeliveryMessages(report.messages ?? []);
      } catch { /* silently ignore */ }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Failed to send emails');
      setStep('error');
    }
  };

  const handleTestSend = async () => {
    if (!testEmail.trim()) return;
    setTestSending(true);
    try {
      await api.delivery.testSend({
        test_email: testEmail.trim(),
        integration_id: usePlatformDefault ? undefined : (selectedIntegrationId || undefined),
        template_id: (selectedTemplateId && selectedTemplateId !== BUILTIN_TEMPLATE_ID) ? selectedTemplateId : undefined,
        subject_override: subjectOverride.trim() || undefined,
        from_name_override: fromNameOverride.trim() || undefined,
        use_platform_default: usePlatformDefault || undefined,
      });
      toast.success(`Test email sent to ${testEmail}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err.message ?? 'Test send failed');
    } finally {
      setTestSending(false);
    }
  };

  const effectiveFromName = fromNameOverride.trim() || selectedIntegration?.from_name || '';
  const effectiveSender = effectiveFromName
    ? `${effectiveFromName} <${selectedIntegration?.from_email ?? ''}>`
    : selectedIntegration?.from_email ?? '';

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className={previewTemplate ? "max-w-4xl p-0 gap-0 overflow-hidden" : step === 'select_template' ? "max-w-3xl" : "max-w-2xl"}>

        {/* ── Template preview panel ── */}
        {previewTemplate ? (
          <div className="flex flex-col h-[85vh]">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-b shrink-0">
              <button
                onClick={() => setPreviewTemplate(null)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <div className="w-px h-4 bg-border" />
              <Eye className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold truncate">{previewTemplate.name}</span>
                {previewTemplate.email_subject && (
                  <span className="text-xs text-muted-foreground ml-2 truncate">— {previewTemplate.email_subject}</span>
                )}
              </div>
            </div>

            {/* Body: email preview + sidebar */}
            <div className="flex flex-1 min-h-0">
              {/* Left: Gmail chrome + iframe */}
              <div className="flex-1 bg-muted/40 p-4 overflow-auto">
                <div className="max-w-[600px] mx-auto">
                  {/* Gmail-like header */}
                  <div className="bg-card border border-b-0 rounded-t-xl px-4 py-3 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0 mt-0.5">A</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold">Authentix</span>
                        <span className="text-xs text-muted-foreground">noreply@authentix.io</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{previewTemplate.email_subject ?? '(no subject)'}</p>
                    </div>
                  </div>
                  {/* Email iframe */}
                  <iframe
                    key={previewTemplate.id + (certPreviewUrl ?? '')}
                    srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;background:#fff;font-family:sans-serif;}img{max-width:100%;}*{box-sizing:border-box;}</style></head><body>${applyTemplatePreview(previewTemplate.body, buildPreviewVars(firstRecipientRow ?? null, certPreviewUrl ?? null, subcategoryName))}</body></html>`}
                    className="w-full border-x border-b rounded-b-xl bg-white"
                    style={{ minHeight: 480 }}
                    title="Email preview"
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>

              {/* Right: sidebar */}
              <div className="w-72 border-l flex flex-col overflow-auto shrink-0">
                {/* Cert thumbnail */}
                {certPreviewUrl && (
                  <div className="p-4 border-b">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Certificate Preview</p>
                    <img
                      src={certPreviewUrl}
                      alt="Generated certificate"
                      className="w-full rounded-lg border object-contain"
                      style={{ maxHeight: 160 }}
                    />
                  </div>
                )}

                {/* Variables */}
                <div className="p-4 border-b">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Variables Used</p>
                  {previewTemplate.variables.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No variables in this template.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {previewTemplate.variables.map(v => (
                        <span key={v} className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground border">
                          {`{{${v}}}`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="p-4 space-y-2 mt-auto">
                  <Button
                    className="w-full gap-2"
                    onClick={() => {
                      setSelectedTemplateId(previewTemplate.id);
                      setPreviewTemplate(null);
                    }}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Use This Template
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => {
                      try {
                        sessionStorage.setItem('pendingSendJob', JSON.stringify({
                          jobId,
                          recipientCount,
                          certPreviewUrl: certPreviewUrl ?? null,
                          certFieldHeaders: certFieldHeaders ?? [],
                        }));
                      } catch { /* storage unavailable */ }
                      router.push(orgPath(`/email-templates/${previewTemplate.id}?returnToSend=1`));
                    }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Edit This Template
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full gap-2 text-muted-foreground"
                    onClick={() => {
                      try {
                        sessionStorage.setItem('pendingSendJob', JSON.stringify({
                          jobId,
                          recipientCount,
                          certPreviewUrl: certPreviewUrl ?? null,
                          certFieldHeaders: certFieldHeaders ?? [],
                        }));
                      } catch { /* storage unavailable */ }
                      router.push(orgPath('/email-templates?returnToSend=1'));
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create New Template
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
        <>
        <DialogTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-primary" />
          {step === 'select_template' ? 'Choose Email Template' : step === 'no_integration' ? 'Set Up Email Sending' : 'Send via Email'}
        </DialogTitle>

        {/* Checking */}
        {step === 'checking' && (
          <div className="flex items-center gap-3 py-6 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin shrink-0" />
            <span>Checking email configuration…</span>
          </div>
        )}

        {/* No template */}
        {step === 'no_template' && (
          <div className="space-y-4">
            <Alert className="border-amber-500/30 bg-amber-500/5">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-sm text-amber-800">
                No active email template found. Create one to continue.
              </AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
              <Button
                className="flex-1 gap-2"
                onClick={() => {
                  try {
                    sessionStorage.setItem('pendingSendJob', JSON.stringify({
                      jobId,
                      recipientCount,
                      certPreviewUrl: certPreviewUrl ?? null,
                      certFieldHeaders: certFieldHeaders ?? [],
                    }));
                  } catch { /* storage unavailable */ }
                  router.push(orgPath('/email-templates?returnToSend=1'));
                }}
              >
                Create Template <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* No integration — non-owner orgs must connect their own email provider.
            (Platform owner never reaches this step: check() auto-uses the default sender.) */}
        {step === 'no_integration' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/30">
              <div className="p-2 rounded-md bg-primary/10 shrink-0">
                <Mail className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Connect your email to send certificates</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Certificates are sent from your own verified sender so recipients see your
                  organization&apos;s identity. Set up an email provider once — it takes a minute.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
              <Button
                className="flex-1 gap-2"
                onClick={() => {
                  try {
                    sessionStorage.setItem('pendingSendJob', JSON.stringify({
                      jobId,
                      recipientCount,
                      certPreviewUrl: certPreviewUrl ?? null,
                      certFieldHeaders: certFieldHeaders ?? [],
                    }));
                  } catch { /* storage unavailable */ }
                  router.push(orgPath('/settings/delivery'));
                }}
              >
                Set up email <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Template selection — Modal 1 */}
        {step === 'select_template' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Choose the email template your recipients will receive.</p>
            <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-0.5">
              {templates.map(t => {
                const isSelected = t.id === selectedTemplateId;
                return (
                  <div
                    key={t.id}
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onClick={() => setSelectedTemplateId(t.id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedTemplateId(t.id); }}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-border/60 hover:bg-muted/30'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
                      isSelected ? 'border-primary' : 'border-muted-foreground/40'
                    }`}>
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    </div>
                    <div className="w-48 h-32 rounded overflow-hidden border bg-white shrink-0 relative">
                      <iframe
                        srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;background:#fff;overflow:hidden;}*{box-sizing:border-box;}</style></head><body>${applyTemplatePreview(t.body, buildPreviewVars(null, null))}</body></html>`}
                        className="absolute top-0 left-0 border-0"
                        style={{ width: '560px', height: '375px', transform: 'scale(0.343)', transformOrigin: '0 0', pointerEvents: 'none' }}
                        title=""
                        sandbox="allow-same-origin"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">{t.name}</span>
                        {t.is_default && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">default</span>}
                      </div>
                      {t.email_subject && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{t.email_subject}</p>
                      )}
                      {t.variables.length > 0 && (
                        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                          {t.variables.slice(0, 3).map(v => (
                            <span key={v} className="text-[10px] bg-muted/70 border px-1.5 py-0.5 rounded font-mono text-muted-foreground">{`{{${v}}}`}</span>
                          ))}
                          {t.variables.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">+{t.variables.length - 3} more</span>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setPreviewTemplate(t); }}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                      title="Preview this template"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 pt-1">
              {/* Owners auto-use the default sender (no no_integration step), so just Cancel.
                  Non-owners with no integration came from the setup prompt — let them go Back. */}
              <Button variant="outline" onClick={(integrations.length === 0 && !isPlatformOwner) ? () => setStep('no_integration') : onClose} className="shrink-0 gap-1.5">
                {(integrations.length === 0 && !isPlatformOwner) ? <><ChevronLeft className="w-4 h-4" />Back</> : 'Cancel'}
              </Button>
              <Button
                onClick={() => setStep('confirm')}
                className="flex-1 gap-2"
                disabled={!selectedTemplateId}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Confirm — Modal 2 */}
        {step === 'confirm' && (usePlatformDefault || selectedIntegration) && selectedTemplate && (
          <div className="space-y-4">
            {/* Recipient count pill */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
              <span className="text-sm font-medium">Recipients</span>
              <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
                {recipientCount} {recipientCount === 1 ? 'person' : 'people'}
              </Badge>
            </div>

            {/* Integration selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Send From</Label>
              {isPlatformOwner ? (
                /* Parent owner: choose which email to send from — Authentix default + any own integrations. */
                <Select
                  value={usePlatformDefault ? '__platform__' : selectedIntegrationId}
                  onValueChange={(v) => {
                    if (v === '__platform__') { setUsePlatformDefault(true); }
                    else { setUsePlatformDefault(false); setSelectedIntegrationId(v); }
                  }}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Select sender…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__platform__">
                      <span className="flex items-center gap-2">
                        <span>Authentix Default</span>
                        <span className="text-xs text-muted-foreground">verified sender</span>
                      </span>
                    </SelectItem>
                    {integrations.map(i => (
                      <SelectItem key={i.id} value={i.id}>
                        <span className="flex items-center gap-2">
                          <span>{i.display_name}</span>
                          <span className="text-xs text-muted-foreground">{i.from_email}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : integrations.length === 1 ? (
                <div className="flex items-center gap-2 p-2.5 rounded-md border bg-muted/30 text-sm">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{effectiveSender || selectedIntegration?.from_email || integrations[0]?.from_email}</span>
                </div>
              ) : (
                <Select value={selectedIntegrationId} onValueChange={setSelectedIntegrationId}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Select integration…" />
                  </SelectTrigger>
                  <SelectContent>
                    {integrations.map(i => (
                      <SelectItem key={i.id} value={i.id}>
                        <span className="flex items-center gap-2">
                          <span>{i.display_name}</span>
                          <span className="text-xs text-muted-foreground">{i.from_email}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Selected template (read-only chip) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email Template</Label>
              <div className="flex items-center gap-2 p-2.5 rounded-md border bg-primary/5 border-primary/20">
                <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-sm font-medium flex-1 truncate">{selectedTemplate.name}</span>
                <button
                  type="button"
                  onClick={() => setStep('select_template')}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 shrink-0 transition-colors"
                >
                  Change
                </button>
              </div>
            </div>

            {/* Variable resolution warning — shown when template vars won't resolve for all recipients */}
            {(() => {
              const SYSTEM_VARS = new Set([
                'recipient_name', 'organization_name', 'issue_date',
                'verification_url', 'verification_url_encoded', 'certificate_image_url',
              ]);
              const normalizeKey = (k: string) => k.toLowerCase().replace(/\s+/g, '_');
              const csvKeys = new Set([
                ...(certFieldHeaders ?? []).map(normalizeKey),
                ...(certFieldHeaders ?? []),
              ]);
              const unresolved = (selectedTemplate.variables ?? []).filter(
                v => !SYSTEM_VARS.has(v) && !csvKeys.has(v),
              );
              if (unresolved.length === 0) return null;
              return (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/50">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Variables may not resolve</p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                      {unresolved.map(v => <code key={v} className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded mr-1">{`{{${v}}}`}</code>)}
                      {unresolved.length === 1 ? 'is' : 'are'} not in your CSV — {unresolved.length === 1 ? 'it' : 'they'} will appear literally in the email.
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Advanced overrides toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(v => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showAdvanced ? 'Hide' : 'Customize'} sender name & subject
            </button>

            {showAdvanced && (
              <div className="space-y-3 p-3 rounded-lg border bg-muted/20">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Sender Name Override</Label>
                  <Input
                    value={fromNameOverride}
                    onChange={e => setFromNameOverride(e.target.value)}
                    placeholder={selectedIntegration?.from_name ?? 'e.g. Authentix Academy'}
                    className="h-8 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Overrides "{selectedIntegration?.from_name || 'not set'}" for this send only.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Subject Override</Label>
                  <Input
                    value={subjectOverride}
                    onChange={e => setSubjectOverride(e.target.value)}
                    placeholder={selectedTemplate.email_subject ?? 'e.g. Your Certificate is Ready'}
                    className="h-8 text-sm font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Overrides the template subject. Supports <code className="bg-muted px-1 rounded">{`{{variables}}`}</code>.
                  </p>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Certificates will be attached as PNG images to each email.
            </p>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('select_template')} className="gap-1.5 shrink-0">
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>
              <Button onClick={() => setStep('test_email')} className="flex-1 gap-2">
                Continue
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Test email checkpoint */}
        {step === 'test_email' && (
          <div className="space-y-4">
            {/* Summary of what will be sent */}
            <div className="p-3 rounded-lg bg-muted/40 border space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                <span className="font-medium truncate">{selectedTemplate?.name}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground text-xs pl-6">
                <Mail className="w-3.5 h-3.5 shrink-0" />
                {usePlatformDefault ? 'Authentix Default Email' : (effectiveSender || selectedIntegration?.from_email || '—')}
                <span className="ml-auto font-medium text-foreground">{recipientCount} recipient{recipientCount !== 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* Test send */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Send yourself a test first</Label>
              <p className="text-xs text-muted-foreground">Preview exactly what recipients will see. Uses sample data — no certificate attached.</p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="h-9 text-sm flex-1"
                  onKeyDown={e => { if (e.key === 'Enter') handleTestSend(); }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTestSend}
                  disabled={testSending || !testEmail.trim()}
                  className="shrink-0 gap-1.5 h-9"
                >
                  {testSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Send Test
                </Button>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={() => setStep('confirm')} className="gap-1.5">
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>
              <Button onClick={handleSend} className="flex-1 gap-2">
                <Send className="w-4 h-4" />
                Send {recipientCount} Email{recipientCount !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        )}

        {/* Sending */}
        {step === 'sending' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Sending {recipientCount} email{recipientCount !== 1 ? 's' : ''}…</p>
          </div>
        )}

        {/* Done */}
        {step === 'done' && sendResult && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="p-3 rounded-full bg-green-500/10">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold">Emails sent!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {sendResult.sent} sent
                  {sendResult.failed > 0 && (
                    <span className="text-destructive"> · {sendResult.failed} failed</span>
                  )}
                </p>
              </div>
            </div>
            {sendResult.failed > 0 && (
              <Alert className="border-amber-500/30 bg-amber-500/5">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-sm text-amber-800">
                  {sendResult.failed} email{sendResult.failed !== 1 ? 's' : ''} failed to send. This may be due to invalid email addresses.
                </AlertDescription>
              </Alert>
            )}
            {/* Per-recipient delivery report */}
            {deliveryMessages.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Delivery Report</p>
                <div className="max-h-52 overflow-y-auto rounded-lg border text-xs">
                  <table className="w-full">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Recipient</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveryMessages.map(msg => (
                        <tr key={msg.id} className="border-t">
                          <td className="px-3 py-2 text-muted-foreground truncate max-w-40">{msg.to_email ?? '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium ${
                              msg.status === 'delivered' || msg.status === 'sent' || msg.status === 'read'
                                ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                                : msg.status === 'failed'
                                ? 'bg-destructive/10 text-destructive'
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              {msg.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground/70 max-w-40 truncate" title={msg.error_message ?? undefined}>
                            {msg.error_message ? (
                              <span className="text-destructive/80">{msg.error_message.slice(0, 60)}{msg.error_message.length > 60 ? '…' : ''}</span>
                            ) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <Button className="w-full" onClick={onClose}>Done</Button>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1">Close</Button>
              <Button onClick={check} className="flex-1">Retry</Button>
            </div>
          </div>
        )}
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Certificate preview card ────────────────────────────────────────────────────

function CertPreviewCard({
  cert,
  isImageTemplate: _isImageTemplate,
  emailStatus,
}: {
  cert: GeneratedCertificate;
  isImageTemplate: boolean;
  emailStatus?: string;
}) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!cert.download_url) return;
    setDownloading(true);
    try {
      const res = await fetch(cert.download_url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${cert.certificate_number}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch { /* silent */ }
    setDownloading(false);
  };

  return (
    <div className="group border rounded-xl overflow-hidden bg-card hover:shadow-md transition-shadow">
      {/* Thumbnail */}
      <div className="aspect-[4/3] bg-muted/40 relative overflow-hidden">
        {cert.preview_url ? (
          <img
            src={cert.preview_url}
            alt={cert.recipient_name}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FileCheck className="w-10 h-10 text-muted-foreground/30" />
          </div>
        )}
        {/* Hover action overlay */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
          {cert.preview_url && (
            <button
              className="h-9 w-9 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center transition"
              onClick={() => window.open(cert.preview_url!, '_blank')}
              title="View full size"
            >
              <Eye className="w-4 h-4 text-white" />
            </button>
          )}
          {cert.download_url && (
            <button
              className="h-9 w-9 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center transition disabled:opacity-50"
              onClick={handleDownload}
              disabled={downloading}
              title="Download PNG"
            >
              {downloading
                ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                : <Download className="w-4 h-4 text-white" />}
            </button>
          )}
        </div>
      </div>

      {/* Info row */}
      <div className="px-3 py-2.5 space-y-0.5">
        <p className="text-sm font-medium leading-tight truncate">{cert.recipient_name}</p>
        <p className="text-xs text-muted-foreground font-mono truncate">{cert.certificate_number}</p>
        {emailStatus && (
          <div className="pt-1">
            {(emailStatus === 'sent' || emailStatus === 'delivered') && (
              <span className="inline-flex items-center gap-1 text-xs text-green-600">
                <CheckCircle2 className="w-3 h-3" />
                {emailStatus === 'delivered' ? 'Delivered' : 'Sent'}
              </span>
            )}
            {emailStatus === 'queued' && (
              <span className="text-xs text-muted-foreground">Email queued</span>
            )}
            {emailStatus === 'failed' && (
              <span className="text-xs text-destructive">Email failed</span>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      {(cert.preview_url || cert.download_url) && (
        <div className="px-3 pb-3 flex gap-1.5">
          {cert.preview_url && (
            <button
              className="flex-1 text-xs py-1.5 rounded-lg border hover:bg-muted/50 transition flex items-center justify-center gap-1"
              onClick={() => window.open(cert.preview_url!, '_blank')}
            >
              <Eye className="w-3 h-3" />
              View
            </button>
          )}
          {cert.download_url && (
            <button
              className="flex-1 text-xs py-1.5 rounded-lg border hover:bg-muted/50 transition flex items-center justify-center gap-1 disabled:opacity-50"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Download className="w-3 h-3" />}
              PNG
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Download link expiry helpers ──────────────────────────────────────────────

const CERT_DOWNLOAD_TTL_MS = 7 * 24 * 60 * 60 * 1000; // mirrors backend SIGNED_URL_TTL.CERT_DOWNLOAD

function linkExpiryStatus(expiresAt: Date | null): 'ok' | 'soon' | 'expired' {
  if (!expiresAt) return 'ok';
  const ms = expiresAt.getTime() - Date.now();
  if (ms <= 0) return 'expired';
  if (ms < 3 * 24 * 60 * 60 * 1000) return 'soon'; // <3 days
  return 'ok';
}

function formatLinkExpiry(expiresAt: Date | null): string | null {
  if (!expiresAt) return null;
  const ms = expiresAt.getTime() - Date.now();
  if (ms <= 0) return 'Link expired';
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `Expires in ${days} day${days !== 1 ? 's' : ''}`;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 1) return `Expires in ${hours} hour${hours !== 1 ? 's' : ''}`;
  return 'Expires very soon';
}

// ── Certificate number format helpers ─────────────────────────────────────────

function derivePrefixFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'ORG';
  const first = words[0]!.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!first) return 'ORG';
  return words.length === 1 ? first.slice(0, 5) : first.slice(0, 3);
}

function previewCertNumber(prefix: string, format: string, seq = 1): string {
  return format
    .replace('{prefix}', prefix || 'ORG')
    .replace(/{seq:(\d+)}/g, (_, n) => String(seq).padStart(Number(n), '0'));
}

interface CertFormatPattern {
  id: string;
  label: string;
  prefix: (derived: string) => string;
  format: string;
}

function getCertFormatPatterns(derivedPrefix: string): CertFormatPattern[] {
  return [
    { id: 'p1', label: `${derivedPrefix}-000001`, prefix: () => derivedPrefix, format: '{prefix}-{seq:6}' },
    { id: 'p2', label: `${derivedPrefix}-0001`, prefix: () => derivedPrefix, format: '{prefix}-{seq:4}' },
    { id: 'p3', label: `CERT-000001`, prefix: () => 'CERT', format: '{prefix}-{seq:6}' },
    { id: 'p4', label: `${derivedPrefix}000001`, prefix: () => derivedPrefix, format: '{prefix}{seq:6}' },
    { id: 'p5', label: `${derivedPrefix}-001`, prefix: () => derivedPrefix, format: '{prefix}-{seq:3}' },
  ];
}

// ── Smart date picker ─────────────────────────────────────────────────────────
// Fully custom — no react-day-picker. Always 42 cells (6×7), fixed height.
// Header: month + year <select> on the left, ← → arrows on the right.
interface SmartCalendarProps {
  selected?: Date;
  onSelect: (d: Date | undefined) => void;
  defaultMonth?: Date;
  fromYear: number;
  toYear: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function SmartCalendar({ selected, onSelect, defaultMonth, fromYear, toYear }: SmartCalendarProps) {
  const today = new Date();
  const initial = defaultMonth ?? selected ?? today;
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const goToPrev = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const goToNext = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  // Build 42-cell grid: leading prev-month, current month, trailing next-month
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevMonthTotal = new Date(viewYear, viewMonth, 0).getDate();
  const cells: { date: Date; outOfMonth: boolean }[] = [];
  for (let i = firstDow - 1; i >= 0; i--) {
    cells.push({ date: new Date(viewYear, viewMonth - 1, prevMonthTotal - i), outOfMonth: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(viewYear, viewMonth, d), outOfMonth: false });
  }
  let next = 1;
  while (cells.length < 42) {
    cells.push({ date: new Date(viewYear, viewMonth + 1, next++), outOfMonth: true });
  }

  const years = Array.from({ length: toYear - fromYear + 1 }, (_, i) => fromYear + i);
  const atStart = viewYear === fromYear && viewMonth === 0;
  const atEnd = viewYear === toYear && viewMonth === 11;

  return (
    <div className="p-3 select-none" style={{ width: 272 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-0.5">
          <select
            value={viewMonth}
            onChange={e => setViewMonth(Number(e.target.value))}
            className="text-sm font-semibold bg-transparent border-none outline-none cursor-pointer rounded px-0.5 hover:bg-muted transition-colors"
          >
            {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select
            value={viewYear}
            onChange={e => setViewYear(Number(e.target.value))}
            className="text-sm font-semibold bg-transparent border-none outline-none cursor-pointer rounded px-0.5 hover:bg-muted transition-colors"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={goToPrev}
            disabled={atStart}
            className="size-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={goToNext}
            disabled={atEnd}
            className="size-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Day-of-week labels */}
      <div className="grid grid-cols-7 mb-0.5">
        {DOW_LABELS.map(d => (
          <div key={d} className="h-7 flex items-center justify-center text-[11px] font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Date grid — always 42 cells so height never shifts */}
      <div className="grid grid-cols-7">
        {cells.map(({ date, outOfMonth }, i) => {
          const isSel = !!selected && isSameDay(date, selected);
          const isToday = isSameDay(date, today);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(date)}
              className={[
                'h-8 w-full flex items-center justify-center text-[13px] rounded-full transition-colors',
                isSel
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : isToday
                  ? 'ring-1 ring-primary text-primary font-medium hover:bg-primary/10'
                  : outOfMonth
                  ? 'text-muted-foreground/25 hover:bg-muted'
                  : 'text-foreground hover:bg-muted',
              ].join(' ')}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Smooth count-up hook ───────────────────────────────────────────────────────

function useCountUp(target: number, duration = 400): number {
  const [displayed, setDisplayed] = useState(target);
  const prev = useRef(target);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const start = prev.current;
    const diff = target - start;
    if (diff === 0) return;
    const t0 = performance.now();
    const tick = (now: number) => {
      const pct = Math.min((now - t0) / duration, 1);
      const ease = 1 - Math.pow(1 - pct, 3);
      setDisplayed(Math.round(start + diff * ease));
      if (pct < 1) rafRef.current = requestAnimationFrame(tick);
      else { setDisplayed(target); prev.current = target; }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);
  return displayed;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ExportSection({
  template,
  fields,
  importedData,
  fieldMappings,
  subcategoryName,
  savedTemplates = [],
  additionalConfigs = [],
  onAdditionalConfigsChange,
  onFieldMappingsChange,
  additionalRows,
  onTrackEvent,
}: ExportSectionProps) {
  const { orgPath } = useOrg();
  const { addJob } = useJobNotifications();
  const { organization } = useOrganization();

  // ── Cert number format ──
  const derivedPrefix = derivePrefixFromName(organization?.name ?? 'ORG');

  // Lazy initializers read from React Query cache synchronously on mount (org is typically
  // already cached from page.tsx's useOrganization call). This prevents the flash where
  // pills first render as "ORG-000001" then jump to the real prefix after the effect fires.
  const [certFmtPatternId, setCertFmtPatternId] = useState<string>(() => {
    if (!organization) return 'p1';
    const p = organization.certificate_prefix ?? 'ORG';
    const f = organization.certificate_number_format ?? '{prefix}-{seq:6}';
    const dp = derivePrefixFromName(organization.name ?? 'ORG');
    return getCertFormatPatterns(dp).find(pt => pt.prefix(dp) === p && pt.format === f)?.id ?? 'custom';
  });
  const [certFmtCustomPrefix, setCertFmtCustomPrefix] = useState<string>(() =>
    organization?.certificate_prefix ?? ''
  );
  const [certFmtCustomFormat, setCertFmtCustomFormat] = useState<string>(() =>
    organization?.certificate_number_format ?? '{prefix}-{seq:6}'
  );
  const [certFmtSaving, setCertFmtSaving] = useState(false);

  // Keep in sync if org data arrives after mount (edge case: direct URL navigation to step 4).
  // useLayoutEffect fires before paint, so the correct value is visible on first frame.
  useLayoutEffect(() => {
    if (!organization) return;
    const p = organization.certificate_prefix ?? 'ORG';
    const f = organization.certificate_number_format ?? '{prefix}-{seq:6}';
    const patterns = getCertFormatPatterns(derivedPrefix);
    const match = patterns.find(pt => pt.prefix(derivedPrefix) === p && pt.format === f);
    if (match) {
      setCertFmtPatternId(match.id);
    } else {
      setCertFmtPatternId('custom');
      setCertFmtCustomPrefix(p);
      setCertFmtCustomFormat(f);
    }
  }, [organization?.certificate_prefix, organization?.certificate_number_format]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCertFmtSelect = async (patternId: string) => {
    setCertFmtPatternId(patternId);
    const patterns = getCertFormatPatterns(derivedPrefix);
    const pt = patterns.find(p => p.id === patternId);
    if (!pt) return;
    setCertFmtSaving(true);
    try {
      await api.organizations.update({
        certificate_prefix: pt.prefix(derivedPrefix),
        certificate_number_format: pt.format,
      });
    } catch { /* non-fatal, user can retry */ }
    setCertFmtSaving(false);
  };

  const handleCertFmtCustomSave = async () => {
    const prefix = certFmtCustomPrefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (!prefix || !certFmtCustomFormat.trim()) return;
    setCertFmtSaving(true);
    try {
      await api.organizations.update({
        certificate_prefix: prefix,
        certificate_number_format: certFmtCustomFormat.trim(),
      });
    } catch { /* non-fatal */ }
    setCertFmtSaving(false);
  };

  // Current active prefix/format (for preview)
  const activeCertPatterns = getCertFormatPatterns(derivedPrefix);
  const activePt = activeCertPatterns.find(p => p.id === certFmtPatternId);
  const activePrefix = activePt ? activePt.prefix(derivedPrefix) : (certFmtCustomPrefix || 'ORG');
  const activeFormat = activePt ? activePt.format : (certFmtCustomFormat || '{prefix}-{seq:6}');

  // 'hidden' = idle, 'generating' = submitting, 'queued' = job sent to background, 'success' = done
  const [overlayState, setOverlayState] = useState<'hidden' | 'generating' | 'queued' | 'success'>('hidden');
  const [, setProgress] = useState(0);
  const [, setProgressLabel] = useState('');
  const [simulatedCount, setSimulatedCount] = useState(0);
  const [generationStatus, setGenerationStatus] = useState<'idle' | 'generating' | 'completed' | 'error'>('idle');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewImageLoaded, setPreviewImageLoaded] = useState(false);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, setStatusMsgIndex] = useState(0);
  const isMountedRef = useRef(true);
  useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; }; }, []);

  // Escape key dismisses a stuck generating overlay (job submitted but polling hangs)
  useEffect(() => {
    if (overlayState !== 'generating') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (progressTimerRef.current) { clearInterval(progressTimerRef.current); progressTimerRef.current = null; }
        setOverlayState('hidden');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlayState]);

  // Cycle through encouraging status messages while generating
  const STATUS_MESSAGES = [
    'Processing your data…',
    'Laying out certificate fields…',
    'Applying fonts and styles…',
    'Embedding verification seals…',
    'Packaging your certificates…',
    'Almost there…',
  ];
  useEffect(() => {
    if (overlayState !== 'generating') { setStatusMsgIndex(0); return; }
    const id = setInterval(() => setStatusMsgIndex(i => (i + 1) % STATUS_MESSAGES.length), 3500);
    return () => clearInterval(id);
  }, [overlayState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Declared here so the polling effect below can reference it before other state declarations.
  const [generationJobId, setGenerationJobId] = useState<string | null>(null);

  // Shared handler — processes a job row update from Realtime or an initial fetch.
  // Called for both the primary job and any extra jobs.
  type JobRow = {
    status: string;
    result: unknown;
    error: string | null;
    completed_at: string | null;
  };

  const handlePrimaryJobRow = useCallback((row: JobRow) => {
    if (!isMountedRef.current) return;

    if (row.status === 'completed') {
      if (progressTimerRef.current) { clearInterval(progressTimerRef.current); progressTimerRef.current = null; }
      const result = row.result as Record<string, unknown> | null;
      const total = (result?.total_certificates as number | undefined) ?? 0;
      type ResultEntry = {
        label: string; count: number; download_url: string | null; job_id: string | null;
        certificates?: Array<{
          id: string; certificate_number: string; recipient_name: string;
          recipient_email: string | null; issued_at: string; expires_at: string | null;
          download_url: string | null; preview_url: string | null; recipient_id?: string | null;
        }>;
      };
      const resultsArr = result?.results as ResultEntry[] | undefined;
      const url = (result?.last_download_url as string | null | undefined) ?? resultsArr?.[0]?.download_url ?? null;
      const allCerts: GeneratedCertificate[] = [];
      const summary: Array<{ label: string; count: number }> = [];
      for (const r of resultsArr ?? []) {
        if (r.label) summary.push({ label: r.label, count: r.count });
        for (const c of r.certificates ?? []) {
          allCerts.push({
            id: c.id, certificate_number: c.certificate_number,
            recipient_name: c.recipient_name, recipient_email: c.recipient_email,
            issued_at: c.issued_at, expires_at: c.expires_at,
            download_url: c.download_url, preview_url: c.preview_url,
            recipient_id: c.recipient_id ?? null,
          });
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const certJobIds = (resultsArr ?? []).map((r: any) => r.job_id as string | null | undefined).filter((id): id is string => !!id);
      if (certJobIds.length > 0) {
        setCertGenJobId(certJobIds[0]!);
        setAllCertJobIds(prev => Array.from(new Set([...prev, ...certJobIds])));
      } else {
        const firstJobId = result?.first_job_id as string | null | undefined;
        if (firstJobId) {
          setCertGenJobId(prev => prev ?? firstJobId);
          setAllCertJobIds(prev => prev.includes(firstJobId) ? prev : [...prev, firstJobId]);
        }
      }
      setTotalGenerated(prev => prev + total);
      setDownloadUrl(url ?? null);
      if (row.completed_at) {
        setDownloadExpiresAt(new Date(new Date(row.completed_at).getTime() + CERT_DOWNLOAD_TTL_MS));
      }
      setGeneratedCertificates(allCerts);
      if (summary.length > 0) setGenerationSummary(summary);
      setGenerationStatus('completed');
      setProgress(100);
      onTrackEvent?.('generation_completed', { template_id: template?.id, total_generated: total });
      setOverlayState(prev => prev !== 'hidden' ? 'success' : 'hidden');
      return;
    }

    if (row.status === 'failed') {
      if (progressTimerRef.current) { clearInterval(progressTimerRef.current); progressTimerRef.current = null; }
      setGenerationError(row.error ?? 'Certificate generation failed. Please try again.');
      setGenerationStatus('error');
      setOverlayState('hidden');
      return;
    }

    // In-progress: update real progress bar and accumulate batch certs as they stream in
    const rawResult = row.result as Record<string, unknown> | null | undefined;
    const processedSoFar = rawResult?.processed_so_far as number | undefined;
    const progressTotal = rawResult?.total as number | undefined;
    if (processedSoFar !== undefined && progressTotal !== undefined && progressTotal > 0) {
      if (progressTimerRef.current) { clearInterval(progressTimerRef.current); progressTimerRef.current = null; }
      setProgress(Math.min(Math.round((processedSoFar / progressTotal) * 100), 98));
      setSimulatedCount(processedSoFar);
    }
    // Stream certs into the grid as each render batch completes — no need to wait for the full job
    type BatchCert = { id: string; certificate_number: string; recipient_name: string; recipient_email: string | null; issued_at: string; expires_at: string | null; download_url: string | null; preview_url: string | null; recipient_id?: string | null };
    const batchCerts = rawResult?.batch_certs as BatchCert[] | undefined;
    if (batchCerts?.length) {
      setGeneratedCertificates(prev => {
        const existingIds = new Set(prev.map(c => c.id));
        const newCerts = batchCerts
          .filter(c => !existingIds.has(c.id))
          .map(c => ({
            id: c.id,
            certificate_number: c.certificate_number,
            recipient_name: c.recipient_name,
            recipient_email: c.recipient_email ?? null,
            issued_at: c.issued_at,
            expires_at: c.expires_at ?? null,
            download_url: c.download_url,
            preview_url: c.preview_url ?? null,
            recipient_id: c.recipient_id ?? null,
          }));
        return newCerts.length ? [...prev, ...newCerts] : prev;
      });
    }
  }, [onTrackEvent, template?.id]);

  // Subscribe to Realtime updates for the primary generation job.
  // Listens on BOTH broadcast (fast — DB trigger fires immediately) and
  // postgres_changes (fallback — survives if broadcast trigger is absent).
  // Initial fetch catches jobs that finished before subscribe() fires.
  useEffect(() => {
    if (!generationJobId) return;

    let active = true;
    const supabase = createSupabaseBrowserClient();

    // One-shot initial check — catches jobs that already finished before subscribe() fires
    api.certificates.pollJobStatus(generationJobId).then(status => {
      if (!active) return;
      if (status.status === 'completed' || status.status === 'failed') {
        handlePrimaryJobRow(status);
      }
    }).catch(() => { /* ignore — realtime will still deliver updates */ });

    const channel = supabase
      .channel(`bg-job:${generationJobId}-${Date.now()}`)
      // Broadcast path: DB trigger fires realtime.broadcast_changes() → instant delivery
      .on('broadcast', { event: 'UPDATE' }, (payload) => {
        if (!active) return;
        const row = (payload as { payload?: { record?: JobRow } }).payload?.record;
        if (row) handlePrimaryJobRow(row);
      })
      // postgres_changes fallback: replication-slot path, slightly delayed
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'background_jobs', filter: `id=eq.${generationJobId}` },
        (payload) => {
          if (!active) return;
          handlePrimaryJobRow(payload.new as JobRow);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [generationJobId, handlePrimaryJobRow]);

  // Expiry settings
  const [expiryType, setExpiryType] = useState<ExpiryType>('year');
  const [customExpiryDate, setCustomExpiryDate] = useState<string>('');
  const [issueDate, setIssueDate] = useState<string>('');
  const [useCustomIssueDate, setUseCustomIssueDate] = useState(false);
  const [expiryPickerOpen, setExpiryPickerOpen] = useState(false);
  const [issueDatePickerOpen, setIssueDatePickerOpen] = useState(false);

  // Generated certificates
  const [generatedCertificates, setGeneratedCertificates] = useState<GeneratedCertificate[]>([]);
  const [totalGenerated, setTotalGenerated] = useState(0);
  const [generationSummary, setGenerationSummary] = useState<Array<{ label: string; count: number }>>([]);
  const [displayCount, setDisplayCount] = useState(0);

  // Animate the count up when success overlay appears
  useEffect(() => {
    if (overlayState !== 'success' || totalGenerated === 0) { setDisplayCount(0); return; }
    setDisplayCount(0);
    const duration = Math.min(1200, totalGenerated * 60);
    const steps = Math.min(totalGenerated, 30);
    const stepMs = duration / steps;
    let current = 0;
    const id = setInterval(() => {
      current = Math.min(current + Math.ceil(totalGenerated / steps), totalGenerated);
      setDisplayCount(current);
      if (current >= totalGenerated) clearInterval(id);
    }, stepMs);
    return () => clearInterval(id);
  }, [overlayState, totalGenerated]);

  // Send via Email modal
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [emailStatuses, setEmailStatuses] = useState<Record<string, string> | undefined>(undefined);
  // certificate_generation_jobs.id (different from background_jobs.id = generationJobId)
  const [certGenJobId, setCertGenJobId] = useState<string | null>(null);
  // All cert-gen job IDs collected from every background job result (multi-template × multi-file)
  const [allCertJobIds, setAllCertJobIds] = useState<string[]>([]);
  // Background job IDs for import files 2+ (file 1 is tracked by generationJobId)
  const [extraGenerationJobIds, setExtraGenerationJobIds] = useState<string[]>([]);

  // Download link expiry — derived from completed_at + 7-day TTL
  const [downloadExpiresAt, setDownloadExpiresAt] = useState<Date | null>(null);
  const [isRefreshingLink, setIsRefreshingLink] = useState(false);

  // Per-recipient failure tracking
  type FailedRecipient = { recipient_id: string | null; recipient_name: string; recipient_email: string | null; error: string; index: number };
  const [failedRecipients, setFailedRecipients] = useState<FailedRecipient[]>([]);
  const [failedPanelOpen, setFailedPanelOpen] = useState(false);
  const [isRetryingFailed, setIsRetryingFailed] = useState(false);

  // Subscribe to Realtime updates for extra background jobs (files 2+).
  // These don't drive the overlay but we need their cert-gen job IDs for email send.
  useEffect(() => {
    if (extraGenerationJobIds.length === 0) return;

    const supabase = createSupabaseBrowserClient();
    let active = true;

    const handleExtraJobRow = (ejId: string, row: JobRow) => {
      if (!active || !isMountedRef.current) return;
      if (row.status === 'completed') {
        const result = row.result as Record<string, unknown> | null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resultsArr = result?.results as Array<any> | undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const certJobIds = (resultsArr ?? []).map((r: any) => r.job_id as string | null | undefined).filter((id): id is string => !!id);
        if (certJobIds.length > 0) {
          setAllCertJobIds(prev => Array.from(new Set([...prev, ...certJobIds])));
        } else {
          const fallback = result?.first_job_id as string | null | undefined;
          if (fallback) setAllCertJobIds(prev => prev.includes(fallback) ? prev : [...prev, fallback]);
        }
        const extraTotal = (result?.total_certificates as number | undefined) ?? 0;
        if (extraTotal > 0) setTotalGenerated(prev => prev + extraTotal);
      }
      void ejId; // used only for channel naming
    };

    const channels = extraGenerationJobIds.map(ejId => {
      // Initial check for jobs that may have finished before subscription
      api.certificates.pollJobStatus(ejId).then(status => {
        if (!active) return;
        if (status.status === 'completed' || status.status === 'failed') {
          handleExtraJobRow(ejId, status);
        }
      }).catch(() => {});

      return supabase
        .channel(`bg-job-extra:${ejId}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'background_jobs', filter: `id=eq.${ejId}` },
          (payload) => handleExtraJobRow(ejId, payload.new as JobRow),
        )
        .subscribe();
    });

    return () => {
      active = false;
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [extraGenerationJobIds]);

  // Email setup pre-check (soft warning before generating)
  const [emailSetup, setEmailSetup] = useState<{ hasTemplate: boolean; hasIntegration: boolean } | null>(null);
  const [emailBannerDismissed, setEmailBannerDismissed] = useState(false);
  useEffect(() => {
    Promise.all([api.delivery.listTemplates(), api.delivery.listIntegrations()])
      .then(([tplList, intList]) => {
        const hasTemplate = tplList.some(t => t.is_active && t.channel === 'email');
        // Platform default is always available as sender, so integration is never truly "missing"
        const hasIntegration = intList.some(i => i.is_active && i.channel === 'email') || true;
        setEmailSetup({ hasTemplate, hasIntegration });
      })
      .catch(() => { /* silently ignore */ });
  }, []);

  // Restore send modal state when returning from email template editor
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('pendingSendJob');
      if (!raw) return;
      const pending = JSON.parse(raw) as { jobId: string; recipientCount: number; certPreviewUrl: string | null };
      sessionStorage.removeItem('pendingSendJob');
      setGenerationJobId(pending.jobId);
      setTotalGenerated(pending.recipientCount);
      setGenerationStatus('completed');
      setSendModalOpen(true);
    } catch { /* storage unavailable or malformed */ }
   
  }, []);

  // Template picker for adding extra configs
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [loadingTemplateId, setLoadingTemplateId] = useState<string | null>(null);

  const hasQrCodeField = fields.some(f => f.type === 'qr_code');
  // Non-data field types that never need a CSV mapping
  const NON_MAPPABLE = new Set(['qr_code', 'custom_text', 'image']);
  const mappableFields = fields.filter(f => !NON_MAPPABLE.has(f.type));
  // Only recipient name is truly required — everything else is optional (leaves blank if unmapped)
  const nameField = fields.find(f => f.type === 'name');
  const nameFieldMapped = !nameField || fieldMappings.some(m => m.fieldId === nameField.id);
  // Also verify mapped column names actually exist in the uploaded headers (catches stale mappings)
  const allMappedColumnsValid = !importedData || fieldMappings
    .filter(m => m.columnName)
    .every(m => importedData.headers.includes(m.columnName));
  // Additional configs: only require their name field mapped
  const allAdditionalConfigsMapped = additionalConfigs.every(cfg => {
    const cfgNameField = cfg.fields.find(f => f.type === 'name');
    return !cfgNameField || cfg.fieldMappings.some(m => m.fieldId === cfgNameField.id);
  });
  const canGenerate = !!(template && importedData && template.id && nameFieldMapped && allMappedColumnsValid && allAdditionalConfigsMapped);

  // All configs including the primary one (for unified rendering)
  const allConfigs: CertificateConfig[] = [
    {
      key: '__primary__',
      template: template!,
      fields,
      fieldMappings,
      label: template?.templateName || 'Certificate',
    },
    ...additionalConfigs,
  ];

  // Display count: count configs with any template present (id may be set async for new uploads).
  // Generation uses the stricter `c.template?.id` filter so the API call always has a valid id.
  const activeConfigCount = allConfigs.filter(c => c.template != null).length;

  const liveCount = Math.max(simulatedCount, generatedCertificates.length);
  const animCount = useCountUp(liveCount, 350);

  const estimatedTime = canGenerate && importedData
    ? estimateGenerationTime(importedData.rowCount, allConfigs.filter(c => c.template?.id))
    : '';

  // ── Add a template as extra config ────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleAddTemplate = async (savedTemplate: any, existingConfigs?: CertificateConfig[]) => {
    setLoadingTemplateId(savedTemplate.id);
    try {
      const editorData = await api.templates.getEditorData(savedTemplate.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const templateFields: CertificateField[] = (editorData?.fields ?? []).map((f: any) => ({
        id: f.id || f.field_key,
        type: f.type === 'qrcode' ? 'qr_code' : f.type === 'date' ? 'start_date' : 'custom_text',
        label: f.label,
        x: f.x, y: f.y, width: f.width || 200, height: f.height || 30,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fontSize: (f.style as any)?.fontSize || 16,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fontFamily: (f.style as any)?.fontFamily || 'DM Sans',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        color: (f.style as any)?.color || '#000000',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fontWeight: (f.style as any)?.fontWeight || '400',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fontStyle: (f.style as any)?.fontStyle || 'normal',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        textAlign: (f.style as any)?.textAlign || 'left',
      }));

      // Step 1: auto-detect from headers + value inference
      const rawMappings = autoMapForTemplate(templateFields, importedData?.headers ?? [], importedData?.rows);
      const autoMappedIds = new Set(rawMappings.map(m => m.fieldId));
      const headers = importedData?.headers ?? [];

      // Step 2: inherit primary config's confirmed mappings for unmapped fields.
      // Uses shouldPropagate: name type is universal, content types only inherit when labels match.
      const enhanced = [...rawMappings];
      for (const f of templateFields) {
        if (autoMappedIds.has(f.id)) continue;
        const primaryField = fields.find(pf => shouldPropagate(pf, f));
        const primaryCol = primaryField
          ? fieldMappings.find(m => m.fieldId === primaryField.id)?.columnName
          : undefined;
        if (primaryCol && headers.includes(primaryCol)) {
          enhanced.push({ fieldId: f.id, columnName: primaryCol });
        }
      }

      const currentConfigs = existingConfigs ?? additionalConfigs;
      const newConfig: CertificateConfig = {
        key: crypto.randomUUID(),
        template: {
          id: savedTemplate.id,
          templateName: savedTemplate.title || savedTemplate.name,
          fileUrl: savedTemplate.preview_url || '',
          
          templateWidth: savedTemplate.width || 800,
          templateHeight: savedTemplate.height || 600,
          fields: templateFields,
        },
        fields: templateFields,
        fieldMappings: enhanced,
        label: savedTemplate.title || savedTemplate.name || `Certificate ${currentConfigs.length + 2}`,
      };

      // Return the new config for multi-add; caller manages onAdditionalConfigsChange
      return newConfig;
    } catch (err) {
      console.error('Failed to load template fields:', err);
      return null;
    } finally {
      setLoadingTemplateId(null);
    }
  };

  // Handle adding multiple selected templates at once
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());
  const [isAddingMultiple, setIsAddingMultiple] = useState(false);

  const handleAddSelectedTemplates = async () => {
    const ids = [...selectedTemplateIds];
    if (ids.length === 0) return;
    setIsAddingMultiple(true);
    try {
      let currentConfigs = additionalConfigs;
      const newConfigs: CertificateConfig[] = [];
      for (const id of ids) {
        const t = savedTemplates.find(st => st.id === id);
        if (!t) continue;
        const newConfig = await handleAddTemplate(t, [...currentConfigs, ...newConfigs]);
        if (newConfig) newConfigs.push(newConfig);
      }
      if (newConfigs.length > 0) {
        onAdditionalConfigsChange?.([...additionalConfigs, ...newConfigs]);
      }
      setSelectedTemplateIds(new Set());
      setShowTemplatePicker(false);
    } finally {
      setIsAddingMultiple(false);
    }
  };

  // Push primary config's field mappings to all other configs (only fills unmapped fields).
  // Uses shouldPropagate: name type propagates universally; content types only when labels match.
  const handleSyncAllMappings = () => {
    const headers = importedData?.headers ?? [];
    const newAdditional = additionalConfigs.map(cfg => {
      const newMappings = [...cfg.fieldMappings];
      for (const f of cfg.fields) {
        if (newMappings.find(m => m.fieldId === f.id)?.columnName) continue; // already mapped
        const primaryField = fields.find(pf => shouldPropagate(pf, f));
        const primaryCol = primaryField
          ? fieldMappings.find(m => m.fieldId === primaryField.id)?.columnName
          : undefined;
        if (primaryCol && headers.includes(primaryCol)) {
          const idx = newMappings.findIndex(m => m.fieldId === f.id);
          if (idx >= 0) newMappings[idx] = { ...newMappings[idx]!, columnName: primaryCol };
          else newMappings.push({ fieldId: f.id, columnName: primaryCol });
        }
      }
      return { ...cfg, fieldMappings: newMappings };
    });
    onAdditionalConfigsChange?.(newAdditional);
  };

  const handleRemoveConfig = (key: string) => {
    onAdditionalConfigsChange?.(additionalConfigs.filter(c => c.key !== key));
  };

  // Unified mapping change handler — updates the source config and auto-fills the same
  // field *type* in all other configs that don't yet have that type mapped.
  const handleMappingChange = (sourceConfigKey: string, fieldId: string, col: string) => {
    const applyMapping = (mappings: FieldMapping[], fId: string, column: string): FieldMapping[] =>
      mappings.find(m => m.fieldId === fId)
        ? mappings.map(m => m.fieldId === fId ? { ...m, columnName: column } : m)
        : [...mappings, { fieldId: fId, columnName: column }];

    const sourceField = allConfigs.find(c => c.key === sourceConfigKey)?.fields.find(f => f.id === fieldId);

    // Primary config: direct update or propagation
    const newPrimary = sourceConfigKey === '__primary__'
      ? applyMapping(fieldMappings, fieldId, col)
      : (() => {
          if (!sourceField) return fieldMappings;
          const target = allConfigs[0]?.fields.find(
            f => shouldPropagate(sourceField, f) && !fieldMappings.find(m => m.fieldId === f.id)?.columnName,
          );
          return target ? applyMapping(fieldMappings, target.id, col) : fieldMappings;
        })();
    onFieldMappingsChange?.(newPrimary);

    // Additional configs: direct update for source, propagate to others using shouldPropagate
    const newAdditional = additionalConfigs.map(cfg => {
      if (cfg.key === sourceConfigKey) {
        return { ...cfg, fieldMappings: applyMapping(cfg.fieldMappings, fieldId, col) };
      }
      if (!sourceField) return cfg;
      const target = cfg.fields.find(
        f => shouldPropagate(sourceField, f) && !cfg.fieldMappings.find(m => m.fieldId === f.id)?.columnName,
      );
      return target
        ? { ...cfg, fieldMappings: applyMapping(cfg.fieldMappings, target.id, col) }
        : cfg;
    });
    onAdditionalConfigsChange?.(newAdditional);
  };

  // ── Preview first row ────────────────────────────────────────────────────────
  // Uses the lightweight /preview-render endpoint: no DB writes, no storage uploads.
  // Returns data URLs directly — typical round-trip ~2s vs ~10s for full generation.
  const handlePreviewFirstRow = async () => {
    if (!template?.id || !importedData?.rows.length) return;
    setIsPreviewing(true);
    try {
      const rowData = importedData.rows[0]!;
      const configsToPreview = allConfigs.filter(c => c.template?.id);
      const dataUrls: string[] = [];

      for (const cfg of configsToPreview) {
        const result = await api.certificates.previewRender({
          template_id: cfg.template.id!,
          row_data: rowData,
          field_mappings: cfg.fieldMappings,
          options: { includeQR: hasQrCodeField },
        });
        if (result.data_url) dataUrls.push(result.data_url);
      }

      if (dataUrls.length > 0) {
        setPreviewUrls(dataUrls);
        setPreviewIndex(0);
        setPreviewImageLoaded(false);
        setPreviewModalOpen(true);
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error('Preview generation failed:', err);
      toast.error(err?.message ?? 'Preview failed — check your field mappings and try again');
    } finally {
      setIsPreviewing(false);
    }
  };

  // ── Generate ────────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!template || !importedData || !template.id) return;

    // Validate before showing overlay — validation failure must not leave overlay stuck
    if (expiryType === 'custom' && customExpiryDate) {
      if (new Date(customExpiryDate) <= new Date()) {
        toast.error('Expiry date must be in the future');
        return;
      }
    }

    // Pre-generation preflight: check required field mappings and data quality
    const nameField = fields.find(f => f.type === 'name');
    const nameMapped = nameField ? fieldMappings.some(m => m.fieldId === nameField.id) : false;
    if (nameField && !nameMapped) {
      toast.error('Map the recipient name field before generating', {
        description: 'Go to the Data step and map a column to the name field.',
      });
      return;
    }

    // Warn about invalid emails in inline data (backend will null them out — surface it early)
    if (importedData.rows && importedData.rows.length > 0) {
      const EMAIL_RE = /^[^\s@"(),:;<>[\]\\]+@[^\s@"(),:;<>[\]\\]+\.[^\s@"(),:;<>[\]\\]{2,}$/;
      const emailCol = importedData.headers.find(h => h.toLowerCase() === 'email' || h.toLowerCase() === 'e-mail');
      if (emailCol) {
        const invalidEmailCount = importedData.rows.filter(row => {
          const v = String(row[emailCol] ?? '').trim();
          return v && (v.length > 320 || !EMAIL_RE.test(v));
        }).length;
        if (invalidEmailCount > 0) {
          toast.warning(`${invalidEmailCount} row${invalidEmailCount !== 1 ? 's have' : ' has'} an invalid email address`, {
            description: 'Those recipients will have no email — they won\'t receive certificate emails.',
          });
          // Non-blocking: continue generation, backend will null out invalid emails
        }
      }
    }

    setOverlayState('generating');
    setGenerationStatus('generating');
    setGenerationError(null);
    setProgress(0);
    setSimulatedCount(0);
    setProgressLabel('');
    setGeneratedCertificates([]);
    setTotalGenerated(0);
    setGenerationSummary([]);
    // Clear stale cert-gen job IDs from any previous run
    setCertGenJobId(null);
    setAllCertJobIds([]);
    setExtraGenerationJobIds([]);

    const options: {
      includeQR: boolean;
      expiry_type: ExpiryType;
      custom_expiry_date?: string;
      issue_date?: string;
    } = {
      includeQR: hasQrCodeField,
      expiry_type: expiryType,
    };
    if (expiryType === 'custom' && customExpiryDate) {
      options.custom_expiry_date = new Date(customExpiryDate).toISOString();
    }
    if (useCustomIssueDate && issueDate) {
      options.issue_date = new Date(issueDate).toISOString();
    }

    const configsToRun = allConfigs.filter(c => c.template?.id);
    const totalRows = importedData.rowCount;

    setProgressLabel(`Generating ${totalRows} certificate${totalRows !== 1 ? 's' : ''}…`);

    // Starter pulse: creeps to 3% while waiting for the job to be accepted by the
    // worker.  Cleared as soon as the first real processed_so_far value arrives
    // via the polling loop — real progress always takes over.
    let elapsed = 0;
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    progressTimerRef.current = setInterval(() => {
      elapsed += 300;
      setProgress(Math.min(3, Math.round((elapsed / 10000) * 3)));
    }, 300);

    try {
      // Submit — returns 202 immediately with job_id
      // For multiple uploaded files, submit one batch job per import ID
      const importIds = importedData.importIds && importedData.importIds.length > 1
        ? importedData.importIds
        : importedData.importId
        ? [importedData.importId]
        : null;

      const configDefs = configsToRun.map(cfg => ({
        template_id: cfg.template.id!,
        field_mappings: cfg.fieldMappings,
        label: cfg.label,
      }));

      const { firstJobId, restJobIds } = await (async () => {
        if (importIds) {
          const allJobIds: string[] = [];
          for (let i = 0; i < importIds.length; i++) {
            const batchParams = {
              import_id: importIds[i]!,
              ...(additionalRows && additionalRows.length > 0 ? { additional_rows: additionalRows } : {}),
              options,
              configs: configDefs,
            };
            const { job_id } = await api.certificates.batchGenerate(batchParams);
            const fileLabel = importIds.length > 1
              ? `File ${i + 1}/${importIds.length}: ${Math.round(totalRows / importIds.length)} certs`
              : `${totalRows} certificate${totalRows !== 1 ? 's' : ''} — ${configsToRun[0]?.label ?? ''}`;
            addJob(job_id, fileLabel);
            allJobIds.push(job_id);
          }
          return { firstJobId: allJobIds[0]!, restJobIds: allJobIds.slice(1) };
        }
        // Inline data fallback
        const { job_id } = await api.certificates.batchGenerate({
          data: importedData.rows,
          options,
          configs: configDefs,
        });
        addJob(job_id, `${totalRows} certificate${totalRows !== 1 ? 's' : ''} — ${configsToRun[0]?.label ?? ''}`);
        return { firstJobId: job_id, restJobIds: [] as string[] };
      })();

      setGenerationJobId(firstJobId);
      if (restJobIds.length > 0) setExtraGenerationJobIds(restJobIds);
      onTrackEvent?.('generation_started', {
        template_id: template?.id,
        row_count: totalRows,
        config_count: configsToRun.length,
        has_qr: hasQrCodeField,
      });
      // Progress timer keeps running through polling — cleared only on completion or error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (progressTimerRef.current) { clearInterval(progressTimerRef.current); progressTimerRef.current = null; }
      if (!isMountedRef.current) return;
      // Show the error so the user knows the submission failed and can retry
      const msg = err?.message || 'Failed to submit generation job. Please try again.';
      setGenerationError(msg);
      setGenerationStatus('error');
      setOverlayState('hidden');
    }
  };

  const handleRefreshDownload = async () => {
    if (!certGenJobId || isRefreshingLink) return;
    setIsRefreshingLink(true);
    try {
      const { download_url, expires_at } = await api.certificates.refreshDownloadLink(certGenJobId);
      setDownloadUrl(download_url);
      setDownloadExpiresAt(new Date(expires_at));
      toast.success('Download link refreshed — valid for 7 more days');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to refresh download link');
    } finally {
      setIsRefreshingLink(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!downloadUrl || isDownloadingZip) return;
    setIsDownloadingZip(true);
    try {
      await downloadFileFromUrl(downloadUrl, 'certificates.zip');
    } catch {
      toast.error('ZIP download failed — please try again');
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // Fetch per-recipient failure details once the cert gen job ID is known and job is complete
  useEffect(() => {
    if (!certGenJobId || generationStatus !== 'completed') return;
    let cancelled = false;
    api.certificates.listJobRecipients(certGenJobId).then(result => {
      if (!cancelled && result.failed_count > 0) setFailedRecipients(result.failed_recipients);
    }).catch(() => { /* non-fatal — failure list is a bonus */ });
    return () => { cancelled = true; };
  }, [certGenJobId, generationStatus]);

  const handleRetryFailed = async () => {
    if (!certGenJobId || isRetryingFailed) return;
    setIsRetryingFailed(true);
    try {
      const result = await api.certificates.retryFailedRecipients(certGenJobId);
      setFailedPanelOpen(false);
      setFailedRecipients([]);
      // Wire the new job into the existing polling infrastructure
      setGenerationJobId(result.job_id);
      setGenerationStatus('generating');
      setOverlayState('generating');
      toast.success(`Retrying ${result.retry_count} failed recipient${result.retry_count !== 1 ? 's' : ''}…`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to start retry job');
    } finally {
      setIsRetryingFailed(false);
    }
  };

  const handleExpiryChange = (type: ExpiryType, customDate?: string) => {
    setExpiryType(type);
    if (customDate !== undefined) setCustomExpiryDate(customDate);
  };

  const unmappedFields = mappableFields.filter(f => !fieldMappings.find(m => m.fieldId === f.id));

  // ── Render ──────────────────────────────────────────────────────────────────

  // Full-screen generation overlay
  if (overlayState !== 'hidden') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background select-none overflow-hidden">

        {/* Dark-mode subtle glow */}
        <div className="absolute inset-0 pointer-events-none hidden dark:block" aria-hidden style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 30%, rgba(62,207,142,0.05) 0%, transparent 70%)' }} />

        {/* Cancel button — only during 'generating'; press Escape or click to dismiss */}
        {overlayState === 'generating' && (
          <button
            onClick={() => {
              if (progressTimerRef.current) { clearInterval(progressTimerRef.current); progressTimerRef.current = null; }
              setOverlayState('hidden');
            }}
            className="absolute top-5 right-5 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors z-10"
            title="Cancel (Esc)"
          >
            <X style={{ width: 18, height: 18 }} />
          </button>
        )}
        <style>{`
          @keyframes genZoomIn    { from{opacity:0;transform:scale(0.6)} to{opacity:1;transform:scale(1)} }
          @keyframes genRipple    { 0%{transform:scale(1);opacity:0.7} 100%{transform:scale(3);opacity:0} }
          @keyframes genFadeSlide { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
          @keyframes genFadeUp    { from{opacity:0;transform:translateY(16px) scale(0.95)} to{opacity:1;transform:translateY(0) scale(1)} }
          @keyframes genCountPop  { 0%{transform:scale(0.6);opacity:0} 60%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }
          @keyframes genMsgFade   { from{opacity:0;transform:translateY(4px)} to{opacity:0.6;transform:translateY(0)} }
          @keyframes shimmer      { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        `}</style>

        {/* Bottom CTA — while generating animation plays */}
        {overlayState === 'generating' && generationJobId && (
          <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-3 z-10" style={{ animation: 'genFadeSlide 0.4s ease-out 1s both' }}>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Want to keep working? Run this in the background.
            </p>
            <button
              onClick={() => {
                if (progressTimerRef.current) { clearInterval(progressTimerRef.current); progressTimerRef.current = null; }
                setOverlayState('queued');
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-white/10"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.5)',
              }}
            >
              <Bell style={{ width: 14, height: 14 }} />
              Run in background
            </button>
          </div>
        )}

        <div className="relative z-10 flex flex-col items-center gap-10">
          {overlayState === 'success' ? (
            /* ── Success ── */
            <div className="flex flex-col items-center gap-8">
              {/* Celebration animation */}
              <div style={{ animation: 'genZoomIn 0.6s cubic-bezier(0.34,1.56,0.64,1) both', width: 300, height: 300 }}>
                <Lottie
                  animationData={generatedNewAnimationData}
                  loop={false}
                  autoplay
                  style={{ width: 300, height: 300 }}
                  rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
                />
              </div>

              {/* Text with count-up */}
              <div className="text-center space-y-3" style={{ animation: 'genFadeUp 0.5s ease-out 0.3s both' }}>
                <p className="font-black tracking-tight" style={{ fontSize: 40, lineHeight: 1, animation: 'genCountPop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.15s both' }}>
                  <CheckCircle2 className="inline-block mr-2 mb-0.5" style={{ width: 34, height: 34, color: '#3ECF8E', verticalAlign: 'middle' }} />All set!
                </p>
                <p className="text-muted-foreground" style={{ fontSize: 17 }}>
                  <span style={{ color: '#3ECF8E', fontWeight: 800, fontSize: 22 }}>{displayCount}</span>
                  {' '}certificate{totalGenerated !== 1 ? 's' : ''} generated
                </p>
                {generationSummary.length > 1 && (
                  <div className="flex flex-wrap justify-center gap-2 mt-1">
                    {generationSummary.map((s, i) => (
                      <span key={i} className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'rgba(62,207,142,0.12)', color: '#3ECF8E', border: '1px solid rgba(62,207,142,0.3)' }}>
                        {s.label}: {s.count}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Failed recipients chip */}
              {failedRecipients.length > 0 && (
                <button
                  onClick={() => setFailedPanelOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
                  style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: 'rgba(252,165,165,1)', animation: 'genFadeUp 0.4s ease-out 0.5s both' }}
                >
                  <AlertCircle style={{ width: 14, height: 14 }} />
                  {failedRecipients.length} failed — view &amp; retry
                </button>
              )}

              {/* CTAs */}
              <div className="flex items-start gap-3" style={{ animation: 'genFadeUp 0.5s ease-out 0.55s both' }}>
                {downloadUrl && (() => {
                  const expiry = linkExpiryStatus(downloadExpiresAt);
                  return (
                    <div className="flex flex-col items-center gap-1">
                      {expiry === 'expired' ? (
                        <button
                          onClick={handleRefreshDownload}
                          disabled={isRefreshingLink}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm opacity-60 hover:opacity-80 transition-opacity"
                          style={{ background: '#3ECF8E', color: '#000' }}
                        >
                          {isRefreshingLink ? <Loader2 style={{ width: 15, height: 15 }} className="animate-spin" /> : <Download style={{ width: 15, height: 15 }} />}
                          {isRefreshingLink ? 'Refreshing…' : 'Regenerate Link'}
                        </button>
                      ) : (
                        <button
                          onClick={handleDownloadZip}
                          disabled={isDownloadingZip}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm"
                          style={{ background: '#3ECF8E', color: '#000' }}
                        >
                          {isDownloadingZip
                            ? <Loader2 style={{ width: 15, height: 15 }} className="animate-spin" />
                            : <Download style={{ width: 15, height: 15 }} />}
                          {isDownloadingZip ? 'Downloading…' : 'Download All'}
                        </button>
                      )}
                      {downloadExpiresAt && (
                        <span className="text-xs tabular-nums" style={{ color: expiry === 'expired' ? 'rgba(251,191,36,0.7)' : expiry === 'soon' ? 'rgba(251,191,36,0.55)' : 'rgba(255,255,255,0.3)' }}>
                          {formatLinkExpiry(downloadExpiresAt)}
                        </span>
                      )}
                    </div>
                  );
                })()}
                <button
                  onClick={() => setOverlayState('hidden')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all hover:bg-white/10"
                  style={{
                    background: 'rgba(62,207,142,0.12)',
                    border: '1.5px solid rgba(62,207,142,0.45)',
                    color: '#3ECF8E',
                  }}
                >
                  View Results
                  <ArrowRight style={{ width: 15, height: 15 }} />
                </button>
              </div>
            </div>
          ) : overlayState === 'queued' ? (
            /* ── Running in background ── */
            <div className="flex flex-col items-center gap-8" style={{ animation: 'genFadeSlide 0.4s ease-out both' }}>
              {/* Icon */}
              <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
                <div className="absolute w-36 h-36 rounded-full" style={{ border: '2px solid rgba(62,207,142,0.25)', animation: 'genRipple 2s ease-out infinite' }} />
                <div className="absolute w-36 h-36 rounded-full" style={{ border: '1.5px solid rgba(62,207,142,0.15)', animation: 'genRipple 2s ease-out 0.6s infinite' }} />
                <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{
                  background: 'rgba(62,207,142,0.1)',
                  border: '2px solid rgba(62,207,142,0.5)',
                  boxShadow: '0 0 24px rgba(62,207,142,0.2)',
                }}>
                  <Bell style={{ width: 36, height: 36, color: '#3ECF8E' }} />
                </div>
              </div>

              {/* Text */}
              <div className="text-center space-y-2">
                <p className="text-3xl font-bold">Generating in background</p>
                <p className="text-base text-muted-foreground max-w-sm">
                  You&apos;re free to keep working. We&apos;ll notify you via the bell when your certificates are ready.
                </p>
              </div>

              {/* CTA */}
              <button
                onClick={() => setOverlayState('hidden')}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all"
                style={{
                  background: 'rgba(62,207,142,0.15)',
                  border: '1.5px solid rgba(62,207,142,0.5)',
                  color: '#3ECF8E',
                }}
              >
                Continue Working
                <ArrowRight style={{ width: 16, height: 16 }} />
              </button>
            </div>
          ) : (
            /* ── Generating animation ── */
            (() => {
              const totalExpected = (importedData?.rowCount ?? 0) * Math.max(activeConfigCount, 1);
              return (
                <>
                  {/* Center column */}
                  <div
                    className="flex flex-col items-center gap-8 relative"
                    style={{ zIndex: 1, animation: 'genFadeSlide 0.3s ease-out both' }}
                  >
                    {/* Generation animation — landscape (800x200 source, 4:1) */}
                    <Lottie
                      animationData={finalGenerationAnimationData as object}
                      loop autoplay
                      style={{ width: 560, height: 140 }}
                      rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
                    />

                    {/* Big counter */}
                    <div className="flex flex-col items-center gap-2" style={{ animation: 'genFadeSlide 0.4s ease-out 0.1s both' }}>
                      <div className="flex items-baseline" style={{ gap: 10 }}>
                        <span
                          className="tabular-nums font-black"
                          style={{ fontSize: 96, lineHeight: 1, color: '#3ECF8E', letterSpacing: '-5px', fontVariantNumeric: 'tabular-nums', textShadow: '0 0 28px rgba(62,207,142,0.45)' }}
                        >
                          {animCount}
                        </span>
                        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 28, fontWeight: 300, letterSpacing: 0 }}>
                          of
                        </span>
                        <span
                          className="tabular-nums font-semibold"
                          style={{ fontSize: 52, lineHeight: 1, color: 'rgba(255,255,255,0.35)', letterSpacing: '-2px' }}
                        >
                          {totalExpected || '…'}
                        </span>
                      </div>

                      <p
                        className="uppercase tracking-widest text-xs font-semibold"
                        style={{ color: 'rgba(255,255,255,0.28)', letterSpacing: '0.22em' }}
                      >
                        certificates generated
                      </p>

                      {/* Thin progress line — no numbers, pure visual */}
                      <div style={{ width: 260, height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', marginTop: 6 }}>
                        <div style={{
                          height: '100%',
                          width: `${totalExpected > 0 ? Math.min((liveCount / totalExpected) * 100, 100) : 4}%`,
                          background: 'linear-gradient(90deg, #3ECF8E, #6EE7B7)',
                          borderRadius: 1,
                          transition: 'width 400ms ease',
                          boxShadow: '0 0 6px rgba(62,207,142,0.45)',
                          minWidth: 6,
                        }} />
                      </div>
                    </div>
                  </div>
                </>
              );
            })()
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Results — success header + certificate preview grid */}
      {generationStatus === 'completed' && (
        <div className="space-y-4">
          {/* Success / zero-result header */}
          {totalGenerated === 0 ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800">Generation completed with 0 certificates</p>
                <p className="text-xs text-amber-700 mt-0.5">No certificates were created. Check that your data file has valid rows and try again.</p>
              </div>
              <button
                className="text-amber-700/60 hover:text-amber-700 transition-colors text-xs underline shrink-0"
                onClick={() => { setGenerationStatus('idle'); setTotalGenerated(0); setDownloadUrl(null); setGenerationJobId(null); setCertGenJobId(null); }}
              >
                Dismiss
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-[#3ECF8E]/30 bg-[#3ECF8E]/5 px-4 py-3 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#3ECF8E] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  {totalGenerated} certificate{totalGenerated !== 1 ? 's' : ''} generated successfully
                </p>
                {generationSummary.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {generationSummary.map((s, i) => (
                      <Badge key={i} variant="outline" className="text-xs gap-1">
                        <FileText className="w-3 h-3" />
                        {s.label}: {s.count}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Failed recipients banner — shown in results view after overlay is dismissed */}
          {failedRecipients.length > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-600">
                  {failedRecipients.length} recipient{failedRecipients.length !== 1 ? 's' : ''} failed
                </p>
                <p className="text-xs text-red-500/80 mt-0.5">
                  {failedRecipients.length !== 1 ? 'These recipients were' : 'This recipient was'} not issued a certificate due to an error.
                </p>
              </div>
              <Button size="sm" variant="outline" className="shrink-0 border-red-500/40 text-red-600 hover:bg-red-50 text-xs" onClick={() => setFailedPanelOpen(true)}>
                View &amp; Retry
              </Button>
            </div>
          )}

          {/* Certificate preview cards */}
          {generatedCertificates.length > 0 ? (
            <>
              {/* Download ZIP strip — shown when ZIP is available alongside individual cards */}
              {downloadUrl && (
                <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/30 border">
                  <FileArchive className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Download all as ZIP</p>
                    {downloadExpiresAt && (
                      <p className="text-[11px]" style={{ color: linkExpiryStatus(downloadExpiresAt) === 'ok' ? undefined : '#f59e0b' }}>
                        {formatLinkExpiry(downloadExpiresAt)}
                      </p>
                    )}
                  </div>
                  {linkExpiryStatus(downloadExpiresAt) === 'expired' ? (
                    <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs" onClick={handleRefreshDownload} disabled={isRefreshingLink}>
                      {isRefreshingLink ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                      {isRefreshingLink ? 'Refreshing…' : 'Regenerate link'}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs gap-1" onClick={handleDownloadZip} disabled={isDownloadingZip}>
                      {isDownloadingZip ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} ZIP
                    </Button>
                  )}
                </div>
              )}
              <div className="max-h-[420px] overflow-y-auto pr-1">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {generatedCertificates.map((cert) => (
                    <CertPreviewCard
                      key={cert.id}
                      cert={cert}
                      isImageTemplate={true}
                      emailStatus={cert.recipient_email ? emailStatuses?.[cert.recipient_email] : undefined}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : totalGenerated > 0 && (
            /* Backend didn't return individual cert data — show download prompt */
            <div className="rounded-lg border bg-muted/20 p-6 text-center space-y-3">
              <FileCheck className="w-8 h-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {totalGenerated} certificate{totalGenerated !== 1 ? 's' : ''} are ready.
              </p>
              {downloadUrl && (
                <div className="flex flex-col items-center gap-1">
                  {linkExpiryStatus(downloadExpiresAt) === 'expired' ? (
                    <>
                      <p className="text-xs text-amber-600 dark:text-amber-400">Download link expired</p>
                      <Button size="sm" variant="outline" onClick={handleRefreshDownload} disabled={isRefreshingLink} className="gap-1.5">
                        {isRefreshingLink ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                        {isRefreshingLink ? 'Refreshing…' : 'Regenerate download link'}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={handleDownloadZip} disabled={isDownloadingZip}>
                        {isDownloadingZip ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} Download ZIP
                      </Button>
                      {downloadExpiresAt && (
                        <p className="text-[11px] text-muted-foreground">{formatLinkExpiry(downloadExpiresAt)}</p>
                      )}
                    </>
                  )}
                </div>
              )}
              <Link href={orgPath('/certificates')} className="text-xs text-primary underline underline-offset-2 block">
                View in Certificates →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Settings — hidden after completion */}
      {generationStatus !== 'completed' && (
        <div className="space-y-8">
          {/* ── Stats hero ── */}
          {importedData && (
            <div className="rounded-2xl bg-gradient-to-br from-muted/60 to-muted/20 border border-border/50 p-5 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-3">Ready to generate</p>
              <div className="flex items-center justify-center gap-2 text-4xl font-black tabular-nums tracking-tight">
                <div className="flex flex-col items-center gap-0.5">
                  <span>{importedData.rowCount}</span>
                  <span className="text-[9px] font-normal text-muted-foreground/50 uppercase tracking-wide">recipients</span>
                </div>
                <span className="text-muted-foreground/40 text-2xl font-light pb-3">×</span>
                <div className="flex flex-col items-center gap-0.5">
                  <span>{activeConfigCount}</span>
                  <span className="text-[9px] font-normal text-muted-foreground/50 uppercase tracking-wide">templates</span>
                </div>
                <span className="text-muted-foreground/40 text-2xl font-light pb-3">=</span>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-primary">{importedData.rowCount * activeConfigCount}</span>
                  <span className="text-[9px] font-normal text-primary/50 uppercase tracking-wide">certificates</span>
                </div>
              </div>
              {hasQrCodeField && <p className="text-[11px] text-green-600 dark:text-green-400 font-medium mt-2">QR codes included</p>}
              {estimatedTime && overlayState === 'hidden' && (() => {
                const rowCount = importedData.rowCount;
                const CHUNK = 50;
                const chunksPerTemplate = Math.ceil(rowCount / CHUNK);
                const totalChunks = chunksPerTemplate * activeConfigCount;
                const isMultiTemplate = activeConfigCount > 1;
                const showBreakdown = rowCount > CHUNK;
                return (
                  <p className="text-[11px] text-muted-foreground/60 mt-2">
                    Est.{' '}
                    <span className="font-medium text-muted-foreground">{estimatedTime}</span>
                    {showBreakdown && (
                      <>
                        {' · '}runs in background
                        <span className="relative group inline-block ml-1 align-middle cursor-help">
                          <Info className="w-3 h-3 text-muted-foreground/40 inline" />
                          <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover:flex w-72 flex-col gap-1.5 rounded-lg bg-gray-900 px-3 py-2.5 text-left text-xs text-white shadow-xl">
                            <strong className="text-white/90">Why does this take so long?</strong>
                            <span className="text-white/70 leading-relaxed">Background job runs once per minute and processes <strong className="text-white/90">up to 50 per run</strong>.</span>
                            <span className="text-white/60 font-mono text-[10px] bg-white/5 rounded px-2 py-1">
                              {rowCount.toLocaleString()} recipients ÷ {CHUNK}/run = {chunksPerTemplate} runs{isMultiTemplate && <> × {activeConfigCount} templates</>} = ~{totalChunks} min
                            </span>
                            <span className="text-white/50">You can close this page — you&apos;ll get a notification when it&apos;s done.</span>
                          </span>
                        </span>
                      </>
                    )}
                  </p>
                );
              })()}
            </div>
          )}

          {/* ── Certificate templates ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Certificate Templates</p>
              <div className="flex items-center gap-2">
                {additionalConfigs.length > 0 && fieldMappings.some(m => m.columnName) && (
                  <button
                    title="Fill unmapped fields in all templates using primary config's mappings"
                    onClick={handleSyncAllMappings}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Sync all
                  </button>
                )}
                <span className="text-[10px] text-muted-foreground/50">{activeConfigCount} selected</span>
              </div>
            </div>

            {template && (
              <ConfigRow
                config={allConfigs[0]!}
                importedData={importedData}
                index={0}
                onRemove={() => {}}
                onMappingChange={(fieldId, col) => handleMappingChange('__primary__', fieldId, col)}
              />
            )}

            {additionalConfigs.map((cfg, idx) => (
              <ConfigRow
                key={cfg.key}
                config={cfg}
                importedData={importedData}
                index={idx + 1}
                onRemove={() => handleRemoveConfig(cfg.key)}
                onMappingChange={(fieldId, col) => handleMappingChange(cfg.key, fieldId, col)}
              />
            ))}

            {showTemplatePicker ? (
              <div className="rounded-xl border border-border/60 p-3 space-y-2.5 bg-muted/20">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">
                    {selectedTemplateIds.size > 0
                      ? `${selectedTemplateIds.size} selected`
                      : 'Add certificate templates'}
                  </p>
                  <button className="text-muted-foreground hover:text-foreground" onClick={() => { setShowTemplatePicker(false); setSelectedTemplateIds(new Set()); }}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {(() => {
                  const available = savedTemplates.filter(t => t.id && t.id !== template?.id && !additionalConfigs.find(c => c.template.id === t.id));
                  if (available.length === 0) {
                    return <p className="text-xs text-muted-foreground">No other saved templates found.</p>;
                  }
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-1.5 max-h-52 overflow-y-auto">
                        {available.map(t => {
                          const checked = selectedTemplateIds.has(t.id);
                          const isLoading = loadingTemplateId === t.id;
                          return (
                            <button
                              key={t.id}
                              disabled={isLoading || isAddingMultiple}
                              onClick={() => setSelectedTemplateIds(prev => {
                                const next = new Set(prev);
                                next.has(t.id) ? next.delete(t.id) : next.add(t.id);
                                return next;
                              })}
                              className={`flex items-center gap-2 p-2 text-left rounded-lg border transition-colors text-xs ${
                                checked
                                  ? 'border-primary/50 bg-primary/8 text-foreground'
                                  : 'border-border/50 hover:bg-muted/50 text-foreground/80'
                              }`}
                            >
                              {isLoading
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                : <div className={`w-3.5 h-3.5 rounded shrink-0 border flex items-center justify-center transition-colors ${checked ? 'bg-primary border-primary' : 'border-border'}`}>
                                    {checked && <CheckCircle2 className="w-2.5 h-2.5 text-primary-foreground" />}
                                  </div>}
                              <span className="truncate">{t.title || t.name}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-2 pt-0.5">
                        <button
                          disabled={selectedTemplateIds.size === 0 || isAddingMultiple}
                          onClick={handleAddSelectedTemplates}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
                        >
                          {isAddingMultiple
                            ? <><Loader2 className="w-3 h-3 animate-spin" />Adding…</>
                            : <><Plus className="w-3 h-3" />Add {selectedTemplateIds.size > 0 ? selectedTemplateIds.size : ''} template{selectedTemplateIds.size !== 1 ? 's' : ''}</>}
                        </button>
                        {selectedTemplateIds.size > 0 && (
                          <button
                            onClick={() => setSelectedTemplateIds(new Set())}
                            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <button
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-xs text-muted-foreground hover:text-primary"
                onClick={() => setShowTemplatePicker(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                Add another certificate type
              </button>
            )}
          </div>

          {/* ── Cert number format ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Certificate Number</p>
              <span className="font-mono text-[10px] text-muted-foreground/50">{previewCertNumber(activePrefix, activeFormat, 1)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {getCertFormatPatterns(derivedPrefix).map(pt => (
                <button
                  key={pt.id}
                  onClick={() => handleCertFmtSelect(pt.id)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-all font-mono ${
                    certFmtPatternId === pt.id
                      ? 'bg-foreground text-background border-transparent font-semibold'
                      : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                  }`}
                >
                  {pt.label}
                </button>
              ))}
              <button
                onClick={() => setCertFmtPatternId('custom')}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                  certFmtPatternId === 'custom'
                    ? 'bg-foreground text-background border-transparent font-semibold'
                    : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                }`}
              >
                Custom…
              </button>
              {certFmtSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground self-center" />}
            </div>
            {certFmtPatternId === 'custom' && (
              <div className="rounded-xl border border-border/60 p-3 space-y-3 bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  Build your own format. <span className="font-mono text-foreground/70">{'{prefix}'}</span> is your short code (e.g. <span className="font-mono text-foreground/70">XEN</span>), and <span className="font-mono text-foreground/70">{'{seq:6}'}</span> is a zero-padded counter — the number sets how many digits wide it is.
                </p>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <p className="text-[10px] font-medium text-muted-foreground mb-1">Short code <span className="font-normal opacity-60">(letters/numbers, max 8)</span></p>
                    <Input
                      value={certFmtCustomPrefix}
                      onChange={e => setCertFmtCustomPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                      placeholder="XEN"
                      className="h-7 text-xs font-mono"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-medium text-muted-foreground mb-1">Format <span className="font-normal opacity-60">({'{prefix}'} + {'{seq:N}'})</span></p>
                    <Input
                      value={certFmtCustomFormat}
                      onChange={e => setCertFmtCustomFormat(e.target.value)}
                      placeholder="{prefix}-{seq:6}"
                      className="h-7 text-xs font-mono"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-0.5">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Preview</p>
                    <span className="font-mono text-sm font-semibold">
                      {previewCertNumber(certFmtCustomPrefix || 'ORG', certFmtCustomFormat || '{prefix}-{seq:6}', 1)}
                    </span>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs px-3" onClick={handleCertFmtCustomSave} disabled={certFmtSaving}>
                    {certFmtSaving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}Save format
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Expiry & Issue Date ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-0.5">Expiry & Issue Date</p>
            <div className="rounded-xl border border-border/60 overflow-hidden divide-y divide-border/40">

              {/* Expiry row */}
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="text-[11px] text-muted-foreground shrink-0 w-10">Expiry</span>
                <div className="flex flex-wrap gap-1.5">
                  {(['never', 'year', '5_years', 'month'] as ExpiryType[]).map(value => {
                    const labels: Record<string, string> = { never: 'Never', year: '1 Year', '5_years': '5 Years', month: '1 Month' };
                    return (
                      <button key={value} onClick={() => handleExpiryChange(value)}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-all ${expiryType === value ? 'bg-foreground text-background border-transparent font-semibold' : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'}`}>
                        {labels[value]}
                      </button>
                    );
                  })}
                  {/* Custom chip — doubles as the calendar trigger; date shows on the chip */}
                  <Popover open={expiryPickerOpen} onOpenChange={setExpiryPickerOpen} modal={true}>
                    <PopoverTrigger asChild>
                      <button
                        onClick={() => handleExpiryChange('custom')}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-all flex items-center gap-1 ${expiryType === 'custom' ? 'bg-foreground text-background border-transparent font-semibold' : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'}`}
                      >
                        <Calendar className="w-3 h-3 opacity-70" />
                        {expiryType === 'custom' && customExpiryDate && isValid(new Date(customExpiryDate))
                          ? format(new Date(customExpiryDate), 'MMM d, yyyy')
                          : 'Custom…'}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start" sideOffset={8}>
                      <SmartCalendar
                        selected={customExpiryDate && isValid(new Date(customExpiryDate)) ? new Date(customExpiryDate) : undefined}
                        defaultMonth={customExpiryDate && isValid(new Date(customExpiryDate)) ? new Date(customExpiryDate) : undefined}
                        onSelect={d => { handleExpiryChange('custom', d ? format(d, 'yyyy-MM-dd') : ''); setExpiryPickerOpen(false); }}
                        fromYear={new Date().getFullYear()}
                        toYear={2099}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Issue Date row */}
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="text-[11px] text-muted-foreground shrink-0 w-10">Issue</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setUseCustomIssueDate(false)}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-all ${!useCustomIssueDate ? 'bg-foreground text-background border-transparent font-semibold' : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'}`}
                  >
                    Today
                  </button>
                  {/* Custom chip — doubles as the calendar trigger; date shows on the chip */}
                  <Popover
                    open={issueDatePickerOpen}
                    onOpenChange={(open) => {
                      setIssueDatePickerOpen(open);
                      // If closed without picking a date, deactivate the chip so it doesn't show as selected with no value
                      if (!open && !issueDate) setUseCustomIssueDate(false);
                    }}
                    modal={true}
                  >
                    <PopoverTrigger asChild>
                      <button
                        onClick={() => setUseCustomIssueDate(true)}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-all flex items-center gap-1 ${useCustomIssueDate ? 'bg-foreground text-background border-transparent font-semibold' : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'}`}
                      >
                        <Calendar className="w-3 h-3 opacity-70" />
                        {useCustomIssueDate && issueDate && isValid(new Date(issueDate))
                          ? format(new Date(issueDate), 'MMM d, yyyy')
                          : 'Custom…'}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start" sideOffset={8}>
                      <SmartCalendar
                        selected={issueDate && isValid(new Date(issueDate)) ? new Date(issueDate) : undefined}
                        defaultMonth={issueDate && isValid(new Date(issueDate)) ? new Date(issueDate) : undefined}
                        onSelect={d => { setIssueDate(d ? format(d, 'yyyy-MM-dd') : ''); setIssueDatePickerOpen(false); }}
                        fromYear={2000}
                        toYear={new Date().getFullYear() + 5}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

            </div>
          </div>

          {/* ── Unmapped name field — blocks generation ── */}
          {nameField && !nameFieldMapped && (
            <div className="flex gap-2.5 px-3 py-2.5 rounded-xl border border-destructive/30 bg-destructive/5">
              <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-medium text-destructive">Recipient Name not mapped</p>
                <p className="text-destructive/80 mt-0.5">Go to the Data step and map a column to the Recipient Name field.</p>
              </div>
            </div>
          )}

          {/* ── Other unmapped fields — soft warning only ── */}
          {unmappedFields.filter(f => f.type !== 'name').length > 0 && (
            <div className="flex gap-2.5 px-3 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-medium text-amber-700 dark:text-amber-400">Some fields unmapped</p>
                <p className="text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                  {unmappedFields.filter(f => f.type !== 'name').map(f => f.label).join(', ')} will be left blank — generation can still proceed.
                </p>
              </div>
            </div>
          )}

          {/* ── Email setup nudge ── */}
          {emailSetup && !emailSetup.hasTemplate && !emailBannerDismissed && (
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5">
              <Mail className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs text-amber-800 dark:text-amber-300">
                No email template — <Link href={orgPath('/email-templates')} className="underline underline-offset-2 font-medium">create one</Link> to send certificates by email after generating.
              </div>
              <button type="button" onClick={() => setEmailBannerDismissed(true)} className="text-amber-600/50 hover:text-amber-700 transition-colors shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* ── Background job notice ── */}
          {generationJobId && overlayState === 'hidden' && (
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 text-xs text-blue-800 dark:text-blue-200">
              <Bell className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
              <span>A generation job is still processing — starting a new one won&apos;t cancel it. Check the bell for progress.</span>
            </div>
          )}

          {/* ── Disabled reason ── */}
          {!canGenerate && overlayState === 'hidden' && (
            <p className="text-xs text-center text-muted-foreground/60">
              {!importedData
                ? 'Import data in the Data step to enable generation'
                : !template?.id
                ? 'Template is still being saved — if this persists, go back to Step 1 and re-upload'
                : !nameFieldMapped
                ? 'Map the Recipient Name field to a column in the Data step'
                : 'Complete setup to enable generation'}
            </p>
          )}

          {/* ── Generate CTA ── */}
          <div className="flex gap-2 justify-center">
            {canGenerate && overlayState === 'hidden' && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 shrink-0 rounded-lg"
                disabled={isPreviewing}
                onClick={handlePreviewFirstRow}
                title="Preview using first data row"
              >
                {isPreviewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                Preview
              </Button>
            )}
            <Button
              className="rounded-lg gap-2"
              size="sm"
              disabled={!canGenerate || overlayState !== 'hidden'}
              onClick={handleGenerate}
            >
              {overlayState !== 'hidden' ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Generate{activeConfigCount > 1
                    ? ` ${activeConfigCount} Templates`
                    : ' Certificates'}
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── Generation error ── */}
      {generationStatus === 'error' && generationError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">Generation failed</p>
            <p className="text-xs text-destructive/80 mt-0.5">{generationError}</p>
          </div>
          <button
            className="text-destructive/60 hover:text-destructive transition-colors text-xs underline shrink-0"
            onClick={() => { setGenerationStatus('idle'); setGenerationError(null); }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Post-generation actions ── */}
      {generationStatus === 'completed' && (
        <div className="flex gap-2">
          {downloadUrl && (
            <Button variant="outline" className="gap-2 shrink-0" onClick={handleDownloadZip} disabled={isDownloadingZip}>
              {isDownloadingZip ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />}
              Download ZIP
            </Button>
          )}
          <Button
            className="flex-1"
            variant="outline"
            onClick={() => {
              setGenerationStatus('idle');
              setGeneratedCertificates([]);
              setTotalGenerated(0);
              setGenerationSummary([]);
              setDownloadUrl(null);
              setProgress(0);
              setSimulatedCount(0);
              setProgressLabel('');
              setGenerationJobId(null);
              setCertGenJobId(null);
              setAllCertJobIds([]);
              setExtraGenerationJobIds([]);
              setEmailStatuses(undefined);
            }}
          >
            Generate More
          </Button>
          <Button
            className="flex-1 gap-2"
            disabled={!generationJobId || totalGenerated === 0 || generationStatus !== 'completed'}
            onClick={() => setSendModalOpen(true)}
            title={generationStatus !== 'completed' ? 'Wait for generation to complete' : totalGenerated === 0 ? 'No certificates to send' : !generationJobId ? 'No job ID available' : 'Send certificates by email'}
          >
            <Send className="w-4 h-4" />
            Send via Email
          </Button>
        </div>
      )}

      {/* ── Failed recipients panel ── */}
      <Dialog open={failedPanelOpen} onOpenChange={setFailedPanelOpen}>
        <DialogContent className="max-w-lg">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <AlertCircle className="w-4 h-4 text-red-500" />
            {failedRecipients.length} Failed Recipient{failedRecipients.length !== 1 ? 's' : ''}
          </DialogTitle>
          <p className="text-sm text-muted-foreground -mt-1">
            These rows could not be processed. Fix the underlying issue in your source data before retrying.
          </p>
          <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
            {failedRecipients.map((r, i) => (
              <div key={i} className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.recipient_name}</p>
                    {r.recipient_email && <p className="text-xs text-muted-foreground truncate">{r.recipient_email}</p>}
                  </div>
                  <Badge variant="destructive" className="text-[10px] shrink-0 mt-0.5">Row {r.index + 1}</Badge>
                </div>
                <p className="text-xs text-red-500/80 mt-1 line-clamp-2">{r.error}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">
              {certGenJobId ? 'Retry re-submits only the failed rows using the same template.' : 'Retry not available for this job.'}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setFailedPanelOpen(false)}>Close</Button>
              {certGenJobId && (
                <Button size="sm" variant="destructive" onClick={handleRetryFailed} disabled={isRetryingFailed}>
                  {isRetryingFailed ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : null}
                  {isRetryingFailed ? 'Starting…' : `Retry ${failedRecipients.length} failed`}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Send via Email modal ── */}
      {sendModalOpen && generationJobId && (
        <SendEmailModal
          jobId={certGenJobId ?? generationJobId}
          allCertJobIds={allCertJobIds.length > 0 ? allCertJobIds : undefined}
          recipientCount={totalGenerated}
          certPreviewUrl={generatedCertificates[0]?.preview_url ?? null}
          firstRecipientRow={importedData?.rows[0] ?? null}
          certFieldHeaders={importedData?.headers ?? []}
          subcategoryName={subcategoryName}
          orgPath={orgPath}
          onClose={() => setSendModalOpen(false)}
          onEmailSent={(statuses) => setEmailStatuses(statuses)}
        />
      )}

      {/* ── Preview Modal ── */}
      <Dialog open={previewModalOpen} onOpenChange={setPreviewModalOpen}>
        <DialogContent className={`w-full p-0 overflow-hidden bg-black/95 border-border/40 [&>button:last-child]:hidden ${template && template.templateWidth > template.templateHeight ? 'max-w-5xl' : 'max-w-3xl'}`}>
          <DialogTitle className="sr-only">Certificate Preview</DialogTitle>
          <div className="relative flex flex-col items-center justify-center" style={{ minHeight: template && template.templateWidth > template.templateHeight ? '40vh' : '60vh' }}>
            {/* Close button */}
            <button
              onClick={() => setPreviewModalOpen(false)}
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Certificate number badge */}
            {previewUrls.length > 1 && (
              <div className="absolute top-3 left-3 z-10 text-xs text-white/60 bg-white/10 px-2 py-1 rounded-full">
                {previewIndex + 1} / {previewUrls.length}
              </div>
            )}

            {/* Image */}
            {previewUrls[previewIndex] && (
              <div className="relative flex items-center justify-center w-full min-h-[40vh]">
                {!previewImageLoaded && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-white/60" />
                    <p className="text-xs text-white/40">Loading preview…</p>
                  </div>
                )}
                <img
                  key={previewUrls[previewIndex]}
                  src={previewUrls[previewIndex]}
                  alt="Certificate preview"
                  className={`w-full object-contain transition-opacity duration-300 ${previewImageLoaded ? 'opacity-100' : 'opacity-0'}`}
                  style={{ maxHeight: '85vh' }}
                  onLoad={() => setPreviewImageLoaded(true)}
                />
              </div>
            )}

            {/* Carousel controls */}
            {previewUrls.length > 1 && (
              <>
                <button
                  onClick={() => { setPreviewImageLoaded(false); setPreviewIndex(i => Math.max(0, i - 1)); }}
                  disabled={previewIndex === 0}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors disabled:opacity-30"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => { setPreviewImageLoaded(false); setPreviewIndex(i => Math.min(previewUrls.length - 1, i + 1)); }}
                  disabled={previewIndex === previewUrls.length - 1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors disabled:opacity-30"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            {/* Dot indicators */}
            {previewUrls.length > 1 && (
              <div className="absolute bottom-4 flex gap-1.5">
                {previewUrls.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPreviewIndex(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${i === previewIndex ? 'bg-white w-4' : 'bg-white/40'}`}
                  />
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
