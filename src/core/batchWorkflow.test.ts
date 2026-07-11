import { describe, expect, it } from "vitest";

import { createTasksFromPromptList } from "./batchPlanner";
import {
  appendStyleLockToPrompt,
  buildBatchPromptRecipe,
  countRecoverableBatchTasks,
  formatBatchPromptRecipe,
  mergeRetriedBatchTask,
  resetFailedBatchTasks,
} from "./batchWorkflow";
import { DEFAULT_BATCH_EXECUTION_CONFIG } from "./batchTypes";

describe("batchWorkflow", () => {
  it("appends one batch-level style lock to a prompt", () => {
    const prompt = appendStyleLockToPrompt("Create a France World Cup poster.", "cinematic light, cream background");

    expect(prompt).toBe(
      "Create a France World Cup poster.\n\nBatch style lock: cinematic light, cream background",
    );
    expect(appendStyleLockToPrompt(prompt, "cinematic light, cream background")).toBe(prompt);
  });

  it("leaves prompts unchanged when the style lock is empty", () => {
    expect(appendStyleLockToPrompt("  Create a Japan poster.  ", "   ")).toBe("Create a Japan poster.");
  });

  it("counts pending and failed tasks as recoverable without counting succeeded tasks", () => {
    const tasks = createTasksFromPromptList(["one", "two", "three"]).map((task, index) => ({
      ...task,
      status: index === 0 ? ("succeeded" as const) : index === 1 ? ("failed" as const) : ("pending" as const),
    }));

    expect(countRecoverableBatchTasks(tasks)).toBe(2);
  });

  it("resets failed tasks for retry while preserving succeeded task outputs", () => {
    const tasks = createTasksFromPromptList(["one", "two"]).map((task, index) => ({
      ...task,
      status: index === 0 ? ("succeeded" as const) : ("failed" as const),
      outputPath: index === 0 ? "outputs/one.png" : "",
      errorMessage: index === 1 ? "timeout" : "",
      failureCategory: index === 1 ? ("timeout" as const) : null,
      attemptCount: index === 1 ? 2 : 1,
    }));

    const nextTasks = resetFailedBatchTasks(tasks);

    expect(nextTasks[0]).toMatchObject({ status: "succeeded", outputPath: "outputs/one.png" });
    expect(nextTasks[1]).toMatchObject({
      status: "pending",
      errorMessage: "",
      failureCategory: null,
      attemptCount: 0,
    });
  });

  it("merges a retried task into the latest task snapshot without replacing newer sibling state", () => {
    const originalTasks = createTasksFromPromptList(["one", "two"]);
    const latestTasks = [
      { ...originalTasks[0], status: "running" as const },
      { ...originalTasks[1], prompt: "two edited while retry was pending", status: "pending" as const },
    ];
    const retriedTask = {
      ...originalTasks[0],
      status: "succeeded" as const,
      outputPath: "outputs/one.png",
      previewUrl: "blob:one",
      attemptCount: 2,
    };

    const merged = mergeRetriedBatchTask(latestTasks, retriedTask);

    expect(merged[0]).toEqual(retriedTask);
    expect(merged[1]).toEqual(latestTasks[1]);
    expect(merged[1].prompt).toBe("two edited while retry was pending");
  });

  it("builds a versioned prompt recipe that can be copied or imported later", () => {
    const tasks = createTasksFromPromptList(["France poster", "Japan poster"]);
    const recipe = buildBatchPromptRecipe({
      title: "World Cup posters",
      source: "same-prompt",
      masterPrompt: "Create national team posters.",
      styleLock: "same poster composition and warm daylight",
      taskCount: 2,
      splitTemplateId: "basic",
      customSplitSystemPrompt: "",
      executionConfig: DEFAULT_BATCH_EXECUTION_CONFIG,
      tasks,
      generatedAt: "2026-05-23T00:00:00.000Z",
    });

    expect(recipe.schemaVersion).toBe(1);
    expect(recipe.workflowSteps.map((step) => step.id)).toEqual(["draft", "plan", "review", "generate", "recover"]);
    expect(recipe.styleLock).toBe("same poster composition and warm daylight");
    expect(recipe.tasks).toEqual([
      { title: "France poster", prompt: "France poster", suggestedName: undefined },
      { title: "Japan poster", prompt: "Japan poster", suggestedName: undefined },
    ]);
    expect(formatBatchPromptRecipe(recipe)).toContain("Prompt Recipe v1");
    expect(formatBatchPromptRecipe(recipe)).toContain("Style lock: same poster composition and warm daylight");
  });
});
