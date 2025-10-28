import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Navigation } from "@/components/Navigation";
import { Loader2, RefreshCcw } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";

interface BackendSettings {
  topResultsCount: number;
  similarityThreshold: number;
  model: string;
  rerankModel: string | null;
  csvBatchSize: number;
}

interface SettingsResponse {
  ok: boolean;
  settings: BackendSettings;
}

const fetchSettings = async (): Promise<SettingsResponse> => {
  return apiFetch<SettingsResponse>("/settings");
};

const saveSettings = async (payload: BackendSettings): Promise<SettingsResponse> => {
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
        title: "Настройки сохранены",
        description: "Конфигурация обновлена.",
      });
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Не удалось сохранить настройки";
      toast({
        title: "Ошибка",
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
      topResultsCount: form.topResultsCount,
      similarityThreshold: form.similarityThreshold,
      model: form.model,
      rerankModel: form.rerankModel,
      csvBatchSize: form.csvBatchSize,
    });
  };

  const handleReset = () => {
    if (data?.settings) {
      setForm(data.settings);
    }
  };

  const isDirty = useMemo(() => {
    if (!data?.settings || !form) return false;
    return JSON.stringify(data.settings) !== JSON.stringify(form);
  }, [data, form]);

  const isBusy = mutation.isPending || isLoading;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-8">
        <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Settings
        </h1>

        <Card className="border-primary/20 shadow-lg">
          <CardHeader className="space-y-2">
            <CardTitle className="text-primary">Search & Ingest</CardTitle>
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
                <p>Подтягиваю настройки...</p>
              </div>
            ) : (
              <form className="space-y-6" onSubmit={handleSubmit}>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="top-results">Number of Top Results</Label>
                    <Input
                      id="top-results"
                      type="number"
                      min={1}
                      max={50}
                      value={form.topResultsCount}
                      onChange={(e) => handleNumberChange("topResultsCount", e.target.value)}
                    />
                    <p className="text-sm text-muted-foreground">Сколько результатов запрашивать из Pinecone (1-50)</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="threshold">Similarity Threshold</Label>
                    <Input
                      id="threshold"
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={form.similarityThreshold}
                      onChange={(e) => handleNumberChange("similarityThreshold", e.target.value)}
                    />
                    <p className="text-sm text-muted-foreground">Минимальная косинусная схожесть для показа результата</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="csv-batch">CSV Batch Size</Label>
                    <Input
                      id="csv-batch"
                      type="number"
                      min={1}
                      max={500}
                      value={form.csvBatchSize}
                      onChange={(e) => handleNumberChange("csvBatchSize", e.target.value)}
                    />
                    <p className="text-sm text-muted-foreground">Сколько строк обрабатываем за один проход импорта</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Embedding Model</Label>
                    <Input value={form.model} readOnly className="bg-muted text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Берём из env / Pinecone, редактирование в UI отключено</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Rerank Model</Label>
                    <Input value={form.rerankModel ?? "—"} readOnly className="bg-muted text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Если нужно поменять модель — обнови переменные окружения</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      refetch();
                      toast({
                        title: "Обновляю",
                        description: "Тяну свежие настройки с сервера",
                      });
                    }}
                    disabled={isBusy}
                    className="flex items-center gap-2"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Sync
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleReset}
                    disabled={!isDirty || isBusy}
                  >
                    Reset
                  </Button>
                  <Button type="submit" disabled={!isDirty || mutation.isPending} className="gap-2">
                    {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save Settings
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/20 shadow-lg">
          <CardHeader>
            <CardTitle className="text-primary">About</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed">
              Pinecone конфиг подтягиваем из окружения сервера. Здесь можно управлять только тем, что хранится в SQLite
              (лимиты поиска и размер CSV batch). Модельные параметры меняются через env или сам Pinecone dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SettingsPage;