import { describe, it, expect, beforeAll } from "vitest";
import { createHmac } from "crypto";

beforeAll(() => { process.env.ENCRYPTION_KEY = "a".repeat(64); });

describe("crypto", () => {
  it("encrypts credentials with AES-GCM and detects tampering", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const c = encrypt("secret-token");
    expect(c).not.toContain("secret-token");
    expect(decrypt(c)).toBe("secret-token");
    const parts = c.split(".");
    parts[2] = Buffer.from("tampered").toString("base64");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
  it("verifies Meta webhook signatures", async () => {
    const { verifyMetaSignature } = await import("@/lib/crypto");
    const body = '{"a":1}';
    const sig = "sha256=" + createHmac("sha256", "s3cret").update(body).digest("hex");
    expect(verifyMetaSignature("s3cret", body, sig)).toBe(true);
    expect(verifyMetaSignature("s3cret", body + " ", sig)).toBe(false);
    expect(verifyMetaSignature("s3cret", body, null)).toBe(false);
  });
  it("CSV export neutralises formula injection", async () => {
    const { csvEscape } = await import("@/lib/util");
    expect(csvEscape("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvEscape('a,"b"')).toBe('"a,""b"""');
  });
});
