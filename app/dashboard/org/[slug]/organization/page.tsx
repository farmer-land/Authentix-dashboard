"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Building2, Upload, Loader2, CheckCircle2, Globe, MapPin, Phone, Mail, UserCircle, Receipt, MessageSquare } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { getOrganizationLogoUrl } from "@/lib/utils/organization-logo";
import { useOrganization, useUpdateOrganization } from "@/lib/hooks/queries/organizations";
import { useUserProfile, useUpdateUserProfile } from "@/lib/hooks/queries/users";

export default function OrganizationPage() {
  const [organizationData, setOrganizationData] = useState({
    name: "",
    email: "",
    phone: "",
    website: "",
    industry: "",
    verification_message: "",
    address: "",
    city: "",
    state: "",
    country: "",
    postal_code: "",
    gst_number: "",
    cin_number: "",
    // Billing specific fields
    billing_email: "",
    billing_currency: "USD",
    billing_address: "",
    billing_city: "",
    billing_state: "",
    billing_country: "",
    billing_postal_code: "",
  });
  
  const [userData, setUserData] = useState({
    full_name: "",
    email: "",
  });

  const [userAvatar, setUserAvatar] = useState<File | null>(null);
  const [userAvatarPreview, setUserAvatarPreview] = useState("");

  const [billingSameAsOrg, setBillingSameAsOrg] = useState(true);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const { organization, loading } = useOrganization();
  const { profile: userProfile } = useUserProfile();
  const updateOrganization = useUpdateOrganization();
  const updateUserProfile = useUpdateUserProfile();

  // Seed form fields once org data arrives
  useEffect(() => {
    if (!organization) return;
    const org = organization as Record<string, any>;
    setOrganizationData({
      name: org.name || "",
      email: org.email || "",
      phone: org.phone || "",
      website: org.website || "",
      industry: org.industry || "",
      verification_message: org.verification_message || "",
      address: org.address || "",
      city: org.city || "",
      state: org.state || "",
      country: org.country || "",
      postal_code: org.postal_code || "",
      gst_number: org.gst_number || "",
      cin_number: org.cin_number || "",
      billing_email: org.billing_email || "",
      billing_currency: org.billing_currency || "USD",
      billing_address: org.billing_address || "",
      billing_city: org.billing_city || "",
      billing_state: org.billing_state || "",
      billing_country: org.billing_country || "",
      billing_postal_code: org.billing_postal_code || "",
    });
    setBillingSameAsOrg(!(org.billing_address && org.billing_address !== org.address));
    const logoUrl = getOrganizationLogoUrl(organization);
    setLogoPreview(logoUrl || "");
  }, [organization]);

  // Seed user fields once profile arrives
  useEffect(() => {
    if (!userProfile) return;
    const p = userProfile as Record<string, any>;
    setUserData({ full_name: p.full_name || "", email: p.email || "" });
    if (p.avatar_url) setUserAvatarPreview(p.avatar_url);
  }, [userProfile]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        setLogo(file);
        const reader = new FileReader();
        reader.onloadend = () => {
          setLogoPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setError("Please upload an image file");
      }
    }
  };

  const handleUserAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        setUserAvatar(file);
        const reader = new FileReader();
        reader.onloadend = () => {
          setUserAvatarPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setError("Please upload an image file for profile");
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);

    // Compute the actual payload; if "Same as Org", overwrite the billing address with the org address.
    const payload = { ...organizationData };
    if (billingSameAsOrg) {
      payload.billing_address = payload.address;
      payload.billing_city = payload.city;
      payload.billing_state = payload.state;
      payload.billing_country = payload.country;
      payload.billing_postal_code = payload.postal_code;
    }

    try {
      const [updatedOrganization] = await Promise.all([
        updateOrganization.mutateAsync({ data: payload, logoFile: logo || undefined }),
        updateUserProfile
          .mutateAsync({ data: { full_name: userData.full_name }, avatarFile: userAvatar || undefined })
          .catch((err) => console.warn("User profile update may not be implemented on backend", err)),
      ]);

      const updatedLogoUrl = getOrganizationLogoUrl(updatedOrganization);
      if (updatedLogoUrl) setLogoPreview(updatedLogoUrl);

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      setLogo(null);
    } catch (err: any) {
      setError(err.message || "Failed to save organization profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-10">
      {/* Status Notification */}
      {success && (
        <div className="flex justify-center animate-in fade-in slide-in-from-top-2">
          <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 hover:bg-green-500/20 border-0 gap-1.5 px-3 py-1 text-sm font-medium transition-all">
            <CheckCircle2 className="h-4 w-4" />
            Changes saved successfully
          </Badge>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        
        {/* Personal Details Card */}
        <Card className="border-border/50 shadow-sm bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-4 border-b border-border/30">
            <CardTitle className="text-lg font-medium flex items-center justify-center gap-2">
              <UserCircle className="h-4 w-4 text-muted-foreground" />
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 sm:p-8">
            <div className="space-y-6 max-w-xl mx-auto">
              
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
                <div className="relative group rounded-full bg-background shadow-sm border border-border/50 shrink-0">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center bg-muted overflow-hidden relative transition-all group-hover:border-primary/50 group-hover:shadow-md">
                    {userAvatarPreview ? (
                      <img src={userAvatarPreview} alt="User Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <UserCircle className="h-10 w-10 text-muted-foreground/50" />
                    )}
                    <div 
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                      onClick={() => document.getElementById('user_avatar')?.click()}
                    >
                      <Upload className="h-5 w-5 text-white" />
                    </div>
                  </div>
                  <input
                    type="file"
                    id="user_avatar"
                    accept="image/*"
                    onChange={handleUserAvatarChange}
                    className="hidden"
                  />
                </div>
                <div className="text-center sm:text-left mt-2 sm:mt-1">
                  <h3 className="text-sm font-medium">Profile Picture</h3>
                  <p className="text-[11px] text-muted-foreground mt-1 mb-2">
                    Square, min 256x256px. Supported formats: PNG, JPG.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('user_avatar')?.click()}
                    className="rounded-full px-4 h-7 text-xs font-medium"
                  >
                    <Upload className="h-3 w-3 mr-1.5" />
                    Upload new
                  </Button>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-border/30">
                <div className="space-y-2">
                  <Label htmlFor="user_name" className="text-xs font-medium text-muted-foreground">Full Name</Label>
                  <Input
                    id="user_name"
                    value={userData.full_name}
                    onChange={(e) => setUserData({ ...userData, full_name: e.target.value })}
                    placeholder="e.g. John Doe"
                    className="h-10 transition-all bg-card hover:bg-muted/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user_email" className="text-xs font-medium text-muted-foreground">Account Email</Label>
                  <Input
                    id="user_email"
                    value={userData.email}
                    readOnly
                    disabled
                    className="h-10 bg-muted/50 cursor-not-allowed text-muted-foreground"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Core Identity Card */}
        <Card className="border-border/50 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
          <div className="h-24 bg-linear-to-r from-primary/10 via-primary/5 to-transparent border-b border-border/50"></div>
          <CardContent className="p-6 sm:p-8 pt-0 relative">
            {/* Logo Avatar - Pulled up into the header space */}
            <div className="flex flex-col items-center -mt-12 mb-8">
              <div className="relative group rounded-full p-1 bg-background shadow-sm">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border border-border/50 flex items-center justify-center bg-muted overflow-hidden relative transition-all group-hover:border-primary/50 group-hover:shadow-md">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo" className="w-full h-full object-contain bg-white" />
                  ) : (
                    <Building2 className="h-10 w-10 text-muted-foreground/50" />
                  )}
                  {/* Subtle overlay on hover */}
                  <div 
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                    onClick={() => document.getElementById('logo')?.click()}
                  >
                    <Upload className="h-6 w-6 text-white" />
                  </div>
                </div>
                <input
                  type="file"
                  id="logo"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="hidden"
                />
              </div>
              <div className="mt-3 text-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('logo')?.click()}
                  className="rounded-full px-4 h-8 text-xs font-medium"
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  {logoPreview ? 'Change Logo' : 'Upload Logo'}
                </Button>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Recommended size: 256x256px. PNG or JPG (max 2MB)
                </p>
              </div>
            </div>

            {/* Basic Info Fields */}
            <div className="space-y-5 max-w-xl mx-auto">
              <div className="space-y-2 text-center mb-6">
                <Label htmlFor="name" className="text-sm font-medium text-muted-foreground">
                  Organization Name
                </Label>
                <Input
                  id="name"
                  value={organizationData.name}
                  onChange={(e) => setOrganizationData({ ...organizationData, name: e.target.value })}
                  required
                  placeholder="e.g. Authentix Inc."
                  className="text-xl font-semibold h-12 text-center transition-all focus:bg-background bg-muted/30 border-transparent focus:border-border hover:bg-muted/50"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-5 pt-4 border-t border-border/50">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    Contact Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={organizationData.email}
                    onChange={(e) => setOrganizationData({ ...organizationData, email: e.target.value })}
                    placeholder="contact@organization.com"
                    className="h-10 transition-all bg-card hover:bg-muted/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    Phone Number
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={organizationData.phone}
                    onChange={(e) => setOrganizationData({ ...organizationData, phone: e.target.value })}
                    placeholder="+1 (555) 000-0000"
                    className="h-10 transition-all bg-card hover:bg-muted/20"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="website" className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                    <Globe className="h-3.5 w-3.5" />
                    Website URL
                  </Label>
                  <Input
                    id="website"
                    type="url"
                    value={organizationData.website}
                    onChange={(e) => setOrganizationData({ ...organizationData, website: e.target.value })}
                    placeholder="https://organization.com"
                    className="h-10 transition-all bg-card hover:bg-muted/20"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="industry" className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                    Industry
                  </Label>
                  <Select
                    value={organizationData.industry}
                    onValueChange={(value) => setOrganizationData({ ...organizationData, industry: value })}
                  >
                    <SelectTrigger className="h-10 transition-all bg-card hover:bg-muted/20">
                      <SelectValue placeholder="Select industry" />
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
                </div>
              </div>

              {/* Verification page message */}
              <div className="space-y-2">
                <Label htmlFor="verification_message" className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Verification Page Message
                </Label>
                <Textarea
                  id="verification_message"
                  value={organizationData.verification_message}
                  onChange={(e) => setOrganizationData({ ...organizationData, verification_message: e.target.value })}
                  placeholder="This is to certify that {{name}} has successfully completed the {{category}} program, demonstrating the knowledge, skills, and dedication required to earn this credential.&#10;&#10;We proudly recognize this achievement as a reflection of {{name}}'s commitment to professional growth and continuous learning."
                  className="resize-none transition-all bg-card hover:bg-muted/20 min-h-20"
                  maxLength={300}
                />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Appears on the public certificate verification page below the recipient&apos;s name.
                  Use <code className="font-mono bg-muted px-1 rounded text-[11px]">{"{{name}}"}</code> for the recipient name and{" "}
                  <code className="font-mono bg-muted px-1 rounded text-[11px]">{"{{category}}"}</code> for the category.
                  If left blank, an auto-generated achievement statement is shown.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Address & Tax Stacked/Centered Cards */}
        <div className="space-y-6">
          <Card className="border-border/50 shadow-sm bg-card/60 backdrop-blur-sm">
            <CardHeader className="pb-4 border-b border-border/30">
              <CardTitle className="text-lg font-medium flex items-center justify-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Organization Address
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 sm:p-8">
              <div className="space-y-5 max-w-xl mx-auto">
                <div className="space-y-2">
                  <Label htmlFor="address" className="text-xs font-medium text-muted-foreground">Street Address</Label>
                  <Input
                    id="address"
                    value={organizationData.address}
                    onChange={(e) => setOrganizationData({ ...organizationData, address: e.target.value })}
                    placeholder="123 Main St, Suite 400"
                    className="h-10 transition-all bg-card hover:bg-muted/20"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city" className="text-xs font-medium text-muted-foreground">City</Label>
                    <Input
                      id="city"
                      value={organizationData.city}
                      onChange={(e) => setOrganizationData({ ...organizationData, city: e.target.value })}
                      placeholder="San Francisco"
                      className="h-10 transition-all bg-card hover:bg-muted/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state" className="text-xs font-medium text-muted-foreground">State / Province</Label>
                    <Input
                      id="state"
                      value={organizationData.state}
                      onChange={(e) => setOrganizationData({ ...organizationData, state: e.target.value })}
                      placeholder="CA"
                      className="h-10 transition-all bg-card hover:bg-muted/20"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="country" className="text-xs font-medium text-muted-foreground">Country</Label>
                    <Input
                      id="country"
                      value={organizationData.country}
                      onChange={(e) => setOrganizationData({ ...organizationData, country: e.target.value })}
                      placeholder="United States"
                      className="h-10 transition-all bg-card hover:bg-muted/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postal_code" className="text-xs font-medium text-muted-foreground">Postal Code</Label>
                    <Input
                      id="postal_code"
                      value={organizationData.postal_code}
                      onChange={(e) => setOrganizationData({ ...organizationData, postal_code: e.target.value })}
                      placeholder="94105"
                      className="h-10 transition-all bg-card hover:bg-muted/20"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm bg-card/60 backdrop-blur-sm transition-all overflow-hidden relative">
            <CardHeader className="pb-4 border-b border-border/30 flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 relative z-10 w-full">
              <CardTitle className="text-lg font-medium flex items-center justify-center sm:justify-start gap-2 w-full sm:w-auto">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                Billing Address
              </CardTitle>
              <div className="flex flex-row items-center justify-center space-x-2 py-0.5 px-3 bg-muted/50 rounded-full w-max mx-auto sm:mx-0">
                <Switch 
                  id="same_as_org"
                  checked={billingSameAsOrg}
                  onCheckedChange={setBillingSameAsOrg}
                  className="scale-90"
                />
                <Label htmlFor="same_as_org" className="text-xs cursor-pointer font-medium hover:text-foreground text-muted-foreground transition-colors">
                  Same as Organization
                </Label>
              </div>
            </CardHeader>
            
            {/* Smooth height adjustment when not same as org */}
            <div className={`transition-all duration-300 ease-in-out origin-top ${billingSameAsOrg ? 'h-0 opacity-0 pointer-events-none' : 'h-auto opacity-100'}`}>
              <CardContent className="p-6 sm:p-8">
                <div className="space-y-5 max-w-xl mx-auto">
                  <div className="space-y-2">
                    <Label htmlFor="billing_address" className="text-xs font-medium text-muted-foreground">Billing Street Address</Label>
                    <Input
                      id="billing_address"
                      value={organizationData.billing_address}
                      onChange={(e) => setOrganizationData({ ...organizationData, billing_address: e.target.value })}
                      placeholder="e.g. 100 Financial Way"
                      className="h-10 transition-all bg-card hover:bg-muted/20"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="billing_city" className="text-xs font-medium text-muted-foreground">City</Label>
                      <Input
                        id="billing_city"
                        value={organizationData.billing_city}
                        onChange={(e) => setOrganizationData({ ...organizationData, billing_city: e.target.value })}
                        className="h-10 transition-all bg-card hover:bg-muted/20"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="billing_state" className="text-xs font-medium text-muted-foreground">State / Province</Label>
                      <Input
                        id="billing_state"
                        value={organizationData.billing_state}
                        onChange={(e) => setOrganizationData({ ...organizationData, billing_state: e.target.value })}
                        className="h-10 transition-all bg-card hover:bg-muted/20"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="billing_country" className="text-xs font-medium text-muted-foreground">Country</Label>
                      <Input
                        id="billing_country"
                        value={organizationData.billing_country}
                        onChange={(e) => setOrganizationData({ ...organizationData, billing_country: e.target.value })}
                        className="h-10 transition-all bg-card hover:bg-muted/20"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="billing_postal_code" className="text-xs font-medium text-muted-foreground">Postal Code</Label>
                      <Input
                        id="billing_postal_code"
                        value={organizationData.billing_postal_code}
                        onChange={(e) => setOrganizationData({ ...organizationData, billing_postal_code: e.target.value })}
                        className="h-10 transition-all bg-card hover:bg-muted/20"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </div>
          </Card>

          <Card className="border-border/50 shadow-sm bg-card/60 backdrop-blur-sm">
            <CardHeader className="pb-4 border-b border-border/30">
              <CardTitle className="text-lg font-medium flex items-center justify-center gap-2">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                Tax & Financial Details
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 sm:p-8">
              <div className="space-y-6 max-w-xl mx-auto text-center">
                <p className="text-sm text-muted-foreground/80 pb-2">
                  Financial details are optional and used securely for standardized invoicing across worldwide regions.
                </p>
                <div className="grid sm:grid-cols-2 gap-5 text-left">
                  <div className="space-y-2">
                    <Label htmlFor="gst_number" className="text-xs font-medium text-muted-foreground">Tax ID / VAT / GST Number</Label>
                    <Input
                      id="gst_number"
                      value={organizationData.gst_number}
                      onChange={(e) => setOrganizationData({ ...organizationData, gst_number: e.target.value })}
                      placeholder="e.g. 22AAAAA0000A1Z5"
                      className="h-10 transition-all bg-card hover:bg-muted/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cin_number" className="text-xs font-medium text-muted-foreground">Company Registration (CIN / EIN)</Label>
                    <Input
                      id="cin_number"
                      value={organizationData.cin_number}
                      onChange={(e) => setOrganizationData({ ...organizationData, cin_number: e.target.value })}
                      placeholder="e.g. U74999MH2020PTC123"
                      className="h-10 transition-all bg-card hover:bg-muted/20"
                    />
                  </div>
                </div>
                
                <div className="grid sm:grid-cols-2 gap-5 text-left pt-5 border-t border-border/30">
                  <div className="space-y-2">
                    <Label htmlFor="billing_email" className="text-xs font-medium text-muted-foreground">Billing Contact Email</Label>
                    <Input
                      id="billing_email"
                      type="email"
                      value={organizationData.billing_email}
                      onChange={(e) => setOrganizationData({ ...organizationData, billing_email: e.target.value })}
                      placeholder="finance@organization.com"
                      className="h-10 transition-all bg-card hover:bg-muted/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="billing_currency" className="text-xs font-medium text-muted-foreground">Default Currency</Label>
                    <Select
                      value={organizationData.billing_currency}
                      onValueChange={(value) => setOrganizationData({ ...organizationData, billing_currency: value })}
                    >
                      <SelectTrigger className="h-10 transition-all bg-card hover:bg-muted/20">
                        <SelectValue placeholder="Select standard currency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="EUR">EUR (€)</SelectItem>
                        <SelectItem value="GBP">GBP (£)</SelectItem>
                        <SelectItem value="INR">INR (₹)</SelectItem>
                        <SelectItem value="CAD">CAD ($)</SelectItem>
                        <SelectItem value="AUD">AUD ($)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

              </div>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="max-w-xl mx-auto bg-destructive/5 border border-destructive/20 text-destructive px-4 py-3 rounded-xl text-sm text-center font-medium animate-in fade-in slide-in-from-bottom-2">
            {error}
          </div>
        )}

        {/* Floating/Centered Save Button Area */}
        <div className="pt-6 flex justify-center">
          <Button 
            type="submit" 
            className="h-12 px-10 rounded-full shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5" 
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Saving Changes...
              </>
            ) : (
              <span className="text-base font-semibold">Save Profile Changes</span>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
