import { useMemo, useState, useEffect } from "react";
import { read, utils, writeFileXLSX } from "xlsx";
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
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Plus,
  Upload,
  Download,
  Edit,
  Trash2,
  Trash,
  Search,
  Database,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
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

interface DeleteQaResponse {
  deleted: boolean;
  vectorRemoved: boolean;
  vectorSkipped: boolean;
  vectorError: string | null;
}

const PAGE_SIZE = 10;

interface ImportProgressState {
  total: number;
  processed: number;
  success: number;
  failed: number;
}

interface ImportRow {
  rowNumber: number;
  question?: string;
  answer?: string;
  language?: string;
  parseError?: string;
}

type RawCellValue = string | number | boolean | Date | null | undefined;

const toCellString = (value: RawCellValue): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    return value.toString();
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
};

const parseXlsxFile = async (file: File): Promise<{ sheetName: string; rows: ImportRow[] }> => {
  const buffer = await file.arrayBuffer();

  let workbook;
  try {
    workbook = read(buffer, { type: "array", cellDates: true });
  } catch (error) {
    throw new Error("Не удалось прочитать XLSX. Проверьте файл.");
  }

  const [sheetName] = workbook.SheetNames;
  if (!sheetName) {
    throw new Error("XLSX-файл не содержит листов.");
  }

  const worksheet = workbook.Sheets[sheetName];
  const sheetRows = utils.sheet_to_json<RawCellValue[]>(worksheet, {
    header: 1,
    blankrows: true,
    defval: null,
    raw: false,
  });

  if (sheetRows.length === 0) {
    throw new Error("XLSX-файл пуст.");
  }

  const headerRow = sheetRows[0];
  if (!Array.isArray(headerRow)) {
    throw new Error("Не удалось определить заголовок листа.");
  }

  const headers = headerRow.map((value) => toCellString(value)?.toLowerCase() ?? "");
  const dataRows = sheetRows.slice(1);

  const rows: ImportRow[] = dataRows.map((rowValues, index) => {
    const rowNumber = index + 2;
    if (!Array.isArray(rowValues)) {
      return { rowNumber, parseError: "Некорректная структура строки XLSX" };
    }

    const record: Record<string, string | null | undefined> = {};
    headers.forEach((header, colIndex) => {
      if (!header) return;
      const cell = toCellString(rowValues[colIndex]);
      if (cell) {
        record[header] = cell;
      }
    });

    if (Object.keys(record).length === 0) {
      return { rowNumber };
    }

    const question = pickField(record, ["question", "qestion"]);
    const answer = pickField(record, ["answer", "ans"]);
    const language = pickField(record, ["language", "lang"]);

    return { rowNumber, question, answer, language };
  });

  return { sheetName, rows };
};

const pickField = (row: Record<string, string | null | undefined>, candidates: string[]): string | undefined => {
  for (const key of candidates) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
};

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

const getVectorStatus = (status: string | null | undefined) => {
  switch (status) {
    case "ready":
      return {
        label: "Synced to Pinecone",
        description: "Vector stored and ready for search",
        variant: "default" as const,
        Icon: CheckCircle2,
      };
    case "pending":
      return {
        label: "Sync in progress",
        description: "Embedding queued for Pinecone",
        variant: "secondary" as const,
        Icon: Clock,
      };
    case "failed":
      return {
        label: "Sync failed",
        description: "Inspect logs and retry the embedding job",
        variant: "destructive" as const,
        Icon: AlertTriangle,
      };
    case "skipped":
      return {
        label: "Skipped",
        description: "Vectorisation skipped (model returned no embedding)",
        variant: "outline" as const,
        Icon: AlertTriangle,
      };
    default:
      return {
        label: "Unknown",
        description: "Sync status was not reported",
        variant: "outline" as const,
        Icon: Database,
      };
  }
};

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
  const [importProgress, setImportProgress] = useState<ImportProgressState | null>(null);
  const [importSheetName, setImportSheetName] = useState<string | null>(null);

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
      title: "Request failed",
      description: message,
      variant: "destructive",
    });
  };

  const createMutation = useMutation({
    mutationFn: (payload: { question: string; answer: string; language?: string }) =>
      apiFetch<{ item: QaItem | null; replaced: boolean }>("/qa", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: async (result) => {
      setNewQuestion("");
      setNewAnswer("");
      setPage(1);
      invalidateQa();
      await refresh().catch(() => undefined);
      const replaced = Boolean(result?.replaced);
      toast({
        title: replaced ? "Q&A replaced" : "Q&A saved",
        description: replaced
          ? "Existing question updated; vector will be refreshed."
          : "Stored and queued for Pinecone vector sync.",
      });
    },
    onError: (err) => handleMutationError(err, "Could not add the Q&A pair"),
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
        title: "Q&A updated",
        description: "Changes saved and vector sync restarted.",
      });
    },
    onError: (err) => handleMutationError(err, "Could not update the record"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<DeleteQaResponse>(`/qa/${id}`, {
        method: "DELETE",
      }),
    onSuccess: async (result) => {
      invalidateQa();
      await refresh().catch(() => undefined);
      const { vectorRemoved, vectorSkipped, vectorError } = result;
      let description = "Removed from SQLite and Pinecone.";
      let variant: "default" | "destructive" = "default";

      if (!vectorRemoved) {
        if (vectorSkipped) {
          description = "Deleted locally. Pinecone cleanup was skipped (vector missing or Pinecone disabled).";
        } else {
          description = `Deleted locally. Pinecone cleanup failed${
            vectorError ? `: ${vectorError}` : "."
          }`;
          variant = "destructive";
        }
      }

      toast({
        title: "Q&A deleted",
        description,
        variant,
      });
    },
    onError: (err) => handleMutationError(err, "Unable to delete the record"),
  });

  const deleteAllMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ deleted: number; vectorFailures: string[] }>("/qa", {
        method: "DELETE",
      }),
    onSuccess: async (result) => {
      invalidateQa();
      await refresh().catch(() => undefined);
      const hasVectorFailures = Array.isArray(result.vectorFailures) && result.vectorFailures.length > 0;
      toast({
        title: "Knowledge base cleared",
        description: hasVectorFailures
          ? `Deleted ${result.deleted} pairs. Some vectors need manual cleanup in Pinecone.`
          : `Deleted ${result.deleted} pairs from SQLite and Pinecone.`,
        variant: hasVectorFailures ? "destructive" : "default",
      });
    },
    onError: (err) => handleMutationError(err, "Unable to delete all records"),
  });

  const isProcessing =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    isImporting ||
    isExporting ||
    deleteAllMutation.isPending;

  const handleCreate = () => {
    if (!newQuestion.trim() || !newAnswer.trim()) {
      toast({
        title: "Missing fields",
        description: "Provide both question and answer before saving.",
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
        title: "Missing fields",
        description: "Question and answer cannot be empty.",
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
    const confirmed = window.confirm("Delete this Q&A pair from Pinecone and SQLite?");
    if (!confirmed) return;
    deleteMutation.mutate(id);
  };

  const handleDeleteAll = () => {
    const total = data?.total ?? 0;
    if (total === 0) {
      toast({
        title: "Nothing to delete",
        description: "The knowledge base is already empty.",
      });
      return;
    }

    const confirmed = window.confirm(
      `Delete all ${total} Q&A pairs from SQLite and Pinecone? This action cannot be undone.`,
    );
    if (!confirmed) return;
    deleteAllMutation.mutate();
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

    const fileName = file.name.toLowerCase();
    const isXlsx =
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      fileName.endsWith(".xlsx");
    if (!isXlsx) {
      toast({
        title: "Неверный формат",
        description: "Пожалуйста, загрузите XLSX-файл с колонками question, answer.",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);
    setImportProgress(null);
    setImportSheetName(null);

    try {
      const { sheetName, rows: parsedRows } = await parseXlsxFile(file);
      setImportSheetName(sheetName);

      const rows = parsedRows.filter((item) => {
        if (item.parseError) return true;
        return Boolean(item.question) || Boolean(item.answer);
      });

      if (rows.length === 0) {
        throw new Error("XLSX не содержит строк, которые удалось разобрать.");
      }

      setImportProgress({ total: rows.length, processed: 0, success: 0, failed: 0 });

      console.log(`[Import Excel] Starting import of ${rows.length} rows from sheet "${sheetName}"`);
      
      let success = 0;
      let failed = 0;
      const failures: { rowNumber: number | null; error: string }[] = [];

      for (let index = 0; index < rows.length; index += 1) {
        const { rowNumber, question, answer, language, parseError } = rows[index];

        if (parseError) {
          failed += 1;
          failures.push({ rowNumber, error: `Ошибка структуры XLSX: ${parseError}` });
        } else if (!question || !answer) {
          failed += 1;
          failures.push({ rowNumber, error: "Пустой question или answer" });
        } else {
          try {
            console.log(`[Import Excel] Importing row ${rowNumber}: question="${question.substring(0, 50)}..."`);
            const result = await apiFetch<{ item: QaItem | null; replaced: boolean }>("/qa", {
              method: "POST",
              body: JSON.stringify({
                question,
                answer,
                language: normaliseLanguage(language ?? "ru"),
              }),
            });
            
            if (!result?.item) {
              throw new Error("Server returned no item");
            }
            
            const item = result.item;
            if (item.embedding_status !== "ready" && item.embedding_status !== "pending") {
              console.warn(`[Import] QA ${item.id} sync status: ${item.embedding_status} for question: "${question.substring(0, 50)}..."`);
            }
            
            success += 1;
            
            if (index < rows.length - 1) {
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
          } catch (err) {
            failed += 1;
            const message = err instanceof ApiError ? err.message : "Ошибка сервера";
            failures.push({ rowNumber, error: message });
            console.error(`[Import] Failed to import row ${rowNumber}:`, err);
          }
        }

        setImportProgress({
          total: rows.length,
          processed: index + 1,
          success,
          failed,
        });
      }

      invalidateQa();
      await refresh().catch(() => undefined);

      const summary = `Добавлено: ${success}. Ошибок: ${failed}${sheetName ? `. Лист: ${sheetName}` : ""}`;
      const failurePreview = failures
        .slice(0, 3)
        .map((failure) => {
          const prefix = failure.rowNumber ? `стр. ${failure.rowNumber}` : "лист";
          return `${prefix}: ${failure.error}`;
        })
        .join(" · ");

      toast({
        title: "Импорт завершён",
        description:
          failures.length > 0
            ? `${summary}${failurePreview ? `\n${failurePreview}${failures.length > 3 ? " · …" : ""}` : ""}`
            : summary,
        variant: failures.length > 0 ? "destructive" : "default",
      });
    } catch (error) {
      setImportProgress(null);
      setImportSheetName(null);
      const message = error instanceof Error ? error.message : "Не удалось обработать XLSX";
      toast({
        title: "Импорт не удался",
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

      const worksheetData = items.map((item) => ({
        question: item.question,
        answer: item.answer,
        language: item.language ?? "ru",
      }));

      const workbook = utils.book_new();
      const worksheet = utils.json_to_sheet(worksheetData, {
        header: ["question", "answer", "language"],
      });
      utils.book_append_sheet(workbook, worksheet, "QA");

      writeFileXLSX(workbook, "qa-export.xlsx", {
        compression: true,
      });

      toast({
        title: "Экспорт готов",
        description: `Экспортировано ${items.length} записей в XLSX`,
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Не удалось экспортировать XLSX";
      toast({
        title: "Экспорт не удался",
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
              Curate the knowledge base. Entries stay in SQLite and auto-sync to the Pinecone vector index.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleExport} variant="outline" className="gap-2" disabled={isExporting || isProcessing}>
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export XLSX
            </Button>
            <Button asChild variant="outline" disabled={isImporting || isProcessing}>
              <label className="cursor-pointer flex items-center gap-2">
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Import XLSX
                <input
                  type="file"
                  accept=".xlsx,.xlsm,.xlsb,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAll}
              className="gap-2"
              disabled={isProcessing || (data?.total ?? 0) === 0}
            >
              {deleteAllMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash className="w-4 h-4" />}
              Delete all
            </Button>
          </div>
        </div>

        {importProgress && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-primary">
              <span>
                Обработано {importProgress.processed} из {importProgress.total} строк XLSX
              </span>
              {importSheetName ? (
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Лист: {importSheetName}
                </span>
              ) : null}
            </div>
            <Progress
              value={importProgress.total === 0 ? 0 : Math.round((importProgress.processed / importProgress.total) * 100)}
            />
            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
              <span>Успешно: {importProgress.success}</span>
              <span>Ошибки: {importProgress.failed}</span>
            </div>
          </div>
        )}

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
                    <TableHead className="w-[140px]">Vector Sync</TableHead>
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
                        No entries yet. Create a pair or adjust the filters.
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
                            {(() => {
                              const status = getVectorStatus(item.embedding_status);
                              const StatusIcon = status.Icon;
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant={status.variant} className="gap-1.5 cursor-help">
                                      <StatusIcon className="w-3.5 h-3.5" />
                                      {status.label}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="max-w-xs space-y-1 text-sm">
                                      <p>{status.description}</p>
                                      {item.pinecone_id ? (
                                        <p className="text-muted-foreground">ID: {item.pinecone_id}</p>
                                      ) : null}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })()}
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