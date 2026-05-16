// Certificate Field Types
export type FieldType = 'name' | 'course' | 'start_date' | 'end_date' | 'custom_text' | 'qr_code' | 'image' | 'email' | 'phone';

export type TextAlign = 'left' | 'center' | 'right';
export type FontWeight = '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' | 'normal' | 'bold';
export type FontStyle = 'normal' | 'italic';

// Individual field configuration
export interface CertificateField {
  id: string;
  type: FieldType;
  label: string;
  dataKey?: string; // Maps to Excel column (e.g., "Recipient Name")

  // Position & Size (in pixels, relative to PDF)
  x: number;
  y: number;
  width: number;
  height: number;

  // Multi-page support
  pageNumber?: number; // Page number for multi-page PDFs (0-indexed, defaults to 0)

  // Styling
  fontSize: number; // Font size in pt
  fontFamily: string; // Google Fonts name
  color: string; // Hex color (#RRGGBB)
  opacity?: number; // 0–100, defaults to 100
  fontWeight: FontWeight;
  fontStyle: FontStyle;
  textAlign: TextAlign;

  // Formatting options
  dateFormat?: string; // For date fields: "MM/DD/YYYY", "DD-MM-YYYY", etc
  prefix?: string; // Text before value (e.g., "Name: ")
  suffix?: string; // Text after value

  // Typography extras
  letterSpacing?: number; // px in design space
  lineHeight?: number; // unitless multiplier (default 1.2)
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  textDecoration?: 'none' | 'underline' | 'line-through' | 'underline line-through';
  backgroundColor?: string; // hex — background highlight behind text field

  // Color / gradient
  colorMode?: 'solid' | 'linear' | 'radial'; // defaults to 'solid'
  gradientAngle?: number; // degrees for linear gradient (default 90)
  gradientStartColor?: string; // hex
  gradientStartOpacity?: number; // 0–100
  gradientEndColor?: string; // hex
  gradientEndOpacity?: number; // 0–100

  // Effects
  textShadow?: { offsetX: number; offsetY: number; blur: number; color: string } | null;

  // QR code options
  qrStyle?: 'standard' | 'rounded' | 'dots' | 'classy' | 'logo'; // QR visual style (default 'standard')
  qrTransparentBg?: boolean; // Remove white background (default false)
  qrLogoUrl?: string; // Logo image URL to display in centre (used when qrStyle === 'logo')
  qrErrorCorrection?: 'L' | 'M' | 'Q' | 'H'; // Error correction level (default 'M')

  // Image field
  imageUrl?: string; // For image-type fields

  // Image appearance
  cornerRadius?: number; // px, 0–500
  strokeColor?: string; // hex
  strokeWidth?: number; // px, 0–50
  strokePosition?: 'inside' | 'center' | 'outside';

  // Effects
  dropShadow?: { offsetX: number; offsetY: number; blur: number; spread: number; color: string } | null;
  layerBlur?: number; // px, 0–100
  backgroundBlur?: number; // px, 0–100

  // Sample/default value for preview
  sampleValue?: string;

  // Canvas behaviour
  locked?: boolean;           // Prevents drag/resize when true
  zIndex?: number;            // Layer order (higher = on top)
  lockAspectRatio?: boolean;  // For image fields: keep width/height proportional
}

// Template configuration
export interface CertificateTemplate {
  id?: string;
  templateName: string;
  fileUrl: string;
  fileType: 'image';
  pdfWidth: number; // Template dimensions in pixels
  pdfHeight: number;
  pageCount?: number;
  fields: CertificateField[];
  createdAt?: Date;
  updatedAt?: Date;
}

// Imported data from Excel/CSV
export interface ImportedData {
  fileName: string;
  headers: string[]; // Column names
  rows: Record<string, any>[]; // Array of row objects (preview only)
  rowCount: number;
  /** Server-side import ID — set when the file was uploaded via the imports API */
  importId?: string;
  /** All import IDs when multiple files were uploaded; importId === importIds[0] */
  importIds?: string[];
}

// Column mapping (Excel column -> Certificate field)
export interface FieldMapping {
  fieldId: string; // Certificate field ID
  columnName: string; // Excel column name
}

// Export options
export interface ExportOptions {
  format: 'individual' | 'merged';
  includeQR: boolean;
  qrPosition?: { x: number; y: number; size: number };
  fileName: string;
  compression?: 'none' | 'low' | 'high';
}

// Generation job status
export type GenerationStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface GenerationJob {
  id: string;
  status: GenerationStatus;
  totalCertificates: number;
  processedCertificates: number;
  failedCertificates: number;
  downloadUrl?: string;
  errorMessage?: string;
  createdAt: Date;
  completedAt?: Date;
}

// Google Fonts list (comprehensive selection for certificates)
export const CERTIFICATE_FONTS = [
  // ── System fonts ─────────────────────────────────────────────────────────
  { name: 'Arial', value: 'Arial', category: 'sans-serif' },
  { name: 'Georgia', value: 'Georgia', category: 'serif' },
  { name: 'Times New Roman', value: 'Times New Roman', category: 'serif' },
  { name: 'Helvetica', value: 'Helvetica', category: 'sans-serif' },
  // ── Google Sans-serif ─────────────────────────────────────────────────────
  { name: 'Inter', value: 'Inter', category: 'sans-serif', googleFont: true },
  { name: 'Roboto', value: 'Roboto', category: 'sans-serif', googleFont: true },
  { name: 'Open Sans', value: 'Open Sans', category: 'sans-serif', googleFont: true },
  { name: 'Lato', value: 'Lato', category: 'sans-serif', googleFont: true },
  { name: 'Montserrat', value: 'Montserrat', category: 'sans-serif', googleFont: true },
  { name: 'Poppins', value: 'Poppins', category: 'sans-serif', googleFont: true },
  { name: 'Nunito', value: 'Nunito', category: 'sans-serif', googleFont: true },
  { name: 'Raleway', value: 'Raleway', category: 'sans-serif', googleFont: true },
  { name: 'Oswald', value: 'Oswald', category: 'sans-serif', googleFont: true },
  { name: 'Ubuntu', value: 'Ubuntu', category: 'sans-serif', googleFont: true },
  { name: 'Work Sans', value: 'Work Sans', category: 'sans-serif', googleFont: true },
  { name: 'DM Sans', value: 'DM Sans', category: 'sans-serif', googleFont: true },
  { name: 'Plus Jakarta Sans', value: 'Plus Jakarta Sans', category: 'sans-serif', googleFont: true },
  { name: 'Outfit', value: 'Outfit', category: 'sans-serif', googleFont: true },
  { name: 'Jost', value: 'Jost', category: 'sans-serif', googleFont: true },
  { name: 'Barlow', value: 'Barlow', category: 'sans-serif', googleFont: true },
  { name: 'Mulish', value: 'Mulish', category: 'sans-serif', googleFont: true },
  { name: 'PT Sans', value: 'PT Sans', category: 'sans-serif', googleFont: true },
  { name: 'Noto Sans', value: 'Noto Sans', category: 'sans-serif', googleFont: true },
  { name: 'Source Sans 3', value: 'Source Sans 3', category: 'sans-serif', googleFont: true },
  // ── Google Serif ──────────────────────────────────────────────────────────
  { name: 'Playfair Display', value: 'Playfair Display', category: 'serif', googleFont: true },
  { name: 'Merriweather', value: 'Merriweather', category: 'serif', googleFont: true },
  { name: 'Lora', value: 'Lora', category: 'serif', googleFont: true },
  { name: 'EB Garamond', value: 'EB Garamond', category: 'serif', googleFont: true },
  { name: 'Cormorant Garamond', value: 'Cormorant Garamond', category: 'serif', googleFont: true },
  { name: 'Libre Baskerville', value: 'Libre Baskerville', category: 'serif', googleFont: true },
  { name: 'Crimson Text', value: 'Crimson Text', category: 'serif', googleFont: true },
  { name: 'PT Serif', value: 'PT Serif', category: 'serif', googleFont: true },
  { name: 'Noto Serif', value: 'Noto Serif', category: 'serif', googleFont: true },
  { name: 'DM Serif Display', value: 'DM Serif Display', category: 'serif', googleFont: true },
  { name: 'Italiana', value: 'Italiana', category: 'serif', googleFont: true },
  { name: 'Spectral', value: 'Spectral', category: 'serif', googleFont: true },
  { name: 'Cardo', value: 'Cardo', category: 'serif', googleFont: true },
  // ── Google Display ────────────────────────────────────────────────────────
  { name: 'Abril Fatface', value: 'Abril Fatface', category: 'display', googleFont: true },
  { name: 'Bebas Neue', value: 'Bebas Neue', category: 'display', googleFont: true },
  { name: 'Anton', value: 'Anton', category: 'display', googleFont: true },
  { name: 'Righteous', value: 'Righteous', category: 'display', googleFont: true },
  { name: 'Cinzel', value: 'Cinzel', category: 'display', googleFont: true },
  { name: 'Philosopher', value: 'Philosopher', category: 'display', googleFont: true },
  // ── Google Handwriting / Script ───────────────────────────────────────────
  { name: 'Great Vibes', value: 'Great Vibes', category: 'handwriting', googleFont: true },
  { name: 'Dancing Script', value: 'Dancing Script', category: 'handwriting', googleFont: true },
  { name: 'Pacifico', value: 'Pacifico', category: 'handwriting', googleFont: true },
  { name: 'Sacramento', value: 'Sacramento', category: 'handwriting', googleFont: true },
  { name: 'Satisfy', value: 'Satisfy', category: 'handwriting', googleFont: true },
  { name: 'Kaushan Script', value: 'Kaushan Script', category: 'handwriting', googleFont: true },
  { name: 'Allura', value: 'Allura', category: 'handwriting', googleFont: true },
  { name: 'Alex Brush', value: 'Alex Brush', category: 'handwriting', googleFont: true },
  { name: 'Pinyon Script', value: 'Pinyon Script', category: 'handwriting', googleFont: true },
] as const;

// Preset colors for quick selection
export const PRESET_COLORS = [
  { name: 'Black', value: '#000000' },
  { name: 'Dark Gray', value: '#4A5568' },
  { name: 'Blue', value: '#2563EB' },
  { name: 'Gold', value: '#D97706' },
  { name: 'Dark Green', value: '#047857' },
  { name: 'Burgundy', value: '#991B1B' },
  { name: 'Navy', value: '#1E3A8A' },
  { name: 'Brown', value: '#78350F' },
] as const;

// Date format options
export const DATE_FORMATS = [
  { label: 'MM/DD/YYYY', value: 'MM/dd/yyyy', example: '01/15/2026' },
  { label: 'DD/MM/YYYY', value: 'dd/MM/yyyy', example: '15/01/2026' },
  { label: 'YYYY-MM-DD', value: 'yyyy-MM-dd', example: '2026-01-15' },
  { label: 'Month DD, YYYY', value: 'MMMM dd, yyyy', example: 'January 15, 2026' },
  { label: 'DD Month YYYY', value: 'dd MMMM yyyy', example: '15 January 2026' },
  { label: 'Mon DD, YYYY', value: 'MMM dd, yyyy', example: 'Jan 15, 2026' },
] as const;

// Field type metadata
export const FIELD_TYPE_CONFIG = {
  name: {
    label: 'Recipient Name',
    icon: 'User',
    defaultWidth: 300,
    defaultHeight: 40,
    sampleValue: 'John Doe',
  },
  course: {
    label: 'Course Name',
    icon: 'BookOpen',
    defaultWidth: 350,
    defaultHeight: 40,
    sampleValue: 'Web Development Fundamentals',
  },
  start_date: {
    label: 'Start Date',
    icon: 'Calendar',
    defaultWidth: 150,
    defaultHeight: 30,
    sampleValue: 'January 15, 2026',
  },
  end_date: {
    label: 'End Date',
    icon: 'Calendar',
    defaultWidth: 150,
    defaultHeight: 30,
    sampleValue: 'March 15, 2026',
  },
  custom_text: {
    label: 'Custom Text',
    icon: 'Type',
    defaultWidth: 200,
    defaultHeight: 30,
    sampleValue: 'Custom Value',
  },
  qr_code: {
    label: 'QR Code',
    icon: 'QrCode',
    defaultWidth: 100,
    defaultHeight: 100,
    sampleValue: '[QR Code]',
  },
  image: {
    label: 'Image',
    icon: 'Image',
    defaultWidth: 120,
    defaultHeight: 120,
    sampleValue: '',
  },
  email: {
    label: 'Email Address',
    icon: 'Mail',
    defaultWidth: 250,
    defaultHeight: 30,
    sampleValue: 'john@example.com',
  },
  phone: {
    label: 'Phone Number',
    icon: 'Phone',
    defaultWidth: 180,
    defaultHeight: 30,
    sampleValue: '+1-555-000-0001',
  },
} as const;
