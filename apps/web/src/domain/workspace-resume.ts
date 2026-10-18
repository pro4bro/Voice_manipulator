/** A stable, project-local identity for the source shown in the workspace. */
export type ResumeSource =
  | { kind: "asset"; id: string; parentId?: string }
  | { kind: "obs"; id: string }
  | { kind: "output"; id: string };

const RECORD_VERSION = 1;
const STORAGE_PREFIX = "pro4bro:workspace-resume:v1";

export function resumeSourceKey(projectId: string): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(projectId)}:source`;
}

export function resumePositionKey(projectId: string): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(projectId)}:positions`;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validProjectId(value: unknown): value is string {
  return validId(value);
}

function normalizeSource(value: unknown): ResumeSource | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === "asset") {
    if (!validId(candidate.id)) return null;
    if (candidate.parentId !== undefined && !validId(candidate.parentId)) return null;
    if (Object.keys(candidate).some((key) => !["kind", "id", "parentId"].includes(key))) return null;
    return candidate.parentId === undefined
      ? { kind: "asset", id: candidate.id }
      : { kind: "asset", id: candidate.id, parentId: candidate.parentId as string };
  }
  if (candidate.kind === "obs" || candidate.kind === "output") {
    if (!validId(candidate.id) || Object.keys(candidate).some((key) => !["kind", "id"].includes(key))) return null;
    return { kind: candidate.kind, id: candidate.id };
  }
  return null;
}

function sourceIdentity(source: ResumeSource): string {
  return JSON.stringify([source.kind, source.id, source.kind === "asset" ? source.parentId ?? null : null]);
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function readSourceRecord(projectId: string): unknown {
  try {
    const raw = storage()?.getItem(resumeSourceKey(projectId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readPositions(projectId: string): Record<string, number> {
  try {
    const raw = storage()?.getItem(resumePositionKey(projectId));
    if (!raw) return {};
    const record = JSON.parse(raw) as unknown;
    if (!record || typeof record !== "object" || Array.isArray(record)) return {};
    const envelope = record as Record<string, unknown>;
    if (envelope.version !== RECORD_VERSION || Object.keys(envelope).some((key) => !["version", "positions"].includes(key))) return {};
    if (!envelope.positions || typeof envelope.positions !== "object" || Array.isArray(envelope.positions)) return {};
    const positions = envelope.positions as Record<string, unknown>;
    for (const [identity, seconds] of Object.entries(positions)) {
      let parsedIdentity: unknown;
      try { parsedIdentity = JSON.parse(identity); } catch { return {}; }
      if (!Array.isArray(parsedIdentity) || parsedIdentity.length !== 3) return {};
      const source = normalizeSource(parsedIdentity[0] === "asset"
        ? { kind: "asset", id: parsedIdentity[1], ...(parsedIdentity[2] === null ? {} : { parentId: parsedIdentity[2] }) }
        : { kind: parsedIdentity[0], id: parsedIdentity[1] });
      if (!source || sourceIdentity(source) !== identity || typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return {};
    }
    return positions as Record<string, number>;
  } catch {
    return {};
  }
}

export function loadResumeSource(projectId: string): ResumeSource | null {
  if (!validProjectId(projectId)) return null;
  const record = readSourceRecord(projectId);
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const envelope = record as Record<string, unknown>;
  if (envelope.version !== RECORD_VERSION || Object.keys(envelope).some((key) => !["version", "source"].includes(key))) return null;
  if (envelope.source === null) return null;
  return normalizeSource(envelope.source);
}

export function saveResumeSource(projectId: string, source: ResumeSource | null): void {
  if (!validProjectId(projectId)) return;
  const normalized = source === null ? null : normalizeSource(source);
  if (source !== null && !normalized) return;
  try {
    storage()?.setItem(resumeSourceKey(projectId), JSON.stringify({ version: RECORD_VERSION, source: normalized }));
  } catch {
    // Resume state is a convenience; unavailable or full storage is harmless.
  }
}

export function loadResumePosition(projectId: string, source: ResumeSource, duration?: number): number | null {
  if (!validProjectId(projectId)) return null;
  const normalized = normalizeSource(source);
  if (!normalized) return null;
  const value = readPositions(projectId)[sourceIdentity(normalized)];
  if (value === undefined) return null;
  return typeof duration === "number" && Number.isFinite(duration) && duration >= 0
    ? Math.min(value, duration)
    : value;
}

export function saveResumePosition(projectId: string, source: ResumeSource, seconds: number): void {
  if (!validProjectId(projectId) || !Number.isFinite(seconds) || seconds < 0) return;
  const normalized = normalizeSource(source);
  if (!normalized) return;
  const positions = readPositions(projectId);
  positions[sourceIdentity(normalized)] = seconds;
  try {
    storage()?.setItem(resumePositionKey(projectId), JSON.stringify({ version: RECORD_VERSION, positions }));
  } catch {
    // Resume state is a convenience; unavailable or full storage is harmless.
  }
}
