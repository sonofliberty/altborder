import type { Geometry } from "geojson";
import { describe, expect, it, vi } from "vitest";
import type { CountryGeometryWorkerRequest, CountryGeometryWorkerResponse } from "./countryGeometryTasks";
import { CountryGeometryWorkerClient } from "./countryGeometryWorkerClient";

class TestWorker extends EventTarget {
  requests: CountryGeometryWorkerRequest[] = [];
  terminated = false;

  postMessage(request: CountryGeometryWorkerRequest) {
    this.requests.push(request);
  }

  terminate() {
    this.terminated = true;
  }

  reply(response: CountryGeometryWorkerResponse) {
    this.dispatchEvent(new MessageEvent("message", { data: response }));
  }
}

function setup() {
  const workers: TestWorker[] = [];
  const createWorker = vi.fn(() => {
    const worker = new TestWorker();
    workers.push(worker);
    return worker as unknown as Worker;
  });
  return { client: new CountryGeometryWorkerClient(createWorker), workers, createWorker };
}

const geometry: Geometry = { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] };

describe("country geometry worker client", () => {
  it("keeps one worker and limits execution to one country job at a time", async () => {
    const { client, workers, createWorker } = setup();
    const first = client.unionOwned([geometry]);
    const second = client.union([geometry], 0.02);
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(workers[0].requests).toHaveLength(1);
    workers[0].reply({ id: 1, result: geometry });
    await expect(first).resolves.toEqual(geometry);
    expect(workers[0].requests).toHaveLength(2);
    expect(workers[0].requests[1].task).toEqual({ kind: "union", geometries: [geometry], gapTolerance: 0.02 });
    workers[0].reply({ id: 2, result: null });
    await expect(second).resolves.toBeNull();
    expect(createWorker).toHaveBeenCalledTimes(1);
    client.dispose();
  });

  it("terminates an obsolete active overlay before starting the next map", async () => {
    const { client, workers } = setup();
    const controller = new AbortController();
    const first = client.unionOwned([geometry], controller.signal);
    const rejection = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const next = client.unionOwned([geometry]);
    controller.abort();
    await rejection;
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);
    workers[0].reply({ id: 1, result: null });
    workers[1].reply({ id: 2, result: geometry });
    await expect(next).resolves.toEqual(geometry);
    client.dispose();
  });

  it("removes aborted queued work without interrupting a current job", async () => {
    const { client, workers, createWorker } = setup();
    const current = client.unionOwned([geometry]);
    const controller = new AbortController();
    const queued = client.unionOwned([geometry], controller.signal);
    const rejection = expect(queued).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejection;
    workers[0].reply({ id: 1, result: geometry });
    await expect(current).resolves.toEqual(geometry);
    expect(workers[0].requests).toHaveLength(1);
    expect(workers[0].terminated).toBe(false);
    expect(createWorker).toHaveBeenCalledTimes(1);
    client.dispose();
  });

  it("does not start any of the queued jobs cancelled by the same map update", async () => {
    const { client, workers, createWorker } = setup();
    const controller = new AbortController();
    const jobs = [client.unionOwned([geometry], controller.signal), client.unionOwned([geometry], controller.signal)];
    const settled = Promise.allSettled(jobs);
    controller.abort();
    expect(await settled).toEqual([
      { status: "rejected", reason: expect.objectContaining({ name: "AbortError" }) },
      { status: "rejected", reason: expect.objectContaining({ name: "AbortError" }) },
    ]);
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(workers[0].terminated).toBe(true);
    client.dispose();
  });

  it("reports a failed worker job and continues with the next country", async () => {
    const { client, workers } = setup();
    const first = client.unionOwned([geometry]);
    const failure = expect(first).rejects.toThrow("Invalid geometry");
    const second = client.unionOwned([geometry]);
    workers[0].reply({ id: 1, error: "Invalid geometry" });
    await failure;
    workers[0].reply({ id: 2, result: geometry });
    await expect(second).resolves.toEqual(geometry);
    client.dispose();
  });

  it("rejects pending and future work when the map unmounts", async () => {
    const { client, workers } = setup();
    const pending = Promise.allSettled([client.unionOwned([geometry]), client.unionOwned([geometry])]);
    client.dispose();
    expect(await pending).toEqual([
      { status: "rejected", reason: expect.objectContaining({ name: "AbortError" }) },
      { status: "rejected", reason: expect.objectContaining({ name: "AbortError" }) },
    ]);
    await expect(client.unionOwned([geometry])).rejects.toMatchObject({ name: "AbortError" });
    expect(workers[0].terminated).toBe(true);
  });
});
