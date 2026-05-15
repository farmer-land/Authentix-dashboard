"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Key, Mail, LayoutList } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useOrg } from "@/lib/org";

export default function SettingsPage() {
  const { orgPath } = useOrg();

  const settingsSections = [
    {
      icon: Building2,
      title: "Organization Profile",
      description: "Manage your organization information, logo, and branding",
      href: orgPath("/organization"),
    },
    {
      icon: LayoutList,
      title: "Categories & Subcategories",
      description: "Manage certificate categories and subcategories — add custom ones, rename, hide, or reorder industry defaults",
      href: orgPath("/settings/categories"),
    },
    {
      icon: Key,
      title: "API Settings",
      description: "Generate and manage API keys for integration",
      href: orgPath("/settings/api"),
    },
    {
      icon: Mail,
      title: "Email Delivery",
      description: "Configure email integration and delivery templates for certificates",
      href: orgPath("/settings/delivery"),
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1.5 text-base">
          Manage your organization preferences and integrations
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {settingsSections.map((section) => (
          <Link key={section.title} href={section.href}>
            <Card className="group hover:shadow-md transition-all duration-200 cursor-pointer border border-border bg-card/60 h-full">
              <CardHeader>
                <div className="flex items-start gap-4">
                  <div className="p-2.5 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <section.icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base mb-1">{section.title}</CardTitle>
                    <CardDescription className="text-sm leading-relaxed">
                      {section.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm" className="w-full">
                  Configure
                </Button>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
