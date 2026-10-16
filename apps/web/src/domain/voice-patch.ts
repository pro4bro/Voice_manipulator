export interface VoicePatchSource {
  outputId: string; rowId: string; sourceSha256: string; sourceMetadataSha256: string;
  scriptRevision: number; editRevision: number; startFrame: number; endFrame: number;
  sampleRate: number; text: string; replacementText: string; voiceId: string; speakerProfileId: string;
  status: "ready" | "stale" | "missing"; reason?: string | null; audioUrl: string; processingAvailable: boolean;
}
export interface VoicePatchDocument { revision: number; draft: VoicePatchSource | null }
