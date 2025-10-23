import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Navigation } from "@/components/Navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface Settings {
  topResultsCount: number;
  similarityThreshold: number;
  model: string;
}

const DEFAULT_SETTINGS: Settings = {
  topResultsCount: 5,
  similarityThreshold: 0.3,
  model: "mixedbread-ai/mxbai-embed-xsmall-v1",
};

const SettingsPage = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const { toast } = useToast();

  useEffect(() => {
    const stored = localStorage.getItem("faq-settings");
    if (stored) {
      setSettings(JSON.parse(stored));
    }
  }, []);

  const saveSettings = () => {
    localStorage.setItem("faq-settings", JSON.stringify(settings));
    toast({
      title: "Success",
      description: "Settings saved successfully",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-8">
        <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Settings
        </h1>

        <Card className="border-primary/20 shadow-lg">
          <CardHeader>
            <CardTitle className="text-primary">Search Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="top-results">Number of Top Results</Label>
              <Input
                id="top-results"
                type="number"
                min="1"
                max="20"
                value={settings.topResultsCount}
                onChange={(e) =>
                  setSettings({ ...settings, topResultsCount: parseInt(e.target.value) || 5 })
                }
              />
              <p className="text-sm text-muted-foreground">
                How many similar questions to display (1-20)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="threshold">Similarity Threshold</Label>
              <Input
                id="threshold"
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={settings.similarityThreshold}
                onChange={(e) =>
                  setSettings({ ...settings, similarityThreshold: parseFloat(e.target.value) || 0.3 })
                }
              />
              <p className="text-sm text-muted-foreground">
                Minimum similarity score to show results (0-1)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">Embedding Model</Label>
              <Select
                value={settings.model}
                onValueChange={(value) => setSettings({ ...settings, model: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mixedbread-ai/mxbai-embed-xsmall-v1">
                    MixedBread XSmall (Fast)
                  </SelectItem>
                  <SelectItem value="Xenova/all-MiniLM-L6-v2">
                    MiniLM L6 (Balanced)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Model used for generating embeddings
              </p>
            </div>

            <Button onClick={saveSettings}>Save Settings</Button>
          </CardContent>
        </Card>

        <Card className="border-primary/20 shadow-lg">
          <CardHeader>
            <CardTitle className="text-primary">About</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed">
              Smart FAQ System v1.0 - Vector-based question answering for support operators.
              Fast and efficient semantic search with configurable settings.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SettingsPage;