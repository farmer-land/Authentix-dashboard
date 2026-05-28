'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, isValid } from 'date-fns';
import {
  Plus,
  Trash2,
  UserPlus,
  AlertCircle,
  CheckCircle2,
  Edit2,
  X,
  ChevronDown,
} from 'lucide-react';
import { CertificateField, ImportedData } from '@/lib/types/certificate';
import { cn } from '@/lib/utils';

interface ManualDataEntryProps {
  fields: CertificateField[];
  /** Called when the user explicitly clicks "Confirm Data" — triggers navigation to preview */
  onDataSubmit: (data: ImportedData) => void;
  /** Called whenever committed rows change (live sync) — does NOT trigger navigation */
  onDataChange?: (data: ImportedData) => void;
  initialData?: ImportedData;
  className?: string;
}

interface RecipientRow {
  id: string;
  data: Record<string, string>;
  isEditing: boolean;
}

const EMAIL_COLUMN = { key: 'email', label: 'Email', required: true, isDate: false };

// Field types that are semantically unique per person — only one column needed even across multiple templates
const SEMANTIC_TYPES = new Set(['name', 'course', 'start_date', 'end_date']);

export function ManualDataEntry({ fields, onDataSubmit, onDataChange, initialData, className }: ManualDataEntryProps) {
  const [editingRow, setEditingRow] = useState<RecipientRow | null>(null);
  // Tracks which date column's popover is open (by col.key); null = all closed
  const [openDatePicker, setOpenDatePicker] = useState<string | null>(null);

  // Build columns: template fields first (in order), then Email last.
  const getColumns = () => {
    const templateCols: typeof EMAIL_COLUMN[] = [];
    const seenTypes = new Set<string>();

    fields
      .filter((f) => f.type !== 'qr_code' && f.type !== 'image')
      .forEach((field) => {
        if (SEMANTIC_TYPES.has(field.type)) {
          if (seenTypes.has(field.type)) return;
          seenTypes.add(field.type);
        }
        const fieldKey = field.label.toLowerCase().replace(/\s+/g, '_');
        if (!templateCols.find((c) => c.key === fieldKey)) {
          templateCols.push({
            key: fieldKey,
            label: field.label,
            required: false,
            isDate: field.type === 'start_date' || field.type === 'end_date',
          });
        }
      });

    if (!templateCols.find((c) => c.key === 'email')) {
      templateCols.push(EMAIL_COLUMN);
    }

    return templateCols;
  };

  const columns = getColumns();

  const [rows, setRows] = useState<RecipientRow[]>(() => {
    if (!initialData) return [];
    return initialData.rows.map((row) => ({
      id: crypto.randomUUID(),
      data: Object.fromEntries(columns.map((col) => [col.key, String(row[col.label] ?? '')])),
      isEditing: false,
    }));
  });

  // Create empty row data
  const createEmptyRowData = (): Record<string, string> => {
    const data: Record<string, string> = {};
    columns.forEach((col) => {
      data[col.key] = '';
    });
    return data;
  };

  // Add new row — auto-saves any currently open editing row first
  const handleAddRow = () => {
    const newRow: RecipientRow = {
      id: crypto.randomUUID(),
      data: createEmptyRowData(),
      isEditing: true,
    };
    setRows((prev) => {
      const committed = editingRow
        ? prev.map((r) => r.id === editingRow.id ? { ...editingRow, isEditing: false } : r)
        : prev;
      return [...committed, newRow];
    });
    setEditingRow(newRow);
  };

  // Delete row
  const handleDeleteRow = (id: string) => {
    setRows(rows.filter((r) => r.id !== id));
    if (editingRow?.id === id) {
      setEditingRow(null);
    }
  };

  // Start editing
  const handleStartEdit = (row: RecipientRow) => {
    setEditingRow({ ...row });
  };

  // Save edit
  const handleSaveEdit = () => {
    if (!editingRow) return;

    setRows(
      rows.map((r) =>
        r.id === editingRow.id ? { ...editingRow, isEditing: false } : r
      )
    );
    setEditingRow(null);
    setOpenDatePicker(null);
  };

  // Save edit with explicit updated data (avoids stale closure when field + save happen together)
  const _handleSaveEditWithData = (key: string, value: string) => {
    if (!editingRow) return;
    const updatedRow = { ...editingRow, data: { ...editingRow.data, [key]: value }, isEditing: false };
    setRows(rows.map((r) => r.id === editingRow.id ? updatedRow : r));
    setEditingRow(null);
  };

  // Cancel edit
  const handleCancelEdit = () => {
    // If it's a new unsaved row, remove it
    if (editingRow && !rows.find((r) => r.id === editingRow.id && !r.isEditing)) {
      setRows(rows.filter((r) => r.id !== editingRow.id || !r.isEditing));
    }
    setEditingRow(null);
    setOpenDatePicker(null);
  };

  // Update field in editing row
  const handleFieldChange = (key: string, value: string) => {
    if (!editingRow) return;
    setEditingRow({
      ...editingRow,
      data: { ...editingRow.data, [key]: value },
    });
  };

  // Validate row
  const isRowValid = (row: RecipientRow): boolean => {
    return columns
      .filter((c) => c.required)
      .every((c) => row.data[c.key]?.trim());
  };

  // Use live editingRow data for the row currently being edited so validation reflects what's typed
  const getEffectiveRow = (row: RecipientRow): RecipientRow =>
    editingRow?.id === row.id ? editingRow : row;

  // Check if all rows are valid — uses live editingRow data so the error clears as you type
  const allRowsValid = rows.length > 0 && rows.every((r) => isRowValid(getEffectiveRow(r)));

  // Submit data — auto-commits any open editing row, then triggers navigation
  const handleSubmit = () => {
    // Commit the open editing row first (auto-save)
    let effectiveRows = rows;
    if (editingRow) {
      if (!isRowValid(editingRow)) return;
      effectiveRows = rows.map((r) =>
        r.id === editingRow.id ? { ...editingRow, isEditing: false } : r
      );
      setRows(effectiveRows);
      setEditingRow(null);
      setOpenDatePicker(null);
    }

    if (!effectiveRows.every(isRowValid)) return;

    const headers = columns.map((c) => c.label);
    const dataRows = effectiveRows.map((row) => {
      const rowData: Record<string, unknown> = {};
      columns.forEach((col) => {
        rowData[col.label] = row.data[col.key] || '';
      });
      return rowData;
    });

    onDataSubmit({
      fileName: 'Manual Entry',
      headers,
      rows: dataRows,
      rowCount: dataRows.length,
    });
  };

  // Live sync to parent whenever committed rows change — uses onDataChange (no navigation)
  useEffect(() => {
    if (!onDataChange) return;
    const committedRows = rows.filter(r => r.id !== editingRow?.id);
    if (committedRows.length === 0) return;

    const headers = columns.map((c) => c.label);
    const dataRows = committedRows.map((row) => {
      const rowData: Record<string, unknown> = {};
      columns.forEach((col) => { rowData[col.label] = row.data[col.key] || ''; });
      return rowData;
    });

    onDataChange({
      fileName: 'Manual Entry',
      headers,
      rows: dataRows,
      rowCount: dataRows.length,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <UserPlus className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Manual Data Entry</h3>
              <p className="text-sm text-muted-foreground">
                Add recipients one by one instead of uploading a file
              </p>
            </div>
          </div>
          <Badge variant="secondary">
            {rows.length} recipient{rows.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </Card>

      {/* Data Table */}
      {rows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="w-12 px-4 py-3 text-left font-medium text-muted-foreground">#</th>
                  {columns.map((col) => (
                    <th key={col.key} className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap min-w-[140px]">
                      {col.label}
                      {col.required && <span className="text-destructive ml-1">*</span>}
                    </th>
                  ))}
                  <th className="w-24 px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const isEditing = editingRow?.id === row.id;
                  const currentData = isEditing ? editingRow.data : row.data;
                  const valid = isRowValid(isEditing ? editingRow : row);

                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        'border-b hover:bg-muted/30',
                        !valid && !isEditing && 'bg-yellow-50/50 dark:bg-yellow-950/20'
                      )}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {idx + 1}
                      </td>
                      {columns.map((col) => (
                        <td key={col.key} className="px-4 py-3 min-w-[140px]">
                          {isEditing ? (
                            col.isDate ? (
                              <Popover
                                open={openDatePicker === col.key}
                                onOpenChange={(open) => setOpenDatePicker(open ? col.key : null)}
                              >
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    data-empty={!currentData[col.key]}
                                    className="h-8 w-full justify-between text-left text-sm font-normal data-[empty=true]:text-muted-foreground"
                                  >
                                    {currentData[col.key] || <span>Pick a date</span>}
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={
                                      currentData[col.key]
                                        ? (() => {
                                            const d = new Date(currentData[col.key] as string);
                                            return isValid(d) ? d : undefined;
                                          })() as Date | undefined
                                        : undefined
                                    }
                                    onSelect={(d) => {
                                      // Update the field in editingRow and close the popover
                                      // Row stays in edit mode so user can fill remaining fields
                                      handleFieldChange(col.key, d ? format(d, 'PPP') : '');
                                      setOpenDatePicker(null);
                                    }}
                                    defaultMonth={
                                      currentData[col.key]
                                        ? (() => {
                                            const d = new Date(currentData[col.key] as string);
                                            return isValid(d) ? d : undefined;
                                          })() as Date | undefined
                                        : undefined
                                    }
                                  />
                                </PopoverContent>
                              </Popover>
                            ) : (
                            <Input
                              value={currentData[col.key] || ''}
                              onChange={(e) => handleFieldChange(col.key, e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(); } }}
                              placeholder={col.label}
                              className={cn(
                                'h-8 text-sm',
                                col.required && !currentData[col.key]?.trim() && 'border-destructive'
                              )}
                            />
                            )
                          ) : (
                            <span
                              className={cn(
                                'text-sm',
                                !currentData[col.key] && 'text-muted-foreground italic'
                              )}
                            >
                              {currentData[col.key] || '(empty)'}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isEditing ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-green-600 hover:text-green-600"
                                onClick={handleSaveEdit}
                                title="Confirm (Enter)"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={handleCancelEdit}
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleStartEdit(row)}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteRow(row.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add Row Button */}
      <Button variant="outline" onClick={handleAddRow} className="w-full gap-2">
        <Plus className="w-4 h-4" />
        Add Recipient
      </Button>

      {/* Validation Message */}
      {rows.length > 0 && !allRowsValid && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/20">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Some rows are missing required fields — please fill in the Email field for all recipients.</span>
        </div>
      )}

      {/* Submit Button */}
      {rows.length > 0 && (
        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={!allRowsValid}
            className="gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Confirm Data
          </Button>
        </div>
      )}

      {/* Empty State */}
      {rows.length === 0 && (
        <Card className="p-8 text-center border-dashed">
          <UserPlus className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="font-semibold mb-2">No Recipients Added</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Click &quot;Add Recipient&quot; to start entering data manually
          </p>
          <Button onClick={handleAddRow} className="gap-2">
            <Plus className="w-4 h-4" />
            Add First Recipient
          </Button>
        </Card>
      )}
    </div>
  );
}
