import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Navigation } from "@/components/Navigation";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

interface SearchMatch {
  id: string;
  score: number;
  question: string;
  answer: string;
  language: string;
}

const Index = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAllResults, setShowAllResults] = useState(false);
  const { metrics } = useAuth();
  const { toast } = useToast();

  const searchMutation = useMutation({
    mutationFn: async (payload: { query: string }) => {
      const params = new URLSearchParams({ query: payload.query });
      const response = await apiFetch<{ matches: SearchMatch[] }>(`/search?${params.toString()}`);
      return response.matches ?? [];
    },
  });

  const handleSearch = async () => {
    if (!query.trim()) {
      toast({
        title: "Ошибка",
        description: "Введи текст запроса",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    try {
      const searchResults = await searchMutation.mutateAsync({ query });
      setResults(searchResults);
      setShowAllResults(false);

      if (searchResults.length === 0) {
        toast({
          title: "Пусто",
          description: "Ничего похожего не нашли, попробуй иначе",
        });
      }
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Поиск не отработал. Попробуй снова чуть позже.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const topResult = results[0];
  const otherResults = results.slice(1);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="max-w-5xl mx-auto p-4 sm:p-8 space-y-8">
        <div className="text-center space-y-3 pt-8">
          <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Support Operator Assistant
          </h1>
          <p className="text-muted-foreground text-lg">
            Enter a customer query to find the most relevant answer
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="shadow-sm">
            <CardContent className="py-4">
              <p className="text-xs uppercase text-muted-foreground">Всего QA</p>
              <p className="text-2xl font-semibold">{metrics?.totalQa ?? "—"}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="py-4">
              <p className="text-xs uppercase text-muted-foreground">Vectors в Pinecone</p>
              <p className="text-2xl font-semibold">{metrics?.pineconeVectors ?? "—"}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="py-4">
              <p className="text-xs uppercase text-muted-foreground">Последний статус</p>
              <p className="text-sm text-muted-foreground">API готов к запросам</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-primary/20 shadow-lg bg-gradient-to-br from-card to-primary/5">
          <CardContent className="pt-6">
            <div className="flex gap-2">
              <Input
                placeholder="Try: How do I reset my password?"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                disabled={isSearching}
                className="h-12 text-base"
              />
              <Button
                onClick={handleSearch}
                disabled={isSearching}
                className="h-12 px-6"
              >
                {isSearching ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Search className="w-5 h-5 mr-2" />
                    Search
                  </>
                )}
              </Button>
            </div>
            <div className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
              <Lightbulb className="w-4 h-4 mt-0.5 flex-shrink-0 text-accent" />
              <p>Попробуй конкретные вопросы клиента — Pinecone отдаст наиболее релевантные ответы.</p>
            </div>
          </CardContent>
        </Card>

        {topResult && (
          <Card className="border-primary/50 shadow-xl bg-gradient-to-br from-card to-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="text-primary">Top Result</span>
                <span className="text-sm font-normal px-3 py-1 rounded-full bg-primary/10 text-primary">
                  {(topResult.score * 100).toFixed(1)}% match
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="font-semibold text-sm text-muted-foreground mb-2">Question:</p>
                <p className="text-lg">{topResult.question}</p>
              </div>
              <div className="p-4 rounded-lg bg-primary/5">
                <p className="font-semibold text-sm text-primary mb-2">Answer:</p>
                <p className="whitespace-pre-wrap leading-relaxed">{topResult.answer}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {otherResults.length > 0 && (
          <Card className="shadow-lg">
            <CardHeader className="pb-3">
              <Button
                variant="ghost"
                className="w-full flex justify-between items-center p-0 h-auto hover:bg-transparent"
                onClick={() => setShowAllResults(!showAllResults)}
              >
                <span className="text-lg font-semibold">Other Similar Results ({otherResults.length})</span>
                {showAllResults ? (
                  <ChevronUp className="w-5 h-5" />
                ) : (
                  <ChevronDown className="w-5 h-5" />
                )}
              </Button>
            </CardHeader>
            {showAllResults && (
              <CardContent className="space-y-3">
                {otherResults.map((result, idx) => (
                  <div key={result.id} className="p-4 border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-semibold text-primary">#{idx + 2}</span>
                      <span className="text-sm px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {(result.score * 100).toFixed(1)}% match
                      </span>
                    </div>
                    <p className="font-medium mb-2">{result.question}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{result.answer}</p>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        )}
      </div>
    </div>
  );
};

export default Index;
