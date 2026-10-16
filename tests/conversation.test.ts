import { beforeEach, describe, expect, it } from "vitest";
import { handleMessage, initialState, type ConvState, type Deps } from "@/lib/conversation";
import { DatabaseUnavailableError } from "@/lib/db";
import { UNKNOWN_FALLBACK, REQUEST_NOT_BOOKING } from "@/lib/business";
import { futureDate } from "./helpers";

let submitted: unknown[] = [];
const deps: Deps = {
  submit: async (d) => { submitted.push(d); return { reference: "PT-261016-ABCDE" }; },
  lookup: async () => null,
  requestChange: async () => ({ ok: true }),
};

async function run(inputs: string[], d: Deps = deps) {
  let state: ConvState = initialState();
  let last;
  for (const i of inputs) {
    last = await handleMessage(state, i, d);
    state = last.state;
  }
  return last!;
}

const all = (t: { messages: { text: string }[] }) => t.messages.map((m) => m.text).join("\n");
const fullFlow = ["start", "menu:request", "Asha Rao", "9876543210", futureDate(2), "Evening (4pm–8pm)", "Jayanagar 4th Block", "Lower back pain for two weeks", "female", "yes"];

beforeEach(() => { submitted = []; });

describe("conversation engine", () => {
  it("greets with the four main options", async () => {
    const t = await run(["start"]);
    expect(all(t)).toContain("Welcome to Physiotherapy Treatment at Home");
    expect(t.quickReplies.map((q) => q.value)).toEqual(["menu:request", "menu:faq", "menu:status", "menu:human"]);
  });

  it("scenario 1: collects a complete enquiry, summarises, and submits only after confirmation", async () => {
    const summaryTurn = await run(fullFlow);
    expect(summaryTurn.state.step).toBe("confirm");
    expect(all(summaryTurn)).toContain("Asha Rao");
    expect(all(summaryTurn)).toContain("+919876543210");
    expect(submitted).toHaveLength(0);
    const done = await run([...fullFlow, "submit"]);
    expect(submitted).toHaveLength(1);
    expect(all(done)).toContain(REQUEST_NOT_BOOKING);
    expect(all(done)).toContain("PT-261016-ABCDE");
    expect(all(done).toLowerCase()).not.toMatch(/your appointment (is|has been) confirmed/);
  });

  it("scenario 2: rejects invalid details and re-asks", async () => {
    const badPhone = await run(["menu:request", "Asha", "12345"]);
    expect(badPhone.state.step).toBe("phone");
    expect(badPhone.messages[0].tone).toBe("error");
    const badName = await run(["menu:request", "1"]);
    expect(badName.state.step).toBe("name");
    const pastDate = await run(["menu:request", "Asha", "9876543210", "01/01/2020"]);
    expect(pastDate.state.step).toBe("date");
    expect(all(pastDate)).toMatch(/past/);
    const invalidDate = await run(["menu:request", "Asha", "9876543210", "31/02/2027"]);
    expect(invalidDate.state.step).toBe("date");
  });

  it("scenario 2b: refuses to submit without consent and stores nothing", async () => {
    const t = await run([...fullFlow.slice(0, -1), "no"]);
    expect(t.state.step).toBe("menu");
    expect(all(t)).toContain("haven't submitted");
    expect(submitted).toHaveLength(0);
  });

  it("scenarios 3 & 4: a requested date is recorded as a preference, never as availability", async () => {
    const t = await run(["menu:request", "Asha", "9876543210", futureDate(5)]);
    expect(all(t)).toMatch(/preferred date — the clinic will confirm whether a therapist is available/);
    const summary = await run(fullFlow);
    expect(all(summary)).toMatch(/not yet confirmed/);
  });

  it("scenario 8: unknown prices and service areas use the standard fallback", async () => {
    expect(all(await run(["What are your home visit charges?"]))).toBe(UNKNOWN_FALLBACK);
    expect(all(await run(["Do you cover Whitefield?"]))).toBe(UNKNOWN_FALLBACK);
    expect(all(await run(["Do you offer hydrotherapy"]))).toContain(UNKNOWN_FALLBACK);
  });

  it("answers verified FAQs from business facts", async () => {
    expect(all(await run(["What is your contact number?"]))).toContain("077158 77047");
    expect(all(await run(["Where is the clinic located?"]))).toContain("Jayanagar 6th Block");
    expect(all(await run(["What are your opening hours?"]))).toContain("Open 24 hours");
    expect(all(await run(["Can I request a female physiotherapist?"]))).toMatch(/isn't guaranteed/);
  });

  it("scenario 9: never diagnoses", async () => {
    const t = await run(["Do I have a slip disc? Which exercise should I do?"]);
    expect(all(t)).toMatch(/can't diagnose/);
    // mid-form diagnosis question keeps the form position
    const mid = await run(["menu:request", "Asha", "Do I have arthritis?"]);
    expect(mid.state.step).toBe("phone");
    expect(all(mid)).toMatch(/can't diagnose/);
  });

  it("urgent symptoms trigger emergency advice", async () => {
    const t = await run(["My father has chest pain and can't breathe"]);
    expect(t.messages[0].tone).toBe("warning");
    expect(all(t)).toMatch(/112/);
    // urgent description in the reason step is kept and flagged
    const r = await run(["menu:request", "Asha", "9876543210", futureDate(2), "morning", "Jayanagar", "sudden weakness in left arm"]);
    expect(r.state.step).toBe("therapist");
    expect(r.state.draft.urgentFlag).toBe(true);
    expect(all(r)).toMatch(/112/);
  });

  it("scenario 12: database failure is reported honestly and the draft is kept for retry", async () => {
    const failing: Deps = { ...deps, submit: async () => { throw new DatabaseUnavailableError(); } };
    const t = await run([...fullFlow, "submit"], failing);
    expect(t.state.step).toBe("confirm");
    expect(all(t)).toMatch(/NOT been submitted/);
    expect(all(t)).toContain("077158 77047");
  });

  it("scenario 7: patient can request cancellation or rescheduling after verifying reference + phone", async () => {
    const calls: unknown[] = [];
    const d: Deps = {
      ...deps,
      lookup: async () => ({ status: "new", preferred_date: futureDate(2), preferred_time: "morning" }),
      requestChange: async (...a) => { calls.push(a); return { ok: true }; },
    };
    const t = await run(["menu:status", "pt-261016-abcde", "9876543210"], d);
    expect(all(t)).toMatch(/not yet a confirmed appointment/);
    const r = await run(["menu:status", "PT-261016-ABCDE", "9876543210", "reschedule", "Next Monday evening"], d);
    expect(all(r)).toMatch(/not confirmed until the clinic contacts you/);
    expect(calls[0]).toEqual(["PT-261016-ABCDE", "+919876543210", "reschedule", "Next Monday evening"]);
    const c = await run(["menu:status", "PT-261016-ABCDE", "9876543210", "cancel", "confirm cancellation"], d);
    expect(all(c)).toMatch(/cancelled/);
  });

  it("status lookup with wrong phone reveals nothing", async () => {
    const t = await run(["menu:status", "PT-261016-ABCDE", "9876543210"]);
    expect(all(t)).toMatch(/couldn't find/);
  });

  it("AI classifier output is limited to routing; unknown stays fallback", async () => {
    const d: Deps = { ...deps, classify: async () => ({ kind: "faq", key: "prices" }) };
    expect(all(await run(["blah blah"], d))).toBe(UNKNOWN_FALLBACK);
    const none: Deps = { ...deps, classify: async () => null };
    expect(all(await run(["blah blah"], none))).toBe(UNKNOWN_FALLBACK);
  });
});
