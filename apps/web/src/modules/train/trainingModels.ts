import type { TrainingModelOption, TrainingParameterSpec, TrainingParameterValue, TrainingSettings } from "../../domain/types";

export type TrainingCategory = "clone" | "train";

export const CATEGORY_LABELS: Record<TrainingCategory, string> = {
  clone: "Nhái giọng",
  train: "Train giọng",
};

export function categoryOf(model: Pick<TrainingModelOption, "category" | "mode"> | null | undefined): TrainingCategory {
  if (model?.category) return model.category;
  return model?.mode === "zero-shot-clone" ? "clone" : "train";
}

/** The chosen option, or the first one that can run, or simply the first. */
export function selectedTrainingModel(models: TrainingModelOption[], settings: TrainingSettings): TrainingModelOption | null {
  return models.find((model) => model.id === settings.modelId)
    ?? models.find((model) => model.available)
    ?? models[0]
    ?? null;
}

/**
 * The user's changes for one option, limited to parameters it still declares.
 * A descriptor that renamed or removed a key must not turn an old saved value
 * into a start request the API refuses.
 */
export function parameterOverrides(model: TrainingModelOption, settings: TrainingSettings): Record<string, TrainingParameterValue> {
  const saved = settings.modelParameters?.[model.id] ?? {};
  const editable = new Set(model.parameters.filter((spec) => spec.editable).map((spec) => spec.key));
  return Object.fromEntries(Object.entries(saved).filter(([key]) => editable.has(key)));
}

export function parameterValue(spec: TrainingParameterSpec, overrides: Record<string, TrainingParameterValue>): TrainingParameterValue {
  return spec.editable && spec.key in overrides ? overrides[spec.key] : spec.default;
}

/** Why a value would be refused, in the same terms the API uses; null if fine. */
export function parameterProblem(spec: TrainingParameterSpec, value: TrainingParameterValue): string | null {
  if (value === null || value === "") {
    return spec.nullable || spec.kind === "text" ? null : "Cần có giá trị";
  }
  if (spec.kind === "int" || spec.kind === "float") {
    if (typeof value !== "number" || !Number.isFinite(value)) return "Phải là số";
    if (spec.kind === "int" && !Number.isInteger(value)) return "Phải là số nguyên";
    if (spec.min != null && value < spec.min) return `Tối thiểu ${spec.min}`;
    if (spec.max != null && value > spec.max) return `Tối đa ${spec.max}`;
  }
  if (spec.kind === "choice" && !spec.options.some((option) => option.value === value)) return "Không có trong danh sách";
  return null;
}

export function formatParameterValue(value: TrainingParameterValue | undefined): string {
  if (value === undefined) return "";
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "bật" : "tắt";
  return String(value);
}
