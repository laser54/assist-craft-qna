import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Edit, Plus, Upload, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Navigation } from "@/components/Navigation";
import { loadDemoData } from "@/lib/demoData";

export interface QAPair {
  id: string;
  question: string;
  answer: string;
}

const QAManagement = () => {
  const [qaPairs, setQaPairs] = useState<QAPair[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    loadDemoData();
    const stored = localStorage.getItem("faq-qa-pairs");
    if (stored) {
      setQaPairs(JSON.parse(stored));
    }
  }, []);

  const saveToStorage = (pairs: QAPair[]) => {
    localStorage.setItem("faq-qa-pairs", JSON.stringify(pairs));
    setQaPairs(pairs);
  };

  const addQAPair = () => {
    if (!newQuestion.trim() || !newAnswer.trim()) {
      toast({
        title: "Error",
        description: "Both question and answer are required",
        variant: "destructive",
      });
      return;
    }

    const newPair: QAPair = {
      id: Date.now().toString(),
      question: newQuestion,
      answer: newAnswer,
    };

    saveToStorage([...qaPairs, newPair]);
    setNewQuestion("");
    setNewAnswer("");
    toast({
      title: "Success",
      description: "Q&A pair added successfully",
    });
  };

  const updateQAPair = (id: string, question: string, answer: string) => {
    const updated = qaPairs.map((pair) =>
      pair.id === id ? { ...pair, question, answer } : pair
    );
    saveToStorage(updated);
    setEditingId(null);
    toast({
      title: "Success",
      description: "Q&A pair updated successfully",
    });
  };

  const deleteQAPair = (id: string) => {
    saveToStorage(qaPairs.filter((pair) => pair.id !== id));
    toast({
      title: "Success",
      description: "Q&A pair deleted successfully",
    });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const imported = JSON.parse(content) as QAPair[];
        
        if (!Array.isArray(imported)) {
          throw new Error("Invalid format");
        }

        const withIds = imported.map((pair, idx) => ({
          id: Date.now().toString() + idx,
          question: pair.question,
          answer: pair.answer,
        }));

        saveToStorage([...qaPairs, ...withIds]);
        toast({
          title: "Success",
          description: `Imported ${withIds.length} Q&A pairs`,
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Invalid file format. Expected JSON array.",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const exportQAPairs = () => {
    const dataStr = JSON.stringify(qaPairs, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "faq-qa-pairs.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Q&A Management
          </h1>
          <div className="flex gap-2">
            <Button onClick={exportQAPairs} variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Export
            </Button>
            <Button asChild variant="outline">
              <label className="cursor-pointer flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Import
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
            </Button>
          </div>
        </div>

        <Card className="border-primary/20 shadow-lg">
          <CardHeader>
            <CardTitle className="text-primary">Add New Q&A Pair</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="new-question">Question</Label>
              <Input
                id="new-question"
                placeholder="Enter the question..."
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="new-answer">Answer</Label>
              <Textarea
                id="new-answer"
                placeholder="Enter the answer..."
                value={newAnswer}
                onChange={(e) => setNewAnswer(e.target.value)}
                rows={4}
                className="mt-1.5"
              />
            </div>
            <Button onClick={addQAPair} className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Add Q&A Pair
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">
            Existing Q&A Pairs 
            <span className="ml-2 text-primary">({qaPairs.length})</span>
          </h2>
          {qaPairs.map((pair) => (
            <Card key={pair.id} className="shadow-md hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                {editingId === pair.id ? (
                  <div className="space-y-4">
                    <div>
                      <Label>Question</Label>
                      <Input
                        defaultValue={pair.question}
                        id={`edit-q-${pair.id}`}
                      />
                    </div>
                    <div>
                      <Label>Answer</Label>
                      <Textarea
                        defaultValue={pair.answer}
                        id={`edit-a-${pair.id}`}
                        rows={4}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          const q = (document.getElementById(`edit-q-${pair.id}`) as HTMLInputElement).value;
                          const a = (document.getElementById(`edit-a-${pair.id}`) as HTMLTextAreaElement).value;
                          updateQAPair(pair.id, q, a);
                        }}
                      >
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-semibold text-lg">{pair.question}</p>
                        <p className="text-muted-foreground mt-2">{pair.answer}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingId(pair.id)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteQAPair(pair.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default QAManagement;