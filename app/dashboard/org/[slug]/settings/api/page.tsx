"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Key, Copy, RefreshCw, AlertTriangle, CheckCircle2, Eye, EyeOff, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  useOrganizationAPISettings,
  useRotateAPIKey,
  useBootstrapIdentity,
  useUpdateAPIEnabled,
} from "@/lib/hooks/queries/organizations";

export default function APISettingsPage() {
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const { settings, loading } = useOrganizationAPISettings();
  const rotateAPIKey = useRotateAPIKey();
  const bootstrapIdentity = useBootstrapIdentity();
  const updateAPIEnabled = useUpdateAPIEnabled();

  const apiEnabled = settings?.api_enabled ?? false;
  const apiKeyExists = settings?.api_key_exists ?? false;
  const applicationId = settings?.application_id ?? "";
  const apiKeyCreatedAt = settings?.api_key_created_at ?? null;
  const apiKeyLastRotatedAt = settings?.api_key_last_rotated_at ?? null;

  const handleGenerateKey = async () => {
    setError("");
    setNewApiKey(null);

    try {
      const result = apiKeyExists
        ? await rotateAPIKey.mutateAsync()
        : await bootstrapIdentity.mutateAsync();
      setNewApiKey(result.api_key || null);
      setShowKey(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.message || "Failed to generate API key");
    }
  };

  const handleToggleAPI = async () => {
    try {
      await updateAPIEnabled.mutateAsync(!apiEnabled);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.message || "Failed to update API status");
    }
  };

  const generating = rotateAPIKey.isPending || bootstrapIdentity.isPending;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your API authentication and access
          </p>
        </div>
        <Badge variant={apiEnabled ? "default" : "secondary"} className="gap-1.5">
          <Shield className="h-3 w-3" />
          {apiEnabled ? "API Enabled" : "API Disabled"}
        </Badge>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Application ID */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Application ID</CardTitle>
          <CardDescription>
            Use this unique identifier along with your API key for authentication
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={applicationId}
              readOnly
              className="font-mono bg-muted"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleCopy(applicationId)}
            >
              {copied ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Include this in the <code className="bg-muted px-1 py-0.5 rounded">X-Application-ID</code> header of your API requests
          </p>
        </CardContent>
      </Card>

      {/* API Key Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="h-4 w-4" />
            API Key
          </CardTitle>
          <CardDescription>
            Generate and manage your API authentication key
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {newApiKey ? (
            <Alert className="bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                <strong>Save this key now!</strong> You won't be able to see it again. Store it securely.
              </AlertDescription>
            </Alert>
          ) : null}

          {newApiKey && (
            <div className="space-y-2">
              <Label>Your New API Key</Label>
              <div className="flex gap-2">
                <Input
                  value={newApiKey}
                  type={showKey ? "text" : "password"}
                  readOnly
                  className="font-mono bg-muted"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleCopy(newApiKey)}
                >
                  {copied ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {apiKeyExists && !newApiKey && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-mono">••••••••••••••••</span>
                </div>
                <Badge variant="secondary" className="text-xs">Active</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Created</p>
                  <p className="font-medium">{formatDate(apiKeyCreatedAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Last Rotated</p>
                  <p className="font-medium">{formatDate(apiKeyLastRotatedAt)}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {apiKeyExists ? (
              <>
                <Button
                  onClick={handleGenerateKey}
                  variant="outline"
                  disabled={generating}
                  className="flex-1"
                >
                  {generating ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      Rotating Key...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Rotate Key
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleToggleAPI}
                  variant={apiEnabled ? "destructive" : "default"}
                  className="flex-1"
                >
                  {apiEnabled ? "Disable API" : "Enable API"}
                </Button>
              </>
            ) : (
              <Button
                onClick={handleGenerateKey}
                disabled={generating}
                className="w-full"
              >
                {generating ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Key className="h-4 w-4 mr-2" />
                    Generate API Key
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* API Documentation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">API Usage</CardTitle>
          <CardDescription>
            How to authenticate your API requests
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Authentication Headers</p>
            <div className="bg-muted p-3 rounded-lg font-mono text-xs space-y-1">
              <div>
                <span className="text-blue-600 dark:text-blue-400">X-Application-ID:</span> {applicationId || "your-application-id"}
              </div>
              <div>
                <span className="text-blue-600 dark:text-blue-400">Authorization:</span> Bearer your-api-key
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Example Request</p>
            <div className="bg-muted p-3 rounded-lg font-mono text-xs overflow-x-auto">
              <pre>{`curl -X POST https://api.authentix.com/v1/certificates \\
  -H "X-Application-ID: ${applicationId || "your-application-id"}" \\
  -H "Authorization: Bearer your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "template_id": "uuid",
    "recipient_name": "John Doe",
    "recipient_email": "john@example.com"
  }'`}</pre>
            </div>
          </div>

          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Never expose your API key in client-side code or public repositories.
              Always use it server-side and store it securely in environment variables.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
