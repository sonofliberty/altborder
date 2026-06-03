import { describe, expect, it } from "vitest";
import { decodeSharePayload, encodeSharePayload, hashRequestsEdit, readShareFromHash } from "./share";
import type { ScenarioPayload } from "./types";

describe("share helpers", () => {
  it("round-trips scenario payloads through lazy compression", async () => {
    const payload: ScenarioPayload = {
      version: 1,
      title: "Shared map",
      description: "",
      customCounter: 1,
      entityChanges: {},
      regionOwnerChanges: [["A", "B"]],
      regionNameOverrides: { A: "Renamed region" },
      customRegions: [],
    };

    const encoded = await encodeSharePayload(payload);
    const decoded = await decodeSharePayload(encoded);

    expect(decoded).toEqual({ ok: true, payload });
  });

  it("reads shared scenario hashes without loading compression", () => {
    expect(readShareFromHash("#s=abc&edit=1")).toBe("abc");
    expect(hashRequestsEdit("#s=abc&edit=1")).toBe(true);
    expect(hashRequestsEdit("#s=abc")).toBe(false);
  });
});
