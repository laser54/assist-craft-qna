import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Navigation } from "@/components/Navigation";
import { Loader2, Sparkles, Brain } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";

interface BackendSettings {
  topResultsCount: number;
  similarityThreshold: number;
  model: string;
  rerankModel: string | null;
  rerankEnabled: boolean;
  csvBatchSize: number;
}

interface SettingsResponse {
  ok: boolean;
  settings: BackendSettings;
}

const fetchSettings = async (): Promise<SettingsResponse> => {
  return apiFetch<SettingsResponse>("/settings");
};

const saveSettings = async (payload: Partial<BackendSettings>): Promise<SettingsResponse> => {
  return apiFetch<SettingsResponse>("/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
};

const SettingsPage = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: fetchSettings,
  });

  const [form, setForm] = useState<BackendSettings | null>(null);

  useEffect(() => {
    if (data?.settings) {
      setForm(data.settings);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: (response) => {
      setForm(response.settings);
      queryClient.setQueryData(["settings"], response);
      toast({
        title: "Settings saved",
        description: "Configuration updated successfully.",
      });
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Failed to persist settings";
      toast({
        title: "Request failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  const handleNumberChange = <K extends keyof BackendSettings>(key: K, value: string) => {
    const numeric = Number(value);
    setForm((prev) => (prev ? { ...prev, [key]: Number.isNaN(numeric) ? 0 : numeric } : prev));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    mutation.mutate({
      rerankEnabled: form.rerankEnabled,
    });
  };

  const handleReset = () => {
    if (data?.settings) {
      setForm(data.settings);
    }
  };

  const isDirty = useMemo(() => {
    if (!data?.settings || !form) return false;
    return data.settings.rerankEnabled !== form.rerankEnabled;
  }, [data, form]);

  const isBusy = mutation.isPending || isLoading;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent leading-tight">
            Settings
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
            Configure AI models and search behavior
          </p>
        </div>

        <Card className="border-primary/20 shadow-lg">
          <CardHeader className="space-y-2">
            <CardTitle className="text-primary leading-tight">AI Configuration</CardTitle>
            {error && (
              <div className="text-sm text-destructive">
                {(error as Error).message}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {!form ? (
              <div className="flex flex-col items-center justify-center space-y-3 py-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p>Fetching settings...</p>
              </div>
            ) : (
              <form className="space-y-6" onSubmit={handleSubmit}>
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 pb-2 border-b">
                      <Brain className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-semibold">AI Models</h3>
                    </div>
                    
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="embedding-model" className="text-sm font-medium">Embedding Model</Label>
                        <div className="relative">
                          <Input 
                            id="embedding-model" 
                            value={form.model} 
                            readOnly 
                            className="bg-muted/50 text-muted-foreground pr-10" 
                          />
                          <Brain className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        </div>
                        <p className="text-xs text-muted-foreground">Configured via environment variables</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="rerank-model" className="text-sm font-medium">Rerank Model</Label>
                        <div className="relative">
                          <Input 
                            id="rerank-model" 
                            value={form.rerankModel ?? "Not configured"} 
                            readOnly 
                            className="bg-muted/50 text-muted-foreground pr-10" 
                          />
                          <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        </div>
                        <p className="text-xs text-muted-foreground">Configured via environment variables</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t">
                    <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                      <div className="space-y-0.5 flex-1">
                        <Label htmlFor="rerank-enabled" className="text-base font-medium cursor-pointer">
                          Enable Reranker
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Use semantic reranking to improve search result quality
                        </p>
                      </div>
                      <Switch
                        id="rerank-enabled"
                        checked={form.rerankEnabled}
                        onCheckedChange={(checked) => setForm((prev) => prev ? { ...prev, rerankEnabled: checked } : null)}
                        disabled={isBusy}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 justify-end pt-4 border-t">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleReset}
                    disabled={!isDirty || isBusy}
                  >
                    Reset
                  </Button>
                  <Button type="submit" disabled={!isDirty || mutation.isPending} className="gap-2 min-w-[120px]">
                    {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save Changes
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default SettingsPage;