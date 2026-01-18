import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, Loader2, ChevronDown, ChevronUp, Lightbulb, Database, Sparkles, Info, Brain, ShieldCheck, Zap, MessageSquare, Network, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Navigation } from "@/components/Navigation";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

interface SearchMatch {
  id: string;
  score: number;
  vectorScore: number;
  rerankScore?: number | null;
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
    usage?: {
      lastCallUnits: number;
      unitsUsed: number;
      limit: number | null;
      remaining: number | null;
      date: string;
    };
  };
}

const scoreToColor = (score: number): string => {
  if (score >= 0.8) return "bg-emerald-500/90";
  if (score >= 0.6) return "bg-lime-400/80";
  if (score >= 0.4) return "bg-amber-400/80";
  return "bg-rose-500/80";
};

const LOW_SCORE_THRESHOLD = 0.2;

const isLowScore = (score: number): boolean => score < LOW_SCORE_THRESHOLD;

const Index = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [vectorResults, setVectorResults] = useState<SearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAllResults, setShowAllResults] = useState(false);
  const [showVectorResults, setShowVectorResults] = useState(false);
  const [pipelineMeta, setPipelineMeta] = useState<SearchPipelineMeta | null>(null);
  const [rerankerRejected, setRerankerRejected] = useState(false);
  const [topRerankScore, setTopRerankScore] = useState<number | undefined>(undefined);
  const [hasSearched, setHasSearched] = useState(false);
  const [expandedLowScoreIds, setExpandedLowScoreIds] = useState<Set<string>>(new Set());
  const { metrics } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const searchMutation = useMutation({
    mutationFn: async (payload: { query: string }) => {
      const params = new URLSearchParams({ query: payload.query });
      const response = await apiFetch<{
        matches: SearchMatch[];
        vectorMatches?: SearchMatch[];
        rerankerRejected?: boolean;
        topRerankScore?: number;
        pipeline?: SearchPipelineMeta;
      }>(`/search?${params.toString()}`);
      const meta = response.pipeline;
      if (meta) {
        setPipelineMeta({
          vector: meta.vector,
          rerank: {
            model: meta.rerank.model,
            applied: meta.rerank.applied,
            fallbackReason: meta.rerank.fallbackReason ?? null,
            attemptedModels: Array.isArray(meta.rerank.attemptedModels) ? meta.rerank.attemptedModels : [],
            usage: meta.rerank.usage
              ? {
                lastCallUnits: meta.rerank.usage.lastCallUnits,
                unitsUsed: meta.rerank.usage.unitsUsed,
                limit: meta.rerank.usage.limit,
                remaining: meta.rerank.usage.remaining,
                date: meta.rerank.usage.date,
              }
              : undefined,
          },
        });
      } else {
        setPipelineMeta(null);
      }
      setRerankerRejected(response.rerankerRejected ?? false);
      setTopRerankScore(response.topRerankScore);
      if (response.vectorMatches) {
        setVectorResults(response.vectorMatches);
      } else {
        setVectorResults([]);
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
    setShowVectorResults(false);
    try {
      const searchResults = await searchMutation.mutateAsync({ query });
      setResults(searchResults);
      setShowAllResults(false);
      setExpandedLowScoreIds(new Set());
      setHasSearched(true);

      if (searchResults.length === 0 && !rerankerRejected) {
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
  const topResultLowScore = Boolean(topResult && isLowScore(topResult.score));
  const noResults = hasSearched && !isSearching && sortedResults.length === 0 && !rerankerRejected;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="max-w-5xl mx-auto p-4 sm:p-8 space-y-8">
        <div className="text-center space-y-3 pt-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-primary leading-tight">
            Support Operator Assistant
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Enter a customer query to find the most relevant answer
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="shadow-sm border-primary/20 hover:shadow-md transition-shadow">
            <CardContent className="py-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-xs uppercase text-muted-foreground font-medium leading-tight">Total Q&A</p>
                  <p className="text-2xl font-semibold mt-1 leading-tight">{metrics?.totalQa ?? "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-accent/30 hover:shadow-md transition-shadow hover:border-accent/50">
            <CardContent className="py-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-lg bg-accent/15 flex items-center justify-center ring-1 ring-accent/20">
                  <Network className="h-5 w-5 text-accent" />
                </div>
                <div className="flex-1">
                  <p className="text-xs uppercase text-muted-foreground font-medium leading-tight">Vectors in Pinecone</p>
                  <p className="text-2xl font-semibold mt-1 leading-tight">{metrics?.pineconeVectors ?? "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-primary/20 hover:shadow-md transition-shadow">
            <CardContent className="py-5">
              <div className="flex items-center gap-3 mb-2">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${pipelineMeta?.rerank?.applied ? 'bg-accent/15 ring-1 ring-accent/20' : 'bg-primary/15'}`}>
                  {pipelineMeta?.rerank?.applied ? (
                    <Sparkles className="h-5 w-5 text-accent" />
                  ) : (
                    <Database className="h-5 w-5 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs uppercase text-muted-foreground font-medium leading-tight mb-1">AI Pipeline</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {pipelineMeta ? (
                      pipelineMeta.rerank.applied ? (
                        <>
                          <Badge className="text-xs px-2 py-0.5 bg-accent text-accent-foreground border-accent/20">
                            <Sparkles className="h-3 w-3 mr-1" />
                            Reranked
                          </Badge>
                          <span className="text-xs text-muted-foreground truncate">
                            {pipelineMeta.rerank.model ?? "Pinecone"}
                          </span>
                        </>
                      ) : (
                        <Badge variant="outline" className="text-xs px-2 py-0.5">
                          <Database className="h-3 w-3 mr-1" />
                          Vector
                        </Badge>
                      )
                    ) : (
                      <Badge variant="secondary" className="text-xs px-2 py-0.5">
                        <Zap className="h-3 w-3 mr-1" />
                        Ready
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-primary/20 shadow-lg bg-gradient-to-br from-card to-primary/5 hover:border-accent/30 transition-colors">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Input
                  placeholder="Try: How do I reset my password?"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  disabled={isSearching}
                  className="h-12 text-base focus-visible:ring-accent/20 pr-10"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setResults([]);
                      setHasSearched(false);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <Button
                onClick={handleSearch}
                disabled={isSearching || !query.trim()}
                className="h-12 px-6 w-full sm:w-auto"
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
              <Lightbulb className="w-4 h-4 mt-0.5 flex-shrink-0 text-accent drop-shadow-sm" />
              <p>Describe the customer intent in plain English — the semantic stack tracks meaning, not just matching words.</p>
            </div>
            {rerankerRejected && (
              <div className="mt-4 space-y-3 rounded-md border border-amber-400/60 bg-amber-500/10 p-4 text-sm text-left">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <Brain className="w-4 h-4" />
                  <span className="font-semibold">Reranker found no relevant answer</span>
                </div>
                <p className="text-muted-foreground">
                  The semantic reranker analyzed your query and determined that none of the found documents are relevant enough to answer your question.
                  {topRerankScore !== undefined && (
                    <span className="block mt-1">Top rerank score: {(topRerankScore * 100).toFixed(2)}% (threshold: 1%)</span>
                  )}
                </p>
                {vectorResults.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-muted-foreground">
                      However, vector search found {vectorResults.length} potentially related result{vectorResults.length !== 1 ? "s" : ""}. You can review them below.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setShowVectorResults(!showVectorResults)}
                      className="w-full sm:w-auto"
                    >
                      {showVectorResults ? (
                        <>
                          <ChevronUp className="w-4 h-4 mr-2" />
                          Hide vector search results
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4 mr-2" />
                          Show vector search results ({vectorResults.length})
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
            {noResults && !rerankerRejected && (
              <div className="mt-4 space-y-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-left">
                <div className="flex items-center gap-2 text-destructive">
                  <Info className="w-4 h-4" />
                  <span className="font-semibold">Nothing matched this question yet.</span>
                </div>
                <p className="text-muted-foreground">
                  Rephrase the wording with more context, or save this customer question so the next search succeeds.
                </p>
                <Button variant="outline" onClick={() => navigate("/qa-management")} className="w-full sm:w-auto">
                  Add this Q&A to the knowledge base
                </Button>
              </div>
            )}
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

        {topResult && !noResults && (
          <Card className="border-primary/50 shadow-xl bg-gradient-to-br from-card to-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-3 text-primary">
                  Top Result
                  {pipelineMeta?.rerank?.applied ? (
                    <Badge className="gap-1 bg-accent text-accent-foreground border-accent/20">
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
              <div className="p-4 rounded-lg bg-primary/5 border-l-4 border-accent">
                <p className="font-semibold text-sm text-primary mb-2">Answer:</p>
                <p className="whitespace-pre-wrap leading-relaxed">{topResult.answer}</p>
              </div>
              {topResultLowScore && (
                <div className="p-4 rounded-lg border border-amber-400/60 bg-amber-500/10 text-sm space-y-2">
                  <p className="font-semibold text-amber-700">Low confidence match</p>
                  <p className="text-amber-800/90">
                    This answer scored {(topResult.score * 100).toFixed(1)}%. Refine the query or add
                    a dedicated Q&A entry before trusting it.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {otherResults.length > 0 && !noResults && (
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
                    {isLowScore(result.score) ? (
                      expandedLowScoreIds.has(result.id) ? (
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground leading-relaxed">{result.answer}</p>
                          <button
                            type="button"
                            onClick={() => {
                              const newSet = new Set(expandedLowScoreIds);
                              newSet.delete(result.id);
                              setExpandedLowScoreIds(newSet);
                            }}
                            className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 transition-colors"
                          >
                            <ChevronUp className="w-3 h-3" />
                            Hide answer
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs text-amber-700/90">
                            Match confidence {(result.score * 100).toFixed(1)}%. Answer hidden due to low confidence.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              const newSet = new Set(expandedLowScoreIds);
                              newSet.add(result.id);
                              setExpandedLowScoreIds(newSet);
                            }}
                            className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 transition-colors"
                          >
                            <ChevronDown className="w-3 h-3" />
                            Show answer anyway
                          </button>
                        </div>
                      )
                    ) : (
                      <p className="text-sm text-muted-foreground leading-relaxed">{result.answer}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        )}

        {showVectorResults && rerankerRejected && vectorResults.length > 0 && (
          <Card className="shadow-lg border-amber-400/30">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-amber-600" />
                <span className="text-lg font-semibold">Vector Search Results ({vectorResults.length})</span>
                <Badge variant="outline" className="gap-1">
                  <Database className="w-3 h-3" />
                  Vector order
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                These results were found by vector similarity search but were rejected by the reranker as not relevant enough.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {vectorResults.map((result, idx) => (
                <div key={result.id} className="p-4 border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-semibold text-primary">#{idx + 1}</span>
                    <span
                      className={`text-sm px-2 py-0.5 rounded-full text-primary-foreground ${scoreToColor(
                        result.vectorScore,
                      )}`}
                    >
                      {(result.vectorScore * 100).toFixed(1)}% vector match
                    </span>
                  </div>
                  <p className="font-medium mb-2">{result.question}</p>
                  {isLowScore(result.vectorScore) ? (
                    expandedLowScoreIds.has(result.id) ? (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground leading-relaxed">{result.answer}</p>
                        <p className="text-xs text-amber-700/90">
                          Note: The reranker determined this is not relevant enough to answer your query.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            const newSet = new Set(expandedLowScoreIds);
                            newSet.delete(result.id);
                            setExpandedLowScoreIds(newSet);
                          }}
                          className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 transition-colors"
                        >
                          <ChevronUp className="w-3 h-3" />
                          Hide answer
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-amber-700/90">
                          Vector match confidence {(result.vectorScore * 100).toFixed(1)}%. Answer hidden due to low confidence.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            const newSet = new Set(expandedLowScoreIds);
                            newSet.add(result.id);
                            setExpandedLowScoreIds(newSet);
                          }}
                          className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 transition-colors"
                        >
                          <ChevronDown className="w-3 h-3" />
                          Show answer anyway
                        </button>
                      </div>
                    )
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground leading-relaxed">{result.answer}</p>
                      <p className="text-xs text-amber-700/90">
                        Note: The reranker determined this is not relevant enough to answer your query.
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card className="border-primary/40 shadow-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl text-primary">Why our semantic search beats keyword filters</CardTitle>
            <p className="text-muted-foreground text-sm">
              We run Pinecone plus transformer rerankers to understand intent, not just literal word overlap.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="flex gap-3">
                <div className="h-10 w-10 flex items-center justify-center rounded-full bg-primary/15 text-primary font-semibold">
                  1
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-semibold">
                    <Brain className="w-4 h-4 text-primary" />
                    Neural embeddings instead of raw keywords
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Pinecone Inference converts the query into a rich vector, capturing synonyms and customer intent even when wording differs.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="h-10 w-10 flex items-center justify-center rounded-full bg-primary/15 text-primary font-semibold">
                  2
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-semibold">
                    <Database className="w-4 h-4 text-primary" />
                    Pinecone vector store
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    We compare the query embedding with thousands of answers in milliseconds, keeping relevance high even without literal matches.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="h-10 w-10 flex items-center justify-center rounded-full bg-primary/15 text-primary font-semibold">
                  3
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-semibold">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Transformer reranker checks the nuance
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    A cross-encoder rereads the top answers and boosts the most complete response, reducing noisy hits.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="h-10 w-10 flex items-center justify-center rounded-full bg-primary/15 text-primary font-semibold">
                  4
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-semibold">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    Quality gates and fallbacks at every step
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Metrics reveal which index and model fired. If rerank is down, we safely fall back to the vector order.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Semantic examples:</p>
              <div className="space-y-2 rounded-md border border-dashed border-primary/30 p-3 bg-background/70">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="uppercase">You ask</Badge>
                  <span className="font-semibold text-foreground">“Customer cannot access invoices after plan downgrade”</span>
                </div>
                <div className="pl-6 text-xs sm:text-sm flex flex-wrap items-center gap-2">
                  <Badge variant="outline">We surface</Badge>
                  <span>“Invoice history permissions & downgrades”</span>
                </div>
              </div>
              <div className="space-y-2 rounded-md border border-dashed border-primary/30 p-3 bg-background/70">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="uppercase">You ask</Badge>
                  <span className="font-semibold text-foreground">“Shopify orders stopped syncing after API key rotation”</span>
                </div>
                <div className="pl-6 text-xs sm:text-sm flex flex-wrap items-center gap-2">
                  <Badge variant="outline">We surface</Badge>
                  <span>“Restart the Shopify connector after credential updates”</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
