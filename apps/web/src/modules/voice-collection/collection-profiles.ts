import type { VoiceCollection } from "../../domain/types";

export function collectionProfileCount(collections: VoiceCollection[]): number {
  return new Set(collections.flatMap((collection) => collection.entries.map((entry) =>
    JSON.stringify([entry.sourceProjectId, entry.speaker.id])))).size;
}
