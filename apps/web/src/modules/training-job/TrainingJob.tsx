import { ModuleFrame } from "../../ui/ModuleFrame";

export function TrainingJob() {
  return (
    <ModuleFrame eyebrow="TRAINING JOB" title="Dataset readiness" className="training-job-module" tone="warm">
      <div className="training-score">
        <div><strong>72</strong><span>/100</span></div>
        <p><b>Cần duyệt transcript</b><span>18 phút audio · 126 segments</span></p>
      </div>
      <ol className="training-stages">
        <li className="is-ready"><i />Audio clean-up <span>READY</span></li>
        <li className="is-active"><i />Transcript review <span>18 OPEN</span></li>
        <li><i />Tokenize dataset <span>WAITING</span></li>
        <li><i />Fine-tune checkpoint <span>WAITING</span></li>
      </ol>
      <button className="button button--accent button--full" disabled type="button">Bắt đầu training</button>
    </ModuleFrame>
  );
}

