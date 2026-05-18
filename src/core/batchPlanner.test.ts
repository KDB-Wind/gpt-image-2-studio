import { describe, expect, it } from "vitest";
import {
  createTasksFromMultilinePrompts,
  createTasksFromRepeatedPrompt,
  createTasksFromSplitResults,
} from "./batchPlanner";

describe("batchPlanner", () => {
  it("creates repeated prompt tasks with sequence titles", () => {
    const tasks = createTasksFromRepeatedPrompt("A fox in watercolor", 3);
    expect(tasks.map((task) => task.title)).toEqual([
      "A fox in watercolor 1",
      "A fox in watercolor 2",
      "A fox in watercolor 3",
    ]);
    expect(tasks.map((task) => task.prompt)).toEqual([
      "A fox in watercolor",
      "A fox in watercolor",
      "A fox in watercolor",
    ]);
  });

  it("creates one task per non-empty line", () => {
    const tasks = createTasksFromMultilinePrompts("Argentina poster\n\nPortugal poster\n Japan poster ");
    expect(tasks.map((task) => task.prompt)).toEqual(["Argentina poster", "Portugal poster", "Japan poster"]);
  });

  it("uses split result titles and prompts", () => {
    const tasks = createTasksFromSplitResults([
      { title: "Argentina", prompt: "Argentina poster" },
      { title: "", prompt: "Portugal poster" },
    ]);
    expect(tasks.map((task) => task.title)).toEqual(["Argentina", "Portugal poster"]);
    expect(tasks.every((task) => task.status === "pending")).toBe(true);
  });
});
