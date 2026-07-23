import * as fs from "node:fs";
import * as path from "node:path";
import { ensureDir, getDataDir } from "./paths.js";
import { parseStoredRequestFile } from "./request.js";
import type { InteractionMapping, InteractionsStore } from "./types.js";

function storePath(dataDir = getDataDir()): string {
  return path.join(dataDir, "interactions.json");
}

function emptyStore(): InteractionsStore {
  return { version: 1, nextIndex: 1, interactions: [] };
}

/** Ensure every mapping has stable index/previousIndex; persist if migrated. */
function migrateStore(raw: InteractionsStore): {
  store: InteractionsStore;
  changed: boolean;
} {
  let changed = false;
  const interactions = [...(raw.interactions ?? [])];

  // Assign indexes in existing array order (creation order) starting at 1.
  let maxAssigned = 0;
  for (let i = 0; i < interactions.length; i++) {
    const item = interactions[i]!;
    if (typeof item.index !== "number" || item.index < 1) {
      item.index = i + 1;
      changed = true;
    }
    maxAssigned = Math.max(maxAssigned, item.index);
  }

  const byId = new Map(
    interactions.map((item) => [item.interactionId, item] as const),
  );

  for (const item of interactions) {
    if (item.previousIndex === undefined) {
      const prevId = item.previousInteractionId ?? null;
      if (prevId) {
        const prev = byId.get(prevId);
        item.previousIndex = prev?.index ?? null;
      } else {
        item.previousIndex = null;
      }
      changed = true;
    }
    if (item.userText === undefined) {
      item.userText = null;
      changed = true;
    }
    // Best-effort: backfill root prompts from request YAML when missing/contaminated.
    if (
      item.previousIndex == null &&
      !item.previousInteractionId &&
      item.requestFile
    ) {
      const contaminated =
        !!item.userText &&
        /\n(size|images|aspectRatio|seed|text|voice):/.test(item.userText);
      if (!item.userText || contaminated) {
        const fromYaml = tryReadPromptFromYaml(item.requestFile);
        if (fromYaml && fromYaml !== item.userText) {
          item.userText = fromYaml;
          changed = true;
        }
      }
    }
  }

  const nextIndex =
    typeof raw.nextIndex === "number" && raw.nextIndex > maxAssigned
      ? raw.nextIndex
      : maxAssigned + 1;
  if (raw.nextIndex !== nextIndex) changed = true;

  return {
    store: {
      version: 1,
      nextIndex,
      interactions,
    },
    changed,
  };
}

function tryReadPromptFromYaml(requestFile: string): string | null {
  try {
    const parsed = parseStoredRequestFile(requestFile);
    if (parsed.request.type === "speech") {
      return parsed.request.params.text?.trim() || null;
    }
    return parsed.request.params.prompt?.trim() || null;
  } catch {
    return null;
  }
}

export function loadInteractions(dataDir = getDataDir()): InteractionsStore {
  const filePath = storePath(dataDir);
  try {
    const text = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(text) as InteractionsStore;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.interactions)) {
      return emptyStore();
    }
    const { store, changed } = migrateStore(parsed);
    if (changed) {
      saveInteractions(store, dataDir);
    }
    return store;
  } catch {
    return emptyStore();
  }
}

export function saveInteractions(
  store: InteractionsStore,
  dataDir = getDataDir(),
): void {
  ensureDir(dataDir);
  fs.writeFileSync(storePath(dataDir), JSON.stringify(store, null, 2), "utf-8");
}

export function addInteraction(
  interactionId: string,
  requestFile: string | null,
  tmpFile: string | null,
  dataDir = getDataDir(),
  previousInteractionId: string | null = null,
  userText: string | null = null,
): InteractionMapping {
  const store = loadInteractions(dataDir);
  const existing = store.interactions.findIndex(
    (item) => item.interactionId === interactionId,
  );

  let previousIndex: number | null = null;
  if (previousInteractionId) {
    const prev = store.interactions.find(
      (item) => item.interactionId === previousInteractionId,
    );
    previousIndex = prev?.index ?? null;
  }

  if (existing >= 0) {
    const prev = store.interactions[existing]!;
    const mapping: InteractionMapping = {
      ...prev,
      interactionId,
      requestFile,
      tmpFile,
      previousInteractionId,
      previousIndex:
        previousIndex ?? prev.previousIndex ?? null,
      userText: userText ?? prev.userText ?? null,
    };
    store.interactions[existing] = mapping;
    saveInteractions(store, dataDir);
    return mapping;
  }

  const mapping: InteractionMapping = {
    interactionId,
    requestFile,
    tmpFile,
    index: store.nextIndex,
    previousIndex,
    previousInteractionId,
    userText,
  };
  store.nextIndex += 1;
  store.interactions.push(mapping);
  saveInteractions(store, dataDir);
  return mapping;
}

/** Newest-first view (highest stable index first). */
export function getAllNewestFirst(dataDir = getDataDir()): InteractionMapping[] {
  return [...getAll(dataDir)].sort((a, b) => b.index - a.index);
}

/** Stable index for an interaction id, or null. */
export function indexOfId(
  interactionId: string,
  dataDir = getDataDir(),
): number | null {
  const mapping = getById(interactionId, dataDir);
  return mapping?.index ?? null;
}

/** Mapping at stable index. */
export function getByIndex(
  index: number,
  dataDir = getDataDir(),
): InteractionMapping | null {
  return getAll(dataDir).find((item) => item.index === index) ?? null;
}

/** @deprecated Use getByIndex — display index is now the stable index. */
export function getByDisplayIndex(
  index: number,
  dataDir = getDataDir(),
): InteractionMapping | null {
  return getByIndex(index, dataDir);
}

/** Highest assigned stable index, or null if empty. */
export function latestIndex(dataDir = getDataDir()): number | null {
  const all = getAll(dataDir);
  if (all.length === 0) return null;
  return Math.max(...all.map((item) => item.index));
}

export function removeInteraction(
  interactionId: string,
  dataDir = getDataDir(),
): InteractionMapping | null {
  const store = loadInteractions(dataDir);
  const index = store.interactions.findIndex(
    (item) => item.interactionId === interactionId,
  );
  if (index < 0) {
    return null;
  }

  const [removed] = store.interactions.splice(index, 1);
  // Do not reuse indexes — nextIndex stays as-is.
  saveInteractions(store, dataDir);
  return removed ?? null;
}

export function removeInteractionAndTmp(
  interactionId: string,
  dataDir = getDataDir(),
): InteractionMapping | null {
  const removed = removeInteraction(interactionId, dataDir);
  if (removed?.tmpFile) {
    const tmpPath = path.join(dataDir, "tmp", removed.tmpFile);
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // Ignore missing tmp files.
    }
  }
  return removed;
}

export function getById(
  interactionId: string,
  dataDir = getDataDir(),
): InteractionMapping | null {
  const store = loadInteractions(dataDir);
  return store.interactions.find((item) => item.interactionId === interactionId) ?? null;
}

export function getAll(dataDir = getDataDir()): InteractionMapping[] {
  return loadInteractions(dataDir).interactions;
}

/** @deprecated Use getByIndex */
export function getInteractionByIndex(
  index: number,
  dataDir = getDataDir(),
): InteractionMapping | null {
  return getByIndex(index, dataDir);
}

/** @deprecated Use getAll */
export function getAllInteractions(dataDir = getDataDir()): InteractionMapping[] {
  return getAll(dataDir);
}

export { getDataDir };
