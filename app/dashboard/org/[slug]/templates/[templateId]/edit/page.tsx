"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { useOrg } from "@/lib/org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save, Loader2, AlertCircle, Undo2, Redo2, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { getCachedPreviewUrl, cachePreviewUrl, getPreviewCacheKey } from "@/lib/utils/preview-url-cache";
import { ComponentLibraryPanel } from "@/components/templates/ComponentLibraryPanel";
import type { TemplateComponent, ActiveSession } from "@/lib/api/templates";

interface TemplateField {
  id?: string; // Only present after save
  field_key: string;
  label: string;
  type: string;
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  style?: Record<string, unknown>;
  required?: boolean;
}

interface EditorData {
  template: {
    id: string;
    title: string;
    category_id: string;
    subcategory_id: string;
    category?: { id: string; name: string };
    subcategory?: { id: string; name: string };
  };
  version: {
    id: string;
    version_number: number;
    status: string;
  };
  source_file: {
    id: string;
    file_name: string;
    file_type: string;
    bucket?: string;
    path?: string;
    url?: string;
  };
  fields: TemplateField[];
}

// Default field keys for common fields
const DEFAULT_FIELD_KEYS = [
  "recipient_name",
  "course_name",
  "issue_date",
  "certificate_number",
  "qr_code",
];

export default function TemplateEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { orgPath } = useOrg();
  const templateId = params.templateId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorData, setEditorData] = useState<EditorData | null>(null);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [selectedFieldIndex, setSelectedFieldIndex] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [dragging, setDragging] = useState<{ index: number; startX: number; startY: number } | null>(null);

  // Track used field keys for uniqueness
  const usedFieldKeysRef = useRef<Set<string>>(new Set());
  const customFieldCounterRef = useRef(1);

  // Debounce timer for field updates
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Undo / redo history ────────────────────────────────────────────────────
  const historyRef = useRef<TemplateField[][]>([]);
  const historyIndexRef = useRef(-1);

  const pushHistory = useCallback((snapshot: TemplateField[]) => {
    // Discard any redo future
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(snapshot.map((f) => ({ ...f })));
    historyIndexRef.current = historyRef.current.length - 1;
    // Cap at 50 entries
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
      historyIndexRef.current = historyRef.current.length - 1;
    }
  }, []);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const snapshot = historyRef.current[historyIndexRef.current];
    if (snapshot) setFields(snapshot.map((f) => ({ ...f })));
  }, []);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const snapshot = historyRef.current[historyIndexRef.current];
    if (snapshot) setFields(snapshot.map((f) => ({ ...f })));
  }, []);

  // Cmd+Z / Cmd+Shift+Z keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleUndo, handleRedo]);

  // ── Collaboration presence ─────────────────────────────────────────────────
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    if (!editorData) return;
    const { id: templateId, } = editorData.template;
    const { id: versionId } = editorData.version;
    const sessionId = sessionIdRef.current;

    // Register session
    api.templates.registerSession(templateId, versionId, sessionId).catch(() => {});

    // Poll active sessions every 15 s + heartbeat
    const pollSessions = () => {
      api.templates.getActiveSessions(templateId, versionId)
        .then((res) => setActiveSessions(res.items.filter((s) => s.session_id !== sessionId)))
        .catch(() => {});
      api.templates.heartbeat(templateId, versionId, sessionId).catch(() => {});
    };
    pollSessions();
    const interval = setInterval(pollSessions, 15_000);
    return () => clearInterval(interval);
  }, [editorData]);

  // Load preview URL for source file
  const loadSourcePreviewUrl = useCallback(async (sourceFile: EditorData["source_file"]): Promise<string | null> => {
    // If URL already exists, cache and return it
    if (sourceFile.url) {
      const cacheKey = getPreviewCacheKey(templateId, sourceFile.id, sourceFile.bucket, sourceFile.path);
      cachePreviewUrl(cacheKey, sourceFile.url);
      return sourceFile.url;
    }

    // Check cache
    const cacheKey = getPreviewCacheKey(templateId, sourceFile.id, sourceFile.bucket, sourceFile.path);
    const cached = getCachedPreviewUrl(cacheKey);
    if (cached) {
      return cached;
    }

    // If bucket and path exist, try to fetch signed URL
    if (sourceFile.bucket && sourceFile.path) {
      try {
        const url = await api.templates.getPreviewUrl(templateId);
        if (url) {
          cachePreviewUrl(cacheKey, url);
          return url;
        }
      } catch (err) {
        console.error(`Error loading preview URL for template ${templateId}:`, err);
      }
    }

    return null;
  }, [templateId]);

  // Load editor data
  const loadEditorData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await api.templates.getEditorData(templateId);
      setEditorData(data);
      setFields(data.fields || []);

      // Initialize used field keys
      usedFieldKeysRef.current = new Set(data.fields.map((f) => f.field_key));

      // Load preview URL for source file in background
      if (data.source_file) {
        loadSourcePreviewUrl(data.source_file).then((url) => {
          if (url && data.source_file) {
            setEditorData((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                source_file: { ...prev.source_file, url },
              };
            });
          }
        });
      }
    } catch (err: any) {
      console.error("Error loading editor data:", err);
      setError(err.message || "Failed to load template editor");
    } finally {
      setLoading(false);
    }
  }, [templateId, loadSourcePreviewUrl]);

  useEffect(() => {
    if (templateId) {
      loadEditorData();
    }
  }, [templateId, loadEditorData]);

  // Generate unique field key
  const generateFieldKey = useCallback((type: string): string => {
    // Check if type matches a default key
    const defaultKey = DEFAULT_FIELD_KEYS.find((key) => key.includes(type.toLowerCase()));
    if (defaultKey && !usedFieldKeysRef.current.has(defaultKey)) {
      usedFieldKeysRef.current.add(defaultKey);
      return defaultKey;
    }

    // Generate custom key
    let customKey = `custom_${customFieldCounterRef.current}`;
    while (usedFieldKeysRef.current.has(customKey)) {
      customFieldCounterRef.current++;
      customKey = `custom_${customFieldCounterRef.current}`;
    }
    customFieldCounterRef.current++;
    usedFieldKeysRef.current.add(customKey);
    return customKey;
  }, []);

  // Track dirty state
  useEffect(() => {
    if (editorData) {
      // Compare current fields with original fields
      const originalFields = editorData.fields || [];
      const hasChanges =
        fields.length !== originalFields.length ||
        fields.some((field, index) => {
          const original = originalFields[index];
          if (!original) return true;
          return (
            field.field_key !== original.field_key ||
            field.label !== original.label ||
            field.type !== original.type ||
            field.page_number !== original.page_number ||
            field.x !== original.x ||
            field.y !== original.y ||
            field.width !== original.width ||
            field.height !== original.height ||
            JSON.stringify(field.style) !== JSON.stringify(original.style) ||
            field.required !== original.required
          );
        });
      setIsDirty(hasChanges);
    }
  }, [fields, editorData]);

  // Save fields
  const handleSave = useCallback(async () => {
    if (!editorData || !isDirty || saving) return;

    // Validate field keys uniqueness
    const fieldKeys = fields.map((f) => f.field_key);
    const duplicates = fieldKeys.filter((key, index) => fieldKeys.indexOf(key) !== index);
    if (duplicates.length > 0) {
      setError(`Duplicate field keys found: ${duplicates.join(", ")}`);
      setSaveStatus("error");
      return;
    }

    setSaving(true);
    setSaveStatus("saving");

    try {
      const result = await api.templates.saveFields(
        templateId,
        editorData.version.id,
        fields
      );

      // Update fields with server response (includes IDs)
      setFields(result.fields);
      setEditorData((prev) => {
        if (!prev) return null;
        return { ...prev, fields: result.fields };
      });

      setIsDirty(false);
      setSaveStatus("saved");

      // Clear saved status after 2 seconds
      setTimeout(() => {
        setSaveStatus("idle");
      }, 2000);
    } catch (err: any) {
      console.error("Error saving fields:", err);
      setError(err.message || "Failed to save fields");
      setSaveStatus("error");
      // Keep user changes in UI (don't reset)
    } finally {
      setSaving(false);
    }
  }, [editorData, fields, isDirty, saving, templateId]);

  // Add field
  const handleAddField = useCallback(
    (type: string) => {
      pushHistory(fields);
      const newField: TemplateField = {
        field_key: generateFieldKey(type),
        label: type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " "),
        type,
        page_number: 1,
        x: 100,
        y: 100,
        width: 200,
        height: 30,
        required: false,
      };
      setFields([...fields, newField]);
    },
    [fields, generateFieldKey, pushHistory]
  );

  // Insert a component from the library as a new field
  const handleInsertComponent = useCallback(
    (component: TemplateComponent) => {
      pushHistory(fields);
      const node = component.node as Record<string, unknown>;
      const pos = (node.position as Record<string, number> | undefined) ?? {};
      const style = (node.style as Record<string, unknown> | undefined) ?? {};
      const newField: TemplateField = {
        field_key: generateFieldKey(`component_${component.name.toLowerCase().replace(/\s+/g, "_")}`),
        label: component.name,
        type: (node.type as string | undefined) ?? "text",
        page_number: 1,
        x: (pos.x as number | undefined) ?? 100,
        y: (pos.y as number | undefined) ?? 100,
        width: (pos.width as number | undefined) ?? 200,
        height: (pos.height as number | undefined) ?? 40,
        style: { ...style, _component_id: component.id },
        required: false,
      };
      setFields([...fields, newField]);
    },
    [fields, generateFieldKey, pushHistory]
  );

  // Update field (with debouncing for position updates)
  const handleUpdateField = useCallback(
    (index: number, updates: Partial<TemplateField>, immediate = false) => {
      setFields((currentFields) => {
        const updatedFields = [...currentFields];
        const field = updatedFields[index];

        if (!field) {
          console.error('Field not found at index', index);
          return currentFields;
        }

        // Check field_key uniqueness if it's being changed
        if (updates.field_key && updates.field_key !== field.field_key) {
          if (usedFieldKeysRef.current.has(updates.field_key)) {
            setError(`Field key "${updates.field_key}" is already in use`);
            return currentFields;
          }
          usedFieldKeysRef.current.delete(field.field_key);
          usedFieldKeysRef.current.add(updates.field_key);
        }

        updatedFields[index] = { ...field, ...updates };
        
        // Debounce position updates (x, y) for better performance
        if (!immediate && (updates.x !== undefined || updates.y !== undefined)) {
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }
          debounceTimerRef.current = setTimeout(() => {
            setFields((prevFields) => {
              const finalFields = [...prevFields];
              const existingField = finalFields[index];
              if (existingField) {
                finalFields[index] = { ...existingField, ...updates };
              }
              return finalFields;
            });
            setError(null);
          }, 100);
          // Return updated fields immediately for UI responsiveness
          return updatedFields;
        } else {
          setError(null);
          return updatedFields;
        }
      });
    },
    []
  );

  // Handle field drag start
  const handleFieldDragStart = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedFieldIndex(index);
      const field = fields[index];
      if (!field) return;
      setDragging({
        index,
        startX: e.clientX - field.x,
        startY: e.clientY - field.y,
      });
    },
    [fields]
  );

  // Handle field drag
  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragging.startX;
      const newY = e.clientY - dragging.startY;
      // Use immediate update for dragging for smooth UX
      setFields((currentFields) => {
        const updatedFields = [...currentFields];
        const existingField = updatedFields[dragging.index];
        if (existingField) {
          updatedFields[dragging.index] = {
            ...existingField,
            x: Math.max(0, newX),
            y: Math.max(0, newY),
          };
        }
        return updatedFields;
      });
    };

    const handleMouseUp = () => {
      setDragging(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Delete field
  const handleDeleteField = useCallback(
    (index: number) => {
      pushHistory(fields);
      const field = fields[index];
      if (field) {
        usedFieldKeysRef.current.delete(field.field_key);
      }
      setFields(fields.filter((_, i) => i !== index));
    },
    [fields, pushHistory]
  );

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        {/* Header Skeleton */}
        <div className="border-b bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2 flex-1">
              <div className="h-6 bg-muted animate-pulse rounded w-48" />
              <div className="h-4 bg-muted animate-pulse rounded w-32" />
            </div>
            <div className="h-10 bg-muted animate-pulse rounded w-24" />
          </div>
        </div>

        {/* Main Content Skeleton */}
        <div className="flex-1 flex overflow-hidden">
          {/* Canvas Area Skeleton */}
          <div className="flex-1 p-8 bg-muted/20">
            <div className="h-full bg-muted animate-pulse rounded-lg" />
          </div>

          {/* Properties Panel Skeleton */}
          <div className="w-80 border-l bg-card p-4">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 bg-muted animate-pulse rounded w-24" />
                  <div className="h-10 bg-muted animate-pulse rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !editorData) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={loadEditorData} className="ml-4">
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!editorData) {
    return null;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(orgPath("/templates"))}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-xl font-semibold">{editorData.template.title}</h1>
              <p className="text-sm text-muted-foreground">
                {editorData.template.category?.name || "Category"} /{" "}
                {editorData.template.subcategory?.name || "Subcategory"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Presence avatars */}
            {activeSessions.length > 0 && (
              <div className="flex items-center gap-1 mr-1 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                <span>{activeSessions.length} editing</span>
              </div>
            )}

            {/* Undo / Redo */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUndo}
              disabled={!canUndo}
              title="Undo (⌘Z)"
              className="h-8 w-8 p-0"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRedo}
              disabled={!canRedo}
              title="Redo (⌘⇧Z)"
              className="h-8 w-8 p-0"
            >
              <Redo2 className="h-4 w-4" />
            </Button>

            {saveStatus === "saving" && (
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="text-sm text-primary">Saved</span>
            )}
            <Button
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              Save Fields
            </Button>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="m-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas Area */}
        <div className="flex-1 p-8 bg-muted/20 overflow-auto">
          <div className="relative bg-white shadow-lg rounded-lg inline-block" style={{ minWidth: "100%" }}>
            {/* Template Preview */}
            {editorData.source_file.url ? (
              <img
                src={editorData.source_file.url}
                alt={editorData.template.title}
                className="w-full h-auto block"
                draggable={false}
              />
            ) : editorData.source_file.bucket && editorData.source_file.path ? (
              <div className="flex items-center justify-center h-full min-h-[800px] text-muted-foreground">
                <div className="text-center">
                  <p>Preview URL not available</p>
                  <p className="text-xs mt-2">
                    Bucket: {editorData.source_file.bucket}
                    <br />
                    Path: {editorData.source_file.path}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full min-h-[800px] text-muted-foreground">
                Preview not available
              </div>
            )}

            {/* Field Overlays */}
            {fields.map((field, index) => (
              <div
                key={index}
                className={cn(
                  "absolute border-2 border-dashed bg-primary/10",
                  "cursor-move transition-all",
                  selectedFieldIndex === index
                    ? "border-primary bg-primary/20 z-10"
                    : "border-primary/50 hover:border-primary/75 hover:bg-primary/15"
                )}
                style={{
                  left: `${field.x}px`,
                  top: `${field.y}px`,
                  width: `${field.width}px`,
                  height: `${field.height}px`,
                }}
                onMouseDown={(e) => handleFieldDragStart(index, e)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFieldIndex(index);
                }}
              >
                <div className="p-1 text-xs font-medium text-primary truncate">
                  {field.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Properties Panel */}
        <div className="w-80 border-l bg-card p-4 overflow-y-auto">
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-4">Fields</h2>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddField("text")}
                  className="w-full"
                >
                  Add Text Field
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddField("date")}
                  className="w-full"
                >
                  Add Date Field
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddField("qr_code")}
                  className="w-full"
                >
                  Add QR Code
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddField("custom")}
                  className="w-full"
                >
                  Add Custom Field
                </Button>
              </div>
            </div>

            {/* Field List */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">
                Field Properties {fields.length > 0 && `(${fields.length})`}
              </h3>
              {fields.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No fields added yet. Click "Add Field" buttons above to get started.
                </p>
              ) : (
                fields.map((field, index) => (
                  <div
                    key={index}
                    className={cn(
                      "border rounded-lg p-3 space-y-3 transition-colors",
                      selectedFieldIndex === index && "border-primary bg-primary/5"
                    )}
                  >
                  <div className="space-y-2">
                    <Label htmlFor={`field-key-${index}`}>Field Key</Label>
                    <Input
                      id={`field-key-${index}`}
                      value={field.field_key}
                      onChange={(e) =>
                        handleUpdateField(index, { field_key: e.target.value })
                      }
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`field-label-${index}`}>Label</Label>
                    <Input
                      id={`field-label-${index}`}
                      value={field.label}
                      onChange={(e) =>
                        handleUpdateField(index, { label: e.target.value })
                      }
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`field-type-${index}`}>Type</Label>
                    <Input
                      id={`field-type-${index}`}
                      value={field.type}
                      onChange={(e) =>
                        handleUpdateField(index, { type: e.target.value })
                      }
                      disabled={saving}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label htmlFor={`field-x-${index}`}>X Position</Label>
                      <Input
                        id={`field-x-${index}`}
                        type="number"
                        value={field.x}
                        onChange={(e) =>
                          handleUpdateField(index, { x: Number(e.target.value) }, true)
                        }
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`field-y-${index}`}>Y Position</Label>
                      <Input
                        id={`field-y-${index}`}
                        type="number"
                        value={field.y}
                        onChange={(e) =>
                          handleUpdateField(index, { y: Number(e.target.value) }, true)
                        }
                        disabled={saving}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label htmlFor={`field-width-${index}`}>Width</Label>
                      <Input
                        id={`field-width-${index}`}
                        type="number"
                        value={field.width}
                        onChange={(e) =>
                          handleUpdateField(index, { width: Number(e.target.value) })
                        }
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`field-height-${index}`}>Height</Label>
                      <Input
                        id={`field-height-${index}`}
                        type="number"
                        value={field.height}
                        onChange={(e) =>
                          handleUpdateField(index, { height: Number(e.target.value) })
                        }
                        disabled={saving}
                      />
                    </div>
                  </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        handleDeleteField(index);
                        if (selectedFieldIndex === index) {
                          setSelectedFieldIndex(null);
                        }
                      }}
                      disabled={saving}
                      className="w-full"
                    >
                      Delete Field
                    </Button>
                  </div>
                ))
              )}
            </div>

            <ComponentLibraryPanel onInsert={handleInsertComponent} className="pt-2 border-t" />
          </div>
        </div>
      </div>
    </div>
  );
}
