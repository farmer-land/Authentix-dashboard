"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { autoMapHeaders } from "@/lib/file-parser";

export interface PlatformField {
  key: string;
  label: string;
  required: boolean;
  /** At least one of these keys (including self) must be mapped to satisfy the required check. */
  requiresOneOf?: string[];
  aliases: string[];
  description?: string;
}

export interface FieldMappingModalProps {
  open: boolean;
  fileName: string;
  headers: string[];
  /** Sample rows used to show preview values beneath each mapping row. */
  sampleRows: Record<string, string>[];
  platformFields: PlatformField[];
  /** Called with mapping (platformFieldKey → csvHeader) when user confirms. */
  onConfirm: (mapping: Record<string, string>) => void;
  onCancel: () => void;
}

const SKIP = "__skip__";

export const CONTACT_PLATFORM_FIELDS: PlatformField[] = [
  {
    key: "recipient_name",
    label: "Recipient Name",
    required: true,
    requiresOneOf: ["recipient_name", "first_name"],
    description: "Full name used on certificates (or map First Name below)",
    aliases: [
      "recipient_name", "recipient name", "full_name", "full name",
      "name", "recipient",
    ],
  },
  {
    key: "first_name",
    label: "First Name",
    required: false,
    aliases: [
      "first_name", "first name", "firstname", "given_name", "given name",
      "first", "fname",
    ],
  },
  {
    key: "last_name",
    label: "Last Name",
    required: false,
    aliases: [
      "last_name", "last name", "lastname", "surname", "family_name",
      "family name", "last", "lname",
    ],
  },
  {
    key: "email",
    label: "Email",
    required: false,
    description: "Required for email campaigns — skip if not available",
    aliases: ["email", "e_mail", "email_address", "mail", "email address"],
  },
];

export function FieldMappingModal({
  open,
  fileName,
  headers,
  sampleRows,
  platformFields,
  onConfirm,
  onCancel,
}: FieldMappingModalProps) {
  // mapping: platformFieldKey → selected csv header (or SKIP)
  const [mapping, setMapping] = useState<Record<string, string>>({});

  // Auto-map on open / when headers change
  useEffect(() => {
    if (!open) return;
    const auto = autoMapHeaders(headers, platformFields);
    const initial: Record<string, string> = {};
    for (const f of platformFields) {
      initial[f.key] = auto[f.key] ?? SKIP;
    }
    setMapping(initial);
  }, [open, headers, platformFields]);

  const sample = sampleRows[0];

  const requiredMapped = useMemo(
    () =>
      platformFields
        .filter((f) => f.required)
        .every((f) => {
          const keysToCheck = f.requiresOneOf ?? [f.key];
          return keysToCheck.some((k) => mapping[k] && mapping[k] !== SKIP);
        }),
    [platformFields, mapping]
  );

  const mappedCount = Object.values(mapping).filter((v) => v && v !== SKIP).length;

  function handleConfirm() {
    const confirmed: Record<string, string> = {};
    for (const [k, v] of Object.entries(mapping)) {
      if (v && v !== SKIP) confirmed[k] = v;
    }
    onConfirm(confirmed);
  }

  // Columns already assigned to another platform field (prevent duplicate mappings)
  const usedCols = new Set(
    Object.entries(mapping)
      .filter(([, v]) => v && v !== SKIP)
      .map(([, v]) => v)
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Map columns from "{fileName}"</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            We detected {headers.length} column{headers.length !== 1 ? "s" : ""}.
            Match each platform field to the correct column in your file.
          </p>
        </DialogHeader>

        <div className="space-y-3 my-2">
          {platformFields.map((field) => {
            const selected = mapping[field.key];
            const isMapped = selected && selected !== SKIP;
            const sampleVal = isMapped && sample ? sample[selected] : null;

            return (
              <div
                key={field.key}
                className="rounded-lg border bg-muted/20 p-3 space-y-2"
              >
                <div className="flex items-center gap-3">
                  {/* Platform field label */}
                  <div className="w-36 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">{field.label}</span>
                      {field.required && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-red-200 text-red-600">
                          required
                        </Badge>
                      )}
                    </div>
                    {field.description && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {field.description}
                      </p>
                    )}
                  </div>

                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

                  {/* Column picker */}
                  <div className="flex-1">
                    <Select
                      value={selected ?? SKIP}
                      onValueChange={(v) =>
                        setMapping((prev) => ({ ...prev, [field.key]: v }))
                      }
                    >
                      <SelectTrigger
                        className={
                          isMapped
                            ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                            : field.required
                            ? "border-amber-400"
                            : ""
                        }
                      >
                        <SelectValue placeholder="Choose column…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SKIP} className="text-muted-foreground">
                          — Skip this field
                        </SelectItem>
                        {headers
                          .filter((h) => !usedCols.has(h) || mapping[field.key] === h)
                          .map((h) => (
                            <SelectItem key={h} value={h} className="text-sm">
                              {h}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {isMapped ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  ) : field.required ? (
                    <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                  ) : (
                    <div className="h-4 w-4 shrink-0" />
                  )}
                </div>

                {/* Sample value preview */}
                {isMapped && sampleVal !== null && sampleVal !== "" && (
                  <p className="text-[11px] text-muted-foreground pl-42">
                    Sample:{" "}
                    <span className="font-mono bg-muted px-1 rounded">{sampleVal}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Extra columns summary */}
        {(() => {
          const mapped = new Set(Object.values(mapping).filter((v) => v && v !== SKIP));
          const extra = headers.filter((h) => !mapped.has(h));
          if (!extra.length) return null;
          return (
            <div className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Extra columns</span> — stored as custom
              properties and available for email/certificate variables:
              <div className="flex flex-wrap gap-1 mt-1.5 max-h-20 overflow-y-auto">
                {extra.map((h) => (
                  <span key={h} className="font-mono bg-muted px-1 rounded">
                    {h}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}

        <DialogFooter className="pt-2">
          <p className="text-xs text-muted-foreground mr-auto self-center">
            {mappedCount} field{mappedCount !== 1 ? "s" : ""} mapped
          </p>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!requiredMapped}>
            Confirm mapping
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
