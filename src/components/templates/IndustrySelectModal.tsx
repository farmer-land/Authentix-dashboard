"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api/client";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface IndustrySelectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndustrySelected: () => void;
}

// TODO: Replace with API call to GET /industries when backend is ready
const INDUSTRIES = [
  { id: "edtech", name: "EdTech" },
  { id: "corporate", name: "Corporate" },
  { id: "school", name: "School" },
  { id: "college_university", name: "College / University" },
  { id: "government", name: "Government" },
  { id: "training_institute", name: "Training Institute" },
  { id: "ngo", name: "NGO" },
];

export function IndustrySelectModal({
  open,
  onOpenChange,
  onIndustrySelected,
}: IndustrySelectModalProps) {
  const [selectedIndustry, setSelectedIndustry] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!selectedIndustry) {
      setError("Please select an industry");
      return;
    }

    setSaving(true);
    setError("");

    try {
      // Update organization with industry
      // For now, using industry name. Backend Step-1 should accept industry_id
      await api.organizations.update({
        industry: INDUSTRIES.find((i) => i.id === selectedIndustry)?.name || selectedIndustry,
        industry_id: selectedIndustry, // Backend should accept this
      });

      onIndustrySelected();
      onOpenChange(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.message || "Failed to save industry selection");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select Organization Industry</DialogTitle>
          <DialogDescription>
            Please select your organization&apos;s industry to continue uploading templates.
            Categories and subcategories are filtered by industry.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Industry</label>
            <Select
              value={selectedIndustry}
              onValueChange={setSelectedIndustry}
              disabled={saving}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select industry" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((industry) => (
                  <SelectItem key={industry.id} value={industry.id}>
                    {industry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !selectedIndustry}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
