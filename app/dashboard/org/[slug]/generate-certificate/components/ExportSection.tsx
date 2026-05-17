'use client';

import { useState, useRef, useEffect } from 'react';
import { CertificateTemplate, CertificateField, ImportedData, FieldMapping } from '@/lib/types/certificate';
import { api, type DeliveryIntegration, type DeliveryTemplate, type DeliveryMessage } from '@/lib/api/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { format, isValid } from 'date-fns';
import {
  Download, Loader2, CheckCircle2, AlertCircle, Calendar, Plus, X,
  FileText, ChevronDown, ChevronUp, Settings2, Eye, ChevronLeft, ChevronRight,
  ShieldCheck, BadgeCheck, Mail, Send, ExternalLink, Bell, ArrowRight,
  FileArchive, FileCheck,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ExpiryDateSelector, type ExpiryType } from './ExpiryDateSelector';
import { CertificateTable, type GeneratedCertificate } from './CertificateTable';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useOrg } from '@/lib/org';
import { useJobNotifications } from '@/lib/notifications/job-notifications';

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
  savedTemplates?: any[];
  /** Additional certificate configurations added by the user */
  additionalConfigs?: CertificateConfig[];
  onAdditionalConfigsChange?: (configs: CertificateConfig[]) => void;
  /** Manual entries appended after file rows during generation */
  additionalRows?: Record<string, unknown>[];
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

function getExportFormatDescription(template: CertificateTemplate | null): string {
  return template ? 'PNG' : 'ZIP';
}

// Auto-map imported data headers to a template's fields.
// Uses exact label match first, then type-based fallback so renamed fields
// (e.g. "Student Name" vs "Recipient Name") still resolve correctly.
export function autoMapForTemplate(
  fields: CertificateField[],
  headers: string[]
): FieldMapping[] {
  const mappings: FieldMapping[] = [];
  const usedHeaders = new Set<string>();

  // Pass 1: exact label matches — claimed first so fuzzy matching can't steal them.
  // Prevents 'course name'.includes('name') from mapping "Course Name" to a `name` field.
  fields.forEach((field) => {
    const exact = headers.find(
      (h) => h.toLowerCase().trim() === field.label.toLowerCase().trim()
    );
    if (exact) {
      mappings.push({ fieldId: field.id, columnName: exact });
      usedHeaders.add(exact);
    }
  });

  // Pass 2: semantic type fuzzy matches — only on unclaimed headers, only for unmatched fields.
  fields.forEach((field) => {
    if (mappings.some((m) => m.fieldId === field.id)) return;
    const match = headers.find((h) => {
      if (usedHeaders.has(h)) return false;
      const nh = h.toLowerCase().trim();
      if (field.type === 'name' && nh.includes('name')) return true;
      if (field.type === 'course' && (nh.includes('course') || nh.includes('program'))) return true;
      if (field.type === 'start_date' && (nh.includes('start') || nh.includes('issue'))) return true;
      if (field.type === 'end_date' && (nh.includes('end') || nh.includes('expir'))) return true;
      if (field.type === 'email' && (nh.includes('email') || nh.includes('e-mail'))) return true;
      if (field.type === 'phone' && (nh.includes('phone') || nh.includes('mobile') || nh.includes('contact'))) return true;
      return false;
    });
    if (match) {
      mappings.push({ fieldId: field.id, columnName: match });
      usedHeaders.add(match);
    }
  });

  return mappings;
}

// ── Sub-component: single template config row ─────────────────────────────────

interface ConfigRowProps {
  config: CertificateConfig;
  importedData: ImportedData | null;
  index: number;
  onRemove: () => void;
  onMappingChange: (fieldId: string, column: string) => void;
  onLabelChange: (label: string) => void;
}

function ConfigRow({ config, importedData, index, onRemove, onMappingChange, onLabelChange }: ConfigRowProps) {
  const mappableFields = config.fields.filter(f => f.type !== 'qr_code' && f.type !== 'custom_text' && f.type !== 'image');
  const hasUnmapped = mappableFields.some(f => !config.fieldMappings.find(m => m.fieldId === f.id));
  const [expanded, setExpanded] = useState(hasUnmapped);
  const mappedCount = config.fieldMappings.length;

  return (
    <Card className="overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 p-3">
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <input
            className="text-sm font-medium bg-transparent border-none outline-none w-full placeholder:text-muted-foreground/50"
            value={config.label}
            placeholder={`Certificate Type ${index + 1}`}
            onChange={e => onLabelChange(e.target.value)}
          />
          <p className="text-xs text-muted-foreground truncate">{config.template.templateName}</p>
        </div>
        <Badge variant="outline" className={`text-xs shrink-0 ${mappedCount === mappableFields.length && mappedCount > 0 ? 'border-green-500 text-green-600' : ''}`}>
          {mappedCount}/{mappableFields.length} mapped
        </Badge>
        <button
          className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(v => !v)}
          title={expanded ? 'Collapse mappings' : 'Edit field mappings'}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <Settings2 className="w-4 h-4" />}
        </button>
        {index > 0 && (
          <button
            className="p-1 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            title="Remove this certificate type"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Expanded field mapping */}
      {expanded && (
        <div className="border-t p-3 space-y-2 bg-muted/20">
          {mappableFields.length === 0 ? (
            <p className="text-xs text-muted-foreground">No mappable fields on this template.</p>
          ) : (
            mappableFields.map(field => {
              const mapped = config.fieldMappings.find(m => m.fieldId === field.id)?.columnName;
              return (
                <div key={field.id} className="flex items-center gap-3">
                  <Label className="text-xs w-32 shrink-0 truncate" title={field.label}>{field.label}</Label>
                  <Select
                    value={mapped || ''}
                    onValueChange={val => onMappingChange(field.id, val)}
                  >
                    <SelectTrigger className={`h-7 text-xs ${mapped ? 'border-green-500' : ''}`}>
                      <SelectValue placeholder="Select column…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(importedData?.headers ?? []).map(h => (
                        <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {mapped && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
                </div>
              );
            })
          )}
        </div>
      )}
    </Card>
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

function applyTemplatePreview(html: string, vars: Record<string, string>): string {
  let result = html;
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
  firstRecipientRow?: Record<string, any> | null;
  certFieldHeaders?: string[];
  subcategoryName?: string;
  orgPath: (path: string) => string;
  onClose: () => void;
  onEmailSent?: (statuses: Record<string, string>) => void;
}

type SendModalStep = 'checking' | 'no_template' | 'no_integration' | 'select_template' | 'confirm' | 'test_email' | 'sending' | 'done' | 'error';

function SendEmailModal({ jobId, allCertJobIds, recipientCount, certPreviewUrl, firstRecipientRow, certFieldHeaders, subcategoryName, orgPath, onClose, onEmailSent }: SendEmailModalProps) {
  const router = useRouter();
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

  useEffect(() => { check(); }, []);

  const check = async () => {
    setStep('checking');
    try {
      const [intList, tplList] = await Promise.all([
        api.delivery.listIntegrations(),
        api.delivery.listTemplates(),
      ]);

      const activeIntegrations = intList.filter(i => i.is_active && i.channel === 'email');
      const activeTemplates = tplList.filter(t => t.is_active && t.channel === 'email');

      setIntegrations(activeIntegrations);
      setTemplates(activeTemplates);

      if (activeTemplates.length === 0) { setStep('no_template'); return; }

      const defaultTpl = activeTemplates.find(t => t.is_default) ?? activeTemplates[0]!;
      setSelectedTemplateId(defaultTpl.id);

      if (activeIntegrations.length === 0) {
        setStep('no_integration');
        return;
      }

      const defaultInt = activeIntegrations.find(i => i.is_default) ?? activeIntegrations[0]!;
      setSelectedIntegrationId(defaultInt.id);
      setStep('select_template');
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
          template_id: selectedTemplate.id,
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
        template_id: selectedTemplateId || undefined,
        subject_override: subjectOverride.trim() || undefined,
        from_name_override: fromNameOverride.trim() || undefined,
        use_platform_default: usePlatformDefault || undefined,
      });
      toast.success(`Test email sent to ${testEmail}`);
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
          {step === 'select_template' ? 'Choose Email Template' : step === 'no_integration' ? 'Choose How to Send' : 'Send via Email'}
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

        {/* No integration — user picks platform default or sets up their own */}
        {step === 'no_integration' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              No custom email integration is connected. Choose how you'd like to send certificates:
            </p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => { setUsePlatformDefault(true); setStep('select_template'); }}
                className="w-full text-left p-4 rounded-lg border-2 border-[#3ECF8E]/30 bg-[#3ECF8E]/5 hover:border-[#3ECF8E]/60 hover:bg-[#3ECF8E]/10 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-md bg-[#3ECF8E]/10 shrink-0">
                    <ShieldCheck className="w-5 h-5 text-[#3ECF8E]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">Use Authentix Default Email</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Send from our verified sender — no setup required.</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                </div>
              </button>
              <button
                type="button"
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
                className="w-full text-left p-4 rounded-lg border-2 border-border hover:border-border/60 hover:bg-muted/30 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-md bg-muted shrink-0">
                    <Settings2 className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">Set Up My Own Email</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Connect your own email provider for full control over sender identity.</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                </div>
              </button>
            </div>
            <div className="flex justify-end">
              <Button variant="ghost" onClick={onClose} className="text-muted-foreground">Cancel</Button>
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
              <Button variant="outline" onClick={integrations.length === 0 ? () => setStep('no_integration') : onClose} className="shrink-0 gap-1.5">
                {integrations.length === 0 ? <><ChevronLeft className="w-4 h-4" />Back</> : 'Cancel'}
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
              {usePlatformDefault ? (
                <div className="flex items-center gap-2 p-2.5 rounded-md border bg-[#3ECF8E]/5 border-[#3ECF8E]/20 text-sm">
                  <Mail className="w-3.5 h-3.5 text-[#3ECF8E] shrink-0" />
                  <span className="truncate text-[#3ECF8E] font-medium flex-1">Authentix Default Email</span>
                  <button
                    type="button"
                    onClick={() => setStep('no_integration')}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 shrink-0 transition-colors"
                  >
                    Change
                  </button>
                </div>
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
  isImageTemplate,
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
  additionalRows,
}: ExportSectionProps) {
  const { orgPath } = useOrg();
  const { addJob } = useJobNotifications();

  // 'hidden' = idle, 'generating' = submitting, 'queued' = job sent to background, 'success' = done
  const [overlayState, setOverlayState] = useState<'hidden' | 'generating' | 'queued' | 'success'>('hidden');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [simulatedCount, setSimulatedCount] = useState(0);
  const [generationStatus, setGenerationStatus] = useState<'idle' | 'generating' | 'completed' | 'error'>('idle');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewImageLoaded, setPreviewImageLoaded] = useState(false);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [statusMsgIndex, setStatusMsgIndex] = useState(0);
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

  // Poll for job completion after submission — transitions overlay from 'generating' to 'success'
  // when the job finishes while the user is still watching. Stops once a terminal status is reached.
  useEffect(() => {
    if (!generationJobId) return;

    let stopped = false;
    let timerId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (stopped || !isMountedRef.current) return;
      try {
        const status = await api.certificates.pollJobStatus(generationJobId);
        if (!isMountedRef.current || stopped) return;

        if (status.status === 'completed') {
          stopped = true;
          if (progressTimerRef.current) { clearInterval(progressTimerRef.current); progressTimerRef.current = null; }
          const total = (status.result?.total_certificates as number | undefined) ?? 0;
          const result = status.result as Record<string, unknown> | null;
          type ResultEntry = {
            label: string; count: number; download_url: string | null;
            certificates?: Array<{
              id: string; certificate_number: string; recipient_name: string;
              recipient_email: string | null; issued_at: string; expires_at: string | null;
              download_url: string | null; preview_url: string | null; recipient_id?: string | null;
            }>;
          };
          const resultsArr = result?.results as ResultEntry[] | undefined;
          const url = (result?.last_download_url as string | null | undefined) ?? resultsArr?.[0]?.download_url ?? null;
          // Extract individual certificates and per-template summary from job result
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
          // Collect all cert-gen job IDs: one per template config in this background job's results
          const certJobIds = (resultsArr ?? [])
            .map((r: any) => r.job_id as string | null | undefined)
            .filter((id): id is string => !!id);
          if (certJobIds.length > 0) {
            setCertGenJobId(certJobIds[0]!);
            setAllCertJobIds(prev => {
              const merged = Array.from(new Set([...prev, ...certJobIds]));
              return merged;
            });
          } else {
            // Fallback: use first_job_id if results didn't include per-entry job IDs
            const firstJobId = result?.first_job_id as string | null | undefined;
            if (firstJobId) {
              setCertGenJobId(prev => prev ?? firstJobId);
              setAllCertJobIds(prev => prev.includes(firstJobId) ? prev : [...prev, firstJobId]);
            }
          }
          setTotalGenerated(prev => prev + total);
          setDownloadUrl(url ?? null);
          setGeneratedCertificates(allCerts);
          if (summary.length > 0) setGenerationSummary(summary);
          setGenerationStatus('completed');
          setProgress(100);
          // Transition to success if the overlay is still visible; otherwise leave it hidden
          setOverlayState(prev => prev !== 'hidden' ? 'success' : 'hidden');
          return;
        }

        if (status.status === 'failed') {
          stopped = true;
          if (progressTimerRef.current) { clearInterval(progressTimerRef.current); progressTimerRef.current = null; }
          setGenerationError(status.error ?? 'Certificate generation failed. Please try again.');
          setGenerationStatus('error');
          setOverlayState('hidden');
          return;
        }
      } catch { /* network errors silently ignored — retry next tick */ }

      timerId = setTimeout(poll, 3000);
    };

    timerId = setTimeout(poll, 2000);
    return () => { stopped = true; clearTimeout(timerId); };
  }, [generationJobId]);

  // Expiry settings
  const [expiryType, setExpiryType] = useState<ExpiryType>('year');
  const [customExpiryDate, setCustomExpiryDate] = useState<string>('');
  const [issueDate, setIssueDate] = useState<string>('');
  const [useCustomIssueDate, setUseCustomIssueDate] = useState(false);

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

  // Poll each extra background job (files 2+) in parallel to accumulate their cert-gen job IDs and total counts.
  // These jobs don't drive the overlay — the primary job does — but we need their cert job IDs for email send.
  useEffect(() => {
    if (extraGenerationJobIds.length === 0) return;
    const cleanups: Array<() => void> = [];
    for (const ejId of extraGenerationJobIds) {
      let stopped = false;
      let timerId: ReturnType<typeof setTimeout>;
      const poll = async () => {
        if (stopped || !isMountedRef.current) return;
        try {
          const status = await api.certificates.pollJobStatus(ejId);
          if (!isMountedRef.current || stopped) return;
          if (status.status === 'completed') {
            stopped = true;
            const result = status.result as Record<string, unknown> | null;
            const resultsArr = result?.results as Array<any> | undefined;
            const certJobIds = (resultsArr ?? [])
              .map((r: any) => r.job_id as string | null | undefined)
              .filter((id): id is string => !!id);
            if (certJobIds.length > 0) {
              setAllCertJobIds(prev => Array.from(new Set([...prev, ...certJobIds])));
            } else {
              const fallback = result?.first_job_id as string | null | undefined;
              if (fallback) setAllCertJobIds(prev => prev.includes(fallback) ? prev : [...prev, fallback]);
            }
            const extraTotal = (result?.total_certificates as number | undefined) ?? 0;
            if (extraTotal > 0) setTotalGenerated(prev => prev + extraTotal);
            return;
          }
          if (status.status === 'failed') { stopped = true; return; }
        } catch { /* ignore, retry */ }
        timerId = setTimeout(poll, 4000);
      };
      timerId = setTimeout(poll, 3000);
      cleanups.push(() => { stopped = true; clearTimeout(timerId); });
    }
    return () => cleanups.forEach(c => c());
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
  // Fields that actually require a CSV column mapping (excludes auto-rendered types)
  const mappableFields = fields.filter(f => f.type !== 'qr_code' && f.type !== 'custom_text' && f.type !== 'image');
  // Allow generation even when there are 0 mappable fields (e.g. image/QR-only templates)
  const allMappableFieldsMapped = mappableFields.every(f => fieldMappings.some(m => m.fieldId === f.id));
  // Also verify mapped column names actually exist in the uploaded headers (catches stale mappings)
  const allMappedColumnsValid = !importedData || fieldMappings
    .filter(m => m.columnName)
    .every(m => importedData.headers.includes(m.columnName));
  // Each additional config must also have all its mappable fields mapped
  const allAdditionalConfigsMapped = additionalConfigs.every(cfg => {
    const mappable = cfg.fields.filter(f => f.type !== 'qr_code' && f.type !== 'custom_text' && f.type !== 'image');
    return mappable.every(f => cfg.fieldMappings.some(m => m.fieldId === f.id));
  });
  const canGenerate = !!(template && importedData && template.id && allMappableFieldsMapped && allMappedColumnsValid && allAdditionalConfigsMapped);

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

  const estimatedTime = canGenerate && importedData
    ? estimateGenerationTime(importedData.rowCount, allConfigs.filter(c => c.template?.id))
    : '';

  // ── Add a template as extra config ────────────────────────────────────────
  const handleAddTemplate = async (savedTemplate: any) => {
    setLoadingTemplateId(savedTemplate.id);
    try {
      const editorData = await api.templates.getEditorData(savedTemplate.id);
      const templateFields: CertificateField[] = (editorData?.fields ?? []).map((f: any) => ({
        id: f.id || f.field_key,
        type: f.type === 'qrcode' ? 'qr_code' : f.type === 'date' ? 'start_date' : 'custom_text',
        label: f.label,
        x: f.x,
        y: f.y,
        width: f.width || 200,
        height: f.height || 30,
        fontSize: (f.style as any)?.fontSize || 16,
        fontFamily: (f.style as any)?.fontFamily || 'DM Sans',
        color: (f.style as any)?.color || '#000000',
        fontWeight: (f.style as any)?.fontWeight || '400',
        fontStyle: (f.style as any)?.fontStyle || 'normal',
        textAlign: (f.style as any)?.textAlign || 'left',
      }));

      const autoMappings = autoMapForTemplate(templateFields, importedData?.headers ?? []);

      const newConfig: CertificateConfig = {
        key: crypto.randomUUID(),
        template: {
          id: savedTemplate.id,
          templateName: savedTemplate.title || savedTemplate.name,
          fileUrl: savedTemplate.preview_url || '',
          fileType: 'image',
          pdfWidth: savedTemplate.width || 800,
          pdfHeight: savedTemplate.height || 600,
          fields: templateFields,
        },
        fields: templateFields,
        fieldMappings: autoMappings,
        label: savedTemplate.title || savedTemplate.name || `Certificate ${additionalConfigs.length + 2}`,
      };

      onAdditionalConfigsChange?.([...additionalConfigs, newConfig]);
    } catch (err) {
      console.error('Failed to load template fields:', err);
    } finally {
      setLoadingTemplateId(null);
      setShowTemplatePicker(false);
    }
  };

  const handleRemoveConfig = (key: string) => {
    onAdditionalConfigsChange?.(additionalConfigs.filter(c => c.key !== key));
  };

  const handleConfigMappingChange = (key: string, fieldId: string, column: string) => {
    onAdditionalConfigsChange?.(
      additionalConfigs.map(c =>
        c.key !== key ? c : {
          ...c,
          fieldMappings: c.fieldMappings.find(m => m.fieldId === fieldId)
            ? c.fieldMappings.map(m => m.fieldId === fieldId ? { ...m, columnName: column } : m)
            : [...c.fieldMappings, { fieldId, columnName: column }],
        }
      )
    );
  };

  const handleConfigLabelChange = (key: string, label: string) => {
    onAdditionalConfigsChange?.(additionalConfigs.map(c => c.key !== key ? c : { ...c, label }));
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
    const allCerts: GeneratedCertificate[] = [];
    const summary: Array<{ label: string; count: number }> = [];

    setProgressLabel(`Generating ${totalRows} certificate${totalRows !== 1 ? 's' : ''}…`);

    // Simulate smooth progress — asymptotic curve so it never feels stuck.
    // Estimate total time: 2s submit latency + 1.5s per cert (capped at 120s).
    const estimatedMs = Math.min(Math.max(5000, 2000 + totalRows * configsToRun.length * 1500), 120000);
    const tickMs = 300;
    let elapsed = 0;
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    progressTimerRef.current = setInterval(() => {
      elapsed += tickMs;
      // Asymptotic: fast at first, slows near 88% — never reaches 90 on its own
      const frac = 1 - Math.exp(-3 * elapsed / estimatedMs);
      const pct = Math.round(frac * 88);
      setProgress(pct);
      setSimulatedCount(Math.max(1, Math.round(frac * totalRows)));
    }, tickMs);

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

      if (progressTimerRef.current) { clearInterval(progressTimerRef.current); progressTimerRef.current = null; }

      setGenerationJobId(firstJobId);
      if (restJobIds.length > 0) setExtraGenerationJobIds(restJobIds);
      // Progress timer keeps running through polling — cleared only on completion or error
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

  const handleExpiryChange = (type: ExpiryType, customDate?: string) => {
    setExpiryType(type);
    if (customDate !== undefined) setCustomExpiryDate(customDate);
  };

  const unmappedFields = fields
    .filter(f => f.type !== 'qr_code' && f.type !== 'custom_text' && f.type !== 'image')
    .filter(f => !fieldMappings.find(m => m.fieldId === f.id));

  // ── Render ──────────────────────────────────────────────────────────────────

  // Full-screen generation overlay
  if (overlayState !== 'hidden') {
    const PARTICLE_ANGLES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background select-none overflow-hidden">
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
          @keyframes genShieldPop { 0%{opacity:0;transform:scale(0.4) rotate(-12deg)} 65%{transform:scale(1.12) rotate(4deg)} 100%{opacity:1;transform:scale(1) rotate(0deg)} }
          @keyframes genBadgePop  { 0%{opacity:0;transform:scale(0) rotate(20deg)} 70%{transform:scale(1.18) rotate(-6deg)} 100%{opacity:1;transform:scale(1) rotate(0deg)} }
          @keyframes genBadgeFloat{ 0%,100%{transform:translateY(0px) rotate(-6deg)} 50%{transform:translateY(-8px) rotate(-2deg)} }
          @keyframes genShieldGlow{ 0%,100%{filter:drop-shadow(0 0 10px #3ECF8E66)} 50%{filter:drop-shadow(0 0 28px #3ECF8Ecc)} }
          @keyframes genPulse     { 0%,100%{opacity:0.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.06)} }
          @keyframes genSpin      { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
          @keyframes genSpinRev   { from{transform:rotate(0deg)} to{transform:rotate(-360deg)} }
          @keyframes genOrbit     { from{transform:rotate(0deg) translateX(90px) rotate(0deg)} to{transform:rotate(360deg) translateX(90px) rotate(-360deg)} }
          @keyframes genOrbit2    { from{transform:rotate(120deg) translateX(70px) rotate(-120deg)} to{transform:rotate(480deg) translateX(70px) rotate(-480deg)} }
          @keyframes genOrbit3    { from{transform:rotate(240deg) translateX(110px) rotate(-240deg)} to{transform:rotate(600deg) translateX(110px) rotate(-600deg)} }
          @keyframes genDocLine   { 0%,100%{opacity:0.2} 50%{opacity:0.75} }
          @keyframes genFadeSlide { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
          @keyframes genFadeUp    { from{opacity:0;transform:translateY(16px) scale(0.95)} to{opacity:1;transform:translateY(0) scale(1)} }
          @keyframes genCountPop  { 0%{transform:scale(0.6);opacity:0} 60%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }
          @keyframes genParticle  { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:var(--tx,0) var(--ty,0) scale(0);opacity:0} }
          @keyframes genRay       { 0%,100%{opacity:0.15} 50%{opacity:0.5} }
          @keyframes genMsgFade   { from{opacity:0;transform:translateY(4px)} to{opacity:0.6;transform:translateY(0)} }
          @keyframes genBgPulse   { 0%,100%{opacity:0} 50%{opacity:1} }
        `}</style>

        {/* Bottom CTA — while generating animation plays */}
        {overlayState === 'generating' && generationJobId && (
          <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-3" style={{ animation: 'genFadeSlide 0.4s ease-out 1s both' }}>
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

        <div className="flex flex-col items-center gap-10">
          {overlayState === 'success' ? (
            /* ── Success ── */
            <div className="flex flex-col items-center gap-8">
              {/* Icon cluster with particles */}
              <div className="relative flex items-center justify-center" style={{ width: 240, height: 240 }}>
                {/* Particle burst */}
                {PARTICLE_ANGLES.map((angle, i) => {
                  const rad = (angle * Math.PI) / 180;
                  const dist = 90 + (i % 3) * 20;
                  const tx = `translateX(${Math.round(Math.cos(rad) * dist)}px)`;
                  const ty = `translateY(${Math.round(Math.sin(rad) * dist)}px)`;
                  const size = i % 3 === 0 ? 8 : i % 3 === 1 ? 5 : 6;
                  const colors = ['#3ECF8E', '#3ECF8Eaa', '#3ECF8E77'];
                  return (
                    <div key={angle} style={{
                      position: 'absolute',
                      width: size, height: size,
                      borderRadius: i % 2 === 0 ? '50%' : '2px',
                      background: colors[i % 3],
                      boxShadow: i % 3 === 0 ? `0 0 6px #3ECF8E` : 'none',
                      // @ts-expect-error css custom properties
                      '--tx': tx, '--ty': ty,
                      animation: `genParticle 0.9s cubic-bezier(0.2,0,0.8,1) ${i * 0.04}s both`,
                    }} />
                  );
                })}

                {/* Ripple rings */}
                <div className="absolute w-56 h-56 rounded-full" style={{ border: '1.5px solid #3ECF8E44', animation: 'genRipple 2s ease-out 0.1s infinite' }} />
                <div className="absolute w-56 h-56 rounded-full" style={{ border: '1px solid #3ECF8E22', animation: 'genRipple 2s ease-out 0.7s infinite' }} />
                <div className="absolute w-56 h-56 rounded-full" style={{ border: '1px solid #3ECF8E11', animation: 'genRipple 2s ease-out 1.3s infinite' }} />

                {/* Rotating rays */}
                {[0,45,90,135].map(r => (
                  <div key={r} style={{
                    position: 'absolute', width: 2, height: 70, borderRadius: 1,
                    background: 'linear-gradient(to bottom, #3ECF8E66, transparent)',
                    transformOrigin: 'bottom center',
                    transform: `rotate(${r}deg) translateY(-70px)`,
                    animation: `genRay 2s ease-in-out ${r * 0.015}s infinite`,
                  }} />
                ))}

                {/* Glow backdrop */}
                <div className="absolute rounded-full" style={{ width: 140, height: 140, background: 'radial-gradient(circle, #3ECF8E28 0%, transparent 70%)' }} />

                {/* Main shield */}
                <ShieldCheck style={{
                  width: 100, height: 100, color: '#3ECF8E',
                  animation: 'genShieldPop 0.6s cubic-bezier(0.34,1.56,0.64,1) both, genShieldGlow 2.2s ease-in-out 0.6s infinite',
                }} />

                {/* Floating badge */}
                <div style={{ position: 'absolute', top: 20, right: 16, animation: 'genBadgePop 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.25s both' }}>
                  <div style={{ animation: 'genBadgeFloat 3s ease-in-out 0.8s infinite' }}>
                    <BadgeCheck style={{ width: 38, height: 38, color: '#3ECF8E' }} />
                  </div>
                </div>
              </div>

              {/* Text with count-up */}
              <div className="text-center space-y-3" style={{ animation: 'genFadeUp 0.5s ease-out 0.3s both' }}>
                <p className="font-black tracking-tight" style={{ fontSize: 40, lineHeight: 1, animation: 'genCountPop 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.15s both' }}>
                  🎉 All done!
                </p>
                <p className="text-muted-foreground" style={{ fontSize: 17 }}>
                  <span style={{ color: '#3ECF8E', fontWeight: 800, fontSize: 22 }}>{displayCount}</span>
                  {' '}certificate{totalGenerated !== 1 ? 's' : ''} generated successfully
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

              {/* CTAs */}
              <div className="flex gap-3" style={{ animation: 'genFadeUp 0.5s ease-out 0.55s both' }}>
                {downloadUrl && (
                  <a href={downloadUrl} download>
                    <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm" style={{ background: '#3ECF8E', color: '#000' }}>
                      <Download style={{ width: 15, height: 15 }} />
                      Download All
                    </button>
                  </a>
                )}
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
            <>
              {/* Central animated visual */}
              <div className="relative flex items-center justify-center" style={{ width: 260, height: 260 }}>

                {/* Outermost slow-spinning dashed ring */}
                <div className="absolute inset-0 rounded-full pointer-events-none" style={{
                  border: '1px dashed rgba(62,207,142,0.25)',
                  animation: 'genSpin 18s linear infinite',
                }} />

                {/* Mid spinning ring */}
                <div className="absolute rounded-full pointer-events-none" style={{
                  inset: 18,
                  border: '1.5px dashed rgba(62,207,142,0.35)',
                  animation: 'genSpinRev 12s linear infinite',
                }} />

                {/* Inner glowing ring */}
                <div className="absolute rounded-full pointer-events-none" style={{
                  inset: 38,
                  border: '2px solid rgba(62,207,142,0.45)',
                  boxShadow: '0 0 18px rgba(62,207,142,0.15) inset',
                  animation: 'genPulse 2.4s ease-in-out infinite',
                }} />

                {/* Orbiting dot 1 */}
                <div style={{ position: 'absolute', top: '50%', left: '50%', animation: 'genOrbit 4s linear infinite' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3ECF8E', boxShadow: '0 0 8px #3ECF8E' }} />
                </div>
                {/* Orbiting dot 2 */}
                <div style={{ position: 'absolute', top: '50%', left: '50%', animation: 'genOrbit2 3s linear infinite' }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#3ECF8Eaa' }} />
                </div>
                {/* Orbiting dot 3 */}
                <div style={{ position: 'absolute', top: '50%', left: '50%', animation: 'genOrbit3 6s linear infinite' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3ECF8E77', boxShadow: '0 0 6px #3ECF8E55' }} />
                </div>

                {/* Centre: document icon */}
                <div className="relative flex flex-col items-center justify-center rounded-2xl" style={{
                  width: 100, height: 120,
                  background: 'rgba(62,207,142,0.08)',
                  border: '1.5px solid rgba(62,207,142,0.4)',
                  boxShadow: '0 0 32px rgba(62,207,142,0.12)',
                  animation: 'genPulse 2.4s ease-in-out infinite',
                }}>
                  {/* Folded corner */}
                  <div style={{
                    position: 'absolute', top: 0, right: 0,
                    width: 0, height: 0,
                    borderStyle: 'solid',
                    borderWidth: '0 18px 18px 0',
                    borderColor: 'transparent rgba(62,207,142,0.5) transparent transparent',
                  }} />
                  {/* Doc lines */}
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} style={{
                      height: 3,
                      borderRadius: 2,
                      background: 'rgba(62,207,142,0.5)',
                      width: i === 0 ? 52 : i === 3 ? 32 : 64,
                      marginBottom: i < 3 ? 8 : 0,
                      animation: `genDocLine 1.8s ease-in-out ${i * 0.18}s infinite`,
                    }} />
                  ))}
                  {/* Seal dot */}
                  <div style={{
                    position: 'absolute', bottom: 12, right: 12,
                    width: 18, height: 18, borderRadius: '50%',
                    background: 'rgba(62,207,142,0.2)',
                    border: '1.5px solid rgba(62,207,142,0.6)',
                  }} />
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ width: 480 }} className="space-y-2">
                <div className="relative rounded-full overflow-visible" style={{ height: 10, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.16)' }}>
                  {/* Fill — dragger is a child so it moves with the bar, always in sync */}
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${progress}%`,
                      background: '#3ECF8E',
                      boxShadow: progress > 0 ? '0 0 10px #3ECF8E88' : 'none',
                      minWidth: progress > 0 ? 10 : 0,
                      transition: 'width 600ms linear',
                    }}
                  >
                    {/* Dragger dot — pinned to right edge of fill, always perfectly in sync */}
                    {progress > 0 && progress < 100 && (
                      <div style={{
                        position: 'absolute',
                        right: -7,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: 14, height: 14, borderRadius: '50%',
                        background: 'white',
                        boxShadow: '0 0 0 2.5px #3ECF8E, 0 0 8px #3ECF8E66',
                      }} />
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-sm font-bold tabular-nums" style={{ color: '#3ECF8E' }}>{progress}%</span>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)', animation: 'genMsgFade 0.4s ease-out both' }} key={statusMsgIndex}>
                    {progressLabel || STATUS_MESSAGES[statusMsgIndex]}
                  </span>
                  <span className="text-xs tabular-nums" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {simulatedCount > 0 ? `${simulatedCount} / ${importedData?.rowCount ?? '?'}` : '—'}
                  </span>
                </div>
              </div>
            </>
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

          {/* Certificate preview cards */}
          {generatedCertificates.length > 0 ? (
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
          ) : totalGenerated > 0 && (
            /* Backend didn't return individual cert data — show download prompt */
            <div className="rounded-lg border bg-muted/20 p-6 text-center space-y-2">
              <FileCheck className="w-8 h-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {totalGenerated} certificate{totalGenerated !== 1 ? 's' : ''} are ready.
                {downloadUrl ? ' Download the ZIP to view them all.' : ''}
              </p>
              <Link href={orgPath('/certificates')} className="text-xs text-primary underline underline-offset-2">
                View in Certificates →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Settings — hidden after completion */}
      {generationStatus !== 'completed' && (
        <>
          {/* ── Multi-certificate configuration ── */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Certificate Types</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Generate multiple certificate types from the same data in one click.
                </p>
              </div>
              <Badge variant="secondary" className="text-xs">
                {allConfigs.filter(c => c.template?.id).length} type{allConfigs.filter(c => c.template?.id).length !== 1 ? 's' : ''}
              </Badge>
            </div>

            <div className="space-y-2">
              {/* Primary config */}
              {template && (
                <ConfigRow
                  config={allConfigs[0]!}
                  importedData={importedData}
                  index={0}
                  onRemove={() => {}}
                  onMappingChange={() => {}}
                  onLabelChange={() => {}}
                />
              )}

              {/* Additional configs */}
              {additionalConfigs.map((cfg, idx) => (
                <ConfigRow
                  key={cfg.key}
                  config={cfg}
                  importedData={importedData}
                  index={idx + 1}
                  onRemove={() => handleRemoveConfig(cfg.key)}
                  onMappingChange={(fieldId, col) => handleConfigMappingChange(cfg.key, fieldId, col)}
                  onLabelChange={(label) => handleConfigLabelChange(cfg.key, label)}
                />
              ))}
            </div>

            {/* Add template picker */}
            {showTemplatePicker ? (
              <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">Select a saved template</p>
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setShowTemplatePicker(false)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {savedTemplates.filter(t => t.id !== template?.id).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No other saved templates found.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {savedTemplates
                      .filter(t => t.id && t.id !== template?.id && !additionalConfigs.find(c => c.template.id === t.id))
                      .map(t => (
                        <button
                          key={t.id}
                          disabled={loadingTemplateId === t.id}
                          onClick={() => handleAddTemplate(t)}
                          className="flex items-center gap-2 p-2 text-left rounded-md border border-border/50 hover:bg-muted/50 transition-colors text-xs"
                        >
                          {loadingTemplateId === t.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                            : <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                          }
                          <span className="truncate">{t.title || t.name}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 border-dashed"
                onClick={() => setShowTemplatePicker(true)}
              >
                <Plus className="w-4 h-4" />
                Add Another Certificate Type
              </Button>
            )}
          </Card>

          {/* Expiry Date Settings */}
          <ExpiryDateSelector
            value={expiryType}
            customDate={customExpiryDate}
            issueDate={useCustomIssueDate ? issueDate : undefined}
            onChange={handleExpiryChange}
          />

          {/* Issue Date Settings */}
          <Card className="p-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                <Label className="text-sm font-medium">Issue Date</Label>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="issueDate"
                    checked={!useCustomIssueDate}
                    onChange={() => setUseCustomIssueDate(false)}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm">Today (generation date)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="issueDate"
                    checked={useCustomIssueDate}
                    onChange={() => setUseCustomIssueDate(true)}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm">Custom date</span>
                </label>
              </div>
              {useCustomIssueDate && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      data-empty={!issueDate}
                      className="w-[212px] justify-between font-normal data-[empty=true]:text-muted-foreground"
                    >
                      {issueDate && isValid(new Date(issueDate))
                        ? format(new Date(issueDate), 'PPP')
                        : <span>Pick a date</span>}
                      <ChevronDown />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start" sideOffset={4}>
                    <CalendarPicker
                      mode="single"
                      selected={issueDate && isValid(new Date(issueDate)) ? new Date(issueDate) : undefined}
                      onSelect={(d) => setIssueDate(d ? format(d, 'yyyy-MM-dd') : '')}
                      defaultMonth={issueDate && isValid(new Date(issueDate)) ? new Date(issueDate) : undefined}
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </Card>

          {/* Unmapped field warning */}
          {unmappedFields.length > 0 && (
            <Card className="p-3 bg-destructive/5 border-destructive/30">
              <div className="flex gap-2">
                <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-medium text-destructive">Unmapped Fields</p>
                  <p className="text-destructive/80 mt-1">
                    {unmappedFields.map(f => f.label).join(', ')} {unmappedFields.length === 1 ? 'is' : 'are'} not mapped and will be left empty.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Summary */}
          <Card className="p-4 bg-muted/50">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Recipients:</span>
                <span className="font-medium">{importedData?.rowCount || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Certificate Types:</span>
                <span className="font-medium">{allConfigs.filter(c => c.template?.id).length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total to Generate:</span>
                <span className="font-medium font-mono">
                  {(importedData?.rowCount || 0) * allConfigs.filter(c => c.template?.id).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Export Format:</span>
                <span className="font-medium">{getExportFormatDescription(template)}</span>
              </div>
              {hasQrCodeField && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">QR Code:</span>
                  <span className="font-medium text-green-600">Included</span>
                </div>
              )}
            </div>
          </Card>

          {/* Soft email setup warning */}
          {emailSetup && !emailSetup.hasTemplate && !emailBannerDismissed && (
            <Alert className="border-amber-500/30 bg-amber-500/5">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-sm text-amber-800 flex items-center justify-between gap-2">
                <span>No email template set up — create one to send certificates by email after generating.</span>
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={orgPath('/email-templates')} className="text-amber-700 underline underline-offset-2 whitespace-nowrap font-medium">Create template →</Link>
                  <button
                    type="button"
                    onClick={() => setEmailBannerDismissed(true)}
                    className="text-amber-600/60 hover:text-amber-700 transition-colors"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Informational banner when a prior job is still running and data has changed */}
          {generationJobId && overlayState === 'hidden' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-200">
              <Bell className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
              <span>A generation job is still processing. Starting a new one will not cancel it — check the notification bell for progress.</span>
            </div>
          )}

          {/* Estimated time */}
          {estimatedTime && overlayState === 'hidden' && (
            <p className="text-xs text-muted-foreground text-center">
              Estimated time: <span className="font-medium text-foreground">{estimatedTime}</span>
              {importedData && importedData.rowCount > 50 && (
                <span className="text-muted-foreground/60"> · runs in background</span>
              )}
            </p>
          )}

          {/* Reason why generate is disabled */}
          {!canGenerate && overlayState === 'hidden' && (
            <p className="text-xs text-center text-muted-foreground/70">
              {!importedData
                ? 'Import data in the Data step to enable generation'
                : !template?.id
                ? 'Template is still saving — please wait a moment'
                : !allMappableFieldsMapped
                ? 'Map all certificate fields to columns in the Data step'
                : 'Complete all field mappings to enable generation'}
            </p>
          )}

          {/* Generate + Preview row */}
          <div className="flex gap-2">
            {canGenerate && overlayState === 'hidden' && (
              <Button
                variant="outline"
                size="lg"
                className="gap-2 shrink-0"
                disabled={isPreviewing}
                onClick={handlePreviewFirstRow}
                title="Generate a preview using the first data row"
              >
                {isPreviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                Preview
              </Button>
            )}
            <Button
              className="flex-1"
              size="lg"
              disabled={!canGenerate || overlayState !== 'hidden'}
              onClick={handleGenerate}
            >
              {overlayState !== 'hidden' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Generate {allConfigs.filter(c => c.template?.id).length > 1
                    ? `${allConfigs.filter(c => c.template?.id).length} Certificate Types`
                    : 'Certificates'}
                </>
              )}
            </Button>
          </div>
        </>
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
            <Button variant="outline" className="gap-2 shrink-0" asChild>
              <a href={downloadUrl} download>
                <FileArchive className="w-4 h-4" />
                Download ZIP
              </a>
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
        <DialogContent className={`w-full p-0 overflow-hidden bg-black/95 border-border/40 [&>button:last-child]:hidden ${template && template.pdfWidth > template.pdfHeight ? 'max-w-5xl' : 'max-w-3xl'}`}>
          <DialogTitle className="sr-only">Certificate Preview</DialogTitle>
          <div className="relative flex flex-col items-center justify-center" style={{ minHeight: template && template.pdfWidth > template.pdfHeight ? '40vh' : '60vh' }}>
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
