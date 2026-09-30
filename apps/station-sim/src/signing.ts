import { generateKeyPairSync, sign as edSign } from "node:crypto";

/** Ed25519 signing — planner.md Section 6.4 (`"signature": "ed25519:..."`). */
export class StationSigner {
  private readonly privateKey;
  readonly publicKeyB64: string;

  constructor() {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    this.privateKey = privateKey;
    this.publicKeyB64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  }

  /** Signs the canonical JSON of a record (everything except the `signature` field itself). */
  sign(payload: unknown): string {
    const data = Buffer.from(JSON.stringify(payload));
    const signature = edSign(null, data, this.privateKey);
    return `ed25519:${signature.toString("base64")}`;
  }
}
