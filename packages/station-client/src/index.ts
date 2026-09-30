import WebSocket from "ws";
import {
  StationInfoSchema,
  BoardReadingSchema,
  PairResponseSchema,
  StationResultRecordSchema,
  StationEventSchema,
  type StationInfo,
  type BoardReading,
  type TestPlan,
  type StationState,
  type StationResultRecord,
  type StationEvent,
} from "@fct/contracts";

export interface StationClientOptions {
  baseUrl: string;
  stationToken?: string;
  fetchFn?: typeof fetch;
  WebSocketClass?: typeof WebSocket;
}

export class StationError extends Error {
  constructor(message: string, public readonly status: number, public readonly details?: unknown) {
    super(`StationError (${status}): ${message}`);
    this.name = "StationError";
  }
}

/**
 * Typed client for interacting with an FCT Station (or simulator)
 * implementing planner.md Section 7.1.
 */
export class StationClient {
  private readonly baseUrl: string;
  private token?: string;
  private readonly customFetch: typeof fetch;
  private readonly wsClass: typeof WebSocket;

  constructor(options: StationClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.stationToken;
    this.customFetch = options.fetchFn ?? fetch;
    this.wsClass = options.WebSocketClass ?? WebSocket;
  }

  setToken(token: string) {
    this.token = token;
  }

  getToken(): string | undefined {
    return this.token;
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST" | "PUT" = "GET",
    body?: unknown,
    requiresAuth = true
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {};

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (requiresAuth && this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await this.customFetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new StationError(
        (json as any)?.error?.message || (json as any)?.error || response.statusText,
        response.status,
        json
      );
    }

    return json as T;
  }

  /** GET /v1/info: station id, firmware version, public key, current state */
  async getInfo(): Promise<StationInfo> {
    const res = await this.request<unknown>("/v1/info", "GET", undefined, false);
    return StationInfoSchema.parse(res);
  }

  /** POST /v1/pair: exchange 6-digit code for station bearer token */
  async pair(code: string): Promise<string> {
    const res = await this.request<unknown>("/v1/pair", "POST", { code }, false);
    const parsed = PairResponseSchema.parse(res);
    this.token = parsed.stationToken;
    return parsed.stationToken;
  }

  /** GET /v1/board: check if board is placed, read UID and board-ID resistance */
  async getBoard(): Promise<BoardReading> {
    const res = await this.request<unknown>("/v1/board", "GET");
    return BoardReadingSchema.parse(res);
  }

  /** POST /v1/sessions: start session for current board */
  async createSession(options?: { scenario?: string; confirmTimeoutMs?: number }): Promise<{ sessionId: string }> {
    return this.request<{ sessionId: string }>("/v1/sessions", "POST", options ?? {});
  }

  /** PUT /v1/sessions/:id/plan: upload validated JSON test plan */
  async loadPlan(sessionId: string, plan: TestPlan): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`/v1/sessions/${sessionId}/plan`, "PUT", { plan });
  }

  /** PUT /v1/sessions/:id/program: trigger programming with program SHA-256 */
  async loadProgram(sessionId: string, programSha256: string): Promise<{ ok: boolean; state: StationState }> {
    return this.request<{ ok: boolean; state: StationState }>(`/v1/sessions/${sessionId}/program`, "PUT", {
      programSha256,
    });
  }

  /** POST /v1/sessions/:id/start: start test sequence execution */
  async start(sessionId: string): Promise<void> {
    await this.request<{ ok: boolean }>(`/v1/sessions/${sessionId}/start`, "POST", {});
  }

  /** POST /v1/sessions/:id/confirm: operator visual confirmation (OPS-031) */
  async confirm(sessionId: string): Promise<void> {
    await this.request<{ ok: boolean }>(`/v1/sessions/${sessionId}/confirm`, "POST", {});
  }

  /** POST /v1/sessions/:id/abort: abort execution safely */
  async abort(sessionId: string): Promise<void> {
    await this.request<{ ok: boolean }>(`/v1/sessions/${sessionId}/abort`, "POST", {});
  }

  /** POST /v1/sessions/:id/ack: acknowledge FAIL before next board (OPS-051) */
  async ack(sessionId: string): Promise<void> {
    await this.request<{ ok: boolean }>(`/v1/sessions/${sessionId}/ack`, "POST", {});
  }

  /** GET /v1/records?afterSeq=N: retrieve signed result records for syncing */
  async getRecords(afterSeq = 0): Promise<StationResultRecord[]> {
    const res = await this.request<unknown[]>(`/v1/records?afterSeq=${afterSeq}`, "GET");
    return res.map((r) => StationResultRecordSchema.parse(r));
  }

  /** POST /v1/records/ack: acknowledge that records have been ingested by server */
  async ackRecords(recordIds: string[]): Promise<void> {
    await this.request<{ ok: boolean }>("/v1/records/ack", "POST", { recordIds });
  }

  /**
   * WS /v1/events: stream real-time station events.
   * Returns an unsubscribe function.
   */
  subscribeEvents(
    listener: (event: StationEvent) => void,
    onError?: (err: Error) => void
  ): () => void {
    const wsUrl = `${this.baseUrl.replace(/^http/, "ws")}/v1/events?token=${encodeURIComponent(this.token ?? "")}`;
    const ws = new this.wsClass(wsUrl);

    ws.on("message", (data: WebSocket.RawData) => {
      try {
        const parsed = JSON.parse(data.toString());
        const event = StationEventSchema.safeParse(parsed);
        if (event.success) {
          listener(event.data);
        }
      } catch (err) {
        if (onError) onError(err as Error);
      }
    });

    ws.on("error", (err: Error) => {
      if (onError) onError(err);
    });

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }
}
