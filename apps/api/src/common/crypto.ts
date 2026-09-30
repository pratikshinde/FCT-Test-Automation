import { createPublicKey, verify } from "node:crypto";
import type { StationResultRecord } from "@fct/contracts";

/**
 * Verifies the Ed25519 signature on a station result record (planner.md Section 6.3 & 6.4).
 * The signature covers the canonical JSON representation of all fields except `signature`.
 */
export function verifyStationSignature(
  record: StationResultRecord,
  publicKeyDerBase64: string
): boolean {
  if (!record.signature || !record.signature.startsWith("ed25519:")) {
    return false;
  }

  try {
    const rawSigBase64 = record.signature.slice("ed25519:".length);
    const signatureBuffer = Buffer.from(rawSigBase64, "base64");

    // Canonical payload is the record without the signature field
    const { signature: _, ...payload } = record;
    const dataBuffer = Buffer.from(JSON.stringify(payload));

    const key = createPublicKey({
      key: Buffer.from(publicKeyDerBase64, "base64"),
      format: "der",
      type: "spki",
    });

    return verify(null, dataBuffer, key, signatureBuffer);
  } catch (err) {
    return false;
  }
}
