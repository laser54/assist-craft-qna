import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, Loader2, ChevronDown, ChevronUp, Lightbulb, Database, Sparkles, Info } from "lucide-react";
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

interface SearchPipelineMeta {
  vector: {
    index: string | null;
    namespace: string;
    topK: number;
  };
  rerank: {
    model: string | null;
    applied: boolean;
    fallbackReason: string | null;
    attemptedModels: string[];
  };
}

const scoreToColor = (score: number): string => {
  if (score >= 0.8) return "bg-emerald-500/90";
  if (score >= 0.6) return "bg-lime-400/80";
  if (score >= 0.4) return "bg-amber-400/80";
  return "bg-rose-500/80";
};

const Index = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAllResults, setShowAllResults] = useState(false);
  const [pipelineMeta, setPipelineMeta] = useState<SearchPipelineMeta | null>(null);
  const { metrics } = useAuth();
  const { toast } = useToast();

  const searchMutation = useMutation({
    mutationFn: async (payload: { query: string }) => {
      const params = new URLSearchParams({ query: payload.query });
      const response = await apiFetch<{ matches: SearchMatch[]; pipeline?: SearchPipelineMeta }>(
        `/search?${params.toString()}`,
      );
      const meta = response.pipeline;
      if (meta) {
        setPipelineMeta({
          vector: meta.vector,
          rerank: {
            model: meta.rerank.model,
            applied: meta.rerank.applied,
            fallbackReason: meta.rerank.fallbackReason ?? null,
            attemptedModels: Array.isArray(meta.rerank.attemptedModels) ? meta.rerank.attemptedModels : [],
          },
        });
      } else {
        setPipelineMeta(null);
      }
      return response.matches ?? [];
    },
  });

  const handleSearch = async () => {
    if (!query.trim()) {
      toast({
        title: "Missing query",
        description: "Type a question before launching the search.",
        variant: "destructive",
      });
      return;
    }

    setPipelineMeta(null);
    setIsSearching(true);
    try {
      const searchResults = await searchMutation.mutateAsync({ query });
      setResults(searchResults);
      setShowAllResults(false);

      if (searchResults.length === 0) {
        toast({
          title: "No matches",
          description: "Nothing relevant surfaced. Refine the question and try again.",
        });
      }
    } catch (error) {
      toast({
        title: "Search failed",
        description: "Something went wrong while querying Pinecone. Retry in a moment.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const sortedResults = [...results].sort((a, b) => b.score - a.score);
  const topResult = sortedResults[0];
  const otherResults = sortedResults.slice(1);

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
              <p className="text-xs uppercase text-muted-foreground">Total Q&A</p>
              <p className="text-2xl font-semibold">{metrics?.totalQa ?? "—"}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="py-4">
              <p className="text-xs uppercase text-muted-foreground">Vectors in Pinecone</p>
              <p className="text-2xl font-semibold">{metrics?.pineconeVectors ?? "—"}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardContent className="py-4">
              <p className="text-xs uppercase text-muted-foreground">AI Pipeline</p>
              <p className="text-sm text-muted-foreground">
                {pipelineMeta
                  ? pipelineMeta.rerank.applied
                    ? `Reranked via ${pipelineMeta.rerank.model ?? "Pinecone Rerank"}`
                    : pipelineMeta.rerank.fallbackReason ?? "Vector order (fallback)"
                  : "Vector search ready; reranker will trigger automatically"}
              </p>
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
              <p>Ask the exact customer question — Pinecone’s reranker will surface the sharpest answer.</p>
            </div>
          </CardContent>
        </Card>

        {pipelineMeta && (
          <TooltipProvider>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary" className="gap-2 whitespace-nowrap">
                <Database className="w-3.5 h-3.5" />
                {pipelineMeta.vector.index ?? "Pinecone Index"} · ns:{" "}
                {pipelineMeta.vector.namespace}
              </Badge>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant={pipelineMeta.rerank.applied ? "default" : "outline"}
                    className="gap-2 whitespace-nowrap cursor-help"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {pipelineMeta.rerank.applied
                      ? `Reranked via ${pipelineMeta.rerank.model ?? "Pinecone Rerank"}`
                      : "Vector order (fallback)"}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1 text-sm">
                    <p>
                      Models tried: {pipelineMeta.rerank.attemptedModels.length > 0
                        ? pipelineMeta.rerank.attemptedModels.join(", ")
                        : "n/a"}
                    </p>
                    {pipelineMeta.rerank.applied ? null : (
                      <p className="text-muted-foreground">Rerank fell back to vector order.</p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
              {pipelineMeta.rerank.fallbackReason && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="gap-2 cursor-help">
                      <Info className="w-3.5 h-3.5" />
                      Details
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="space-y-1 text-sm max-w-xs">
                      <p>{pipelineMeta.rerank.fallbackReason}</p>
                      {pipelineMeta.rerank.attemptedModels.length > 0 ? (
                        <p className="text-muted-foreground">
                          Tried: {pipelineMeta.rerank.attemptedModels.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        )}

        {topResult && (
          <Card className="border-primary/50 shadow-xl bg-gradient-to-br from-card to-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-3 text-primary">
                  Top Result
                  {pipelineMeta?.rerank?.applied ? (
                    <Badge variant="secondary" className="gap-1">
                      <Sparkles className="w-3 h-3" />
                      Reranked
                    </Badge>
                  ) : null}
                </span>
                <span
                  className={`text-sm font-normal px-3 py-1 rounded-full text-primary-foreground ${scoreToColor(
                    topResult.score,
                  )}`}
                >
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
                <div className="flex items-center gap-3 text-left">
                  <span className="text-lg font-semibold">Other Similar Results ({otherResults.length})</span>
                  {pipelineMeta?.rerank?.applied ? (
                    <Badge variant="secondary" className="gap-1 hidden sm:inline-flex">
                      <Sparkles className="w-3 h-3" />
                      Reranked
                    </Badge>
                  ) : null}
                </div>
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
                      <span
                        className={`text-sm px-2 py-0.5 rounded-full text-primary-foreground ${scoreToColor(
                          result.score,
                        )}`}
                      >
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
