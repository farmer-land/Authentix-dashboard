"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Filter, Plus, Trash2, Loader2, Users, Edit2, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useEmailSegments, useCreateSegment, useUpdateSegment, useDeleteSegment } from "@/lib/hooks/queries/delivery";
import type { EmailSegment, FilterRule, FilterOperator, SegmentFilters, CreateSegmentDto } from "@/lib/api/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";

// ── Filter config ──────────────────────────────────────────────────────────────

const STANDARD_FIELDS = [
  { value: "email", label: "Email" },
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
  { value: "unsubscribed", label: "Subscription Status" },
];

const OPERATORS: Record<string, { value: FilterOperator; label: string }[]> = {
  default: [
    { value: "equals", label: "equals" },
    { value: "not_equals", label: "does not equal" },
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "does not contain" },
    { value: "starts_with", label: "starts with" },
    { value: "ends_with", label: "ends with" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  unsubscribed: [
    { value: "equals", label: "is" },
  ],
};

const UNSUBSCRIBED_VALUES = [
  { value: "true", label: "Unsubscribed" },
  { value: "false", label: "Subscribed" },
];

function operatorsFor(field: string): { value: FilterOperator; label: string }[] {
  return (field === "unsubscribed" ? OPERATORS.unsubscribed : OPERATORS.default) ?? [];
}

function needsValue(op: FilterOperator) {
  return op !== "is_empty" && op !== "is_not_empty";
}

// ── Empty rule factory ─────────────────────────────────────────────────────────

function emptyRule(): FilterRule {
  return { id: nanoid(), field: "email", operator: "contains", value: "" };
}

function emptyFilters(): SegmentFilters {
  return { match: "all", rules: [emptyRule()] };
}

// ── Segment form ───────────────────────────────────────────────────────────────

function SegmentForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: Partial<EmailSegment>;
  onSave: (dto: CreateSegmentDto) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [filters, setFilters] = useState<SegmentFilters>(
    initial?.filters ?? emptyFilters(),
  );
  const [customField, setCustomField] = useState("");

  const setMatch = (match: "all" | "any") => setFilters(f => ({ ...f, match }));

  const addRule = () =>
    setFilters(f => ({ ...f, rules: [...f.rules, emptyRule()] }));

  const removeRule = (id: string) =>
    setFilters(f => ({ ...f, rules: f.rules.filter(r => r.id !== id) }));

  const updateRule = (id: string, patch: Partial<FilterRule>) =>
    setFilters(f => ({
      ...f,
      rules: f.rules.map(r => (r.id === id ? { ...r, ...patch } : r)),
    }));

  const allFields = [
    ...STANDARD_FIELDS,
    ...(customField.trim() ? [{ value: customField.trim(), label: `Custom: ${customField.trim()}` }] : []),
  ];

  const valid = name.trim().length > 0 && filters.rules.length > 0 &&
    filters.rules.every(r => r.field && r.operator && (!needsValue(r.operator) || r.value.trim()));

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label>Segment name</Label>
        <Input
          placeholder="e.g. Active subscribers India"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Include contacts that match</span>
          <Select value={filters.match} onValueChange={v => setMatch(v as "all" | "any")}>
            <SelectTrigger className="w-20 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ALL</SelectItem>
              <SelectItem value="any">ANY</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">of the following rules:</span>
        </div>

        <div className="space-y-2">
          {filters.rules.map((rule, idx) => (
            <div key={rule.id} className="flex items-center gap-2">
              {/* Field */}
              <Select
                value={rule.field}
                onValueChange={v => updateRule(rule.id, { field: v, operator: operatorsFor(v)[0]!.value, value: "" })}
              >
                <SelectTrigger className="w-40 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allFields.map(f => (
                    <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                  ))}
                  {customField.trim() === "" && (
                    <div className="px-2 pt-1 pb-2 border-t mt-1">
                      <Input
                        placeholder="Custom field key…"
                        className="h-6 text-xs"
                        onClick={e => e.stopPropagation()}
                        onChange={e => setCustomField(e.target.value)}
                      />
                    </div>
                  )}
                </SelectContent>
              </Select>

              {/* Operator */}
              <Select
                value={rule.operator}
                onValueChange={v => updateRule(rule.id, { operator: v as FilterOperator })}
              >
                <SelectTrigger className="w-40 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operatorsFor(rule.field).map(op => (
                    <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Value */}
              {needsValue(rule.operator) && (
                rule.field === "unsubscribed" ? (
                  <Select
                    value={rule.value}
                    onValueChange={v => updateRule(rule.id, { value: v })}
                  >
                    <SelectTrigger className="w-36 h-8 text-xs">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {UNSUBSCRIBED_VALUES.map(v => (
                        <SelectItem key={v.value} value={v.value} className="text-xs">{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    className="h-8 text-xs flex-1"
                    placeholder="Value…"
                    value={rule.value}
                    onChange={e => updateRule(rule.id, { value: e.target.value })}
                  />
                )
              )}

              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                disabled={filters.rules.length === 1}
                onClick={() => removeRule(rule.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" className="text-xs" onClick={addRule}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add rule
        </Button>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button disabled={!valid || saving} onClick={() => onSave({ name: name.trim(), filters })}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save segment
        </Button>
      </DialogFooter>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SegmentsPage() {
  const { segments, loading } = useEmailSegments();
  const createMutation = useCreateSegment();
  const updateMutation = useUpdateSegment();
  const deleteMutation = useDeleteSegment();

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<EmailSegment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmailSegment | null>(null);

  const handleCreate = async (dto: CreateSegmentDto) => {
    try {
      await createMutation.mutateAsync(dto);
      toast.success("Segment created");
      setShowCreate(false);
    } catch {
      toast.error("Failed to create segment");
    }
  };

  const handleUpdate = async (dto: CreateSegmentDto) => {
    if (!editTarget) return;
    try {
      await updateMutation.mutateAsync({ id: editTarget.id, dto });
      toast.success("Segment updated");
      setEditTarget(null);
    } catch {
      toast.error("Failed to update segment");
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Segments</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Group contacts with filter rules to target broadcasts
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" /> New segment
        </Button>
      </div>

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      )}

      {!loading && segments.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Filter className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No segments yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create a segment to group contacts by their properties
            </p>
            <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" /> Create segment
            </Button>
          </CardContent>
        </Card>
      )}

      <div className={segments.length === 0 ? "hidden" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
        {segments.map(segment => (
          <Card key={segment.id} className="relative group">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">{segment.name}</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    {format(new Date(segment.updated_at), "dd MMM yyyy")}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setEditTarget(segment)}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive"
                    onClick={() => setDeleteTarget(segment)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                <span>{segment.contact_count.toLocaleString()} contacts</span>
                <span>·</span>
                <span>Match {segment.filters.match === "all" ? "ALL" : "ANY"}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {segment.filters.rules.slice(0, 3).map(rule => (
                  <Badge key={rule.id} variant="secondary" className="text-xs font-normal">
                    {rule.field} {rule.operator.replace("_", " ")}
                    {needsValue(rule.operator) && ` "${rule.value}"`}
                  </Badge>
                ))}
                {segment.filters.rules.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{segment.filters.rules.length - 3} more
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New segment</DialogTitle>
          </DialogHeader>
          <SegmentForm
            onSave={handleCreate}
            onCancel={() => setShowCreate(false)}
            saving={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={open => !open && setEditTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit segment</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <SegmentForm
              initial={editTarget}
              onSave={handleUpdate}
              onCancel={() => setEditTarget(null)}
              saving={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete segment?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{deleteTarget?.name}</span> will be permanently removed. Broadcasts targeting this segment will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                deleteMutation.mutate(deleteTarget.id, {
                  onSuccess: () => { toast.success("Segment deleted"); setDeleteTarget(null); },
                  onError: () => toast.error("Failed to delete segment"),
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
