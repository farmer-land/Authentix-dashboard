/**
 * Predefined email templates shipped with Authentix.
 * Users can select one of these as a starting point when creating a new template.
 *
 * Design system (2026): all templates share one modern, brand-aligned shell built by
 * `buildTemplate()` — soft neutral canvas, rounded 20px card, thin accent strip, generous
 * spacing, pill CTA, and a framed certificate. Every template is light/dark aware: a
 * `@media (prefers-color-scheme: dark)` block restyles surfaces/text via `.ax-*` classes,
 * so recipients on dark mode get a true dark email and everyone else gets the light design.
 */

export interface PredefinedTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  email_subject: string;
  body: string;
  variables: string[];
  previewImage: string;
  accentColor: string;
  layout: string;
}

// ── Shared building blocks ──────────────────────────────────────────────────────

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Light + dark adaptive style block. Inline styles are the light default; these
 *  class overrides kick in for recipients whose client reports dark mode. */
const DARK_STYLE = `<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .ax-wrap   { background:#0b0e13 !important; }
    .ax-card   { background:#12161d !important; border-color:#252b35 !important; box-shadow:none !important; }
    .ax-h1     { color:#f4f6f8 !important; }
    .ax-sub    { color:#aeb7c2 !important; }
    .ax-text   { color:#c4ccd6 !important; }
    .ax-muted  { color:#8b94a1 !important; }
    .ax-foot   { color:#6b7480 !important; }
    .ax-frame  { background:#0f141b !important; border-color:#252b35 !important; }
    .ax-chip   { background:#0f141b !important; border-color:#252b35 !important; }
    .ax-chip-l { color:#8b94a1 !important; }
    .ax-chip-v { color:#e8edf2 !important; }
  }
</style>`;

const preheader = (text: string) =>
  `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;font-size:1px;line-height:1px;color:#eef1f5;">${text}</div>`;

const certImage = () =>
  `<div class="ax-frame" style="background:#f5f7fa;border:1px solid #e6e9ef;border-radius:16px;padding:14px;margin:0 0 22px;">
    <img src="{{certificate_image_url}}" alt="Your certificate" style="display:block;width:100%;border-radius:8px;" />
  </div>`;

const qrBlock = () =>
  `<div class="ax-frame" style="background:#f5f7fa;border:1px solid #e6e9ef;border-radius:16px;padding:20px;text-align:center;margin:0 0 22px;">
    <div style="display:inline-block;background:#ffffff;border-radius:12px;padding:10px;box-shadow:0 2px 8px rgba(15,23,42,.06);">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=132x132&amp;data={{verification_url}}&amp;qzone=1&amp;color=0b0e13&amp;bgcolor=ffffff" width="132" height="132" alt="Scan to verify" style="display:block;border-radius:6px;" />
    </div>
    <p class="ax-muted" style="margin:12px 0 0;font-size:12px;color:#8a93a0;">Scan to verify authenticity</p>
  </div>`;

const chip = (label: string, value: string) =>
  `<td class="ax-chip" width="50%" style="background:#f5f7fa;border:1px solid #e6e9ef;border-radius:12px;padding:12px 14px;vertical-align:top;">
    <p class="ax-chip-l" style="margin:0 0 3px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8a93a0;">${label}</p>
    <p class="ax-chip-v" style="margin:0;font-size:14px;font-weight:600;color:#1a1f27;">${value}</p>
  </td>`;

function detailsTable(details: { label: string; value: string }[]): string {
  if (!details.length) return '';
  let rows = '';
  for (let i = 0; i < details.length; i += 2) {
    const a = details[i]!;
    const b = details[i + 1];
    rows += `<tr>${chip(a.label, a.value)}<td style="width:10px;font-size:0;">&nbsp;</td>${
      b ? chip(b.label, b.value) : '<td width="50%"></td>'
    }</tr><tr><td colspan="3" style="height:10px;font-size:0;line-height:10px;">&nbsp;</td></tr>`;
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;margin:0 0 6px;">${rows}</table>`;
}

const cta = (label: string, accent: string, textColor: string) =>
  `<div style="text-align:center;margin:6px 0 4px;">
    <a href="{{verification_url}}" style="display:inline-block;background:${accent};color:${textColor};font-size:15px;font-weight:700;padding:14px 32px;border-radius:999px;text-decoration:none;letter-spacing:.2px;box-shadow:0 8px 20px ${accent}3d;">${label}</a>
  </div>`;

interface BuildOpts {
  accent: string;
  ctaText: string;
  preheader: string;
  eyebrow?: string;
  heading: string;
  subheading?: string;
  intro?: string;
  details?: { label: string; value: string }[];
  showCertImage?: boolean;
  showQr?: boolean;
  ctaLabel?: string;
  footerNote?: string;
}

/** Assembles a complete, light/dark-aware email body from content options. */
function buildTemplate(o: BuildOpts): string {
  return `${DARK_STYLE}
${preheader(o.preheader)}
<div class="ax-wrap" style="background:#eef1f5;padding:28px 14px;font-family:${FONT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;border-collapse:collapse;">
    <tr><td>
      <div class="ax-card" style="background:#ffffff;border:1px solid #e6e9ef;border-radius:20px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,.10);">
        <div style="height:4px;background:${o.accent};"></div>
        <div style="padding:38px 34px 32px;">
          ${o.eyebrow ? `<p style="margin:0 0 14px;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${o.accent};">${o.eyebrow}</p>` : ''}
          <h1 class="ax-h1" style="margin:0 0 ${o.subheading ? '8' : '18'}px;font-size:27px;line-height:1.22;font-weight:800;letter-spacing:-.5px;color:#0f1722;">${o.heading}</h1>
          ${o.subheading ? `<p class="ax-sub" style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#55606e;">${o.subheading}</p>` : ''}
          ${o.intro ? `<p class="ax-text" style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#4b5563;">${o.intro}</p>` : ''}
          ${detailsTable(o.details ?? [])}
          ${o.showCertImage ? certImage() : ''}
          ${o.showQr ? qrBlock() : ''}
          ${o.ctaLabel ? cta(o.ctaLabel, o.accent, o.ctaText) : ''}
          ${o.footerNote ? `<p class="ax-muted" style="margin:18px 0 0;font-size:13px;line-height:1.6;text-align:center;color:#8a93a0;">${o.footerNote}</p>` : ''}
        </div>
      </div>
      <p class="ax-foot" style="margin:18px 0 0;text-align:center;font-size:12px;color:#9aa3af;">© {{organization_name}} · Secured by Authentix</p>
    </td></tr>
  </table>
</div>`;
}

const GREEN = '#3ECF8E';
const INK = '#04140d'; // high-contrast dark text for use on light accents (green/amber/sky)

// ── Templates ───────────────────────────────────────────────────────────────────

export const PREDEFINED_TEMPLATES: PredefinedTemplate[] = [
  {
    id: "predefined_showcase",
    name: "Course Completion",
    description: "Clean, modern, Authentix-green — the certificate takes center stage. Light/dark adaptive.",
    category: "Education",
    email_subject: "🎓 Your Certificate — {{course_name}}",
    previewImage: "/email-templates/certificate-modern.avif",
    accentColor: GREEN,
    layout: "Header + Certificate + CTA",
    variables: ["recipient_name", "course_name", "organization_name", "issue_date", "certificate_image_url", "verification_url"],
    body: buildTemplate({
      accent: GREEN, ctaText: INK,
      preheader: "Your certificate for {{course_name}} is ready.",
      eyebrow: "Certificate of Completion",
      heading: "Congratulations, {{recipient_name}} 🎉",
      subheading: "You've successfully completed {{course_name}}.",
      intro: "Your dedication paid off. Your official certificate from <strong>{{organization_name}}</strong> is ready below — download it, share it, and wear it with pride.",
      details: [{ label: "Course", value: "{{course_name}}" }, { label: "Issued", value: "{{issue_date}}" }],
      showCertImage: true, showQr: true,
      ctaLabel: "View & Verify Certificate",
      footerNote: "Tip: share your achievement on LinkedIn to inspire others.",
    }),
  },
  {
    id: "predefined_dark_premium",
    name: "Award & Recognition",
    description: "Premium award styling with a gold accent — high-contrast and celebratory. Light/dark adaptive.",
    category: "Awards",
    email_subject: "🏆 Your Award Certificate — {{award_name}}",
    previewImage: "/email-templates/certificate-premium.avif",
    accentColor: "#f59e0b",
    layout: "Award header + Certificate + CTA",
    variables: ["recipient_name", "award_name", "organization_name", "issue_date", "certificate_image_url", "verification_url"],
    body: buildTemplate({
      accent: "#f59e0b", ctaText: "#1a1205",
      preheader: "You've received the {{award_name}} award.",
      eyebrow: "Award & Recognition",
      heading: "{{recipient_name}}, you earned it 🏆",
      subheading: "Awarded the {{award_name}} by {{organization_name}}.",
      intro: "In recognition of outstanding achievement, <strong>{{organization_name}}</strong> is proud to present you with this award. Your official certificate is below.",
      details: [{ label: "Award", value: "{{award_name}}" }, { label: "Issued", value: "{{issue_date}}" }],
      showCertImage: true, showQr: true,
      ctaLabel: "View & Verify Award",
    }),
  },
  {
    id: "predefined_minimal_focus",
    name: "Simple & Clean",
    description: "Ultra clean — the certificate is the hero with minimal copy. Light/dark adaptive.",
    category: "General",
    email_subject: "Your Certificate from {{organization_name}}",
    previewImage: "/email-templates/certificate-classic.avif",
    accentColor: GREEN,
    layout: "Certificate centered",
    variables: ["recipient_name", "organization_name", "issue_date", "certificate_image_url", "verification_url"],
    body: buildTemplate({
      accent: GREEN, ctaText: INK,
      preheader: "Your certificate from {{organization_name}} is ready.",
      heading: "Hi {{recipient_name}}, your certificate is ready",
      intro: "Issued by <strong>{{organization_name}}</strong> on {{issue_date}}. It's attached and shown below — verify it anytime with the button.",
      showCertImage: true,
      ctaLabel: "View & Verify Certificate",
    }),
  },
  {
    id: "predefined_golden_celebration",
    name: "Event Attendance",
    description: "Warm gold accent with a celebratory tone and share prompt. Light/dark adaptive.",
    category: "Events",
    email_subject: "🎉 Your Certificate — {{event_name}}",
    previewImage: "/email-templates/certificate-elegant.avif",
    accentColor: "#f59e0b",
    layout: "Gradient header + Certificate frame + Share CTA",
    variables: ["recipient_name", "event_name", "event_date", "organization_name", "issue_date", "certificate_image_url", "verification_url"],
    body: buildTemplate({
      accent: "#f59e0b", ctaText: "#1a1205",
      preheader: "Your certificate for {{event_name}} is here.",
      eyebrow: "Certificate of Participation",
      heading: "Thanks for joining us, {{recipient_name}} 🎉",
      subheading: "Your participation in {{event_name}} is confirmed.",
      intro: "It was great to have you at <strong>{{event_name}}</strong>. Here's your official certificate of participation.",
      details: [{ label: "Event", value: "{{event_name}}" }, { label: "Date", value: "{{event_date}}" }],
      showCertImage: true, showQr: true,
      ctaLabel: "View & Verify Certificate",
      footerNote: "🎉 Share the moment on LinkedIn!",
    }),
  },
  {
    id: "predefined_corporate_blue",
    name: "Corporate Training",
    description: "Formal navy accent for enterprise training completion. Light/dark adaptive.",
    category: "Corporate",
    email_subject: "Training Completion Certificate — {{training_name}}",
    previewImage: "/email-templates/certificate-classic.avif",
    accentColor: "#1e3a5f",
    layout: "Navy header + Certificate card + Formal footer",
    variables: ["recipient_name", "training_name", "completion_date", "organization_name", "issue_date", "certificate_image_url", "verification_url"],
    body: buildTemplate({
      accent: "#1e3a5f", ctaText: "#ffffff",
      preheader: "Your training completion certificate is ready.",
      eyebrow: "Certificate of Training",
      heading: "Training completed, {{recipient_name}}",
      subheading: "{{training_name}} · {{organization_name}}",
      intro: "This confirms successful completion of <strong>{{training_name}}</strong>. Your official certificate is provided below for your records.",
      details: [{ label: "Training", value: "{{training_name}}" }, { label: "Completed", value: "{{completion_date}}" }],
      showCertImage: true, showQr: true,
      ctaLabel: "View & Verify Certificate",
    }),
  },
  {
    id: "predefined_gradient_modern",
    name: "Membership Welcome",
    description: "Sleek indigo accent welcoming new members. Light/dark adaptive.",
    category: "Membership",
    email_subject: "Welcome — Your {{membership_type}} Certificate",
    previewImage: "/email-templates/certificate-premium.avif",
    accentColor: "#7c3aed",
    layout: "Accent header + Membership card + Verify CTA",
    variables: ["recipient_name", "membership_type", "organization_name", "valid_until", "issue_date", "certificate_image_url", "verification_url"],
    body: buildTemplate({
      accent: "#7c3aed", ctaText: "#ffffff",
      preheader: "Welcome — your {{membership_type}} membership is active.",
      eyebrow: "Membership Confirmed",
      heading: "Welcome aboard, {{recipient_name}}",
      subheading: "You're now a {{membership_type}} member of {{organization_name}}.",
      intro: "We're thrilled to have you. Your membership is active through <strong>{{valid_until}}</strong>, and your official certificate is below.",
      details: [{ label: "Membership", value: "{{membership_type}}" }, { label: "Valid Until", value: "{{valid_until}}" }],
      showCertImage: true, showQr: true,
      ctaLabel: "View My Certificate",
    }),
  },
  {
    id: "predefined_name_only",
    name: "Name Only (Minimal)",
    description: "Bare-bones — recipient name, certificate, and a verify link. Light/dark adaptive.",
    category: "General",
    email_subject: "Your Certificate from {{organization_name}}",
    previewImage: "/email-templates/certificate-classic.avif",
    accentColor: GREEN,
    layout: "Single column minimal",
    variables: ["recipient_name", "organization_name", "certificate_image_url", "verification_url"],
    body: buildTemplate({
      accent: GREEN, ctaText: INK,
      preheader: "Your certificate from {{organization_name}}.",
      heading: "Congratulations, {{recipient_name}}",
      intro: "Your certificate from <strong>{{organization_name}}</strong> is ready. View it below and verify anytime.",
      showCertImage: true,
      ctaLabel: "View & Verify Certificate",
    }),
  },
  {
    id: "predefined_qr_focus",
    name: "QR Verify Focus",
    description: "QR code front and center — built for mobile verification. Light/dark adaptive.",
    category: "General",
    email_subject: "Verify Your Certificate — {{organization_name}}",
    previewImage: "/email-templates/certificate-modern.avif",
    accentColor: GREEN,
    layout: "QR centered + minimal text",
    variables: ["recipient_name", "organization_name", "issue_date", "verification_url"],
    body: buildTemplate({
      accent: GREEN, ctaText: INK,
      preheader: "Scan to verify your certificate from {{organization_name}}.",
      eyebrow: "Verify Your Certificate",
      heading: "Hi {{recipient_name}}, scan to verify",
      intro: "Your certificate from <strong>{{organization_name}}</strong> was issued on {{issue_date}}. Scan the code below — or tap the button — to view and verify it.",
      showQr: true,
      ctaLabel: "Open Verification Page",
    }),
  },
  {
    id: "predefined_all_fields",
    name: "All Fields",
    description: "Uses every available variable — a full-control starting point. Light/dark adaptive.",
    category: "General",
    email_subject: "🎓 Your Certificate — {{course_name}} · {{organization_name}}",
    previewImage: "/email-templates/certificate-modern.avif",
    accentColor: GREEN,
    layout: "Full details + Certificate + QR + CTA",
    variables: [
      "recipient_name", "organization_name", "course_name", "issue_date",
      "event_name", "event_date", "award_name", "training_name",
      "membership_type", "valid_until", "completion_date",
      "certificate_image_url", "verification_url",
    ],
    body: buildTemplate({
      accent: GREEN, ctaText: INK,
      preheader: "Your certificate and full achievement details.",
      eyebrow: "Certificate",
      heading: "Congratulations, {{recipient_name}}",
      subheading: "Issued by {{organization_name}}",
      intro: "Here's the complete record of your achievement. All available details are listed below for your reference.",
      details: [
        { label: "Course", value: "{{course_name}}" },
        { label: "Issue Date", value: "{{issue_date}}" },
        { label: "Event", value: "{{event_name}}" },
        { label: "Event Date", value: "{{event_date}}" },
        { label: "Award", value: "{{award_name}}" },
        { label: "Training", value: "{{training_name}}" },
        { label: "Membership", value: "{{membership_type}}" },
        { label: "Valid Until", value: "{{valid_until}}" },
      ],
      showCertImage: true, showQr: true,
      ctaLabel: "View & Verify Certificate",
    }),
  },
  {
    id: "predefined_dark_slate",
    name: "Dark Slate",
    description: "Sleek, high-contrast styling with a brand-green CTA. Light/dark adaptive.",
    category: "General",
    email_subject: "Your Certificate is Ready — {{organization_name}}",
    previewImage: "/email-templates/certificate-premium.avif",
    accentColor: "#1e293b",
    layout: "Minimal + Certificate + CTA",
    variables: ["recipient_name", "organization_name", "course_name", "issue_date", "certificate_image_url", "verification_url"],
    body: buildTemplate({
      accent: GREEN, ctaText: INK,
      preheader: "Your certificate from {{organization_name}} is ready.",
      eyebrow: "{{organization_name}}",
      heading: "{{recipient_name}}",
      subheading: "has completed {{course_name}}",
      intro: "Your certificate was issued on <strong>{{issue_date}}</strong>. Download it, share it, and keep it as a record of your achievement.",
      details: [{ label: "Course", value: "{{course_name}}" }, { label: "Issued", value: "{{issue_date}}" }],
      showCertImage: true, showQr: true,
      ctaLabel: "View & Verify Certificate",
    }),
  },
  {
    id: "predefined_event_attendance_v2",
    name: "Event Certificate",
    description: "Clean event-focused layout with a sky accent. Light/dark adaptive.",
    category: "Events",
    email_subject: "Certificate of Attendance — {{event_name}}",
    previewImage: "/email-templates/certificate-elegant.avif",
    accentColor: "#0ea5e9",
    layout: "Sky header + Event details + Certificate",
    variables: ["recipient_name", "event_name", "event_date", "organization_name", "certificate_image_url", "verification_url"],
    body: buildTemplate({
      accent: "#0ea5e9", ctaText: "#ffffff",
      preheader: "Your certificate of attendance for {{event_name}}.",
      eyebrow: "Certificate of Attendance",
      heading: "Thank you for attending, {{recipient_name}}",
      subheading: "{{event_name}} · organized by {{organization_name}}",
      intro: "Thank you for attending <strong>{{event_name}}</strong>. Please find your official certificate of attendance below.",
      details: [{ label: "Event", value: "{{event_name}}" }, { label: "Date", value: "{{event_date}}" }],
      showCertImage: true, showQr: true,
      ctaLabel: "View & Verify Certificate",
    }),
  },
  {
    id: "predefined_welcome_member",
    name: "Welcome Member",
    description: "Warm, minimal welcome for new members — membership confirmation, no certificate image. Light/dark adaptive.",
    category: "Membership",
    email_subject: "Welcome to {{organization_name}}, {{recipient_name}}!",
    previewImage: "/email-templates/certificate-premium.avif",
    accentColor: "#10b981",
    layout: "Warm welcome + Membership badge + Verify CTA",
    variables: ["recipient_name", "organization_name", "membership_type", "valid_until", "verification_url"],
    body: buildTemplate({
      accent: "#10b981", ctaText: INK,
      preheader: "Welcome to {{organization_name}} — your membership is active.",
      eyebrow: "Membership Confirmed",
      heading: "Welcome, {{recipient_name}} ✓",
      subheading: "You're now a member of {{organization_name}}.",
      intro: "We're thrilled to welcome you as a <strong>{{membership_type}}</strong> member. Your membership is active and valid through <strong>{{valid_until}}</strong>.",
      details: [{ label: "Membership", value: "{{membership_type}}" }, { label: "Valid Until", value: "{{valid_until}}" }],
      showQr: true,
      ctaLabel: "View My Certificate",
    }),
  },
];
