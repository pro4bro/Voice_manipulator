export function recordingName(started: Date, projectName: string, source: "MIC" | "SYS" | "LIV", id: string): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const timestamp = Number.isNaN(started.getTime()) ? "unknown-time" : `${started.getFullYear()}-${pad(started.getMonth() + 1)}-${pad(started.getDate())}_${pad(started.getHours())}-${pad(started.getMinutes())}-${pad(started.getSeconds())}`;
  const project = projectName.trim().replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-|-$/g, "") || "project";
  return `${timestamp}_${project}_${source}_${id.slice(0, 8)}`;
}
