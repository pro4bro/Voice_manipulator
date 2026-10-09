import { deleteScriptWordText } from "./script-text-reconciliation";

// Only text identities cross this boundary; annotations stay in the UI snapshot.
self.onmessage = (event: MessageEvent<{ text: string; indexes: number[]; wordTexts: string[] }>) => {
  const { text, indexes, wordTexts } = event.data;
  self.postMessage({ text: deleteScriptWordText(text, indexes, wordTexts.map((word) => ({ text: word }))) });
};
