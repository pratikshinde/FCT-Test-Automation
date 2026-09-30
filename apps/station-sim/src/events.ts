import type { WebSocket } from "ws";
import type { StationEvent } from "@fct/contracts";

/** Broadcasts StationEvent messages to every connected WS client (planner 7.1 `WS /v1/events`). */
export class EventBus {
  private clients = new Set<WebSocket>();

  add(ws: WebSocket) {
    this.clients.add(ws);
    ws.on("close", () => this.clients.delete(ws));
  }

  emit(event: StationEvent) {
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) client.send(payload);
    }
  }

  /** Simulates a Wi-Fi drop: force-closes every connected client without warning. */
  dropAllConnections() {
    for (const client of this.clients) client.terminate();
    this.clients.clear();
  }

  get clientCount() {
    return this.clients.size;
  }
}
