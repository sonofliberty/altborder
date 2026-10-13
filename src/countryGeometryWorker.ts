/// <reference lib="webworker" />

import { runCountryGeometryTask, type CountryGeometryWorkerRequest, type CountryGeometryWorkerResponse } from "./countryGeometryTasks";

self.addEventListener("message", (event: MessageEvent<CountryGeometryWorkerRequest>) => {
  const { id, task } = event.data;
  void runCountryGeometryTask(task).then((result) => {
    const response: CountryGeometryWorkerResponse = { id, result };
    self.postMessage(response);
  }, (error: unknown) => {
    const response: CountryGeometryWorkerResponse = {
      id,
      error: error instanceof Error ? error.message : "Could not calculate country geometry.",
    };
    self.postMessage(response);
  });
});
