'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { CertificateField, ImportedData, FieldMapping } from '@/lib/types/certificate';
import type { SavedImport } from '../schema/types';
import { Upload, FileSpreadsheet, Download, CheckCircle2, Plus, ArrowRight, Keyboard, AlertCircle, AlertTriangle, Link2, Loader2, Info, X, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api/client';
import { getXlsx } from '@/lib/utils/dynamic-imports';
import { ManualDataEntry } from './ManualDataEntry';

// Semantic field types that are logically unique per person across templates
const SEMANTIC_TYPES = new Set(['name', 'course', 'start_date', 'end_date']);

// Stable display order for field types — keeps mapping UI predictable regardless
// of the order fields were placed on the canvas.
const FIELD_TYPE_ORDER: Record<string, number> = {
  name: 0,
  course: 1,
  start_date: 2,
  end_date: 3,
  credential_id: 4,
  organization: 5,
  grade: 6,
  level: 7,
  duration: 8,
  issuer: 9,
};

function sortFields(fields: CertificateField[]): CertificateField[] {
  return [...fields].sort((a, b) => {
    const oa = FIELD_TYPE_ORDER[a.type] ?? 99;
    const ob = FIELD_TYPE_ORDER[b.type] ?? 99;
    if (oa !== ob) return oa - ob;
    return (a.label ?? '').localeCompare(b.label ?? '');
  });
}

// User-friendly messages for mapping errors
function getDuplicateTooltip(column: string): string {
  return `"${column}" is mapped to more than one field. Both fields will show the same data. If that's not what you want, pick a different column for one of them.`;
}

const MAX_DATA_FILE_MB = 10;
const MAX_DATA_FILE_BYTES = MAX_DATA_FILE_MB * 1024 * 1024;
const MAX_ROWS = 2000;
const WARN_ROWS = 500;

function stripExt(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

// Strips trailing " (Required)" / " (optional)" / " *" markers added by sample files before comparing
function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/\s*\((required|optional)\)\s*$/i, '').replace(/\s*\*\s*$/, '').trim();
}

interface DataSelectorProps {
  fields: CertificateField[];
  templateGroups?: Array<{ templateName: string; fields: CertificateField[] }>;
  savedImports: SavedImport[];
  importedData: ImportedData | null;
  fieldMappings: FieldMapping[];
  onDataImport: (data: ImportedData | null) => void;
  onMappingChange: (mappings: FieldMapping[]) => void;
  onLoadImport?: (importId: string) => Promise<void>;
  onContinueToGenerate?: () => void;
  onAdditionalRows?: (rows: Record<string, unknown>[]) => void;
  additionalRows?: Record<string, unknown>[];
  /** Navigate back to the template designer so the user can add extra fields */
  onGoToDesign?: () => void;
}

export function DataSelector({
  fields,
  templateGroups,
  savedImports,
  importedData,
  fieldMappings,
  onDataImport,
  onMappingChange,
  onLoadImport,
  onContinueToGenerate,
  onAdditionalRows,
  additionalRows,
  onGoToDesign,
}: DataSelectorProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showUpload, setShowUpload] = useState(!importedData);
  // Mapping section: start collapsed when all fields are already mapped on mount
  const [mappingExpanded, setMappingExpanded] = useState(() => {
    const mf = fields.filter(f => f.type !== 'qr_code' && f.type !== 'image');
    const vm = fieldMappings.filter(m => mf.some(f => f.id === m.fieldId) && !!m.columnName).length;
    return vm < mf.length; // expand if anything is unmapped
  });
  const [extraColumnsDismissed, setExtraColumnsDismissed] = useState(false);
  // Name-before-upload step
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [pendingName, setPendingName] = useState('');
  const pendingNameRef = useRef('');
  // Recent import expand/preview
  const [expandedImportId, setExpandedImportId] = useState<string | null>(null);
  const [importPreviewCache, setImportPreviewCache] = useState<Record<string, Array<Record<string, unknown>>>>({});
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [entryMode, setEntryMode] = useState<'upload' | 'manual'>('upload');
  const [isManualEntry, setIsManualEntry] = useState(false);
  const [manualEditSeed, setManualEditSeed] = useState<ImportedData | undefined>(undefined);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loadImportError, setLoadImportError] = useState<string | null>(null);
  const [showAdditionalRows, setShowAdditionalRows] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('Uploading…');
  const [templateCardDismissed, setTemplateCardDismissed] = useState(() => {
    try { return sessionStorage.getItem('gencert_template_card_dismissed') === '1'; } catch { return false; }
  });
  const [pendingMapping, setPendingMapping] = useState<{
    fieldId: string;
    columnName: string;
    otherFields: { id: string; label: string }[];
  } | null>(null);

  // Reset banner + mapping collapse whenever the data source changes (new file or load)
  useEffect(() => {
    if (!importedData) return;
    setExtraColumnsDismissed(false);
    const mf = fields.filter(f => f.type !== 'qr_code' && f.type !== 'image');
    const vm = fieldMappings.filter(m => mf.some(f => f.id === m.fieldId) && !!m.columnName).length;
    setMappingExpanded(vm < mf.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importedData]);

  // Upload logic extracted so it can be called after the naming step
  const handleStartUpload = useCallback(
    async (filesToUpload: File[], importName: string) => {
      setPendingFiles(null);
      setUploadError(null);
      setIsProcessing(true);

      type FileResult = {
        file: File;
        importId: string;
        rowCount: number;
        headers: string[];
        previewRows: Record<string, unknown>[];
      };

      const results: FileResult[] = [];

      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i]!;
        const label = filesToUpload.length > 1 ? ` (${i + 1}/${filesToUpload.length})` : '';
        // Use importName for single file, or per-file name for multi
        const backendName = filesToUpload.length === 1 ? importName : file.name;

        setProcessingStatus(`Uploading${label}…`);

        try {
          const importJobs = await api.imports.create(file, { file_name: backendName });
          let importJob = importJobs[0]!;

          if (importJob.status !== 'completed' && importJob.status !== 'failed') {
            setProcessingStatus(`Processing${label}…`);
            const deadline = Date.now() + 120_000;
            while (
              (importJob.status === 'queued' ||
                importJob.status === 'pending' ||
                importJob.status === 'processing') &&
              Date.now() < deadline
            ) {
              await new Promise(r => setTimeout(r, 2000));
              importJob = await api.imports.get(importJob.id);
            }
          }

          if (importJob.status === 'failed') {
            setUploadError(`"${file.name}" failed: ${importJob.error_message ?? 'processing error'}`);
            setIsProcessing(false);
            return;
          }
          if (importJob.status !== 'completed') {
            setUploadError(`"${file.name}" timed out. Please try again.`);
            setIsProcessing(false);
            return;
          }

          setProcessingStatus(`Loading preview${label}…`);
          const previewResult = await api.imports.getData(importJob.id, { limit: 10 });
          const rawItems = previewResult.items as Array<{ row_index: number; data: Record<string, unknown> }>;
          const previewRows = rawItems.map(r => r.data ?? r);

          if (previewRows.length === 0) {
            setUploadError(`"${file.name}" is empty or has no data rows.`);
            setIsProcessing(false);
            return;
          }

          results.push({
            file,
            importId: importJob.id,
            rowCount: importJob.total_rows ?? previewResult.pagination.total,
            headers: Object.keys(previewRows[0]!),
            previewRows,
          });
        } catch (err) {
          console.error('[DataSelector] Upload error:', err);
          const msg = err instanceof Error ? err.message : String(err);
          setUploadError(`Failed to upload "${file.name}": ${msg || 'please try again.'}`);
          setIsProcessing(false);
          return;
        }
      }

      const allHeaders = [...new Set(results.flatMap(r => r.headers))];
      const totalRowCount = results.reduce((sum, r) => sum + r.rowCount, 0);
      const importIds = results.map(r => r.importId);
      const fileName = filesToUpload.length === 1
        ? importName
        : `${results.length} files`;

      if (totalRowCount === 0) {
        const names = results.map(r => `"${r.file.name}"`).join(', ');
        setUploadError(
          `0 rows imported from ${names}. The file may only have a header row, ` +
          `all rows may have failed to parse, or an unsupported format was used. ` +
          `Open the file in a spreadsheet app to verify it has data rows, ` +
          `or download the sample CSV above to see the expected format.`
        );
        setIsProcessing(false);
        return;
      }

      const data: ImportedData = {
        fileName,
        headers: allHeaders,
        rows: results[0]!.previewRows,
        rowCount: totalRowCount,
        importId: importIds[0],
        importIds,
      };

      onDataImport(data);
      setShowUpload(false);
      setIsProcessing(false);
    },
    [onDataImport],
  );

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (rejectedFiles.length > 0) {
        const reason = rejectedFiles[0]?.errors?.[0]?.code;
        setUploadError(
          reason === 'file-too-large'
            ? `File exceeds the ${MAX_DATA_FILE_MB} MB limit.`
            : 'Invalid file. Please upload a .csv, .tsv, .xls, or .xlsx file.',
        );
        return;
      }
      if (acceptedFiles.length === 0) return;

      setUploadError(null);

      // Dedup: warn if the exact same file (name + size) is already imported
      if (importedData && acceptedFiles.length === 1) {
        const f = acceptedFiles[0]!;
        const currentName = importedData.fileName.split(' (')[0];
        if (currentName === f.name && importedData.rowCount > 0) {
          setUploadError(`"${f.name}" looks like the same file already imported (${importedData.rowCount} rows). Upload a different file, or clear the current data first.`);
          return;
        }
      }

      // Pause and ask for a friendly name before uploading
      const defaultName = acceptedFiles.length === 1
        ? stripExt(acceptedFiles[0]!.name)
        : `${acceptedFiles.length} files`;
      pendingNameRef.current = defaultName;
      setPendingName(defaultName);
      setPendingFiles(acceptedFiles);
    },
    [importedData],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv'],
      'text/tab-separated-values': ['.tsv'],
      'text/plain': ['.csv', '.tsv'],           // macOS reports CSV/TSV as text/plain
      'application/octet-stream': ['.csv', '.xlsx', '.xls'], // some browsers/OS combos
    },
    maxFiles: 10,
    maxSize: MAX_DATA_FILE_BYTES,
    disabled: isProcessing || !!pendingFiles,
  });

  const handleToggleExpand = useCallback(async (importId: string) => {
    if (expandedImportId === importId) { setExpandedImportId(null); return; }
    setExpandedImportId(importId);
    if (importPreviewCache[importId]) return;
    setPreviewLoading(importId);
    try {
      const result = await api.imports.getData(importId, { limit: 5 });
      const rawItems = result.items as Array<{ row_index: number; data: Record<string, unknown> }>;
      const rows = rawItems.map(r => r.data ?? r) as Array<Record<string, unknown>>;
      setImportPreviewCache(prev => ({ ...prev, [importId]: rows }));
    } catch { /* silently fail — user can still select */ }
    finally { setPreviewLoading(null); }
  }, [expandedImportId, importPreviewCache]);

  const downloadSampleFile = async () => {
    const XLSX = await getXlsx();

    const sampleValue = (field: CertificateField, i: number): string => {
      const t = field.type;
      if (t === 'name') return `John Doe ${i}`;
      if (t === 'course') return 'Web Development Fundamentals';
      if (t === 'start_date') return '01/15/2026';
      if (t === 'end_date') return '03/15/2026';

      const lower = field.label.toLowerCase();
      if (lower.includes('email')) return `student${i}@example.com`;
      if (lower.includes('grade') || lower.includes('score')) return `${85 + i}%`;
      if (lower.includes('date')) return `01/${String(i).padStart(2, '0')}/2026`;
      return `${field.label} ${i}`;
    };

    const allRawFields = templateGroups ? templateGroups.flatMap(g => g.fields) : fields;
    const seenTypes = new Set<string>();
    const seenLabels = new Set<string>();
    const mappableFields = sortFields(allRawFields.filter(f => {
      if (f.type === 'qr_code' || f.type === 'image') return false;
      if (SEMANTIC_TYPES.has(f.type)) {
        if (seenTypes.has(f.type)) return false;
        seenTypes.add(f.type);
      }
      const key = f.label.toLowerCase();
      if (seenLabels.has(key)) return false;
      seenLabels.add(key);
      return true;
    }));

    const hasEmailCol = mappableFields.some(f => f.label.toLowerCase().includes('email'));
    const sampleData = [];
    for (let i = 1; i <= 5; i++) {
      const row: Record<string, unknown> = {};
      mappableFields.forEach(f => {
        const colName = f.type === 'name' ? `${f.label} (Required)` : f.label;
        row[colName] = sampleValue(f, i);
      });
      if (!hasEmailCol) row['Email (optional)'] = `student${i}@example.com`;
      sampleData.push(row);
    }

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Recipients');
    XLSX.writeFile(wb, 'certificate_data_sample.xlsx');
  };

  const downloadSampleFileCSV = async () => {
    const sampleValue = (field: CertificateField, i: number): string => {
      const t = field.type;
      if (t === 'name') return `John Doe ${i}`;
      if (t === 'course') return 'Web Development Fundamentals';
      if (t === 'start_date') return '01/15/2026';
      if (t === 'end_date') return '03/15/2026';

      const lower = field.label.toLowerCase();
      if (lower.includes('email')) return `student${i}@example.com`;
      if (lower.includes('grade') || lower.includes('score')) return `${85 + i}%`;
      if (lower.includes('date')) return `01/${String(i).padStart(2, '0')}/2026`;
      return `${field.label} ${i}`;
    };

    const allRawFields = templateGroups ? templateGroups.flatMap(g => g.fields) : fields;
    const seenTypes = new Set<string>();
    const seenLabels = new Set<string>();
    const mappableFields = sortFields(allRawFields.filter(f => {
      if (f.type === 'qr_code' || f.type === 'image') return false;
      if (SEMANTIC_TYPES.has(f.type)) {
        if (seenTypes.has(f.type)) return false;
        seenTypes.add(f.type);
      }
      const key = f.label.toLowerCase();
      if (seenLabels.has(key)) return false;
      seenLabels.add(key);
      return true;
    }));

    const hasEmailCol = mappableFields.some(f => f.label.toLowerCase().includes('email'));
    const headers = [
      ...mappableFields.map(f => f.type === 'name' ? `${f.label} (Required)` : f.label),
      ...(hasEmailCol ? [] : ['Email (optional)']),
    ];
    const rows: string[][] = [];
    for (let i = 1; i <= 5; i++) {
      const row = mappableFields.map(f => sampleValue(f, i));
      if (!hasEmailCol) row.push(`student${i}@example.com`);
      rows.push(row);
    }

    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'certificate_data_sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyMappingNow = (fieldId: string, columnName: string, allOfType: boolean) => {
    const mappedField = fields.find((f) => f.id === fieldId);
    const fieldsToMap = allOfType && mappedField && SEMANTIC_TYPES.has(mappedField.type)
      ? fields.filter((f) => f.type === mappedField.type)
      : fields.filter((f) => f.id === fieldId);
    const updated = [...fieldMappings];
    fieldsToMap.forEach((f) => {
      const idx = updated.findIndex((m) => m.fieldId === f.id);
      if (idx >= 0) updated[idx] = { ...updated[idx]!, columnName };
      else updated.push({ fieldId: f.id, columnName });
    });
    onMappingChange(updated);
    setPendingMapping(null);
  };

  const handleMappingChange = (fieldId: string, columnName: string) => {
    const mappedField = fields.find((f) => f.id === fieldId);
    if (mappedField && SEMANTIC_TYPES.has(mappedField.type)) {
      const otherSameType = fields.filter((f) => f.type === mappedField.type && f.id !== fieldId);
      if (otherSameType.length > 0) {
        setPendingMapping({ fieldId, columnName, otherFields: otherSameType.map((f) => ({ id: f.id, label: f.label })) });
        return;
      }
    }
    applyMappingNow(fieldId, columnName, false);
  };

  const getMappedColumn = (fieldId: string) => {
    return fieldMappings.find((m) => m.fieldId === fieldId)?.columnName;
  };

  const handleManualDataSubmit = (data: ImportedData) => {
    onDataImport(data);
    setShowUpload(false);
    setIsManualEntry(true);

    const typeToColumn: Record<string, string> = {};
    data.headers.forEach((header) => {
      const matchedField = fields.find((f) =>
        normalizeHeader(header) === normalizeHeader(f.label)
      );
      if (matchedField && SEMANTIC_TYPES.has(matchedField.type)) {
        typeToColumn[matchedField.type] = header;
      }
      // Content-based detection for email/phone when label doesn't match exactly
      const nh = normalizeHeader(header);
      if (!typeToColumn['email'] && (nh.includes('email') || nh.includes('e-mail'))) {
        typeToColumn['email'] = header;
      }
      if (!typeToColumn['phone'] && (nh.includes('phone') || nh.includes('mobile') || nh.includes('contact'))) {
        typeToColumn['phone'] = header;
      }
    });

    const autoMappings = fields
      .filter((f) => f.type !== 'qr_code' && f.type !== 'image')
      .map((field) => {
        const labelMatch = data.headers.find(
          (h) => normalizeHeader(h) === normalizeHeader(field.label)
        );
        if (labelMatch) return { fieldId: field.id, columnName: labelMatch };
        if (SEMANTIC_TYPES.has(field.type) && typeToColumn[field.type]) {
          return { fieldId: field.id, columnName: typeToColumn[field.type]! };
        }
        return null;
      })
      .filter(Boolean) as FieldMapping[];

    onMappingChange(autoMappings);
  };

  // Semantic fields are always excluded — auto-fill intentionally maps every
  // same-type field to one column, so they're never a user error.
  // Stale mappings (fieldId not in current `fields`) are also excluded to
  // prevent false positives after template switches or session restores.
  const semanticFieldIds = new Set(fields.filter(f => SEMANTIC_TYPES.has(f.type)).map(f => f.id));
  const currentFieldIds = new Set(fields.map(f => f.id));
  const columnUsageCount = fieldMappings.reduce<Record<string, number>>((acc, m) => {
    if (m.columnName && !semanticFieldIds.has(m.fieldId) && currentFieldIds.has(m.fieldId)) {
      acc[m.columnName] = (acc[m.columnName] ?? 0) + 1;
    }
    return acc;
  }, {});
  const duplicatedColumns = new Set(Object.entries(columnUsageCount).filter(([, count]) => count > 1).map(([col]) => col));

  // Mappable fields (non-media) in the current template
  const mappableFields = fields.filter(f => f.type !== 'qr_code' && f.type !== 'image');
  // Valid mappings: only those pointing to a current field with a column set
  const validMappingCount = fieldMappings.filter(m => currentFieldIds.has(m.fieldId) && !!m.columnName).length;
  // Unmapped required (name type) and any unmapped fields — used for banner + Continue guard
  const unmappedFields = mappableFields.filter(f => !fieldMappings.some(m => m.fieldId === f.id && m.columnName));
  const unmappedNameFields = unmappedFields.filter(f => f.type === 'name');

  // Import columns not used by any field mapping — candidates the user might want to add to the template
  const extraColumns = useMemo(() => {
    if (!importedData || importedData.headers.length === 0) return [];
    const importHeaders = new Set(importedData.headers);
    // Guard: if fieldMappings has mapped columns but none of them are in the current file's
    // headers, the mappings are stale (haven't caught up yet from a previous render).
    // Return [] to avoid false-positive "Email not in template" flashes.
    const hasAnyMappedCol = fieldMappings.some(m => !!m.columnName);
    const hasMappedColInCurrentFile = fieldMappings.some(m => m.columnName && importHeaders.has(m.columnName));
    if (hasAnyMappedCol && !hasMappedColInCurrentFile) return [];
    const mappedCols = new Set(fieldMappings.map(m => m.columnName).filter(Boolean));
    // "Email" is a system delivery column — never mapped to a certificate field.
    // Exclude it (and common aliases) so it never shows the "not in template" warning.
    return importedData.headers.filter(h => !mappedCols.has(h) && !/^e-?mail(\s*\((required|optional)\))?$/i.test(h));
  }, [importedData, fieldMappings]);

  // Detect columns with only numeric values mapped to text-type fields (likely wrong column)
  const numericColumnsMappedToText = new Set<string>(
    fieldMappings
      .filter((m) => {
        if (!m.columnName || !importedData) return false;
        const field = fields.find(f => f.id === m.fieldId);
        if (!field || field.type === 'qr_code' || field.type === 'image') return false;
        const sampleValues = importedData.rows.map(r => String(r[m.columnName] ?? '')).filter(v => v !== '');
        return sampleValues.length > 0 && sampleValues.every(v => !isNaN(Number(v)));
      })
      .map((m) => m.columnName),
  );

  return (
    <div className="max-w-2xl mx-auto">
      {showUpload ? (
        <div className="min-h-[62vh] flex flex-col items-center justify-center py-8">
          <div className="w-full space-y-5">
          {/* Title + instructions */}
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Add recipient data</h2>
            <p className="text-sm text-muted-foreground">
              Upload a spreadsheet or enter recipients manually. Each row becomes one certificate.
              Supports .csv, .tsv, .xlsx, .xls — max 10 MB per file, 2,000 rows per file.
            </p>
          </div>

          {/* Sample download strip */}
          {!templateCardDismissed && (
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50 border border-border/60">
              <Download className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground flex-1 min-w-0">
                Need a sample?{' '}
                <button
                  onClick={() => { downloadSampleFile(); setTemplateCardDismissed(true); try { sessionStorage.setItem('gencert_template_card_dismissed', '1'); } catch { /**/ } }}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  .xlsx
                </button>
                {' or '}
                <button
                  onClick={() => { downloadSampleFileCSV(); setTemplateCardDismissed(true); try { sessionStorage.setItem('gencert_template_card_dismissed', '1'); } catch { /**/ } }}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  .csv
                </button>
                {' '}— headers match your certificate field names
              </span>
              <button
                onClick={() => {
                  setTemplateCardDismissed(true);
                  try { sessionStorage.setItem('gencert_template_card_dismissed', '1'); } catch { /* ignore */ }
                }}
                className="text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Mode toggle */}
          <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
            <button
              onClick={() => setEntryMode('upload')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${entryMode === 'upload' ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Upload className="w-3.5 h-3.5" />
              Upload file
            </button>
            <button
              onClick={() => setEntryMode('manual')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${entryMode === 'manual' ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Keyboard className="w-3.5 h-3.5" />
              Enter manually
            </button>
          </div>

          {entryMode === 'upload' ? (
            <div className="space-y-3">
              {/* Name prompt shown after file is dropped */}
              {pendingFiles ? (
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm text-muted-foreground">
                      {pendingFiles.length === 1 ? pendingFiles[0]!.name : `${pendingFiles.length} files selected`}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Pencil className="w-3 h-3" /> Give this import a name
                    </label>
                    <Input
                      autoFocus
                      value={pendingName}
                      onChange={(e) => { setPendingName(e.target.value); pendingNameRef.current = e.target.value; }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && pendingName.trim()) void handleStartUpload(pendingFiles, pendingName.trim());
                        if (e.key === 'Escape') { setPendingFiles(null); setPendingName(''); }
                      }}
                      placeholder="e.g. March 2026 cohort"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => { setPendingFiles(null); setPendingName(''); }}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={!pendingName.trim()}
                      onClick={() => void handleStartUpload(pendingFiles, pendingName.trim())}
                    >
                      Upload
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  {...getRootProps()}
                  className={cn(
                    'border-2 border-dashed rounded-lg py-14 px-8 text-center cursor-pointer transition-all',
                    isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted/20',
                    isProcessing && 'cursor-default pointer-events-none',
                  )}
                >
                  <input {...getInputProps()} />
                  {isProcessing ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-9 h-9 text-primary animate-spin" />
                      <p className="text-sm text-muted-foreground">{processingStatus}</p>
                    </div>
                  ) : isDragActive ? (
                    <div className="flex flex-col items-center gap-3">
                      <FileSpreadsheet className="w-9 h-9 text-primary" />
                      <p className="font-medium">Drop to upload</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <Upload className="w-9 h-9 text-muted-foreground/40" />
                      <div className="space-y-1">
                        <p className="font-medium">Drop your spreadsheet here</p>
                        <p className="text-sm text-muted-foreground">
                          or <span className="text-primary underline-offset-2 hover:underline cursor-pointer">browse files</span>
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground/50">.csv · .tsv · .xlsx · .xls · max {MAX_DATA_FILE_MB} MB per file · {MAX_ROWS.toLocaleString()} rows per file</p>
                    </div>
                  )}
                </div>
              )}
              {uploadError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">{uploadError}</p>
                </div>
              )}
            </div>
          ) : (
            <ManualDataEntry
              fields={fields}
              onDataChange={(data) => { onDataImport(data); }}
              onDataSubmit={(data) => {
                setManualEditSeed(undefined);
                handleManualDataSubmit(data);
              }}
              initialData={manualEditSeed}
            />
          )}

          {/* Recent uploads — expandable rows, upload mode only */}
          {savedImports.length > 0 && entryMode === 'upload' && !pendingFiles && !isProcessing && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Recent uploads</p>
              {loadImportError && (
                <p className="text-xs text-destructive mb-2">{loadImportError}</p>
              )}
              <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                {savedImports.slice(0, 8).map((importJob) => {
                  const isExpanded = expandedImportId === importJob.id;
                  const previewRows = importPreviewCache[importJob.id];
                  const displayName = importJob.file_name ? stripExt(importJob.file_name) : 'Untitled';
                  return (
                    <div key={importJob.id}>
                      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/20 transition-colors">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm truncate flex-1 min-w-0" title={displayName}>{displayName}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {(importJob.total_rows || 0).toLocaleString()} rows
                        </span>
                        <span className="text-xs text-muted-foreground/50 shrink-0">
                          {importJob.created_at ? new Date(importJob.created_at).toLocaleDateString() : ''}
                        </span>
                        {/* Expand / preview */}
                        <button
                          onClick={() => void handleToggleExpand(importJob.id)}
                          title={isExpanded ? 'Collapse' : 'Preview data'}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                        >
                          {previewLoading === importJob.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : isExpanded
                              ? <ChevronUp className="w-3.5 h-3.5" />
                              : <ChevronDown className="w-3.5 h-3.5" />
                          }
                        </button>
                        {/* Select / use */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs shrink-0"
                          disabled={isProcessing}
                          onClick={async () => {
                            if (!onLoadImport) return;
                            setLoadImportError(null);
                            setIsProcessing(true);
                            try {
                              await onLoadImport(importJob.id);
                              setShowUpload(false);
                            } catch {
                              setLoadImportError('Failed to load import data. Please try again.');
                            } finally {
                              setIsProcessing(false);
                            }
                          }}
                        >
                          Use this
                        </Button>
                      </div>
                      {/* Inline preview */}
                      {isExpanded && (
                        <div className="border-t border-border bg-muted/20 overflow-x-auto">
                          {!previewRows ? (
                            <p className="text-xs text-muted-foreground px-3 py-2">Loading preview…</p>
                          ) : previewRows.length === 0 ? (
                            <p className="text-xs text-muted-foreground px-3 py-2">No data rows found.</p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-border">
                                  {Object.keys(previewRows[0]!).map(h => (
                                    <th key={h} className="px-3 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {previewRows.map((row, i) => (
                                  <tr key={i} className="border-b border-border/50 last:border-0">
                                    {Object.values(row).map((v, j) => (
                                      <td key={j} className="px-3 py-1.5 whitespace-nowrap max-w-40 truncate text-muted-foreground">{String(v ?? '')}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          </div>
        </div>
      ) : (
        <div className="space-y-5">

          {/* Title */}
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Add recipient data</h2>
            <p className="text-sm text-muted-foreground">
              Map your spreadsheet columns to certificate fields, then generate.
            </p>
          </div>

          {/* File strip */}
          {importedData && (
            <div className="flex items-center gap-2.5 text-sm">
              <FileSpreadsheet className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-medium truncate flex-1 min-w-0">{importedData.fileName}</span>
              <span className="text-muted-foreground/60 text-xs shrink-0 whitespace-nowrap">
                {importedData.rowCount.toLocaleString()} {importedData.rowCount === 1 ? 'recipient' : 'recipients'}
                {' · '}{importedData.headers.length} col{importedData.headers.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => {
                  if (isManualEntry) { setEntryMode('manual'); setManualEditSeed(importedData ?? undefined); }
                  else { setManualEditSeed(undefined); }
                  setIsManualEntry(false); setUploadError(null); setShowUpload(true); onDataImport(null);
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 underline-offset-2 hover:underline"
              >
                {isManualEntry ? 'Edit entries' : (importedData?.importIds && importedData.importIds.length > 1 ? 'Change files' : 'Change')}
              </button>
            </div>
          )}

          {/* ── Compact preview table ── */}
          {importedData && importedData.headers.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border">
                      {importedData.headers.map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importedData.rows.length > 0 ? importedData.rows.slice(0, 4).map((row, i) => (
                      <tr key={i} className={`border-b last:border-0 ${i % 2 ? 'bg-muted/10' : ''}`}>
                        {importedData.headers.map(h => (
                          <td key={h} className="px-3 py-2 truncate max-w-45 text-foreground" title={String(row[h] ?? '')}>
                            {String(row[h] ?? '') !== '' ? String(row[h]) : <span className="text-muted-foreground/30 italic">—</span>}
                          </td>
                        ))}
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={importedData.headers.length} className="px-3 py-4 text-center text-muted-foreground/60 text-xs italic">
                          Preview unavailable — all {importedData.rowCount.toLocaleString()} rows will still be used
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {importedData.rowCount > 4 && (
                <div className="px-3 py-1.5 bg-muted/20 border-t border-border/60 text-[11px] text-muted-foreground">
                  Showing {Math.min(4, importedData.rows.length)} of {importedData.rowCount.toLocaleString()} rows — all used for generation
                </div>
              )}
            </div>
          )}

          {importedData && importedData.rowCount === 0 && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-destructive/8 border border-destructive/20">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">
                0 rows found — file may only have a header row, wrong delimiter, or parse errors. Re-upload after checking the file.
              </p>
            </div>
          )}
          {importedData && importedData.rowCount >= MAX_ROWS && (
            <div className="flex items-center gap-2 px-1">
              <Info className="w-3.5 h-3.5 text-orange-500 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Maximum batch size is <span className="font-medium text-foreground">{MAX_ROWS.toLocaleString()}</span> rows — please split into smaller files.
              </p>
            </div>
          )}
          {importedData && importedData.rowCount >= WARN_ROWS && importedData.rowCount < MAX_ROWS && (
            <div className="flex items-center gap-2 px-1">
              <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <p className="text-xs text-muted-foreground">
                {importedData.rowCount.toLocaleString()} recipients — generation runs in the background (~{Math.ceil(importedData.rowCount / 200)} min). You can leave this page.
              </p>
            </div>
          )}

          {/* Column mapping — flat rows, no Card */}
          {!isManualEntry && importedData && (
            <div className="space-y-3">
              {/* Header row — always visible, toggles collapse */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Map columns to fields</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs tabular-nums ${validMappingCount === mappableFields.length && mappableFields.length > 0 ? 'text-green-600 dark:text-green-400' : unmappedNameFields.length > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {validMappingCount}/{mappableFields.length} mapped
                  </span>
                  {validMappingCount === mappableFields.length && mappableFields.length > 0 && (
                    <button
                      onClick={() => setMappingExpanded(v => !v)}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
                    >
                      {mappingExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {mappingExpanded ? 'Hide' : 'Edit'}
                    </button>
                  )}
                </div>
              </div>

              {/* Auto-mapped success pill — shown when all mapped and collapsed */}
              {validMappingCount === mappableFields.length && mappableFields.length > 0 && !mappingExpanded && (
                <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  All {mappableFields.length} field{mappableFields.length !== 1 ? 's' : ''} auto-mapped — no action needed.
                </div>
              )}

              {(mappingExpanded || validMappingCount < mappableFields.length) && unmappedFields.length > 0 && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    {unmappedFields.length === 1
                      ? `"${unmappedFields[0]!.label}" needs a column mapping`
                      : `${unmappedFields.length} fields need column mappings`}
                    {unmappedNameFields.length > 0 && ' — including required recipient name'}
                  </p>
                </div>
              )}

              {(mappingExpanded || validMappingCount < mappableFields.length) && templateGroups && templateGroups.length > 1 ? (
                <div className="space-y-4">
                  {templateGroups.map((group, gi) => {
                    const mappableGroupFields = group.fields.filter(f => f.type !== 'qr_code' && f.type !== 'image');
                    if (mappableGroupFields.length === 0) return null;
                    const allMappableFields = templateGroups.flatMap(g => g.fields.filter(f => f.type !== 'qr_code' && f.type !== 'image'));
                    const typeCountMap: Record<string, number> = {};
                    allMappableFields.forEach(f => {
                      if (SEMANTIC_TYPES.has(f.type)) typeCountMap[f.type] = (typeCountMap[f.type] ?? 0) + 1;
                    });
                    return (
                      <div key={gi}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="flex items-center gap-1.5 px-2 py-0.5 bg-primary/10 rounded-full text-[11px] font-semibold text-primary">
                            <span className="w-3.5 h-3.5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[8px] font-bold">{gi + 1}</span>
                            {group.templateName}
                          </span>
                          <div className="flex-1 h-px bg-border/50" />
                          <span className="text-[10px] text-muted-foreground">
                            {mappableGroupFields.filter(f => getMappedColumn(f.id)).length}/{mappableGroupFields.length} mapped
                          </span>
                        </div>
                        <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                          {sortFields(mappableGroupFields).map((field) => {
                            const mappedColumn = getMappedColumn(field.id);
                            const isMapped = !!mappedColumn;
                            const isDuplicate = !!mappedColumn && duplicatedColumns.has(mappedColumn);
                            const isNumericMismatch = !!mappedColumn && numericColumnsMappedToText.has(mappedColumn);
                            const isSynced = SEMANTIC_TYPES.has(field.type) && (typeCountMap[field.type] ?? 0) > 1;
                            const isPending = pendingMapping?.fieldId === field.id;
                            const isRequired = field.type === 'name';
                            const isRequiredUnmapped = isRequired && !isMapped;
                            return (
                              <div key={field.id} className={isRequiredUnmapped ? 'bg-red-50/40 dark:bg-red-950/10' : isDuplicate ? 'bg-orange-50/40 dark:bg-orange-950/20' : isNumericMismatch ? 'bg-yellow-50/40 dark:bg-yellow-950/20' : ''}>
                                <div className="flex items-center gap-3 px-3 py-2">
                                  <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                                    <span className="text-sm font-medium">
                                      {field.label}{isRequired && <span className="text-destructive ml-0.5">*</span>}
                                    </span>
                                    {isSynced && (
                                      <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium cursor-help" title="Maps to all templates of this type automatically">
                                        <Link2 className="w-2.5 h-2.5" />
                                        all templates
                                      </span>
                                    )}
                                    {isDuplicate && (
                                      <span className="relative group/tip cursor-help">
                                        <AlertCircle className="w-3 h-3 text-orange-500" />
                                        <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 z-50 hidden group-hover/tip:block w-56 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-xl">
                                          {getDuplicateTooltip(mappedColumn!)}
                                        </span>
                                      </span>
                                    )}
                                    {isNumericMismatch && !isDuplicate && (
                                      <span className="relative group/tip cursor-help">
                                        <AlertCircle className="w-3 h-3 text-yellow-600" />
                                        <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 z-50 hidden group-hover/tip:block w-64 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-xl">
                                          Column has only numbers; &quot;{field.label}&quot; expects text.
                                        </span>
                                      </span>
                                    )}
                                  </div>
                                  <div className="w-44 shrink-0">
                                    <Select value={mappedColumn || ''} onValueChange={(v) => handleMappingChange(field.id, v)}>
                                      <SelectTrigger className={`h-8 text-xs ${isDuplicate ? 'border-orange-400' : isNumericMismatch ? 'border-yellow-500' : isMapped ? 'border-green-500/70' : ''}`}>
                                        <SelectValue placeholder="Select column…" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {importedData.headers.map((h) => (
                                          <SelectItem key={h} value={h}>{h}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="w-4 shrink-0 flex items-center justify-center">
                                    {isMapped && !isDuplicate && !isNumericMismatch && <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />}
                                    {isDuplicate && <AlertCircle className="w-4 h-4 text-orange-500" />}
                                    {isNumericMismatch && !isDuplicate && <AlertCircle className="w-4 h-4 text-yellow-600" />}
                                  </div>
                                </div>
                                {isPending && (
                                  <div className="flex items-start gap-2 mx-3 mb-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/40">
                                    <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs text-amber-800 dark:text-amber-300">
                                        Also map <strong>{pendingMapping!.otherFields.map(f => `"${f.label}"`).join(', ')}</strong> to this column?
                                      </p>
                                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        <button className="text-[11px] font-semibold text-amber-900 dark:text-amber-100 bg-amber-200 dark:bg-amber-700/60 hover:bg-amber-300 dark:hover:bg-amber-600/60 px-2 py-0.5 rounded transition-colors" onClick={() => applyMappingNow(pendingMapping!.fieldId, pendingMapping!.columnName, true)}>
                                          Update all {pendingMapping!.otherFields.length + 1}
                                        </button>
                                        <button className="text-[11px] text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 px-1 py-0.5" onClick={() => applyMappingNow(pendingMapping!.fieldId, pendingMapping!.columnName, false)}>
                                          This field only
                                        </button>
                                        <button className="text-[11px] text-amber-600 dark:text-amber-500 ml-auto hover:text-amber-800 dark:hover:text-amber-300 px-1 py-0.5" onClick={() => setPendingMapping(null)}>
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (mappingExpanded || validMappingCount < mappableFields.length) ? (
                <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                  {sortFields(fields.filter(f => f.type !== 'qr_code' && f.type !== 'image')).map((field) => {
                    const mappedColumn = getMappedColumn(field.id);
                    const isMapped = !!mappedColumn;
                    const isDuplicate = !!mappedColumn && duplicatedColumns.has(mappedColumn);
                    const isNumericMismatch = !!mappedColumn && numericColumnsMappedToText.has(mappedColumn);
                    const hasWarning = isDuplicate || isNumericMismatch;
                    const isPending = pendingMapping?.fieldId === field.id;
                    const isRequired = field.type === 'name';
                    const isRequiredUnmapped = isRequired && !isMapped;
                    return (
                      <div key={field.id} className={isRequiredUnmapped ? 'bg-red-50/40 dark:bg-red-950/10' : isDuplicate ? 'bg-orange-50/40 dark:bg-orange-950/20' : isNumericMismatch ? 'bg-yellow-50/40 dark:bg-yellow-950/20' : ''}>
                        <div className="flex items-center gap-3 px-3 py-2">
                          <div className="flex-1 min-w-0 flex items-center gap-1.5">
                            <span className="text-sm font-medium">
                              {field.label}{isRequired && <span className="text-destructive ml-0.5">*</span>}
                            </span>
                            {isDuplicate && (
                              <span className="relative group/tip cursor-help">
                                <AlertCircle className="w-3 h-3 text-orange-500" />
                                <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 z-50 hidden group-hover/tip:block w-56 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-xl">
                                  {getDuplicateTooltip(mappedColumn!)}
                                </span>
                              </span>
                            )}
                            {isNumericMismatch && !isDuplicate && (
                              <span className="relative group/tip cursor-help">
                                <AlertCircle className="w-3 h-3 text-yellow-600" />
                                <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 z-50 hidden group-hover/tip:block w-64 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-xl">
                                  Column has only numbers; &quot;{field.label}&quot; expects text.
                                </span>
                              </span>
                            )}
                          </div>
                          <div className="w-44 shrink-0">
                            <Select value={mappedColumn || ''} onValueChange={(v) => handleMappingChange(field.id, v)}>
                              <SelectTrigger className={`h-8 text-xs ${isDuplicate ? 'border-orange-400' : isNumericMismatch ? 'border-yellow-500' : isMapped ? 'border-green-500/70' : ''}`}>
                                <SelectValue placeholder="Select column…" />
                              </SelectTrigger>
                              <SelectContent>
                                {importedData.headers.map((h) => (
                                  <SelectItem key={h} value={h}>{h}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="w-4 shrink-0 flex items-center justify-center">
                            {isMapped && !hasWarning && <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />}
                            {isDuplicate && <AlertCircle className="w-4 h-4 text-orange-500" />}
                            {isNumericMismatch && !isDuplicate && <AlertCircle className="w-4 h-4 text-yellow-600" />}
                          </div>
                        </div>
                        {isPending && (
                          <div className="flex items-start gap-2 mx-3 mb-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/40">
                            <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-amber-800 dark:text-amber-300">
                                Also map <strong>{pendingMapping!.otherFields.map(f => `"${f.label}"`).join(', ')}</strong> to this column?
                              </p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <button className="text-[11px] font-semibold text-amber-900 dark:text-amber-100 bg-amber-200 dark:bg-amber-700/60 hover:bg-amber-300 dark:hover:bg-amber-600/60 px-2 py-0.5 rounded transition-colors" onClick={() => applyMappingNow(pendingMapping!.fieldId, pendingMapping!.columnName, true)}>
                                  Update all {pendingMapping!.otherFields.length + 1}
                                </button>
                                <button className="text-[11px] text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 px-1 py-0.5" onClick={() => applyMappingNow(pendingMapping!.fieldId, pendingMapping!.columnName, false)}>
                                  This field only
                                </button>
                                <button className="text-[11px] text-amber-600 dark:text-amber-500 ml-auto hover:text-amber-800 dark:hover:text-amber-300 px-1 py-0.5" onClick={() => setPendingMapping(null)}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {duplicatedColumns.size > 0 && (
                <div className="flex gap-2 px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                  <AlertCircle className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-orange-700 dark:text-orange-300">
                    <span className="font-medium text-orange-900 dark:text-orange-100">Same column mapped to multiple fields — </span>
                    &ldquo;{[...duplicatedColumns].join('", "')}&rdquo; {duplicatedColumns.size === 1 ? 'is' : 'are'} mapped more than once. Both fields will show the same data.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Add manual entries — compact link */}
          {!isManualEntry && onAdditionalRows && importedData && (
            <div>
              {additionalRows && additionalRows.length > 0 ? (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {additionalRows.length} additional {additionalRows.length === 1 ? 'entry' : 'entries'} added manually
                  </span>
                  <button onClick={() => setShowAdditionalRows(v => !v)} className="text-primary hover:underline underline-offset-2">
                    {showAdditionalRows ? 'Hide' : 'Edit'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAdditionalRows(v => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add manual entries
                </button>
              )}
              {showAdditionalRows && (
                <div className="mt-3 rounded-lg border border-border p-4">
                  <p className="text-xs text-muted-foreground mb-3">
                    These entries will be appended after your uploaded file rows during generation.
                  </p>
                  <ManualDataEntry
                    fields={fields}
                    onDataChange={(data) => onAdditionalRows(data.rows)}
                    onDataSubmit={(data) => {
                      onAdditionalRows(data.rows);
                      setShowAdditionalRows(false);
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Extra-column notice — columns in the file that don't map to any template field */}
          {extraColumns.length > 0 && !extraColumnsDismissed && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/50">
              <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-300">
                  {extraColumns.length === 1
                    ? `"${extraColumns[0]}" column isn't in your template`
                    : `${extraColumns.length} columns aren't in your template`}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400/80">
                  {extraColumns.slice(0, 3).map(c => `"${c}"`).join(', ')}{extraColumns.length > 3 ? `, +${extraColumns.length - 3} more` : ''} — go back to add them, or dismiss to ignore.
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {onGoToDesign && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                    onClick={onGoToDesign}
                  >
                    Add to template
                  </Button>
                )}
                <button
                  onClick={() => setExtraColumnsDismissed(true)}
                  className="p-1 rounded text-amber-600/60 dark:text-amber-500/60 hover:text-amber-800 dark:hover:text-amber-300 hover:bg-amber-100/60 dark:hover:bg-amber-900/30 transition-colors"
                  title="Dismiss — extra columns will be ignored"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Generate CTA */}
          {onContinueToGenerate && importedData && (
            <div className="flex items-center justify-end gap-3 pt-1">
              {importedData.rowCount === 0 && (
                <p className="text-xs text-destructive">Fix the 0-row error above before continuing.</p>
              )}
              {importedData.rowCount > 0 && unmappedNameFields.length > 0 && (
                <p className="text-xs text-destructive">Map the recipient name field (*) before generating.</p>
              )}
              {importedData.rowCount > MAX_ROWS && (
                <p className="text-xs text-destructive">Split file to {MAX_ROWS.toLocaleString()} rows max.</p>
              )}
              <Button
                size="lg"
                onClick={onContinueToGenerate}
                className="gap-2"
                disabled={importedData.rowCount === 0 || unmappedNameFields.length > 0 || importedData.rowCount > MAX_ROWS}
              >
                {importedData.rowCount > 0 && importedData.rowCount <= MAX_ROWS
                  ? `Generate ${importedData.rowCount.toLocaleString()} certificate${importedData.rowCount !== 1 ? 's' : ''}`
                  : 'Generate certificates'}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
