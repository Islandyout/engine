// Form editors for fields that are text underneath (0.77.0).
import { parseRoutineStops, routineActivities, serializeRoutineStops, type RoutineStop } from "./routineStops";

// Routine stops as rows of hour, x, z and activity, with add and remove.
// `commit` gets the text form back whenever a row changes.
export function routineStopsEditor(text: string, commit: (text: string) => void, help?: string): HTMLElement {
  const { stops, errors } = parseRoutineStops(text);
  const box = document.createElement("div");
  box.className = "stops-editor";
  box.setAttribute("aria-label", "Routine.stops");
  if (help) box.title = help;
  const heading = document.createElement("div");
  heading.className = "stops-row stops-head";
  for (const name of ["Hour", "X", "Z", "Activity", ""]) {
    const cell = document.createElement("span");
    cell.textContent = name;
    heading.append(cell);
  }
  box.append(heading);
  const rows = stops.map((s) => ({ ...s }));
  const save = () => commit(serializeRoutineStops(rows));
  rows.forEach((stop, i) => {
    const row = document.createElement("div");
    row.className = "stops-row";
    for (const field of ["hour", "x", "z"] as const) {
      const input = document.createElement("input");
      input.type = "number";
      input.step = field === "hour" ? "0.25" : "0.5";
      if (field === "hour") {
        input.min = "0";
        input.max = "23.99";
      }
      input.value = String(stop[field]);
      input.setAttribute("aria-label", `Stop ${i + 1} ${field}`);
      input.onchange = () => {
        const n = Number(input.value);
        if (Number.isFinite(n)) (stop as RoutineStop)[field] = n;
        save();
      };
      row.append(input);
    }
    const activity = document.createElement("select");
    activity.setAttribute("aria-label", `Stop ${i + 1} activity`);
    for (const word of new Set<string>([...routineActivities, stop.activity])) activity.add(new Option(word || "(walk on)", word));
    activity.value = stop.activity;
    activity.onchange = () => {
      stop.activity = activity.value;
      save();
    };
    row.append(activity);
    const remove = document.createElement("button");
    remove.className = "btn btn-sm btn-ghost";
    remove.textContent = "✕";
    remove.title = "Remove this stop";
    remove.setAttribute("aria-label", `Remove stop ${i + 1}`);
    remove.onclick = (event) => {
      event.preventDefault();
      rows.splice(i, 1);
      save();
    };
    row.append(remove);
    box.append(row);
  });
  const add = document.createElement("button");
  add.className = "btn btn-sm";
  add.textContent = "Add stop";
  add.onclick = (event) => {
    event.preventDefault();
    const last = rows[rows.length - 1];
    rows.push({ hour: last ? Math.min(23, last.hour + 1) : 8, x: last?.x ?? 0, z: last?.z ?? 0, activity: "" });
    save();
  };
  box.append(add);
  for (const message of errors) {
    const warn = document.createElement("p");
    warn.className = "component-issue";
    warn.textContent = `⚠ ${message}`;
    box.append(warn);
  }
  return box;
}
