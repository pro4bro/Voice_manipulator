import { ModuleFrame } from "../../ui/ModuleFrame";

const takes = [
  { type: "VO", title: "Campaign intro · take 04", time: "00:12.480" },
  { type: "DUB", title: "Scene 12 · Vietnamese", time: "00:38.120" },
  { type: "PATCH", title: "Fix pronunciation · AI", time: "00:03.840" },
];

export function RecentTakes() {
  return (
    <ModuleFrame eyebrow="RECENT TAKES" title="Bản gần đây" className="recent-takes-module">
      <div className="recent-takes">
        {takes.map((take) => (
          <button key={take.title} type="button">
            <span>{take.type}</span>
            <strong>{take.title}</strong>
            <small>{take.time}</small>
          </button>
        ))}
      </div>
    </ModuleFrame>
  );
}

