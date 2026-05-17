"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Award, Megaphone, Mail, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

type Intent = "certificates" | "broadcasts" | "email_template";

interface PostImportIntentDialogProps {
  open: boolean;
  imported: number;
  orgSlug: string;
  onDismiss: () => void;
}

const INTENTS: Array<{
  id: Intent;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: (slug: string) => string;
}> = [
  {
    id: "certificates",
    icon: Award,
    title: "Generate certificates",
    description: "Use this contact data to bulk-issue certificates",
    href: (slug) => `/dashboard/org/${slug}/generate-certificate`,
  },
  {
    id: "broadcasts",
    icon: Megaphone,
    title: "Send email campaign",
    description: "Broadcast an email to these recipients",
    href: (slug) => `/dashboard/org/${slug}/broadcasts`,
  },
  {
    id: "email_template",
    icon: Mail,
    title: "Design email template",
    description: "Create a reusable template for future campaigns",
    href: (slug) => `/dashboard/org/${slug}/email-templates`,
  },
];

export function PostImportIntentDialog({
  open,
  imported,
  orgSlug,
  onDismiss,
}: PostImportIntentDialogProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<Intent>>(new Set());

  function toggle(id: Intent) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleGo() {
    // Navigate to the first selected option
    const first = INTENTS.find((i) => selected.has(i.id));
    if (first) {
      router.push(first.href(orgSlug));
    }
    onDismiss();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setSelected(new Set());
          onDismiss();
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {imported.toLocaleString()} contact{imported !== 1 ? "s" : ""} imported!
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            What would you like to do with them? Select one or more.
          </p>
        </DialogHeader>

        <div className="space-y-2 py-1">
          {INTENTS.map(({ id, icon: Icon, title, description }) => {
            const isSelected = selected.has(id);
            return (
              <button
                key={id}
                onClick={() => toggle(id)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "hover:border-muted-foreground/30 hover:bg-muted/30"
                )}
              >
                <div
                  className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                    isSelected ? "bg-primary/10" : "bg-muted"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      isSelected ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium", isSelected && "text-primary")}>
                    {title}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
                </div>
                <div
                  className={cn(
                    "h-4 w-4 rounded-full border-2 shrink-0 transition-colors",
                    isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                  )}
                />
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="ghost" size="sm" className="flex-1" onClick={() => { setSelected(new Set()); onDismiss(); }}>
            I'll decide later
          </Button>
          {selected.size > 0 && (
            <Button size="sm" className="flex-1" onClick={handleGo}>
              Continue <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
