import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Settings, FileText, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useVectorSearch } from "@/hooks/useVectorSearch";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAllResults, setShowAllResults] = useState(false);
  const navigate = useNavigate();
  const { search, isReady } = useVectorSearch();
  const { toast } = useToast();

  const handleSearch = async () => {
    if (!query.trim()) {
      toast({
        title: "Error",
        description: "Please enter a query",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    try {
      const searchResults = await search(query);
      setResults(searchResults);
      setShowAllResults(false);
      
      if (searchResults.length === 0) {
        toast({
          title: "No results",
          description: "No similar questions found. Try rephrasing your query.",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to search. Please try again.",
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
      <nav className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Smart FAQ</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/qa-management")}>
              <FileText className="w-4 h-4 mr-2" />
              Q&A Management
            </Button>
            <Button variant="outline" onClick={() => navigate("/settings")}>
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto p-8 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-4xl font-bold">Support Operator Assistant</h2>
          <p className="text-muted-foreground">
            Enter a customer query to find the most relevant answer
          </p>
        </div>

        {!isReady && (
          <Card>
            <CardContent className="pt-6 flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Loading AI model...</span>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-2">
              <Input
                placeholder="Enter customer query here..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                disabled={!isReady}
              />
              <Button onClick={handleSearch} disabled={!isReady || isSearching}>
                {isSearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {topResult && (
          <Card className="border-primary">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Top Result</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {(topResult.score * 100).toFixed(1)}% match
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="font-semibold text-lg mb-2">Question:</p>
                <p className="text-muted-foreground">{topResult.question}</p>
              </div>
              <div>
                <p className="font-semibold text-lg mb-2">Answer:</p>
                <p className="whitespace-pre-wrap">{topResult.answer}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {otherResults.length > 0 && (
          <Card>
            <CardHeader>
              <Button
                variant="ghost"
                className="w-full flex justify-between items-center"
                onClick={() => setShowAllResults(!showAllResults)}
              >
                <span>Other Similar Results ({otherResults.length})</span>
                {showAllResults ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </Button>
            </CardHeader>
            {showAllResults && (
              <CardContent className="space-y-4">
                {otherResults.map((result, idx) => (
                  <div key={result.id} className="border-t pt-4 first:border-t-0 first:pt-0">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-semibold">#{idx + 2}</p>
                      <span className="text-sm text-muted-foreground">
                        {(result.score * 100).toFixed(1)}% match
                      </span>
                    </div>
                    <p className="font-medium mb-1">{result.question}</p>
                    <p className="text-sm text-muted-foreground">{result.answer}</p>
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
