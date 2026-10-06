export interface TimestampPromotion { assetId: string | null; index: number | null }
export const TIMESTAMP_PROMOTION_EVENT = "pro4bro:timestamp-promotion";
export function promoteTimestampWord(assetId: string | null, index: number | null) {
  window.dispatchEvent(new CustomEvent<TimestampPromotion>(TIMESTAMP_PROMOTION_EVENT, { detail: { assetId, index } }));
}
