import { ReadyzResponse, isReadyzResponse } from "@/lib/contracts/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

function resolveUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_BASE_URL}${path}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const msg =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: string }).message || "Request failed")
        : `HTTP ${response.status}`;
    throw new Error(msg);
  }

  return payload as T;
}

export async function getReadyz(): Promise<ReadyzResponse> {
  const payload = await request<unknown>("/readyz", { method: "GET" });
  if (!isReadyzResponse(payload)) {
    throw new Error("Invalid /readyz response contract");
  }
  return payload;
}
