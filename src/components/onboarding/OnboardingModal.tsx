"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import { api } from "@/lib/api/client";
import { USE_CASE_PRESETS } from "@/lib/feature-flags";

type Step = "use_case" | "industry";

export function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("use_case");
  const [selectedUseCase, setSelectedUseCase] = useState<string>("");
  const [industry, setIndustry] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.organizations.get().then(org => {
      if (!org.industry) {
        const dismissed = localStorage.getItem("onboarding_dismissed");
        if (!dismissed) setOpen(true);
      }
    }).catch(() => {});
  }, []);

  const handleUseCaseContinue = () => {
    if (!selectedUseCase) return;
    setStep("industry");
  };

  const handleSave = async () => {
    if (!industry) return;
    setSaving(true);
    try {
      const preset = USE_CASE_PRESETS.find(p => p.id === selectedUseCase);
      // Save industry + features in parallel
      await Promise.all([
        api.organizations.update({ industry }),
        preset ? api.organizations.updateFeatures(preset.features) : Promise.resolve(),
      ]);
      setOpen(false);
    } catch {
      alert("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    localStorage.setItem("onboarding_dismissed", "true");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-130 p-0 overflow-hidden">
        {/* Header */}
        <div className="px-7 pt-7 pb-5 border-b bg-muted/30">
          <div className="flex items-center gap-3 mb-3">
            <Image src="/brand/authentix-24-24.svg" alt="Authentix" width={28} height={28} />
            <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">Setup</span>
          </div>
          <DialogHeader>
            <DialogTitle className="text-xl">
              {step === "use_case" ? "What will you use Authentix for?" : "Tell us about your organisation"}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm">
              {step === "use_case"
                ? "This sets up your workspace — you can change or expand this later."
                : "Helps us show relevant certificate categories and templates."}
            </DialogDescription>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-4">
            {(["use_case", "industry"] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                  step === s ? "bg-primary text-primary-foreground" :
                  (i === 0 && step === "industry") ? "bg-emerald-500 text-white" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {i === 0 && step === "industry" ? <CheckCircle2 className="w-3 h-3" /> : i + 1}
                </div>
                {i < 1 && <div className={`h-px w-8 transition-colors ${step === "industry" ? "bg-emerald-500" : "bg-muted"}`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="px-7 py-6">
          {step === "use_case" ? (
            <div className="space-y-3">
              {USE_CASE_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => setSelectedUseCase(preset.id)}
                  className={`w-full text-left rounded-2xl border-2 px-4 py-3.5 transition-all ${
                    selectedUseCase === preset.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-border/80 hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                      selectedUseCase === preset.id ? "border-primary" : "border-muted-foreground/40"
                    }`}>
                      {selectedUseCase === preset.id && (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{preset.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{preset.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <Label htmlFor="industry" className="text-sm font-medium">Industry</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select your industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EdTech">EdTech</SelectItem>
                  <SelectItem value="Corporate">Corporate</SelectItem>
                  <SelectItem value="School">School</SelectItem>
                  <SelectItem value="College / University">College / University</SelectItem>
                  <SelectItem value="Government">Government</SelectItem>
                  <SelectItem value="Training Institute">Training Institute</SelectItem>
                  <SelectItem value="NGO">NGO</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">You can change this later in Company Settings</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-7 pb-7 flex justify-between gap-3">
          <Button variant="ghost" onClick={handleSkip} disabled={saving} className="text-muted-foreground">
            Skip for now
          </Button>
          {step === "use_case" ? (
            <Button onClick={handleUseCaseContinue} disabled={!selectedUseCase}>
              Continue
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("use_case")} disabled={saving}>
                Back
              </Button>
              <Button onClick={handleSave} disabled={!industry || saving}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : "Finish setup"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
