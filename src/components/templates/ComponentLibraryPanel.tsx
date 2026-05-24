"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api/client";
import type { TemplateComponent } from "@/lib/api/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Puzzle, Search, Plus, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** Called when user clicks to insert a component into the canvas */
  onInsert: (component: TemplateComponent) => void;
  className?: string;
}

export function ComponentLibraryPanel({ onInsert, className }: Props) {
  const [components, setComponents] = useState<TemplateComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    api.templates.listComponents()
      .then((res) => setComponents(res.items))
      .catch(() => setComponents([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = components.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.description ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const nodeType = (c: TemplateComponent) =>
    (c.node.type as string | undefined) ?? "unknown";

  const nodeTypeColor: Record<string, string> = {
    text:    "bg-blue-100 text-blue-700",
    image:   "bg-purple-100 text-purple-700",
    qr:      "bg-green-100 text-green-700",
    shape:   "bg-orange-100 text-orange-700",
    frame:   "bg-pink-100 text-pink-700",
    group:   "bg-gray-100 text-gray-700",
    unknown: "bg-muted text-muted-foreground",
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
        <Puzzle className="h-4 w-4" />
        Component Library
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search components…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-7 h-8 text-sm"
        />
      </div>

      {/* Component list */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">
          {components.length === 0
            ? "No components yet. Create one from the design editor."
            : "No components match your search."}
        </p>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
          {filtered.map((comp) => (
            <div
              key={comp.id}
              className={cn(
                "border rounded-md text-sm transition-colors",
                expanded === comp.id ? "border-primary/50 bg-primary/5" : "hover:bg-muted/50",
              )}
            >
              {/* Header row */}
              <div className="flex items-center gap-2 px-2 py-1.5">
                <button
                  className="flex-1 flex items-center gap-2 text-left"
                  onClick={() => setExpanded(expanded === comp.id ? null : comp.id)}
                >
                  <ChevronRight
                    className={cn(
                      "h-3 w-3 text-muted-foreground shrink-0 transition-transform",
                      expanded === comp.id && "rotate-90",
                    )}
                  />
                  <span className="font-medium truncate">{comp.name}</span>
                  <span
                    className={cn(
                      "ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0",
                      nodeTypeColor[nodeType(comp)] ?? nodeTypeColor.unknown,
                    )}
                  >
                    {nodeType(comp)}
                  </span>
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 shrink-0"
                  title="Insert into canvas"
                  onClick={() => onInsert(comp)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Expanded detail */}
              {expanded === comp.id && (
                <div className="px-3 pb-2 text-xs text-muted-foreground space-y-1 border-t">
                  {comp.description && <p className="mt-1.5">{comp.description}</p>}
                  {Object.keys(comp.variants).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className="font-medium text-foreground">Variants:</span>
                      {Object.keys(comp.variants).map((v) => (
                        <span key={v} className="bg-muted px-1.5 py-0.5 rounded font-mono">
                          {v}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
