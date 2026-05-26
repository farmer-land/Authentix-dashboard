/**
 * FEATURE FLAGS
 *
 * Org-level feature flags that control which platform capabilities are visible.
 * Flags are stored in organizations.features[] and toggled by product owners
 * via the admin panel — no code deploy needed.
 *
 * Flag registry (mirrors backend VALID_FEATURES):
 *   certs                  — generate, design, bulk-gen, QR verify
 *   cert_delivery_email    — email cert to recipient (transactional)
 *   cert_delivery_sms      — SMS cert to recipient          (future)
 *   cert_delivery_whatsapp — WhatsApp cert to recipient     (future)
 *   campaigns_email        — email broadcast campaigns
 *   campaigns_sms          — SMS campaigns                  (future)
 *   campaigns_whatsapp     — WhatsApp campaigns             (future)
 *   automations            — workflow automations            (future)
 *   api_access             — API keys + webhooks             (future)
 *   multi_team             — multiple teams / roles
 *   custom_domain          — custom sending domain           (future)
 *   analytics              — advanced analytics              (future)
 *   white_label            — remove Authentix branding       (future)
 */

export type OrgFeature =
  | 'certs'
  | 'cert_delivery_email'
  | 'cert_delivery_sms'
  | 'cert_delivery_whatsapp'
  | 'campaigns_email'
  | 'campaigns_sms'
  | 'campaigns_whatsapp'
  | 'automations'
  | 'api_access'
  | 'multi_team'
  | 'custom_domain'
  | 'analytics'
  | 'white_label';

export const ALL_FEATURES: OrgFeature[] = [
  'certs',
  'cert_delivery_email',
  'cert_delivery_sms',
  'cert_delivery_whatsapp',
  'campaigns_email',
  'campaigns_sms',
  'campaigns_whatsapp',
  'automations',
  'api_access',
  'multi_team',
  'custom_domain',
  'analytics',
  'white_label',
];

export const FEATURE_LABELS: Record<OrgFeature, { label: string; description: string; future?: boolean }> = {
  certs:                  { label: 'Certificates',            description: 'Generate, design, bulk-gen, QR verify' },
  cert_delivery_email:    { label: 'Cert email delivery',     description: 'Email certificate to recipient (transactional)' },
  cert_delivery_sms:      { label: 'Cert SMS delivery',       description: 'SMS certificate to recipient', future: true },
  cert_delivery_whatsapp: { label: 'Cert WhatsApp delivery',  description: 'WhatsApp certificate to recipient', future: true },
  campaigns_email:        { label: 'Email campaigns',         description: 'Broadcast email campaigns to contacts' },
  campaigns_sms:          { label: 'SMS campaigns',           description: 'SMS broadcast campaigns', future: true },
  campaigns_whatsapp:     { label: 'WhatsApp campaigns',      description: 'WhatsApp broadcast campaigns', future: true },
  automations:            { label: 'Automations',             description: 'Workflow automations and triggers' },
  api_access:             { label: 'API access',              description: 'API keys and webhooks' },
  multi_team:             { label: 'Multi-team',              description: 'Multiple teams and roles' },
  custom_domain:          { label: 'Custom domain',           description: 'Custom sending domain', future: true },
  analytics:              { label: 'Advanced analytics',      description: 'Advanced analytics dashboard' },
  white_label:            { label: 'White label',             description: 'Remove Authentix branding', future: true },
};

/** Default features for each plan key — mirrors backend migration backfill */
export const PLAN_DEFAULT_FEATURES: Record<string, OrgFeature[]> = {
  seed: ['certs', 'cert_delivery_email'],
  farm: ['certs', 'cert_delivery_email', 'campaigns_email'],
  aura: ['certs', 'cert_delivery_email', 'campaigns_email', 'automations', 'api_access'],
  flex: ['certs', 'cert_delivery_email', 'campaigns_email', 'automations', 'api_access', 'multi_team', 'analytics'],
};

/**
 * Compute the effective feature set.
 * Adds synthetic flags derived from combinations so nav filtering stays simple.
 */
export function effectiveFeatures(features: string[]): Set<string> {
  const s = new Set(features);

  // 'contacts' — visible whenever certs or any outreach channel is active
  if (s.has('certs') || s.has('campaigns_email') || s.has('campaigns_sms') || s.has('campaigns_whatsapp')) {
    s.add('contacts');
  }

  // 'email_templates' — visible when any email feature is active
  if (s.has('cert_delivery_email') || s.has('campaigns_email')) {
    s.add('email_templates');
  }

  // 'delivery_logs' — visible when any delivery or campaign channel is active
  if (s.has('cert_delivery_email') || s.has('campaigns_email') ||
      s.has('cert_delivery_sms') || s.has('campaigns_sms')) {
    s.add('delivery_logs');
  }

  return s;
}

/** Returns true if the org has a given feature (or synthetic feature). */
export function hasFeature(features: string[], flag: string): boolean {
  return effectiveFeatures(features).has(flag);
}

/** Onboarding use-case presets — maps a user selection to an initial feature set. */
export const USE_CASE_PRESETS: Array<{
  id: string;
  label: string;
  description: string;
  features: OrgFeature[];
}> = [
  {
    id: 'certs_download',
    label: 'Generate & download certificates',
    description: 'Create certificates and download them as PDF or ZIP',
    features: ['certs'],
  },
  {
    id: 'certs_email',
    label: 'Generate certificates + email to recipients',
    description: 'Create certificates and automatically email them to each recipient',
    features: ['certs', 'cert_delivery_email'],
  },
  {
    id: 'campaigns',
    label: 'Email campaigns only',
    description: 'Send broadcast emails, newsletters, and announcements to your contacts',
    features: ['campaigns_email'],
  },
  {
    id: 'everything',
    label: 'Everything — certificates + campaigns',
    description: 'Full platform access: certificates, email delivery, and broadcast campaigns',
    features: ['certs', 'cert_delivery_email', 'campaigns_email'],
  },
];
