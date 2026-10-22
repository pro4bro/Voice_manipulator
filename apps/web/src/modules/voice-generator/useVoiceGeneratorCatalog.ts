import { useEffect } from "react";
import { api } from "../../api/client";
import type { TrainingModelOption } from "../../domain/types";

/** Metadata arrives before potentially slow private-runtime import checks. */
export function useVoiceGeneratorCatalog(projectId: string, attempt: number,
  onOptions: (options: TrainingModelOption[]) => void, onError: (message: string) => void) {
  useEffect(() => {
    if (typeof api.getVoiceGenerators !== "function") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const read = async () => {
      try {
        const options = await api.getVoiceGenerators();
        if (cancelled) return;
        failures = 0;
        onOptions(options);
        if (options.some((option) => option.status.startsWith("Đang kiểm tra runtime/model"))) {
          timer = setTimeout(() => { void read(); }, 2000);
        }
      } catch (error) {
        if (cancelled) return;
        if (++failures < 3) timer = setTimeout(() => { void read(); }, 2000);
        else onError(error instanceof Error ? error.message : "Không đọc được danh sách engine tạo giọng.");
      }
    };
    void read();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [projectId, attempt, onOptions, onError]);
}
