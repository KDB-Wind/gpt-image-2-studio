import type { RuntimeAdapter } from "./types";
import { webAdapter } from "./webAdapter";

let runtimeAdapterPromise: Promise<RuntimeAdapter> | null = null;

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

export function getRuntimeAdapter(): Promise<RuntimeAdapter> {
  if (!runtimeAdapterPromise) {
    runtimeAdapterPromise = loadRuntimeAdapter();
  }

  return runtimeAdapterPromise;
}

async function loadRuntimeAdapter(): Promise<RuntimeAdapter> {
  if ("__TAURI_INTERNALS__" in (window as TauriWindow)) {
    const { tauriAdapter } = await import("./tauriAdapter");
    return tauriAdapter;
  }

  return webAdapter;
}
