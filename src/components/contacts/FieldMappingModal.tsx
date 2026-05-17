"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, ArrowRight, AlertTriangle } from "lucide-react";
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
  sampleRows: Record<string, string>[];
  platformFields: PlatformField[];
  onConfirm: (mapping: Record<string, string>) => void;
  onCancel: () => void;
}

export const CONTACT_PLATFORM_FIELDS: PlatformField[] = [
  {
    key: "recipient_name",
    label: "Recipient Name",
    required: true,
    requiresOneOf: ["recipient_name", "first_name"],
    description: "Full name shown on certificates",
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
    description: "Required for email campaigns",
    aliases: ["email", "e_mail", "email_address", "mail", "email address"],
  },
];

const CUSTOM = "__custom__";

export function FieldMappingModal({
  open,
  fileName,
  headers,
  sampleRows,
  platformFields,
  onConfirm,
  onCancel,
}: FieldMappingModalProps) {
  // Column-centric mapping: csvHeader → platformFieldKey | "__custom__"
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});

  // Auto-detect on open: invert autoMapHeaders result, unmatched → custom
  useEffect(() => {
    if (!open || !headers.length) return;
    const autoResult = autoMapHeaders(headers, platformFields); // {platformKey → csvHeader}
    const detected: Record<string, string> = {};
    for (const [pk, ch] of Object.entries(autoResult)) {
      detected[ch] = pk;
    }
    for (const h of headers) {
      if (!detected[h]) detected[h] = CUSTOM;
    }
    setColumnMapping(detected);
  }, [open, headers, platformFields]);

  const sample = sampleRows[0] ?? {};

  // When a user picks a platform field that's already assigned to another column,
  // auto-reset the other column to "Custom property" to avoid duplicates.
  const handleChange = (csvHeader: string, newTarget: string) => {
    setColumnMapping((prev) => {
      const next = { ...prev };
      if (newTarget !== CUSTOM) {
        for (const [h, t] of Object.entries(next)) {
          if (h !== csvHeader && t === newTarget) {
            next[h] = CUSTOM;
          }
        }
      }
      next[csvHeader] = newTarget;
      return next;
    });
  };

  // Validation: all required platform fields must be satisfied
  const canConfirm = useMemo(() => {
    const mapped = Object.values(columnMapping);
    return platformFields
      .filter((f) => f.required)
      .every((f) => {
        const keysToCheck = f.requiresOneOf ?? [f.key];
        return keysToCheck.some((k) => mapped.includes(k));
      });
  }, [columnMapping, platformFields]);

  const matchedCount = Object.values(columnMapping).filter((v) => v !== CUSTOM).length;

  // Dropdown options: platform fields + custom property
  const targetOptions = [
    ...platformFields.map((f) => ({ value: f.key, label: f.label })),
    { value: CUSTOM, label: "Custom property" },
  ];

  function handleConfirm() {
    // Produce {platformFieldKey → csvHeader} — same shape the page already expects
    const outputMapping: Record<string, string> = {};
    for (const [csvHeader, target] of Object.entries(columnMapping)) {
      if (target !== CUSTOM && !outputMapping[target]) {
        outputMapping[target] = csvHeader;
      }
    }
    onConfirm(outputMapping);
  }

  const hasCustomCols = Object.values(columnMapping).some((v) => v === CUSTOM);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Review columns from &ldquo;{fileName}&rdquo;</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {headers.length} column{headers.length !== 1 ? "s" : ""} detected.
            We&apos;ve auto-matched where possible — adjust anything that looks wrong.
          </p>
        </DialogHeader>

        {/* Column header */}
        <div className="grid grid-cols-[1fr_16px_180px_20px] gap-3 px-1 pb-1 shrink-0">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Your column
          </span>
          <span />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Stored as
          </span>
          <span />
        </div>

        {/* Column rows */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 pr-1">
          {headers.map((h) => {
            const target = columnMapping[h] ?? CUSTOM;
            const isMapped = target !== CUSTOM;
            const sampleVal = sample[h];

            return (
              <div
                key={h}
                className="grid grid-cols-[1fr_16px_180px_20px] items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
              >
                {/* Column name + sample */}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{h}</p>
                  {sampleVal ? (
                    <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
                      {sampleVal}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/40 italic mt-0.5">empty</p>
                  )}
                </div>

                <ArrowRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />

                {/* Target picker */}
                <Select value={target} onValueChange={(v) => handleChange(h, v)}>
                  <SelectTrigger
                    className={
                      isMapped
                        ? "border-primary/40 bg-primary/5 text-sm h-8"
                        : "text-sm h-8 text-muted-foreground"
                    }
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {targetOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-sm">
                        {o.label}
                        {o.value === CUSTOM && (
                          <span className="text-muted-foreground/60 ml-1">(variable)</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Status */}
                {isMapped ? (
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <div className="h-4 w-4 shrink-0" />
                )}
              </div>
            );
          })}
        </div>

        {/* Validation warning */}
        {!canConfirm && (
          <div className="shrink-0 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              Map at least one column to <strong>Recipient Name</strong> or <strong>First Name</strong> to continue.
            </span>
          </div>
        )}

        {/* Custom property note */}
        {hasCustomCols && (
          <p className="shrink-0 text-[11px] text-muted-foreground">
            <strong>Custom property</strong> columns are stored and available as{" "}
            <code className="font-mono bg-muted px-1 rounded">{"{{variable}}"}</code> placeholders
            in email and certificate templates.
          </p>
        )}

        <DialogFooter className="shrink-0 pt-2">
          <p className="text-xs text-muted-foreground mr-auto self-center">
            {matchedCount} field{matchedCount !== 1 ? "s" : ""} matched
          </p>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
