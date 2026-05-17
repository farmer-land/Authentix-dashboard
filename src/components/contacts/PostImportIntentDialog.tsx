"use client";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Award, Megaphone, X } from "lucide-react";

interface PostImportIntentDialogProps {
  open: boolean;
  imported: number;
  orgSlug: string;
  onDismiss: () => void;
}

export function PostImportIntentDialog({
  open,
  imported,
  orgSlug,
  onDismiss,
}: PostImportIntentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onDismiss()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {imported} contact{imported !== 1 ? "s" : ""} imported!
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            What would you like to do with them?
          </p>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <a href={`/dashboard/org/${orgSlug}/generate-certificate`}>
            <div className="flex flex-col items-center gap-2 rounded-xl border px-4 py-5 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors text-center">
              <Award className="h-7 w-7 text-primary" />
              <span className="text-sm font-medium">Generate certificates</span>
              <span className="text-[11px] text-muted-foreground">
                Use this data to bulk-issue certificates
              </span>
            </div>
          </a>
          <a href={`/dashboard/org/${orgSlug}/broadcasts`}>
            <div className="flex flex-col items-center gap-2 rounded-xl border px-4 py-5 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors text-center">
              <Megaphone className="h-7 w-7 text-primary" />
              <span className="text-sm font-medium">Send email campaign</span>
              <span className="text-[11px] text-muted-foreground">
                Broadcast to these recipients
              </span>
            </div>
          </a>
        </div>

        <Button variant="ghost" size="sm" className="w-full" onClick={onDismiss}>
          <X className="h-3.5 w-3.5 mr-1.5" /> I'll use them later
        </Button>
      </DialogContent>
    </Dialog>
  );
}
