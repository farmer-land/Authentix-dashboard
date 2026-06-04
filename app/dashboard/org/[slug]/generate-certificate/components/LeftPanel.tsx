'use client';

import { useState } from 'react';
import { CertificateField, CertificateTemplate, ImportedData, FieldMapping } from '@/lib/types/certificate';
import { Card } from '@/components/ui/card';
import { TemplateUploader } from './TemplateUploader';
import { FieldTypeSelector } from './FieldTypeSelector';
import { FieldLayersList } from './FieldLayersList';
import { DataImporter } from './DataImporter';
import { ExportSection } from './ExportSection';
import { Upload, Layers, Database, Download, CheckCircle2, ImageIcon, Ruler } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeftPanelProps {
  template: CertificateTemplate | null;
  fields: CertificateField[];
  importedData: ImportedData | null;
  selectedFieldId: string | null;
  hiddenFields: Set<string>;
  onTemplateUpload: (file: File, width: number, height: number) => void;
  onAddField: (field: CertificateField) => void;
  onFieldSelect: (fieldId: string) => void;
  onFieldDelete: (fieldId: string) => void;
  onToggleVisibility: (fieldId: string) => void;
  onDataImport: (data: ImportedData) => void;
  fieldMappings: FieldMapping[];
  onMappingChange: (mappings: FieldMapping[]) => void;
}

// ── Step config ───────────────────────────────────────────────────────────────

const STEPS = [
  {
    id: 'upload',
    icon: Upload,
    label: 'Template',
    short: '1',
  },
  {
    id: 'fields',
    icon: Layers,
    label: 'Fields',
    short: '2',
  },
  {
    id: 'data',
    icon: Database,
    label: 'Data',
    short: '3',
  },
  {
    id: 'export',
    icon: Download,
    label: 'Export',
    short: '4',
  },
] as const;

type StepId = (typeof STEPS)[number]['id'];

function isStepEnabled(step: StepId, template: CertificateTemplate | null, fields: CertificateField[], importedData: ImportedData | null): boolean {
  if (step === 'upload') return true;
  if (step === 'fields') return !!template;
  if (step === 'data') return !!template && fields.length > 0;
  if (step === 'export') return !!importedData;
  return false;
}

function isStepComplete(step: StepId, template: CertificateTemplate | null, fields: CertificateField[], importedData: ImportedData | null): boolean {
  if (step === 'upload') return !!template;
  if (step === 'fields') return fields.length > 0;
  if (step === 'data') return !!importedData;
  return false;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LeftPanel({
  template,
  fields,
  importedData,
  selectedFieldId,
  hiddenFields,
  onTemplateUpload,
  onAddField,
  onFieldSelect,
  onFieldDelete,
  onToggleVisibility,
  onDataImport,
  fieldMappings,
  onMappingChange,
}: LeftPanelProps) {
  const [activeTab, setActiveTab] = useState<StepId>('upload');

  return (
    <div className="h-full flex flex-col">

      {/* ── Step tabs ── */}
      <div className="flex items-stretch border-b border-border/50 shrink-0">
        {STEPS.map((step) => {
          const enabled = isStepEnabled(step.id, template, fields, importedData);
          const complete = isStepComplete(step.id, template, fields, importedData);
          const active = activeTab === step.id;
          const Icon = step.icon;

          return (
            <button
              key={step.id}
              disabled={!enabled}
              onClick={() => setActiveTab(step.id)}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-2.5 px-1 text-center transition-all relative',
                active
                  ? 'text-primary bg-primary/5'
                  : enabled
                  ? 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  : 'text-muted-foreground/30 cursor-not-allowed',
              )}
            >
              {/* Active underline */}
              {active && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-primary rounded-full" />
              )}

              {/* Icon / complete check */}
              <span className="relative">
                {complete && !active ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
              </span>

              {/* Label */}
              <span className="text-[10px] font-semibold leading-none">{step.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 overflow-y-auto">

        {/* Upload tab */}
        {activeTab === 'upload' && (
          <div className="p-4 space-y-4">
            <TemplateUploader onUpload={onTemplateUpload} />

            {template && (
              <Card className="overflow-hidden">
                <div className="px-3 py-2 border-b border-border/40 flex items-center gap-2">
                  <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold truncate">{template.templateName}</span>
                </div>
                <div className="px-3 py-2 space-y-1.5 bg-muted/20">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Ruler className="w-3 h-3" />
                      Dimensions
                    </span>
                    <span className="font-mono text-[11px]">
                      {template.templateWidth} × {template.templateHeight} px
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Format</span>
                    <span className="uppercase text-[10px] font-bold tracking-widest text-muted-foreground">
                      IMAGE
                    </span>
                  </div>
                </div>
              </Card>
            )}

            {template && (
              <button
                onClick={() => setActiveTab('fields')}
                className="w-full py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Add Fields →
              </button>
            )}
          </div>
        )}

        {/* Fields tab */}
        {activeTab === 'fields' && (
          <div className="p-4 space-y-4">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">
                Add Field
              </p>
              <FieldTypeSelector
                onAddField={onAddField}
                templateWidth={template?.templateWidth || 0}
                templateHeight={template?.templateHeight || 0}
              />
            </div>

            {fields.length > 0 && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2 flex items-center justify-between">
                  <span>Layers</span>
                  <span className="normal-case font-medium text-muted-foreground/50">{fields.length}</span>
                </p>
                <FieldLayersList
                  fields={fields}
                  selectedFieldId={selectedFieldId}
                  hiddenFields={hiddenFields}
                  onFieldSelect={onFieldSelect}
                  onFieldDelete={onFieldDelete}
                  onToggleVisibility={onToggleVisibility}
                />
              </div>
            )}

            {fields.length > 0 && (
              <button
                onClick={() => setActiveTab('data')}
                className="w-full py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Import Data →
              </button>
            )}
          </div>
        )}

        {/* Data tab */}
        {activeTab === 'data' && (
          <div className="p-4">
            <DataImporter
              fields={fields}
              importedData={importedData}
              fieldMappings={fieldMappings}
              onDataImport={onDataImport}
              onMappingChange={onMappingChange}
            />
            {importedData && (
              <button
                onClick={() => setActiveTab('export')}
                className="mt-4 w-full py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Generate →
              </button>
            )}
          </div>
        )}

        {/* Export tab */}
        {activeTab === 'export' && (
          <div className="p-4">
            <ExportSection
              template={template}
              fields={fields}
              importedData={importedData}
              fieldMappings={fieldMappings}
            />
          </div>
        )}

      </div>
    </div>
  );
}
