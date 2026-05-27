"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ArrowRight, AlertTriangle, Sparkles } from "lucide-react";
import { autoMapHeaders } from "@/lib/file-parser";

export interface PlatformField {
  key: string;
  label: string;
  required: boolean;
  /** At least one of these keys (including self) must be mapped to satisfy the required check. */
  requiresOneOf?: string[];
  aliases: string[];
  description?: string;
  /** Short format hint shown in the dropdown, e.g. "email format", "YYYY-MM-DD". */
  typeHint?: string;
}

export interface FieldMappingModalProps {
  open: boolean;
  fileName: string;
  headers: string[];
  sampleRows: Record<string, string>[];
  platformFields: PlatformField[];
  onConfirm: (mapping: Record<string, string>) => void;
  onCancel: () => void;
  /** Pre-built mapping from a saved profile — overrides auto-detect when provided. */
  savedMapping?: Record<string, string> | null;
}

export const CONTACT_PLATFORM_FIELDS: PlatformField[] = [
  {
    key: "recipient_name",
    label: "Recipient Name",
    required: true,
    requiresOneOf: ["recipient_name", "first_name"],
    description: "Full name shown on certificates",
    typeHint: "text, max 200 chars",
    aliases: [
      "recipient_name", "recipient name", "full_name", "full name",
      "name", "recipient",
    ],
  },
  {
    key: "first_name",
    label: "First Name",
    required: false,
    typeHint: "text, max 200 chars",
    aliases: [
      "first_name", "first name", "firstname", "given_name", "given name",
      "first", "fname",
    ],
  },
  {
    key: "last_name",
    label: "Last Name",
    required: false,
    typeHint: "text, max 200 chars",
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
    typeHint: "valid email address",
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
  savedMapping,
}: FieldMappingModalProps) {
  // Column-centric mapping: csvHeader → platformFieldKey | "__custom__"
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  // Track which CSV headers were auto-detected (not manually changed by the user)
  const [autoDetected, setAutoDetected] = useState<Set<string>>(new Set());
  const [usedSavedProfile, setUsedSavedProfile] = useState(false);

  // Auto-detect on open: prefer savedMapping > auto-detect, unmatched → custom
  useEffect(() => {
    if (!open || !headers.length) return;

    if (savedMapping && Object.keys(savedMapping).length > 0) {
      // Invert savedMapping: platformKey → csvHeader → csvHeader → platformKey
      const restored: Record<string, string> = {};
      for (const [pk, ch] of Object.entries(savedMapping)) {
        if (headers.includes(ch)) restored[ch] = pk;
      }
      for (const h of headers) {
        if (!restored[h]) restored[h] = CUSTOM;
      }
      setColumnMapping(restored);
      setAutoDetected(new Set(Object.keys(restored).filter(h => restored[h] !== CUSTOM)));
      setUsedSavedProfile(true);
      return;
    }

    const autoResult = autoMapHeaders(headers, platformFields); // {platformKey → csvHeader}
    const detected: Record<string, string> = {};
    const detectedHeaders = new Set<string>();
    for (const [pk, ch] of Object.entries(autoResult)) {
      detected[ch] = pk;
      detectedHeaders.add(ch);
    }
    for (const h of headers) {
      if (!detected[h]) detected[h] = CUSTOM;
    }
    setColumnMapping(detected);
    setAutoDetected(detectedHeaders);
    setUsedSavedProfile(false);
  }, [open, headers, platformFields, savedMapping]);

  // Preview: up to 3 sample values per column, excluding blanks
  const previewValues = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const h of headers) {
      out[h] = sampleRows
        .map((r) => r[h] ?? "")
        .filter((v) => v !== "")
        .slice(0, 3);
    }
    return out;
  }, [headers, sampleRows]);

  // When a user picks a platform field that's already assigned to another column,
  // auto-reset the other column to "Custom property" to avoid duplicates.
  const handleChange = (csvHeader: string, newTarget: string) => {
    setAutoDetected((prev) => {
      const next = new Set(prev);
      next.delete(csvHeader); // user touched it → no longer auto-detected
      return next;
    });
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

  // Build a map of required field keys so we can mark them in the dropdown
  const requiredFieldKeys = useMemo(
    () => new Set(platformFields.filter((f) => f.required).map((f) => f.key)),
    [platformFields],
  );

  // Look up the PlatformField for a given key
  const fieldByKey = useMemo(() => {
    const m = new Map<string, PlatformField>();
    for (const f of platformFields) m.set(f.key, f);
    return m;
  }, [platformFields]);

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
            {usedSavedProfile
              ? " Mapping restored from your last import with these columns."
              : " We've auto-matched where possible — adjust anything that looks wrong."}
          </p>
          {usedSavedProfile && (
            <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-primary font-medium">
              <Sparkles className="h-3 w-3" />
              Using saved mapping from a previous import
            </div>
          )}
        </DialogHeader>

        {/* Column header */}
        <div className="grid grid-cols-[1fr_16px_200px_24px] gap-3 px-1 pb-1 shrink-0">
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
            const isAutoDetected = autoDetected.has(h);
            const preview = previewValues[h] ?? [];
            const mappedField = isMapped ? fieldByKey.get(target) : undefined;
            const isRequiredField = mappedField ? requiredFieldKeys.has(mappedField.key) : false;

            return (
              <div
                key={h}
                className={`grid grid-cols-[1fr_16px_200px_24px] items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  isMapped
                    ? "bg-primary/5 border-primary/20"
                    : "bg-card border-border"
                }`}
              >
                {/* Column name + preview values */}
                <div className="min-w-0 pt-0.5">
                  <p className="text-sm font-medium truncate">{h}</p>
                  {preview.length > 0 ? (
                    <div className="mt-0.5 space-y-0.5">
                      {preview.map((v, vi) => (
                        <p
                          key={vi}
                          className="text-[11px] text-muted-foreground font-mono truncate leading-tight"
                        >
                          {v}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/40 italic mt-0.5">empty column</p>
                  )}
                </div>

                <ArrowRight className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-2" />

                {/* Target picker + meta */}
                <div className="space-y-1">
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
                    <SelectContent position="popper" className="z-200">
                      {platformFields.map((f) => (
                        <SelectItem key={f.key} value={f.key} className="text-sm">
                          <div className="flex items-center gap-1.5">
                            <span>{f.label}</span>
                            {requiredFieldKeys.has(f.key) && (
                              <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                required
                              </span>
                            )}
                          </div>
                          {f.typeHint && (
                            <span className="text-[11px] text-muted-foreground block leading-none mt-0.5">
                              {f.typeHint}
                            </span>
                          )}
                        </SelectItem>
                      ))}
                      <SelectItem value={CUSTOM} className="text-sm">
                        <span className="text-muted-foreground">Custom property</span>
                        <span className="text-[11px] text-muted-foreground/60 block leading-none mt-0.5">
                          stored as {"{{variable}}"}
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Auto-detected badge + type hint */}
                  {isMapped && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isAutoDetected && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-primary/70 font-medium">
                          <Sparkles className="h-2.5 w-2.5" />
                          Auto-detected
                        </span>
                      )}
                      {mappedField?.typeHint && (
                        <span className="text-[10px] text-muted-foreground/60 font-mono">
                          {mappedField.typeHint}
                        </span>
                      )}
                      {isRequiredField && (
                        <Badge variant="outline" className="h-4 text-[10px] px-1 border-amber-300 text-amber-600 dark:text-amber-400">
                          required
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                {/* Status icon */}
                <div className="mt-2">
                  {isMapped ? (
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  ) : (
                    <div className="h-4 w-4 shrink-0" />
                  )}
                </div>
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
