import { describe, expect, it } from "vitest";
import { normalizePhone, parsePreferredDate } from "@/lib/validation";
import { csvCell } from "@/lib/csv";
import { verifyWhatsAppSignature } from "@/lib/notify/whatsapp";
import crypto from "node:crypto";

describe("validation", () => {
  it("normalises Indian mobile numbers", () => {
    expect(normalizePhone("077158 77047")).toBe("+917715877047");
    expect(normalizePhone("+91 98765-43210")).toBe("+919876543210");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("5876543210")).toBeNull();
  });
  it("parses dates relative to clinic time", () => {
    const now = new Date("2026-10-16T10:00:00Z");
    expect(parsePreferredDate("tomorrow", now)).toEqual({ ok: true, date: "2026-10-17" });
    expect(parsePreferredDate("25/10/2026", now)).toEqual({ ok: true, date: "2026-10-25" });
    expect(parsePreferredDate("20 Oct", now)).toEqual({ ok: true, date: "2026-10-20" });
    expect(parsePreferredDate("01/01/2027", now).ok).toBe(true);
    expect(parsePreferredDate("15/10/2026", now).ok).toBe(false);
    expect(parsePreferredDate("30/02/2027", now).ok).toBe(false);
    expect(parsePreferredDate("01/06/2027", now).ok).toBe(false); // > 90 days
  });
  it("neutralises CSV formula injection", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
  });
  it("verifies WhatsApp webhook signatures", () => {
    const body = '{"a":1}';
    const sig = "sha256=" + crypto.createHmac("sha256", "secret").update(body).digest("hex");
    expect(verifyWhatsAppSignature(body, sig, "secret")).toBe(true);
    expect(verifyWhatsAppSignature(body + " ", sig, "secret")).toBe(false);
    expect(verifyWhatsAppSignature(body, null, "secret")).toBe(false);
    expect(verifyWhatsAppSignature(body, "sha256=abcd", "secret")).toBe(false);
  });
});
