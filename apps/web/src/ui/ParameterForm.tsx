import { useState, type ReactNode } from "react";

import { formatParameterValue, parameterProblem, parameterValue } from "../modules/train/trainingModels";
import type { TrainingParameterSpec, TrainingParameterValue } from "../domain/types";

/**
 * Fields drawn from an engine descriptor's parameter specs.
 *
 * Shared by every place an engine exposes knobs - training models, voice
 * generators, and whatever capability a later repository brings - so a new
 * descriptor shows up with the same controls, hints and validation everywhere.
 */

interface ParameterFormOptions {
  /** Namespaces typed drafts, so switching descriptors does not carry text across. */
  scope: string;
  specs: TrainingParameterSpec[];
  overrides: Record<string, TrainingParameterValue>;
  onChange: (spec: TrainingParameterSpec, value: TrainingParameterValue) => void;
}

export interface ParameterForm {
  /** Keys whose current value the engine would refuse, with the reason. */
  problems: Array<readonly [string, string]>;
  basic: ReactNode;
  advanced: ReactNode;
  advancedCount: number;
  clearDrafts: () => void;
}

export function useParameterForm({ scope, specs, overrides, onChange }: ParameterFormOptions): ParameterForm {
  // What is typed into a number field while it has focus. "0." and "1e-" are
  // on their way to a number; re-rendering the parsed value would eat them.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftKey = (key: string) => `${scope}:${key}`;

  const problems = specs.flatMap((spec) => {
    const draft = drafts[draftKey(spec.key)];
    const typed = draft === undefined ? parameterValue(spec, overrides) : draftNumber(draft);
    const problem = typed === undefined ? "Chưa phải số hợp lệ" : parameterProblem(spec, typed);
    return problem ? [[spec.key, problem] as const] : [];
  });
  const problemByKey = Object.fromEntries(problems);

  function typeNumber(spec: TrainingParameterSpec, text: string) {
    setDrafts((current) => ({ ...current, [draftKey(spec.key)]: text }));
    const parsed = draftNumber(text);
    if (parsed === null ? spec.nullable : parsed !== undefined) onChange(spec, parsed ?? null);
  }

  function clearDraft(key: string) {
    setDrafts((current) => {
      if (!(key in current)) return current;
      const { [key]: _dropped, ...rest } = current;
      return rest;
    });
  }

  function renderField(spec: TrainingParameterSpec) {
    const value = parameterValue(spec, overrides);
    const changed = spec.editable && spec.key in overrides;
    const problem = problemByKey[spec.key];
    const disabled = !spec.editable;
    // null means the recipe does not set it / the engine has no default worth
    // naming, so there is nothing to compare against.
    const hint = [
      spec.recipe != null && spec.recipe !== spec.default ? `recipe ${formatParameterValue(spec.recipe)}` : null,
      spec.codeDefault != null && spec.codeDefault !== spec.default ? `code ${formatParameterValue(spec.codeDefault)}` : null,
    ].filter(Boolean).join(" · ");
    const title = [spec.help, spec.source ? `Nguồn: ${spec.source}` : null, `Key: ${spec.key}`].filter(Boolean).join("\n");

    if (spec.kind === "bool") {
      return (
        <label className={`train-param train-param--bool ${changed ? "is-changed" : ""}`} key={spec.key} title={title}>
          <input aria-label={spec.label} checked={value === true} disabled={disabled} onChange={(event) => onChange(spec, event.target.checked)} type="checkbox" />
          <span>{spec.label}{disabled ? <i className="train-param-lock">khoá</i> : null}</span>
          {hint ? <small>{hint}</small> : null}
        </label>
      );
    }

    let control;
    if (spec.kind === "choice") {
      control = (
        <select aria-label={spec.label} disabled={disabled} onChange={(event) => {
          const option = spec.options.find((item) => String(item.value) === event.target.value);
          if (option) onChange(spec, option.value);
        }} value={String(value)}>
          {spec.options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
        </select>
      );
    } else if (spec.kind === "text") {
      control = <input aria-label={spec.label} disabled={disabled} onChange={(event) => onChange(spec, spec.nullable && !event.target.value ? null : event.target.value)} placeholder={spec.nullable ? "tự động" : undefined} spellCheck={false} value={value === null ? "" : String(value)} />;
    } else {
      const draft = drafts[draftKey(spec.key)];
      control = (
        <input
          aria-invalid={problem ? true : undefined}
          aria-label={spec.label}
          disabled={disabled}
          inputMode={spec.kind === "int" ? "numeric" : "decimal"}
          onBlur={() => clearDraft(draftKey(spec.key))}
          onChange={(event) => typeNumber(spec, event.target.value)}
          placeholder={spec.nullable ? "không giới hạn" : undefined}
          value={draft ?? (value === null ? "" : String(value))}
        />
      );
    }

    return (
      <label className={`train-param ${spec.kind === "text" ? "train-param--wide" : ""} ${changed ? "is-changed" : ""} ${problem ? "is-invalid" : ""}`} key={spec.key} title={title}>
        <span>{spec.label}{disabled ? <i className="train-param-lock">khoá</i> : null}{spec.unit ? <em>{spec.unit}</em> : null}</span>
        {control}
        <small>{problem ?? hint}</small>
      </label>
    );
  }

  function renderGroups(items: TrainingParameterSpec[]) {
    const groups: [string, TrainingParameterSpec[]][] = [];
    for (const spec of items) {
      const group = groups.find(([name]) => name === spec.group);
      if (group) group[1].push(spec);
      else groups.push([spec.group, [spec]]);
    }
    return groups.map(([name, members]) => (
      <fieldset className="train-param-group" key={name}>
        <legend>{name}</legend>
        <div className="train-param-grid">{members.map(renderField)}</div>
      </fieldset>
    ));
  }

  const advancedSpecs = specs.filter((spec) => spec.advanced);
  return {
    problems,
    basic: renderGroups(specs.filter((spec) => !spec.advanced)),
    advanced: advancedSpecs.length ? (
      <details className="train-param-advanced">
        <summary>Nâng cao · {advancedSpecs.length}</summary>
        {renderGroups(advancedSpecs)}
      </details>
    ) : null,
    advancedCount: advancedSpecs.length,
    clearDrafts: () => setDrafts({}),
  };
}

/** null for an empty field, undefined for text that is not a number (yet). */
function draftNumber(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}
