export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

const buildUrl = (path: string) => {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedBase = API_BASE.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

type ApiFetchOptions = RequestInit & {
  parseJson?: boolean;
};

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { headers, body, parseJson = true, ...rest } = options;
  const finalHeaders = new Headers(headers);

  if (body && !finalHeaders.has("Content-Type") && !(body instanceof FormData)) {
    finalHeaders.set("Content-Type", "application/json");
  }

  const requestInit: RequestInit = {
    credentials: "include",
    ...rest,
    headers: finalHeaders,
    body,
  };

  const response = await fetch(buildUrl(path), requestInit);

  if (!response.ok) {
    let errorMessage = response.statusText;
    let errorBody: unknown = null;

    try {
      errorBody = await response.json();
      if (typeof errorBody === "object" && errorBody && "message" in errorBody) {
        errorMessage = String((errorBody as { message?: unknown }).message ?? errorMessage);
      }
    } catch (error) {
      errorBody = await response.text().catch(() => null);
    }

    throw new ApiError(response.status, errorMessage, errorBody);
  }

  if (!parseJson || response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}


