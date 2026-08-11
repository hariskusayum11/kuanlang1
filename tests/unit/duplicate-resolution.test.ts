import { describe, expect, it } from "vitest";
import { duplicateFlagForDecision } from "../../lib/verification/duplicate-resolution";

describe("duplicate resolution", () => {
  it("keeps confirmed duplicates excluded from household totals", () => {
    expect(duplicateFlagForDecision("CONFIRMED_DUPLICATE")).toBe(true);
  });

  it("clears the exclusion flag after a verifier confirms it is not duplicate", () => {
    expect(duplicateFlagForDecision("NOT_DUPLICATE")).toBe(false);
  });
});
