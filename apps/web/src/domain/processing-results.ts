import type { ProjectMediaAsset, ProjectVoice, TrainingParameterValue, TrainingRun, VoiceOutput } from "./types";

const sameParameters = (actual: Record<string, TrainingParameterValue>, wanted: Record<string, TrainingParameterValue>) =>
  Object.keys(actual).length === Object.keys(wanted).length && Object.entries(wanted).every(([key, value]) => actual[key] === value);

/** A newer input or changed training settings needs another run for its speaker. */
export function completedTrainingTargets(targets: string[], modelId: string, parameters: Record<string, TrainingParameterValue>,
  runs: TrainingRun[], voices: ProjectVoice[], assets: ProjectMediaAsset[]): Set<string> {
  const inputs = assets.filter((asset) => asset.trainingSelected && asset.importSelected !== false && !asset.deletedAt && !asset.disabled);
  return new Set(targets.filter((id) => runs.some((run) => {
    if (run.status !== "complete" || run.speakerProfileId !== id || run.config.modelId !== modelId
      || !voices.some((voice) => voice.sourceRunId === run.id && voice.speakerProfileId === id && voice.modelId === modelId)) return false;
    if (!sameParameters(run.config.parameters ?? {}, parameters)) return false;
    return !inputs.some((asset) => (asset.speakerProfileIds.includes(id) || asset.words.some((word) => word.speakerId === id))
      && asset.updatedAt > run.createdAt);
  })));
}

const normalizedText = (text: string) => text.trim().replace(/\s+/gu, " ");

/** Count only published audio for the same row, voice, text and requested generator settings. */
export function completedGenerationRows(rows: Array<{ id: string; voiceId: string; text: string }>, outputs: VoiceOutput[],
  parameters: Record<string, Record<string, TrainingParameterValue>>,
  rowParameters: Record<string, Record<string, TrainingParameterValue>> = {}): Set<string> {
  return new Set(rows.filter((row) => outputs.some((output) => output.audioPath && output.audioAvailable !== false && output.segments?.some((segment) => {
    if (segment.rowId !== row.id || segment.voiceId !== row.voiceId || normalizedText(segment.text) !== normalizedText(row.text)) return false;
    const generators = output.parameters.generators as unknown as Record<string, Record<string, TrainingParameterValue>> | undefined;
    const madeWith = generators?.[segment.generatorId];
    const wanted = rowParameters[row.id] ?? parameters[segment.generatorId] ?? {};
    return sameParameters(madeWith ?? {}, wanted);
  }))).map((row) => row.id));
}
