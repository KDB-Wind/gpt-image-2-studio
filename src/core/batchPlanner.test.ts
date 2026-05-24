import { describe, expect, it } from "vitest";
import {
  createTasksFromMultilinePrompts,
  createTasksFromPromptList,
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

  it("applies a batch style lock to repeated prompt tasks", () => {
    const tasks = createTasksFromRepeatedPrompt("A fox in watercolor", 2, {
      styleLock: "soft daylight and warm paper texture",
    });

    expect(tasks.map((task) => task.prompt)).toEqual([
      "A fox in watercolor\n\nBatch style lock: soft daylight and warm paper texture",
      "A fox in watercolor\n\nBatch style lock: soft daylight and warm paper texture",
    ]);
  });

  it("creates one task per non-empty line", () => {
    const tasks = createTasksFromMultilinePrompts("Argentina poster\n\nPortugal poster\n Japan poster ");
    expect(tasks.map((task) => task.prompt)).toEqual(["Argentina poster", "Portugal poster", "Japan poster"]);
  });

  it("creates one task per non-empty custom prompt field", () => {
    const tasks = createTasksFromPromptList(["France poster", "", " Japan poster "]);
    expect(tasks.map((task) => task.prompt)).toEqual(["France poster", "Japan poster"]);
    expect(tasks.map((task) => task.title)).toEqual(["France poster", "Japan poster"]);
  });

  it("caps repeated prompt batches at twenty tasks", () => {
    expect(createTasksFromRepeatedPrompt("A fox in watercolor", 21)).toHaveLength(20);
  });

  it("uses split result titles and prompts", () => {
    const tasks = createTasksFromSplitResults([
      { title: "Argentina", prompt: "Argentina poster" },
      { title: "", prompt: "Portugal poster" },
    ]);
    expect(tasks.map((task) => task.title)).toEqual(["Argentina", "Portugal poster"]);
    expect(tasks.every((task) => task.status === "pending")).toBe(true);
  });

  it("carries planner metadata from split results into draft tasks", () => {
    const tasks = createTasksFromSplitResults([
      {
        title: "France poster",
        prompt: "Create a France poster.",
        suggestedName: "france-world-cup-poster",
        notes: "Use French headline text.",
      },
    ]);

    expect(tasks[0]).toMatchObject({
      title: "France poster",
      suggestedName: "france-world-cup-poster",
      plannerNotes: "Use French headline text.",
    });
  });

  it("applies a batch style lock to split result prompts", () => {
    const tasks = createTasksFromSplitResults([{ title: "France poster", prompt: "Create a France poster." }], {
      styleLock: "consistent poster grid and cream background",
    });

    expect(tasks[0].prompt).toBe(
      "Create a France poster.\n\nBatch style lock: consistent poster grid and cream background",
    );
  });
});
