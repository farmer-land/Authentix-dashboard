'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { CertificateField, ImportedData, FieldMapping } from '@/lib/types/certificate';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Upload, FileSpreadsheet, CheckCircle2, Database,
  ChevronDown, ChevronUp, Search, Loader2,
} from 'lucide-react';
import { parseFile } from '@/lib/file-parser';
import { useImports } from '@/lib/hooks/queries/imports';
import { useEmailContacts } from '@/lib/hooks/queries/delivery';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface DataImporterProps {
  fields: CertificateField[];
  importedData: ImportedData | null;
  fieldMappings: FieldMapping[];
  onDataImport: (data: ImportedData) => void;
  onMappingChange: (mappings: FieldMapping[]) => void;
}

type SourceTab = 'upload' | 'saved' | 'contacts';

/** Normalize a string for fuzzy header matching */
function norm(s: string): string {
  return s.toLowerCase().replace(/[\s\-_]+/g, '_');
}

/** Auto-map certificate fields to CSV headers based on name similarity */
function autoMap(
  certFields: CertificateField[],
  headers: string[]
): FieldMapping[] {
  const mappings: FieldMapping[] = [];
  const used = new Set<string>();

  for (const field of certFields) {
    if (field.type === 'qr_code' || field.type === 'custom_text') continue;
    const labelNorm = norm(field.label);
    const typeNorm = norm(field.type);

    const match = headers.find(h => {
      if (used.has(h)) return false;
      const hn = norm(h);
      return hn === labelNorm || hn === typeNorm || hn.includes(labelNorm) || labelNorm.includes(hn);
    });

    if (match) {
      mappings.push({ fieldId: field.id, columnName: match });
      used.add(match);
    }
  }
  return mappings;
}

export function DataImporter({
  fields,
  importedData,
  fieldMappings,
  onDataImport,
  onMappingChange,
}: DataImporterProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [sourceTab, setSourceTab] = useState<SourceTab>('upload');
  const [savedExpanded, setSavedExpanded] = useState(false);
  const [contactSearch, setContactSearch] = useState('');

  const { imports, loading: importsLoading } = useImports({ limit: 20, sort_by: 'created_at', sort_order: 'desc' });
  const { contacts, loading: contactsLoading } = useEmailContacts({ limit: 500, unsubscribed: false, search: contactSearch || undefined });

  const mappableFields = fields.filter(f => f.type !== 'qr_code' && f.type !== 'custom_text');

  const applyParsed = useCallback(
    (data: ImportedData) => {
      onDataImport(data);
      const auto = autoMap(fields, data.headers);
      if (auto.length > 0) onMappingChange(auto);
    },
    [fields, onDataImport, onMappingChange]
  );

  // ── File drop ────────────────────────────────────────────────────────────
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;
      setIsProcessing(true);
      try {
        const parsed = await parseFile(file);
        if (!parsed.headers.length) {
          alert('Could not detect any columns in the file.');
          return;
        }
        applyParsed({
          fileName: parsed.fileName,
          headers: parsed.headers,
          rows: parsed.rows,
          rowCount: parsed.rowCount,
        });
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to parse file');
      } finally {
        setIsProcessing(false);
      }
    },
    [applyParsed]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv'],
      'text/tab-separated-values': ['.tsv', '.tab'],
      'text/plain': ['.md', '.markdown'],
    },
    maxFiles: 1,
    disabled: isProcessing,
  });

  // ── Use contact list as data ─────────────────────────────────────────────
  const handleUseContacts = useCallback(() => {
    if (!contacts.length) return;
    // Flatten contacts into rows
    const allKeys = new Set<string>();
    contacts.forEach(c => {
      allKeys.add('email');
      allKeys.add('first_name');
      allKeys.add('last_name');
      Object.keys(c.custom_properties ?? {}).forEach(k => allKeys.add(k));
    });
    const headers = [...allKeys].filter(k => {
      const v = contacts[0]?.[k as keyof typeof contacts[0]] ?? contacts[0]?.custom_properties?.[k];
      return v !== undefined && v !== null;
    });

    const rows = contacts.map(c => {
      const row: Record<string, string> = {
        email: c.email,
        first_name: c.first_name ?? '',
        last_name: c.last_name ?? '',
        ...Object.fromEntries(
          Object.entries(c.custom_properties ?? {}).map(([k, v]) => [k, String(v)])
        ),
      };
      return row;
    });

    applyParsed({
      fileName: `Contacts (${contacts.length})`,
      headers,
      rows,
      rowCount: rows.length,
    });
  }, [contacts, applyParsed]);

  // ── Mapping helpers ──────────────────────────────────────────────────────
  const handleMappingChange = (fieldId: string, columnName: string) => {
    const existing = fieldMappings.find(m => m.fieldId === fieldId);
    if (existing) {
      onMappingChange(fieldMappings.map(m => m.fieldId === fieldId ? { ...m, columnName } : m));
    } else {
      onMappingChange([...fieldMappings, { fieldId, columnName }]);
    }
  };

  const getMappedColumn = (fieldId: string) =>
    fieldMappings.find(m => m.fieldId === fieldId)?.columnName;

  // ── If data already imported, show summary + mapping ─────────────────────
  if (importedData) {
    return (
      <div className="space-y-4">
        <Card className="p-4 bg-muted/50">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <div>
                <p className="text-sm font-medium">{importedData.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {importedData.rowCount} row{importedData.rowCount !== 1 ? 's' : ''} ·{' '}
                  {importedData.headers.length} column{importedData.headers.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onDataImport(null as any)}>
              Change
            </Button>
          </div>

          {/* Preview */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted px-2 py-1.5 text-xs font-medium">
              Preview — first 3 rows
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    {importedData.headers.map(h => (
                      <th key={h} className="px-2 py-1 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {importedData.rows.slice(0, 3).map((row, idx) => (
                    <tr key={idx} className="border-t">
                      {importedData.headers.map(h => (
                        <td key={h} className="px-2 py-1 max-w-32 truncate">
                          {row[h]?.toString() || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        {/* Field mapping */}
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-semibold">Map columns to certificate fields</Label>
            <p className="text-xs text-muted-foreground mt-1">
              {fieldMappings.length} of {mappableFields.length} fields auto-mapped — adjust if needed
            </p>
          </div>

          <div className="space-y-2">
            {mappableFields.map(field => {
              const mapped = getMappedColumn(field.id);
              return (
                <div key={field.id} className="flex items-center gap-2">
                  <div className="w-32 shrink-0">
                    <Label className="text-xs text-muted-foreground">{field.label}</Label>
                  </div>
                  <div className="flex-1">
                    <Select
                      value={mapped || ''}
                      onValueChange={v => handleMappingChange(field.id, v)}
                    >
                      <SelectTrigger className={cn('h-8 text-xs', mapped && 'border-green-500')}>
                        <SelectValue placeholder="Select column…" />
                      </SelectTrigger>
                      <SelectContent>
                        {importedData.headers.map(h => (
                          <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {mapped && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Source selection ─────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex rounded-lg border overflow-hidden text-sm">
        {([
          { tab: 'upload' as SourceTab, label: 'Upload file' },
          { tab: 'saved' as SourceTab, label: `Saved imports${imports.length ? ` (${imports.length})` : ''}` },
          { tab: 'contacts' as SourceTab, label: 'Contacts list' },
        ] as const).map(({ tab, label }) => (
          <button
            key={tab}
            className={cn(
              'flex-1 py-2 font-medium transition-colors',
              sourceTab === tab
                ? 'bg-primary text-primary-foreground'
                : 'bg-background hover:bg-muted text-muted-foreground'
            )}
            onClick={() => setSourceTab(tab)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Upload tab */}
      {sourceTab === 'upload' && (
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
            isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary hover:bg-primary/5',
            isProcessing && 'opacity-50 cursor-not-allowed'
          )}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-3">
            {isProcessing ? (
              <>
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">Processing…</p>
              </>
            ) : isDragActive ? (
              <>
                <FileSpreadsheet className="w-10 h-10 text-primary" />
                <p className="text-sm font-medium">Drop to import</p>
              </>
            ) : (
              <>
                <Upload className="w-10 h-10 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Upload your data file</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    CSV, Excel (.xlsx / .xls), TSV, or Markdown table
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Column names are auto-matched to certificate fields
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Saved imports tab */}
      {sourceTab === 'saved' && (
        <div className="space-y-2">
          {importsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}
            </div>
          ) : imports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Database className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No saved imports yet. Upload a file to get started.
            </div>
          ) : (
            imports.map((imp: any) => (
              <div
                key={imp.id}
                className="rounded-lg border px-3 py-2.5 flex items-center gap-3 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
                onClick={async () => {
                  // Load from saved import — fetch rows via API
                  setIsProcessing(true);
                  try {
                    const { api } = await import('@/lib/api/client');
                    const data = await api.imports.getData(imp.id, { page: 1, limit: 500 });
                    const rawRows = (data.items ?? []).map((r: any) => r.data ?? r) as Record<string, unknown>[];
                    if (!rawRows.length) { alert('No data in this import'); return; }
                    const headers = Object.keys(rawRows[0]!);
                    const rows = rawRows.map(r =>
                      Object.fromEntries(headers.map(h => [h, String(r[h] ?? '')]))
                    );
                    applyParsed({ fileName: imp.file_name, headers, rows, rowCount: rows.length });
                  } catch {
                    alert('Failed to load import data');
                  } finally {
                    setIsProcessing(false);
                  }
                }}
              >
                <FileSpreadsheet className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{imp.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {imp.total_rows ?? '?'} rows ·{' '}
                    {formatDistanceToNow(new Date(imp.created_at), { addSuffix: true })}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">{imp.status}</Badge>
              </div>
            ))
          )}
        </div>
      )}

      {/* Contacts tab */}
      {sourceTab === 'contacts' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts…"
              value={contactSearch}
              onChange={e => setContactSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>

          {contactsLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}
            </div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No subscribed contacts found.
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {contacts.length} subscribed contact{contacts.length !== 1 ? 's' : ''} — their custom properties become certificate fields
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleUseContacts}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Use all {contacts.length} contacts as recipients
              </Button>
              <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                {contacts.slice(0, 10).map(c => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(' ');
                  return (
                    <div key={c.id} className="flex items-center gap-2 px-3 py-2 border-b last:border-0 text-xs">
                      <span className="font-mono truncate flex-1">{c.email}</span>
                      {name && <span className="text-muted-foreground shrink-0">{name}</span>}
                    </div>
                  );
                })}
                {contacts.length > 10 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground border-t">
                    +{contacts.length - 10} more
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
