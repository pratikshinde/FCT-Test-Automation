import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(__dirname, "..", "data");
const SEQ_FILE = join(DATA_DIR, "seq.json");

/** Persists the station's sequence counter across restarts (planner 7.3). */
export class SeqStore {
  private value: number;

  constructor() {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (existsSync(SEQ_FILE)) {
      this.value = JSON.parse(readFileSync(SEQ_FILE, "utf-8")).seq ?? 0;
    } else {
      this.value = 0;
      this.persist();
    }
  }

  next(): number {
    this.value += 1;
    this.persist();
    return this.value;
  }

  private persist() {
    writeFileSync(SEQ_FILE, JSON.stringify({ seq: this.value }));
  }
}
