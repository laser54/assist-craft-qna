import { useMemo, useState, useEffect } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Upload, Download, Edit, Trash2, RefreshCw, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Navigation } from "@/components/Navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

interface QaItem {
  id: string;
  question: string;
  answer: string;
  language: string;
  pinecone_id: string | null;
  embedding_status: string;
  created_at: string;
  updated_at: string;
}

interface QaListResponse {
  total: number;
  page: number;
  pageSize: number;
  items: QaItem[];
}

const PAGE_SIZE = 10;

const buildQueryString = (page: number, search: string) => {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: PAGE_SIZE.toString(),
  });
  if (search.trim()) {
    params.set("search", search.trim());
  }
  return params.toString();
};

const fetchQaList = async (page: number, search: string): Promise<QaListResponse> => {
  const query = buildQueryString(page, search);
  return apiFetch<QaListResponse>(`/qa?${query}`);
};

const normaliseLanguage = (value: string) => value.trim() || "ru";

const QAManagement = () => {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [newLanguage, setNewLanguage] = useState("ru");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [editLanguage, setEditLanguage] = useState("ru");
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const { toast } = useToast();
  const { refresh } = useAuth();
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isFetching,
    error: listError,
  } = useQuery({
    queryKey: ["qa", page, search],
    queryFn: () => fetchQaList(page, search),
    keepPreviousData: true,
  });

  useEffect(() => {
    if (!data) return;
    const maxPage = Math.max(1, Math.ceil(data.total / data.pageSize));
    if (page > maxPage) {
      setPage(maxPage);
    }
    if (data.total === 0 && page !== 1) {
      setPage(1);
    }
  }, [data, page]);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / data.pageSize));
  }, [data]);

  const invalidateQa = () => {
    queryClient.invalidateQueries({ queryKey: ["qa"] });
  };

  const handleMutationError = (err: unknown, fallback: string) => {
    const message = err instanceof ApiError ? err.message : fallback;
    toast({
      title: "Ошибка",
      description: message,
      variant: "destructive",
    });
  };

  const createMutation = useMutation({
    mutationFn: (payload: { question: string; answer: string; language?: string }) =>
      apiFetch<QaItem>("/qa", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      setNewQuestion("");
      setNewAnswer("");
      setPage(1);
      invalidateQa();
      await refresh().catch(() => undefined);
      toast({
        title: "Готово",
        description: "Новая пара зафиксирована",
      });
    },
    onError: (err) => handleMutationError(err, "Не удалось добавить Q&A"),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; question: string; answer: string; language?: string }) =>
      apiFetch<QaItem>(`/qa/${payload.id}`, {
        method: "PUT",
        body: JSON.stringify({
          question: payload.question,
          answer: payload.answer,
          language: payload.language,
        }),
      }),
    onSuccess: async () => {
      setEditingId(null);
      invalidateQa();
      await refresh().catch(() => undefined);
      toast({
        title: "Обновлено",
        description: "Пара сохранена",
      });
    },
    onError: (err) => handleMutationError(err, "Не удалось обновить запись"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/qa/${id}`, {
        method: "DELETE",
        parseJson: false,
      }),
    onSuccess: async () => {
      invalidateQa();
      await refresh().catch(() => undefined);
      toast({
        title: "Удалено",
        description: "Пара удалена",
      });
    },
    onError: (err) => handleMutationError(err, "Удалить не получилось"),
  });

  const isProcessing =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending || isImporting || isExporting;

  const handleCreate = () => {
    if (!newQuestion.trim() || !newAnswer.trim()) {
      toast({
        title: "Нужно заполнить",
        description: "Введи вопрос и ответ",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate({
      question: newQuestion.trim(),
      answer: newAnswer.trim(),
      language: normaliseLanguage(newLanguage),
    });
  };

  const startEditing = (item: QaItem) => {
    setEditingId(item.id);
    setEditQuestion(item.question);
    setEditAnswer(item.answer);
    setEditLanguage(item.language ?? "ru");
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditQuestion("");
    setEditAnswer("");
    setEditLanguage("ru");
  };

  const submitEdit = () => {
    if (!editingId) return;
    if (!editQuestion.trim() || !editAnswer.trim()) {
      toast({
        title: "Нужно заполнить",
        description: "Вопрос и ответ не могут быть пустыми",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate({
      id: editingId,
      question: editQuestion.trim(),
      answer: editAnswer.trim(),
      language: normaliseLanguage(editLanguage),
    });
  };

  const handleDelete = (id: string) => {
    const confirmed = window.confirm("Точно удалить эту пару?");
    if (!confirmed) return;
    deleteMutation.mutate(id);
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleResetSearch = () => {
    setSearchInput("");
    setSearch("");
    setPage(1);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        throw new Error("Ожидается массив объектов");
      }

      let imported = 0;
      const failures: { index: number; error: string }[] = [];

      for (let index = 0; index < parsed.length; index += 1) {
        const entry = parsed[index] as Partial<QaItem>;
        if (typeof entry.question !== "string" || typeof entry.answer !== "string") {
          failures.push({ index, error: "Некорректный формат" });
          continue;
        }
        try {
          await apiFetch<QaItem>("/qa", {
            method: "POST",
            body: JSON.stringify({
              question: entry.question,
              answer: entry.answer,
              language: normaliseLanguage(entry.language ?? "ru"),
            }),
          });
          imported += 1;
        } catch (err) {
          const message = err instanceof ApiError ? err.message : "Ошибка сервера";
          failures.push({ index, error: message });
        }
      }

      invalidateQa();
      await refresh().catch(() => undefined);

      toast({
        title: "Импорт завершён",
        description: `Успешно: ${imported}. Ошибки: ${failures.length}`,
        variant: failures.length > 0 ? "destructive" : "default",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось прочитать файл";
      toast({
        title: "Импорт сорвался",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const firstPage = await apiFetch<QaListResponse>(`/qa?page=1&pageSize=100`);
      let items = [...firstPage.items];
      const totalPagesExport = Math.ceil(firstPage.total / firstPage.pageSize);
      for (let nextPage = 2; nextPage <= totalPagesExport; nextPage += 1) {
        const chunk = await apiFetch<QaListResponse>(
          `/qa?page=${nextPage}&pageSize=${firstPage.pageSize}`,
        );
        items = items.concat(chunk.items);
      }

      const blob = new Blob([JSON.stringify(items, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "qa-export.json";
      link.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Экспорт готов",
        description: `Выгружено ${items.length} записей`,
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Экспорт не удался";
      toast({
        title: "Ошибка",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const appliedItems = data?.items ?? [];
  const pendingId = deleteMutation.variables ?? null;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Q&A Management
            </h1>
            <p className="text-muted-foreground text-sm">
              Управляй вопросами и ответами, данные хранятся в SQLite и синкаются с Pinecone.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleExport} variant="outline" className="gap-2" disabled={isExporting || isProcessing}>
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export JSON
            </Button>
            <Button asChild variant="outline" disabled={isImporting || isProcessing}>
              <label className="cursor-pointer flex items-center gap-2">
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Import JSON
                <input type="file" accept="application/json" className="hidden" onChange={handleFileUpload} />
              </label>
            </Button>
            <Button variant="outline" onClick={() => invalidateQa()} className="gap-2" disabled={isProcessing}>
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>
        </div>

        <Card className="border-primary/20 shadow-lg">
          <CardHeader>
            <CardTitle className="text-primary">Add New Q&A Pair</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-question">Question</Label>
                <Textarea
                  id="new-question"
                  placeholder="Enter the question..."
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-answer">Answer</Label>
                <Textarea
                  id="new-answer"
                  placeholder="Enter the answer..."
                  value={newAnswer}
                  onChange={(e) => setNewAnswer(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="new-language">Language</Label>
                <Input
                  id="new-language"
                  placeholder="ru"
                  value={newLanguage}
                  onChange={(e) => setNewLanguage(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2 flex items-end justify-end">
                <Button onClick={handleCreate} className="w-full sm:w-auto" disabled={createMutation.isPending}>
                  {createMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  Add Q&A Pair
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/20 shadow-lg">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-primary">Existing Q&A ({data?.total ?? 0})</CardTitle>
            <form className="flex w-full sm:w-auto gap-2" onSubmit={handleSearchSubmit}>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search question or answer..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button type="submit" variant="default" disabled={isFetching}>
                {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Find"}
              </Button>
              {search && (
                <Button type="button" variant="outline" onClick={handleResetSearch}>
                  Reset
                </Button>
              )}
            </form>
          </CardHeader>
          <CardContent className="space-y-4">
            {listError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {(listError as Error).message}
              </div>
            )}

            <div className="relative overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">Question</TableHead>
                    <TableHead className="min-w-[220px]">Answer</TableHead>
                    <TableHead className="w-[90px]">Language</TableHead>
                    <TableHead className="w-[120px]">Embedding</TableHead>
                    <TableHead className="w-[180px]">Updated</TableHead>
                    <TableHead className="w-[140px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-3" />
                        Loading Q&A...
                      </TableCell>
                    </TableRow>
                  ) : appliedItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        Ничего не найдено. Добавь пару или измени фильтры.
                      </TableCell>
                    </TableRow>
                  ) : (
                    appliedItems.map((item) => {
                      const isEditing = editingId === item.id;
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            {isEditing ? (
                              <Textarea
                                value={editQuestion}
                                onChange={(e) => setEditQuestion(e.target.value)}
                                rows={3}
                              />
                            ) : (
                              <p className="whitespace-pre-wrap text-sm font-semibold leading-relaxed">
                                {item.question}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Textarea value={editAnswer} onChange={(e) => setEditAnswer(e.target.value)} rows={3} />
                            ) : (
                              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                                {item.answer}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="align-top">
                            {isEditing ? (
                              <Input value={editLanguage} onChange={(e) => setEditLanguage(e.target.value)} />
                            ) : (
                              <Badge variant="secondary" className="uppercase">
                                {item.language || "ru"}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge
                              variant={item.embedding_status === "ready" ? "default" : "outline"}
                              className="capitalize"
                            >
                              {item.embedding_status ?? "unknown"}
                            </Badge>
                          </TableCell>
                          <TableCell className="align-top text-sm text-muted-foreground">
                            {new Date(item.updated_at).toLocaleString()}
                          </TableCell>
                          <TableCell className="align-top text-right">
                            {isEditing ? (
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  onClick={submitEdit}
                                  disabled={updateMutation.isPending}
                                >
                                  {updateMutation.isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    "Save"
                                  )}
                                </Button>
                                <Button size="sm" variant="outline" onClick={cancelEditing} disabled={updateMutation.isPending}>
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => startEditing(item)}
                                  disabled={isProcessing}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDelete(item.id)}
                                  disabled={deleteMutation.isPending && pendingId === item.id}
                                >
                                  {deleteMutation.isPending && pendingId === item.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Page {data?.page ?? page} of {totalPages} · Total {data?.total ?? 0}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1 || isFetching}
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages || isFetching}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default QAManagement;