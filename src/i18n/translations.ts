import type { UiLanguage } from "../core/config";
import type { BatchSplitTemplateId } from "../core/batchTypes";
import { classifyErrorForUser } from "../core/errorClassifier";

export type { UiLanguage } from "../core/config";

export const DEFAULT_LANGUAGE: UiLanguage = "zh-CN";

type TranslationBundle = {
  app: {
    eyebrow: string;
    title: string;
    subtitle: string;
    runtimeLoading: string;
    runtimeDesktop: string;
    runtimeWeb: string;
    languageLabel: string;
    statusLabel: string;
    environment: string;
  };
  tabs: {
    generate: string;
    batch: string;
    history: string;
    settings: string;
  };
  batch: {
    title: string;
    description: string;
    emptyTasks: string;
    defaultsNote: string;
    aiSplit: {
      title: string;
      description: string;
      guideTitle: string;
    };
    workflow: {
      title: string;
      description: string;
      styleLockPlaceholder: string;
      styleLockHint: string;
      styleLockGeneratedHint: string;
    };
    recipe: {
      advancedTitle: string;
      title: string;
      description: string;
      outputDescription: string;
    };
    sources: {
      samePrompt: string;
      customPrompts: string;
    };
    referenceImages: {
      title: string;
      description: string;
      scopeHint: string;
      summary: (count: number, max: number) => string;
      taskTitle: string;
      taskDescription: string;
      taskScopeHint: string;
      taskSessionHint: string;
      taskSummary: (count: number, max: number) => string;
      taskInputLabel: (index: number) => string;
      useGlobalLabel: string;
      useGlobalForTask: (index: number) => string;
      usesGlobalHint: string;
      expandAllTaskReferences: string;
      collapseAllTaskReferences: string;
    };
    splitTemplates: Record<BatchSplitTemplateId, { label: string; description: string; useCase: string }>;
    fields: {
      batchTitle: string;
      taskCount: string;
      customPrompt: (index: number) => string;
      masterPrompt: string;
      styleLock: string;
      splitTemplate: string;
      customSplitSystemPrompt: string;
      suggestedName: string;
      plannerNotes: string;
      concurrency: string;
      intervalSeconds: string;
      maxRetries: string;
      executionNotes: string;
      autoPlanTaskCount: string;
      autoPlanTaskCountHint: string;
    };
    actions: {
      createTasks: string;
      splitWithTextModel: string;
      splitBusy: string;
      addPrompt: string;
      removePrompt: string;
      start: string;
      pause: string;
      continue: string;
      continueUnfinished: string;
      cancel: string;
      retryTask: string;
      retryFailed: string;
      applyStyleLock: string;
      generateRecipe: string;
      copyRecipe: string;
      saveDefaults: string;
      clearDraft: string;
    };
    status: {
      draft: string;
      running: string;
      paused: string;
      cancelled: string;
      completed: string;
      pending: string;
      succeeded: string;
      failed: string;
      skipped: string;
    };
    messages: {
      promptRequired: string;
      maxTaskCountWarning: (max: number) => string;
      batchComplete: (success: number, failed: number, skipped: number) => string;
      saveSummary: (success: number, authorized: number, fallback: number) => string;
      splitRunning: string;
      splitSuccess: (count: number) => string;
      taskCountAdjustedByAi: (count: number, reason?: string) => string;
      aiCountMismatch: (recommended: number, actual: number) => string;
      fixedAiCountMismatch: (expected: number, actual: number) => string;
      aiCountOverLimitConfirm: (requested: number, max: number) => string;
      aiCountOverLimitCancelled: string;
      aiCountLimitedAfterConfirmation: (requested: number, max: number) => string;
      splitFailed: (detail: string) => string;
      costRiskPaused: string;
      authPaused: string;
      styleLockRequired: string;
      styleLockSaved: string;
      styleLockApplied: (count: number) => string;
      recipeReady: string;
      recipeCopied: string;
      recipeCopyUnavailable: string;
      recipeCopyFailed: (detail: string) => string;
    };
  };
  modes: {
    textToImage: string;
    imageToImage: string;
  };
  actions: {
    optimize: string;
    optimizeBusy: string;
    clearOptimized: string;
    generate: string;
    generateBusy: string;
    reusePrompt: string;
    openOutput: string;
    chooseDirectory: string;
    chooseImage: string;
    changeImage: string;
    removeImage: string;
    clearImages: string;
    editFromImage: string;
    save: string;
    saveBusy: string;
    testOutputDirectory: string;
    testOutputDirectoryBusy: string;
    testText: string;
    testTextBusy: string;
    testImage: string;
    testImageBusy: string;
    testImageEdit: string;
    testImageEditBusy: string;
    checkUpdates: string;
    openLatestVersion: string;
    openArchivedVersion: string;
    viewMinimalApiExample: string;
    startUsing: string;
    skip: string;
    close: string;
    enlarge: string;
    openRecommended: string;
    openGithubProject: string;
    inspect: string;
    viewLarge: string;
    inspectBatch: string;
    expandBatch: string;
    collapseBatch: string;
  };
  panel: {
    generateTitle: string;
    generateDescription: string;
    historyToolsTitle: string;
    historyToolsDescription: string;
    settingsTitle: string;
    settingsDescription: string;
    previewTitle: string;
    previewIdleDescription: string;
    previewRunningDescription: string;
    historyTitle: string;
    historyDescription: string;
  };
  fields: {
    prompt: string;
    promptPlaceholder: string;
    customName: string;
    customNamePlaceholder: string;
    effectivePrompt: string;
    effectivePromptPlaceholder: string;
    optimizedPrompt: string;
    optimizedPromptPlaceholder: string;
    baseUrl: string;
    apiKey: string;
    rememberApiKey: string;
    textModel: string;
    imageModel: string;
    timeoutSeconds: string;
    outputDirectory: string;
    defaultOutputCard: string;
    imageCount: string;
    version: string;
    referenceImage: string;
    referenceImagePlaceholder: string;
    defaultSize: string;
    defaultQuality: string;
    defaultFormat: string;
    defaultCompression: string;
    imageResponseMode: string;
    customWidth: string;
    customHeight: string;
    editInstructions: string;
    editInstructionsPlaceholder: string;
  };
  options: {
    sizeAuto: string;
    size1kSquare: string;
    size1kLandscape: string;
    size1kPortrait: string;
    size2kSquare: string;
    size2kLandscape: string;
    size4kLandscape: string;
    size4kPortrait: string;
    sizeCustom: string;
    qualityAuto: string;
    qualityLow: string;
    qualityMedium: string;
    qualityHigh: string;
    formatPng: string;
    formatJpeg: string;
    formatWebp: string;
    enabled: string;
    disabled: string;
    imageResponseModeOfficial: string;
    imageResponseModeForceBase64: string;
  };
  quickOptions: {
    title: string;
    size: string;
    aspect: string;
    resolution: string;
    quality: string;
    ratioAuto: string;
    ratioTall: string;
    ratioPortrait: string;
    ratioSquare: string;
    ratioLandscape: string;
    ratioWide: string;
    resolutionAuto: string;
    resolution1k: string;
    resolution2k: string;
    resolution4k: string;
    customResolution: string;
    hint: string;
    providerHint: string;
  };
  sections: {
    connection: string;
    defaults: string;
    output: string;
    version: string;
  };
  cards: {
    currentOutput: string;
    totalRecords: string;
    dateGroups: string;
    selectedRun: string;
    lastSelectedHistoryItem: string;
    savedImage: string;
    selectedHistoryItem: string;
    versionInfo: string;
    welcomeIntro: string;
    welcomeRecommended: string;
    welcomeQuickStart: string;
    referenceImages: string;
    openSourceTitle: string;
    openSourceHint: string;
    editFromImageTitle: string;
  };
  labels: {
    imageModel: string;
    outputDirectory: string;
    timeout: string;
    created: string;
    duration: string;
    outputPath: string;
    customName: string;
    status: string;
    model: string;
    dateGroups: string;
    totalRecords: string;
    currentVersion: string;
    latestVersion: string;
    archivedVersion: string;
    mode: string;
    sourceImages: string;
    size: string;
    quality: string;
    format: string;
    compression: string;
    batch: string;
    tasks: string;
    saveMode: string;
  };
  preview: {
    idle: string;
    running: string;
    failed: string;
    history: string;
    idleBody: string;
    runningHint: string;
    elapsedPrefix: string;
    autoNamed: string;
    batch: string;
    batchBody: string;
    batchLatest: string;
    batchGallery: string;
    batchNoImage: string;
    batchRunning: (title: string) => string;
    batchHistoryBody: string;
  };
  help: {
    imageOptions: string;
    referenceImages: string;
    connectionNotes: string;
    defaultParameterNotes: string;
    outputFolderNotes: string;
    imageToImageTestNotes: string;
    historyPreviewTroubleshooting: string;
    historyPreviewMissingShort: string;
  };
  empty: {
    noHistorySelected: string;
    noHistorySaved: string;
    loadingRuntime: string;
    noReferenceImages: string;
  };
  notes: {
    optimizedPromptLinked: string;
    openOutputDesktopOnly: string;
    webHistoryUnavailable: string;
    defaultsDescription: string;
    outputDescription: string;
    outputDirectoryPermissionHint: string;
    outputDirectoryStatusTitle: string;
    outputDirectoryStatusBody: (directory: string, testAction: string) => string;
    outputDirectoryStateUnsupported: string;
    outputDirectoryStateNotAuthorized: string;
    outputDirectoryStatePermissionRequired: (directory: string) => string;
    outputDirectoryStateReady: (directory: string, lastTestedAt: string) => string;
    currentVersionManualUpdate: string;
    versionSwitchHint: string;
    referenceImageHint: string;
    imageToImageModeDescription: string;
    imageEditTestDescription: string;
    referenceImageLimitHint: string;
    dragAndDropHint: string;
    sizeConstraintsHint: string;
    customSizeHint: string;
    compressionHint: string;
    compressionUnavailable: string;
    imageResponseModeHint: string;
    apiKeyStorageHint: string;
    apiKeySessionOnlyHint: string;
    apiKeyMemoryOnlyHint: string;
  };
  welcome: {
    title: string;
    intro: string;
    recommendedTitle: string;
    recommendedBody: string;
    quickStartTitle: string;
    quickStartBody: string;
    setupChecklistTitle: string;
    setupChecklistItems: string[];
  };
  messages: {
    runtimeLoaded: (mode: string) => string;
    runtimeLoadFailed: (detail: string) => string;
    promptChangedCleared: string;
    promptRequiredForOptimize: string;
    promptRequiredForGenerate: string;
    referenceImageRequired: string;
    referenceImageInvalid: string;
    referenceImagesAdded: (addedCount: number, totalCount: number) => string;
    referenceImagesInvalidSkipped: (count: number) => string;
    referenceImagesOverflowSkipped: (count: number, maxCount: number) => string;
    referenceImagesCleared: string;
    referenceImageRemoved: (fileName: string) => string;
    actionNeedsValidSettings: (actionLabel: string, details: string) => string;
    optimizationDiscarded: string;
    optimizationFailed: (detail: string) => string;
    generationNoImages: string;
    settingsSaved: string;
    settingsSavedWithIssues: (details: string) => string;
    settingsSaveFailed: (detail: string) => string;
    outputSelected: (directory: string) => string;
    chooseDirectoryUnavailableWeb: string;
    chooseDirectoryCancelled: string;
    chooseDirectoryFailed: (detail: string) => string;
    outputDirectoryTestSuccess: (fileName: string, bytes: number) => string;
    outputDirectoryTestFailed: (detail?: string) => string;
    textTestSuccess: (response: string) => string;
    textTestFailed: (detail: string) => string;
    imageTestSuccess: (count: number) => string;
    imageTestFailed: (detail: string) => string;
    imageEditTestSuccess: (count: number) => string;
    imageEditTestFailed: (detail: string) => string;
    openOutputFailed: (detail: string) => string;
    historyPreviewUnavailable: string;
    historyPreviewFileMissing: string;
    historyPreviewPreparationFailed: (detail: string) => string;
    editFromImageReady: string;
    editFromImageUnavailable: string;
    generatedPreviewLoadFailed: string;
    saveModeAuthorizedDirectory: string;
    saveModeBrowserDownload: string;
    saveFallbackToBrowserDownload: (detail: string) => string;
    updateStatus: (version: string) => string;
  };
  validation: Record<string, string>;
};

const translations: Record<UiLanguage, TranslationBundle> = {
  "zh-CN": {
    app: {
      eyebrow: "WINDOWS 优先桌面工具",
      title: "本地生图工作台",
      subtitle:
        "输入提示词，按需优化，支持文生图和图生图，并把结果按日期保存到当前用户的本地目录。",
      runtimeLoading: "正在加载运行环境",
      runtimeDesktop: "桌面模式",
      runtimeWeb: "网页模式",
      languageLabel: "界面语言",
      statusLabel: "当前状态",
      environment: "当前运行环境",
    },
    tabs: {
      generate: "单图",
      batch: "批量",
      history: "历史",
      settings: "设置",
    },
    batch: {
      title: "批量生图",
      description: "支持同一提示词生成多张，也支持一次填写多条不同提示词，再按可控节奏逐张生成。",
      emptyTasks: "先生成任务列表，再逐条微调提示词并开始批量生图。",
      defaultsNote: "任务数量、并发、间隔和重试次数会跟随配置保存；修改后请到“设置”页保存配置。",
      aiSplit: {
        title: "AI 批量任务规划",
        description: "把一个创作目标拆成多条可执行生图任务，包括标题、提示词、建议命名和规划说明。",
        guideTitle: "不知道怎么选？",
      },
      workflow: {
        title: "Prompt 工作流",
        description: "把主任务整理成任务列表，锁定统一风格，生成可复用的 Prompt Recipe，并在失败后继续执行。",
        styleLockPlaceholder: "例如：同一套杂志封面构图、暖色自然光、奶油白背景、细腻胶片质感。",
        styleLockHint: "可选。生成任务列表或 AI 规划任务时，会自动带入每个子任务。",
        styleLockGeneratedHint: "当前任务列表已生成；如果修改了这里的风格要求，请重新生成或重新规划任务列表。",
      },
      recipe: {
        advancedTitle: "高级：导出批次文本",
        title: "批次导出文本",
        description: "把当前批次的任务、提示词、风格要求和执行参数整理成一段文本，方便保存或分享。",
        outputDescription: "这段文本只用于保存和复用当前批次，不会自动导入或自动执行。",
      },
      sources: {
        samePrompt: "同一提示词生成多张",
        customPrompts: "自定义多条提示词",
      },
      referenceImages: {
        title: "批量参考图（图生图）",
        description: "可选。这里上传的参考图会随每一个子任务一起发送给图像模型，适合用同一组参考图生成一整批图片。",
        scopeHint: "这些图片只作用于批量页，不会读取“单图”里的参考图。",
        summary: (count, max) => `批量参考图：${count}/${max}`,
        taskTitle: "专属参考图",
        taskDescription: "可选。这里上传的图片只随当前子任务发送，适合每张图使用不同人物、商品或构图参考。",
        taskScopeHint: "默认会同时使用上方的批量参考图；如果当前任务只想用自己的图片，可以取消勾选。",
        taskSessionHint: "参考图只在当前页面会话中保留，刷新页面后需要重新选择。",
        taskSummary: (count, max) => `专属参考图：${count}/${max}`,
        taskInputLabel: (index) => `第 ${index} 个任务的专属参考图`,
        useGlobalLabel: "使用批量参考图",
        useGlobalForTask: (index) => `第 ${index} 个任务使用批量参考图`,
        usesGlobalHint: "同时使用批量参考图",
        expandAllTaskReferences: "展开全部专属参考图",
        collapseAllTaskReferences: "收起全部",
      },
      splitTemplates: {
        basic: {
          label: "推荐：自动拆分",
          description: "不知道怎么选就用这个。它会按任务数量拆成多条独立提示词。",
          useCase: "适合国家、人物、商品、地点等一组不同主体。",
        },
        "style-consistent": {
          label: "保持同一画风",
          description: "更强调构图、光影、色彩、镜头语言一致。",
          useCase: "适合一组海报、头像、封面或商品图，希望看起来像同一套设计。",
        },
        series: {
          label: "系列组图",
          description: "更强调每张图有不同主题，但整体属于同一系列。",
          useCase: "适合按章节、节日、城市、品牌活动等主题拆成一组图。",
        },
        custom: {
          label: "我自己写规则",
          description: "高级用户可以自己写拆分要求，控制文字模型怎么拆。",
          useCase: "适合你已经知道想让文字模型遵守哪些固定规则。",
        },
      },
      fields: {
        batchTitle: "批次名称",
        taskCount: "任务数量",
        customPrompt: (index) => `提示词 ${index}`,
        masterPrompt: "主任务",
        styleLock: "批次级风格锁定",
        splitTemplate: "拆分规则",
        customSplitSystemPrompt: "自定义拆分系统提示词",
        suggestedName: "建议命名",
        plannerNotes: "规划说明",
        concurrency: "并发数",
        intervalSeconds: "间隔秒数",
        maxRetries: "失败重试次数",
        executionNotes: "执行参数说明",
        autoPlanTaskCount: "让 AI 自动调整任务数量",
        autoPlanTaskCountHint:
          "开启后，规划任务列表时文字模型会返回 recommendedCount，并可把任务数量自动改成更符合主任务的数量。关闭后始终按你填写的任务数量拆分。",
      },
      actions: {
        createTasks: "生成任务列表",
        splitWithTextModel: "规划任务列表",
        splitBusy: "正在规划...",
        addPrompt: "添加提示词",
        removePrompt: "删除",
        start: "开始批量生成",
        pause: "暂停",
        continue: "继续",
        continueUnfinished: "继续未完成",
        cancel: "取消剩余任务",
        retryTask: "重试该任务",
        retryFailed: "重试失败项",
        applyStyleLock: "应用风格锁定",
        generateRecipe: "生成导出文本",
        copyRecipe: "复制导出文本",
        saveDefaults: "保存批量默认值",
        clearDraft: "清空当前批量",
      },
      status: {
        draft: "草稿",
        running: "运行中",
        paused: "已暂停",
        cancelled: "已取消",
        completed: "已完成",
        pending: "等待中",
        succeeded: "成功",
        failed: "失败",
        skipped: "已跳过",
      },
      messages: {
        promptRequired: "请先输入提示词或主任务。",
        maxTaskCountWarning: (max) => `一次最多建议 ${max} 个任务，数量过多可能触发供应商限流或失败，已自动限制为 ${max}。`,
        batchComplete: (success, failed, skipped) => `批量完成：成功 ${success}，失败 ${failed}，跳过 ${skipped}。`,
        saveSummary: (success, authorized, fallback) =>
          `生成成功 ${success}，保存到授权目录 ${authorized}，回退为浏览器下载 ${fallback}。`,
        splitRunning: "正在调用文字模型规划任务，请稍候。",
        splitSuccess: (count) => `文字模型已规划出 ${count} 个任务。`,
        taskCountAdjustedByAi: (count, reason) =>
          `AI 判断该主任务更适合拆分为 ${count} 个任务，已自动调整任务数量。若不需要某一项，可以在任务列表中删除。${
            reason ? ` 判断依据：${reason}` : ""
          }`,
        aiCountMismatch: (recommended, actual) =>
          `文字模型推荐 ${recommended} 个任务，但实际返回 ${actual} 个。请重试规划；当前任务列表未更改。`,
        fixedAiCountMismatch: (expected, actual) =>
          `AI 自动调整任务数量已关闭，应严格返回 ${expected} 个任务，但实际返回 ${actual} 个。请重试规划；当前任务列表未更改。`,
        aiCountOverLimitConfirm: (requested, max) =>
          `文字模型返回了 ${requested} 个任务，超过单批最多 ${max} 个的硬性限制。是否明确使用前 ${max} 个任务？取消不会更改当前任务列表。`,
        aiCountOverLimitCancelled: "已取消采用超限的 AI 规划，当前任务列表未更改。",
        aiCountLimitedAfterConfirmation: (requested, max) =>
          `文字模型返回了 ${requested} 个任务。经你确认，已采用前 ${max} 个；其余 ${requested - max} 个因硬性上限未加入。`,
        splitFailed: (detail) => `文字模型规划失败。${detail}`,
        costRiskPaused: "供应商返回可能已产生费用但没有图片的异常，批次已暂停。确认后再继续。",
        authPaused: "API key 或权限异常，批次已暂停。请先检查设置。",
        styleLockRequired: "请先填写批次级风格锁定内容。",
        styleLockSaved: "风格锁定已记录。生成任务列表或 AI 规划时会自动带入。",
        styleLockApplied: (count) => `已把风格锁定应用到 ${count} 个任务。`,
        recipeReady: "批次导出文本已生成，可以复制保存或发给别人复用。",
        recipeCopied: "批次导出文本已复制。",
        recipeCopyUnavailable: "当前浏览器不允许直接复制。你可以手动选中导出文本复制。",
        recipeCopyFailed: (detail) => `复制批次导出文本失败。${detail}`,
      },
    },
    modes: {
      textToImage: "文生图",
      imageToImage: "图生图",
    },
    actions: {
      optimize: "优化提示词",
      optimizeBusy: "正在优化...",
      clearOptimized: "清空优化稿",
      generate: "生成图片",
      generateBusy: "正在生成...",
      reusePrompt: "复用提示词",
      openOutput: "打开输出位置",
      chooseDirectory: "选择并授权目录",
      chooseImage: "选择图片",
      changeImage: "继续添加图片",
      removeImage: "移除",
      clearImages: "清空全部",
      editFromImage: "基于此图修改",
      save: "保存配置",
      saveBusy: "正在保存...",
      testOutputDirectory: "测试保存目录",
      testOutputDirectoryBusy: "测试中...",
      testText: "测试文字模型",
      testTextBusy: "测试中...",
      testImage: "测试文生图",
      testImageBusy: "测试中...",
      testImageEdit: "测试图生图",
      testImageEditBusy: "测试中...",
      checkUpdates: "检查更新",
      openLatestVersion: "打开最新版",
      openArchivedVersion: "打开当前固定版",
      viewMinimalApiExample: "查看最小 API 调用示例",
      startUsing: "开始使用",
      skip: "跳过",
      close: "关闭",
      enlarge: "点击放大",
      openRecommended: "前往推荐中转站",
      openGithubProject: "在 GitHub 查看",
      inspect: "查看",
      viewLarge: "放大查看",
      inspectBatch: "查看批次",
      expandBatch: "展开批次",
      collapseBatch: "收起批次",
    },
    panel: {
      generateTitle: "生成工作区",
      generateDescription: "在这里编写提示词，可选填写图片名称，并按需选择文生图或图生图。",
      historyToolsTitle: "历史工具",
      historyToolsDescription: "查看过往记录、复用提示词，或者打开已经保存的本地图片。",
      settingsTitle: "连接与默认值",
      settingsDescription: "填写 API key、Base URL、模型名、输出目录和图像输出参数，并按需做连通性测试。",
      previewTitle: "结果预览",
      previewIdleDescription: "这里会显示当前生成状态和最近一次预览。",
      previewRunningDescription: "图片生成进行中，请耐心等待。",
      historyTitle: "历史记录",
      historyDescription: "按日期分组展示本地保存记录，方便回看与复用。",
    },
    fields: {
      prompt: "提示词",
      promptPlaceholder: "请描述你想生成或修改的画面内容、风格、构图和氛围。",
      customName: "图片名称",
      customNamePlaceholder: "可选；不填则按时间和提示词自动命名",
      effectivePrompt: "实际发送内容",
      effectivePromptPlaceholder: "未填写优化稿时，会直接使用上方提示词。",
      optimizedPrompt: "优化后的提示词",
      optimizedPromptPlaceholder: "可选；你也可以手动修改这里的内容后再生成。",
      baseUrl: "Base URL",
      apiKey: "API key",
      rememberApiKey: "在此设备上记住 API key",
      textModel: "文字模型",
      imageModel: "生图模型",
      timeoutSeconds: "超时时间（秒）",
      outputDirectory: "保存目录",
      defaultOutputCard: "当前输出设置",
      imageCount: "图片数量",
      version: "版本号",
      referenceImage: "参考图",
      referenceImagePlaceholder: "拖拽图片到这里，或从文件夹中选择多张图片。",
      defaultSize: "默认尺寸",
      defaultQuality: "默认质量",
      defaultFormat: "默认格式",
      defaultCompression: "默认压缩",
      imageResponseMode: "图片响应兼容模式",
      customWidth: "自定义宽度",
      customHeight: "自定义高度",
      editInstructions: "修改要求",
      editInstructionsPlaceholder: "例如：保留主体和构图，把背景改成傍晚街景，文字更简洁。",
    },
    options: {
      sizeAuto: "自动（由模型决定）",
      size1kSquare: "1K 方图 1024x1024",
      size1kLandscape: "1K 横图 1536x1024",
      size1kPortrait: "1K 竖图 1024x1536",
      size2kSquare: "2K 方图 2048x2048（实验）",
      size2kLandscape: "2K 横图 2048x1152",
      size4kLandscape: "4K 横图 3840x2160（实验）",
      size4kPortrait: "4K 竖图 2160x3840（实验）",
      sizeCustom: "自定义尺寸（高级）",
      qualityAuto: "自动",
      qualityLow: "低",
      qualityMedium: "中",
      qualityHigh: "高",
      formatPng: "PNG",
      formatJpeg: "JPEG",
      formatWebp: "WebP",
      enabled: "开启",
      disabled: "关闭",
      imageResponseModeOfficial: "官方 GPT Image 模式",
      imageResponseModeForceBase64: "中转站强制 base64",
    },
    quickOptions: {
      title: "图片参数",
      size: "图片尺寸",
      aspect: "图片比例",
      resolution: "清晰度",
      quality: "图片质量",
      ratioAuto: "智能",
      ratioTall: "9:16",
      ratioPortrait: "2:3",
      ratioSquare: "1:1",
      ratioLandscape: "3:2",
      ratioWide: "16:9",
      resolutionAuto: "自动",
      resolution1k: "1K",
      resolution2k: "2K",
      resolution4k: "4K",
      customResolution: "自定义",
      hint: "这里会直接影响本次单图或批量生成；如需长期保存为默认值，请到设置页保存。",
      providerHint: "2K/4K 属于高分辨率请求，是否可用取决于当前模型供应商。",
    },
    sections: {
      connection: "连接配置",
      defaults: "生成默认值",
      output: "输出目录",
      version: "版本与更新",
    },
    cards: {
      currentOutput: "当前输出",
      totalRecords: "总记录数",
      dateGroups: "日期分组",
      selectedRun: "当前选中记录",
      lastSelectedHistoryItem: "最近选中的历史项",
      savedImage: "已保存图片",
      selectedHistoryItem: "已选历史记录",
      versionInfo: "版本与更新",
      welcomeIntro: "欢迎使用",
      welcomeRecommended: "作者推荐中转站",
      welcomeQuickStart: "快速开始",
      referenceImages: "当前参考图",
      openSourceTitle: "开源与反馈",
      openSourceHint:
        "想了解这个页面背后实际发送了什么请求？可以查看最小 API 调用示例，也可以把它改造成自己的脚本或工作流。",
      editFromImageTitle: "基于此图继续修改",
    },
    labels: {
      imageModel: "生图模型",
      outputDirectory: "保存目录",
      timeout: "超时时间",
      created: "生成时间",
      duration: "耗时",
      outputPath: "输出路径",
      customName: "图片名称",
      status: "状态",
      model: "模型",
      dateGroups: "日期分组",
      totalRecords: "总记录数",
      currentVersion: "当前版本",
      latestVersion: "最新版",
      archivedVersion: "固定版",
      mode: "生成模式",
      sourceImages: "参考图",
      size: "尺寸",
      quality: "质量",
      format: "格式",
      compression: "压缩",
      batch: "批次",
      tasks: "任务",
      saveMode: "保存方式",
    },
    preview: {
      idle: "待生成",
      running: "生成中",
      failed: "失败",
      history: "历史",
      idleBody: "优化提示词或生成图片后，这里会显示最新结果。",
      runningHint: "生成完成并保存成功后，图片会出现在这里。",
      elapsedPrefix: "已耗时：",
      autoNamed: "自动命名",
      batch: "批量预览",
      batchBody: "这里会显示当前批量任务的进度、最新完成图片和已生成缩略图。",
      batchLatest: "最新完成图片",
      batchGallery: "已生成图片",
      batchNoImage: "批量任务已准备好；开始生成后，成功的图片会出现在这里。",
      batchRunning: (title) => `正在生成：${title}`,
      batchHistoryBody: "这是历史批次的预览。能否恢复缩略图，取决于你是否已授权正确的保存目录。",
    },
    help: {
      imageOptions: "图片参数说明",
      referenceImages: "参考图说明",
      connectionNotes: "连接配置说明",
      defaultParameterNotes: "默认参数说明",
      outputFolderNotes: "保存目录说明",
      imageToImageTestNotes: "图生图测试说明",
      historyPreviewTroubleshooting: "为什么看不到预览？",
      historyPreviewMissingShort: "无法恢复这张历史图片预览。",
    },
    empty: {
      noHistorySelected: "还没有选中任何历史记录。",
      noHistorySaved: "还没有保存任何图片记录。",
      loadingRuntime: "正在读取本地配置和历史记录...",
      noReferenceImages: "还没有添加参考图。",
    },
    notes: {
      optimizedPromptLinked: "优化稿与当前提示词绑定；原提示词发生变化时，会自动清空旧优化稿，避免误用。",
      openOutputDesktopOnly: "“打开输出位置”仅在桌面模式可用。",
      webHistoryUnavailable: "网页模式无法直接读取旧文件预览，你仍然可以在本地目录中手动查看。",
      defaultsDescription:
        "这里可以设置超时时间、默认图片数量、尺寸、质量、格式和压缩。超时时间允许 60-600 秒；低于 180 秒可以保存，但生成 2K/4K 或供应商较慢时可能提前中断。",
      outputDescription:
        "网页静态版不能通过手填 C:\\ 路径获得本地文件权限。请使用目录选择器授权；授权成功后才能直接保存到该目录并恢复历史预览。",
      outputDirectoryPermissionHint:
        "注意：这里显示的是浏览器已记录的目录名，不等于完整磁盘路径。要让图片真正直存并恢复历史预览，请点击“选择并授权目录”，然后再点“测试保存目录”。浏览器可能拒绝授权 Downloads 根目录；如果想放在下载目录，建议先新建 C:\\Users\\你的用户名\\Downloads\\gpt-image-2-studio，再授权这个子目录。更稳定的做法是选择 D:\\gpt-image-outputs 这类普通目录。",
      outputDirectoryStatusTitle: "保存目录状态",
      outputDirectoryStatusBody: (directory, testAction) =>
        `当前记录目录：${directory}。在保存目录测试通过前，图片可能会回退为浏览器下载，历史预览也可能无法恢复。请点击“${testAction}”，确认浏览器能写入并读回图片。`,
      outputDirectoryStateUnsupported: "当前浏览器不支持目录授权。图片会使用浏览器下载。",
      outputDirectoryStateNotAuthorized: "尚未授权保存目录。请选择并授权一个目录。",
      outputDirectoryStatePermissionRequired: (directory) => `目录“${directory}”需要恢复权限或重新测试。`,
      outputDirectoryStateReady: (directory, lastTestedAt) => `已就绪：目录“${directory}”，最近测试 ${lastTestedAt}。`,
      currentVersionManualUpdate: "首页始终指向最新版；如果需要稳定使用旧版，可以从这里打开固定版本。",
      versionSwitchHint: "固定版路径会随发版保留，适合在新版本测试期间临时回退。",
      referenceImageHint: "这些参考图会和提示词一起发送给图像模型，推荐不超过 4 张。",
      imageToImageModeDescription: "图生图会把多张参考图和提示词一起发送到 `/images/edits`。",
      imageEditTestDescription: "“测试图生图”会使用内置的极小参考图，验证当前图像模型是否支持图生图接口。",
      referenceImageLimitHint: "最多支持 8 张参考图，推荐不超过 4 张。",
      dragAndDropHint: "支持多选上传，也支持从文件夹中直接拖拽图片到上传区。",
      sizeConstraintsHint:
        "OpenAI 官方文档当前列出的 GPT Image 常规尺寸是 auto、1024x1024、1536x1024 和 1024x1536。这里额外提供 2K/4K 选项，是为了兼容部分中转站或供应商扩展能力；实际是否可用取决于当前供应商。",
      customSizeHint: "自定义尺寸适合高级用法；只要满足约束就可以尝试，但兼容服务商不支持时仍会返回接口错误。",
      compressionHint: "output_compression 仅对 JPEG / WebP 生效；数值越高通常画质越高、文件也越大。",
      compressionUnavailable: "PNG 不使用压缩参数。",
      apiKeyStorageHint: "默认只在当前浏览器会话中保存。仅在你信任的个人设备上启用长期保存。",
      apiKeySessionOnlyHint: "API key 可保留到当前浏览器会话结束；其他设置只保留在页面内存中，且无法长期记住 API key。",
      apiKeyMemoryOnlyHint: "浏览器存储当前不可用。配置和 API key 只保留在这个已打开页面的内存中，刷新或关闭页面后即丢失。",
      imageResponseModeHint:
        "默认遵循 OpenAI 官方 GPT Image 行为，不发送 response_format。仅当中转站或供应商明确要求时，才启用“中转站强制 base64”。",
    },
    welcome: {
      title: "欢迎来到本地生图工作台",
      intro: "这是一个本地运行的生图工具。你的配置保存在当前用户自己的设备上，不会写进仓库源码。",
      recommendedTitle: "作者推荐中转站",
      recommendedBody: "如果你还没有可用接口，可以先看看作者常用的中转站。",
      quickStartTitle: "先做这 4 步",
      quickStartBody: "去“设置”页填写 API key、Base URL、文字模型、生图模型和保存目录。你也可以先做最小连通性测试，再决定是否保存。",
      setupChecklistTitle: "设置检查清单",
      setupChecklistItems: [
        "填写 Base URL 和 API key，并确认模型名称。",
        "选择并授权保存目录，不要只手动填写 C:\\ 路径。",
        "运行“测试保存目录”，确认浏览器能写入并读回图片。",
        "把超时时间设在 60-600 秒之间；2K/4K 建议从 180 秒起。",
        "先用“单图”跑通一张，再进入“批量”。",
      ],
    },
    messages: {
      runtimeLoaded: (mode) => `${mode} 已加载。修改后记得保存配置。`,
      runtimeLoadFailed: (detail) => `加载本地状态失败。${detail}`,
      promptChangedCleared: "提示词已变化，旧的优化稿已自动清空。",
      promptRequiredForOptimize: "请先输入提示词，再进行优化。",
      promptRequiredForGenerate: "请先输入提示词，再生成图片。",
      referenceImageRequired: "图生图模式至少需要一张参考图。",
      referenceImageInvalid: "本次选择中包含非图片文件，已自动忽略。",
      referenceImagesAdded: (addedCount, totalCount) => `已添加 ${addedCount} 张参考图，当前共 ${totalCount} 张。`,
      referenceImagesInvalidSkipped: (count) => `已忽略 ${count} 个非图片文件。`,
      referenceImagesOverflowSkipped: (count, maxCount) => `有 ${count} 张图片超出上限，已跳过。最多允许 ${maxCount} 张。`,
      referenceImagesCleared: "已清空全部参考图。",
      referenceImageRemoved: (fileName) => `已移除参考图：${fileName}`,
      actionNeedsValidSettings: (actionLabel, details) => `${actionLabel} 需要先使用有效配置。${details}`,
      optimizationDiscarded: "提示词已变化，本次优化结果未自动应用。",
      optimizationFailed: (detail) => `优化提示词失败。${detail}`,
      generationNoImages: "接口已成功返回，但没有可保存的图片数据。",
      settingsSaved: "配置已保存。",
      settingsSavedWithIssues: (details) => `配置已保存。${details}`,
      settingsSaveFailed: (detail) => `保存配置失败。${detail}`,
      outputSelected: (directory) => `已授权目录：${directory}。浏览器不会暴露完整磁盘路径；历史预览会从这个授权目录中查找图片。`,
      chooseDirectoryUnavailableWeb: "当前浏览器或运行环境不支持目录授权。手动填写保存目录后仍可下载图片，但不能恢复历史预览。",
      chooseDirectoryCancelled: "未选择任何目录。",
      chooseDirectoryFailed: (detail) => `选择目录失败。${detail}`,
      outputDirectoryTestSuccess: (fileName, bytes) =>
        `保存目录测试通过：已写入并读回 ${fileName}（${bytes} 字节）。之后历史预览会优先从这个授权目录恢复图片。`,
      outputDirectoryTestFailed: (detail) =>
        `保存目录测试失败。请确认浏览器已授权一个普通子目录，而不是 Downloads 根目录。${detail ?? ""}`.trim(),
      textTestSuccess: (response) => `文字模型响应成功：${response}`,
      textTestFailed: (detail) => `文字模型测试失败。${detail}`,
      imageTestSuccess: (count) => `文生图响应成功，共返回 ${count} 张图片。`,
      imageTestFailed: (detail) => `文生图测试失败。${detail}`,
      imageEditTestSuccess: (count) => `图生图响应成功，共返回 ${count} 张图片。`,
      imageEditTestFailed: (detail) => `图生图测试失败。${detail}`,
      openOutputFailed: (detail) => `无法打开输出路径。${detail}`,
      historyPreviewUnavailable: "当前运行环境无法直接预览这张已保存图片。",
      historyPreviewFileMissing:
        "无法恢复这张历史图片预览。请先在“设置”里点击“选择并授权目录”，选择保存目录；只手动填写 C:\\ 路径不会授权浏览器读取文件。浏览器可能拒绝授权 Downloads 根目录，如果要用下载目录，建议新建并授权 Downloads\\gpt-image-2-studio 子目录。如果已经授权，图片可能已经被删除、移动，或授权目录不匹配。",
      historyPreviewPreparationFailed: (detail) => `准备历史预览失败。${detail}`,
      editFromImageReady: "已把这张历史图片作为参考图带入单图工作区。你可以补充修改要求后重新生成。",
      editFromImageUnavailable: "无法读取这张图片作为参考图。请先授权正确的保存目录，或确认文件仍然存在。",
      generatedPreviewLoadFailed: "图片已保存，但预览加载失败。",
      saveModeAuthorizedDirectory: "已保存到授权目录",
      saveModeBrowserDownload: "浏览器下载",
      saveFallbackToBrowserDownload: (detail) => `授权目录保存失败，已回退为浏览器下载：${detail}`,
      updateStatus: (version) => `当前版本：${version}。如需更新，请手动下载安装新版本。`,
    },
    validation: {
      "Base URL must be a valid URL.": "Base URL 必须是有效的 URL。",
      "API key is required.": "必须填写 API key。",
      "Text model is required.": "必须填写文字模型。",
      "Image model is required.": "必须填写生图模型。",
      "Timeout must be between 60 and 600 seconds.": "超时时间必须在 60 到 600 秒之间。",
      "Timeout below 180 seconds may interrupt slow 2K or 4K generations.":
        "超时时间低于 180 秒时，较慢的 2K/4K 生图可能会被提前中断。",
      "Image count must be between 1 and 4.": "图片数量必须在 1 到 4 之间。",
      "Image size must be auto or use WIDTHxHEIGHT format.": "图片尺寸必须填写 auto，或使用 WIDTHxHEIGHT 格式。",
      "Image size width and height must both be multiples of 16.": "图片尺寸的宽和高都必须是 16 的倍数。",
      "Image size cannot exceed 3840 pixels on either edge.": "图片尺寸任一边都不能超过 3840 像素。",
      "Image size aspect ratio cannot exceed 3:1.": "图片尺寸长宽比不能超过 3:1。",
      "Image size must contain between 655,360 and 8,294,400 total pixels.": "图片总像素必须在 655,360 到 8,294,400 之间。",
      "Image quality must be auto, low, medium, or high.": "图片质量只能是 auto、low、medium 或 high。",
      "Image format must be png, jpeg, or webp.": "图片格式只能是 png、jpeg 或 webp。",
      "Output compression must be an integer between 0 and 100.": "输出压缩必须是 0 到 100 之间的整数。",
      "Output directory is empty; the app will use outputs/.": "保存目录为空时，应用会使用 outputs/。",
      "High-resolution sizes can take longer and may not be supported by every compatible provider.":
        "高分辨率尺寸会更慢，部分兼容服务商也可能暂不支持。",
    },
  },
  "en-US": {
    app: {
      eyebrow: "WINDOWS-FIRST DESKTOP TOOL",
      title: "Local Image Studio",
      subtitle:
        "Write a prompt, optionally refine it, use text-to-image or image-to-image, and save outputs by date on the current user's device.",
      runtimeLoading: "Loading runtime",
      runtimeDesktop: "Desktop mode",
      runtimeWeb: "Web mode",
      languageLabel: "Language",
      statusLabel: "Status",
      environment: "Current runtime",
    },
    tabs: {
      generate: "Single image",
      batch: "Batch",
      history: "History",
      settings: "Settings",
    },
    batch: {
      title: "Batch generation",
      description: "Repeat one prompt or fill multiple different prompts, then generate them at a controlled pace.",
      emptyTasks: "Create tasks first, then review each prompt before starting the batch.",
      defaultsNote: "Task count, concurrency, interval, and retry defaults are saved with Settings. Save settings after changing them.",
      aiSplit: {
        title: "AI batch task planner",
        description:
          "Turn one creative goal into executable image tasks with titles, prompts, suggested names, and planning notes.",
        guideTitle: "How to choose",
      },
      workflow: {
        title: "Prompt workflow",
        description:
          "Plan tasks, lock a shared visual style, create a reusable Prompt Recipe, and continue after failed runs.",
        styleLockPlaceholder:
          "Example: same magazine-cover composition, warm natural light, cream background, fine film-grain texture",
        styleLockHint:
          "Optional. This is automatically included when you create or plan the task list.",
        styleLockGeneratedHint:
          "The current task list has already been created. Recreate or re-plan the task list to apply changes here.",
      },
      recipe: {
        advancedTitle: "Advanced export",
        title: "Batch export text",
        description:
          "Export the current tasks, prompts, style lock, and execution settings as text for saving or sharing.",
        outputDescription: "This text is only for saving and reuse. It will not be imported or executed automatically.",
      },
      sources: {
        samePrompt: "Repeat one prompt",
        customPrompts: "Custom multiple prompts",
      },
      referenceImages: {
        title: "Batch reference images (image-to-image)",
        description:
          "Optional. Images uploaded here are sent with every batch task, useful when one shared reference set should guide the whole batch.",
        scopeHint: "These images only apply to Batch. They do not reuse references from Single image.",
        summary: (count, max) => `Batch references: ${count}/${max}`,
        taskTitle: "Task-specific reference images",
        taskDescription:
          "Optional. Images uploaded here are sent only with this task, useful when each output needs a different person, product, or composition reference.",
        taskScopeHint:
          "By default this task also uses the batch reference images above. Turn it off when this task should use only its own references.",
        taskSessionHint: "Reference images are kept only in this page session. Re-select them after refreshing.",
        taskSummary: (count, max) => `Task references: ${count}/${max}`,
        taskInputLabel: (index) => `Task ${index} reference images`,
        useGlobalLabel: "Use batch reference images",
        useGlobalForTask: (index) => `Use batch reference images for task ${index}`,
        usesGlobalHint: "Also using batch reference images",
        expandAllTaskReferences: "Expand all task references",
        collapseAllTaskReferences: "Collapse all",
      },
      splitTemplates: {
        basic: {
          label: "Recommended auto split",
          description: "Not sure? Use this. It splits the master task into independent prompts.",
          useCase: "Best for countries, people, products, places, or any group of different subjects.",
        },
        "style-consistent": {
          label: "Keep one visual style",
          description: "Emphasizes consistent composition, lighting, color, and camera language.",
          useCase: "Best for posters, avatars, covers, or product shots that should look like one design set.",
        },
        series: {
          label: "Make a coherent series",
          description: "Emphasizes different topics while keeping the whole batch in one series.",
          useCase: "Best for chapters, festivals, cities, campaigns, or themed image sets.",
        },
        custom: {
          label: "Write my own rule",
          description: "Advanced users can write their own split instruction to control the text model.",
          useCase: "Best when you already know the exact rules the text model should follow.",
        },
      },
      fields: {
        batchTitle: "Batch title",
        taskCount: "Task count",
        customPrompt: (index) => `Prompt ${index}`,
        masterPrompt: "Master task",
        styleLock: "Batch style lock",
        splitTemplate: "Split rule",
        customSplitSystemPrompt: "Custom split system prompt",
        suggestedName: "Suggested name",
        plannerNotes: "Planning note",
        concurrency: "Concurrency",
        intervalSeconds: "Interval seconds",
        maxRetries: "Max retries",
        executionNotes: "Execution notes",
        autoPlanTaskCount: "Let AI adjust task count",
        autoPlanTaskCountHint:
          "When enabled, the text model returns recommendedCount while planning and can update task count to match the master task. When disabled, your typed task count stays authoritative.",
      },
      actions: {
        createTasks: "Create tasks",
        splitWithTextModel: "Plan task list",
        splitBusy: "Planning...",
        addPrompt: "Add prompt",
        removePrompt: "Remove",
        start: "Start batch",
        pause: "Pause",
        continue: "Continue",
        continueUnfinished: "Continue unfinished",
        cancel: "Cancel remaining",
        retryTask: "Retry this task",
        retryFailed: "Retry failed tasks",
        applyStyleLock: "Apply style lock",
        generateRecipe: "Generate export text",
        copyRecipe: "Copy export text",
        saveDefaults: "Save batch defaults",
        clearDraft: "Clear current batch",
      },
      status: {
        draft: "Draft",
        running: "Running",
        paused: "Paused",
        cancelled: "Cancelled",
        completed: "Completed",
        pending: "Pending",
        succeeded: "Succeeded",
        failed: "Failed",
        skipped: "Skipped",
      },
      messages: {
        promptRequired: "Enter a prompt or master task first.",
        maxTaskCountWarning: (max) =>
          `A batch is capped at ${max} tasks. Larger batches may hit provider rate limits or failures, so the count was capped at ${max}.`,
        batchComplete: (success, failed, skipped) => `Batch complete: ${success} succeeded, ${failed} failed, ${skipped} skipped.`,
        saveSummary: (success, authorized, fallback) =>
          `Generated successfully ${success}, saved to authorized directory ${authorized}, fell back to browser download ${fallback}.`,
        splitRunning: "Calling the text model to plan this batch. Please wait.",
        splitSuccess: (count) => `Text model planned ${count} tasks.`,
        taskCountAdjustedByAi: (count, reason) =>
          `AI recommended ${count} tasks and adjusted the task count to ${count}. Remove any task you do not need from the task list.${
            reason ? ` Reason: ${reason}` : ""
          }`,
        aiCountMismatch: (recommended, actual) =>
          `The text model recommended ${recommended} tasks but returned ${actual}. Retry planning; the current task list was not changed.`,
        fixedAiCountMismatch: (expected, actual) =>
          `AI task-count planning is off, so the model must return exactly ${expected} tasks. It returned ${actual}. Retry planning; the current task list was not changed.`,
        aiCountOverLimitConfirm: (requested, max) =>
          `The text model returned ${requested} tasks, above the hard batch limit of ${max}. Explicitly continue with the first ${max} tasks? Cancel leaves the current task list unchanged.`,
        aiCountOverLimitCancelled: "The over-limit AI plan was cancelled. The current task list was not changed.",
        aiCountLimitedAfterConfirmation: (requested, max) =>
          `The text model returned ${requested} tasks. After your confirmation, the first ${max} were used; the remaining ${requested - max} were omitted because of the hard limit.`,
        splitFailed: (detail) => `Text model planning failed. ${detail}`,
        costRiskPaused: "The provider returned an error that may still have incurred cost but no image. The batch is paused until you confirm.",
        authPaused: "API key or permission failed. The batch is paused. Check Settings first.",
        styleLockRequired: "Enter a batch style lock first.",
        styleLockSaved: "Style lock saved. It will be applied when you create or plan tasks.",
        styleLockApplied: (count) => `Style lock applied to ${count} task${count === 1 ? "" : "s"}.`,
        recipeReady: "Batch export text is ready. You can copy it for reuse.",
        recipeCopied: "Batch export text copied.",
        recipeCopyUnavailable: "This browser does not allow direct clipboard copy. Select the export text manually.",
        recipeCopyFailed: (detail) => `Failed to copy batch export text. ${detail}`,
      },
    },
    modes: {
      textToImage: "Text to image",
      imageToImage: "Image to image",
    },
    actions: {
      optimize: "Optimize prompt",
      optimizeBusy: "Optimizing...",
      clearOptimized: "Clear optimized draft",
      generate: "Generate image",
      generateBusy: "Generating...",
      reusePrompt: "Reuse prompt",
      openOutput: "Open output",
      chooseDirectory: "Choose and authorize folder",
      chooseImage: "Choose images",
      changeImage: "Add more images",
      removeImage: "Remove",
      clearImages: "Clear all",
      editFromImage: "Edit from this image",
      save: "Save settings",
      saveBusy: "Saving...",
      testOutputDirectory: "Test output folder",
      testOutputDirectoryBusy: "Testing folder...",
      testText: "Test text model",
      testTextBusy: "Testing...",
      testImage: "Test text-to-image",
      testImageBusy: "Testing...",
      testImageEdit: "Test image-to-image",
      testImageEditBusy: "Testing...",
      checkUpdates: "Check updates",
      openLatestVersion: "Open latest version",
      openArchivedVersion: "Open this fixed version",
      viewMinimalApiExample: "View minimal API example",
      startUsing: "Start using",
      skip: "Skip",
      close: "Close",
      enlarge: "Click to enlarge",
      openRecommended: "Open recommended relay",
      openGithubProject: "View on GitHub",
      inspect: "Inspect",
      viewLarge: "View large",
      inspectBatch: "Inspect batch",
      expandBatch: "Expand batch",
      collapseBatch: "Collapse batch",
    },
    panel: {
      generateTitle: "Generation workspace",
      generateDescription: "Write prompts, optionally set a file name, then choose text-to-image or image-to-image.",
      historyToolsTitle: "History tools",
      historyToolsDescription: "Review past runs, reuse prompts, or open saved local images.",
      settingsTitle: "Connection and defaults",
      settingsDescription: "Fill in API key, Base URL, model names, output directory, and image output settings. Run connectivity tests when needed.",
      previewTitle: "Preview",
      previewIdleDescription: "Current generation status and the latest preview appear here.",
      previewRunningDescription: "Image generation is in progress. This can take a while.",
      historyTitle: "History",
      historyDescription: "Saved local runs grouped by date for quick review and reuse.",
    },
    fields: {
      prompt: "Prompt",
      promptPlaceholder: "Describe the scene, style, composition, and mood you want to generate or edit.",
      customName: "Image name",
      customNamePlaceholder: "Optional. Leave blank to auto-name by time and prompt.",
      effectivePrompt: "Effective prompt",
      effectivePromptPlaceholder: "When the optimized draft is empty, the original prompt is sent as-is.",
      optimizedPrompt: "Optimized prompt",
      optimizedPromptPlaceholder: "Optional. You can still edit this text before generating.",
      baseUrl: "Base URL",
      apiKey: "API key",
      rememberApiKey: "Remember API key on this device",
      textModel: "Text model",
      imageModel: "Image model",
      timeoutSeconds: "Timeout (seconds)",
      outputDirectory: "Output directory",
      defaultOutputCard: "Current output settings",
      imageCount: "Image count",
      version: "Version",
      referenceImage: "Reference images",
      referenceImagePlaceholder: "Drag images here, or choose multiple files from a folder.",
      defaultSize: "Default size",
      defaultQuality: "Default quality",
      defaultFormat: "Default format",
      defaultCompression: "Default compression",
      imageResponseMode: "Image response compatibility mode",
      customWidth: "Custom width",
      customHeight: "Custom height",
      editInstructions: "Edit instructions",
      editInstructionsPlaceholder:
        "Example: keep the subject and composition, change the background to an evening street scene, and simplify the text.",
    },
    options: {
      sizeAuto: "Auto (model decides)",
      size1kSquare: "1K square 1024x1024",
      size1kLandscape: "1K landscape 1536x1024",
      size1kPortrait: "1K portrait 1024x1536",
      size2kSquare: "2K square 2048x2048 (Experimental)",
      size2kLandscape: "2K landscape 2048x1152",
      size4kLandscape: "4K landscape 3840x2160 (Experimental)",
      size4kPortrait: "4K portrait 2160x3840 (Experimental)",
      sizeCustom: "Custom size (Advanced)",
      qualityAuto: "Auto",
      qualityLow: "Low",
      qualityMedium: "Medium",
      qualityHigh: "High",
      formatPng: "PNG",
      formatJpeg: "JPEG",
      formatWebp: "WebP",
      enabled: "Enabled",
      disabled: "Disabled",
      imageResponseModeOfficial: "Official GPT Image mode",
      imageResponseModeForceBase64: "Relay/provider force base64",
    },
    quickOptions: {
      title: "Image options",
      size: "Image size",
      aspect: "Aspect ratio",
      resolution: "Resolution",
      quality: "Image quality",
      ratioAuto: "Smart",
      ratioTall: "9:16",
      ratioPortrait: "2:3",
      ratioSquare: "1:1",
      ratioLandscape: "3:2",
      ratioWide: "16:9",
      resolutionAuto: "Auto",
      resolution1k: "1K",
      resolution2k: "2K",
      resolution4k: "4K",
      customResolution: "Custom",
      hint: "These options affect the current single-image or batch run. Save them in Settings if you want to keep them as defaults.",
      providerHint: "2K/4K are high-resolution requests; actual support depends on your current provider.",
    },
    sections: {
      connection: "Connection",
      defaults: "Generation defaults",
      output: "Output directory",
      version: "Version and updates",
    },
    cards: {
      currentOutput: "Current output",
      totalRecords: "Total records",
      dateGroups: "Date groups",
      selectedRun: "Selected run",
      lastSelectedHistoryItem: "Last selected history item",
      savedImage: "Saved image",
      selectedHistoryItem: "Selected history item",
      versionInfo: "Version and updates",
      welcomeIntro: "Welcome",
      welcomeRecommended: "Author-recommended relay",
      welcomeQuickStart: "Quick start",
      referenceImages: "Reference images",
      openSourceTitle: "Open source & feedback",
      openSourceHint:
        "Want to see what this page sends behind the scenes? Read the minimal API example and adapt it into your own script or workflow.",
      editFromImageTitle: "Continue editing from this image",
    },
    labels: {
      imageModel: "Image model",
      outputDirectory: "Output directory",
      timeout: "Timeout",
      created: "Created",
      duration: "Duration",
      outputPath: "Output path",
      customName: "Image name",
      status: "Status",
      model: "Model",
      dateGroups: "Date groups",
      totalRecords: "Total records",
      currentVersion: "Current version",
      latestVersion: "Latest version",
      archivedVersion: "Fixed version",
      mode: "Mode",
      sourceImages: "Source images",
      size: "Size",
      quality: "Quality",
      format: "Format",
      compression: "Compression",
      batch: "Batch",
      tasks: "Tasks",
      saveMode: "Save mode",
    },
    preview: {
      idle: "Idle",
      running: "Running",
      failed: "Failed",
      history: "History",
      idleBody: "After you optimize a prompt or generate an image, the latest result appears here.",
      runningHint: "The image will appear here after it finishes and is saved successfully.",
      elapsedPrefix: "Elapsed: ",
      autoNamed: "Auto-named",
      batch: "Batch preview",
      batchBody: "This panel shows the current batch progress, the latest completed image, and generated thumbnails.",
      batchLatest: "Latest completed image",
      batchGallery: "Generated images",
      batchNoImage: "The batch is ready. Successful images will appear here after generation starts.",
      batchRunning: (title) => `Generating: ${title}`,
      batchHistoryBody:
        "This is a saved batch preview. Thumbnail recovery depends on whether the correct output folder is authorized.",
    },
    help: {
      imageOptions: "Image option notes",
      referenceImages: "Reference image notes",
      connectionNotes: "Connection notes",
      defaultParameterNotes: "Default parameter notes",
      outputFolderNotes: "Output folder notes",
      imageToImageTestNotes: "Image-to-image test notes",
      historyPreviewTroubleshooting: "Why is the preview missing?",
      historyPreviewMissingShort: "Could not restore this history preview.",
    },
    empty: {
      noHistorySelected: "No history item is selected yet.",
      noHistorySaved: "No image records have been saved yet.",
      loadingRuntime: "Loading local settings and history...",
      noReferenceImages: "No reference images have been added yet.",
    },
    notes: {
      optimizedPromptLinked: "The optimized draft is tied to the current prompt. If the source prompt changes, the old optimized draft is cleared automatically.",
      openOutputDesktopOnly: "\"Open output\" is available only in desktop mode.",
      webHistoryUnavailable: "The web runtime cannot preview older local files directly. You can still open them manually from the output directory.",
      defaultsDescription:
        "Set timeout, default image count, size, quality, format, and compression here. Timeout accepts 60-600 seconds. Values below 180 seconds are allowed, but slower 2K/4K generations may be interrupted.",
      outputDescription:
        "The static web version cannot gain local file access from a typed C:\\ path. Use the folder picker to authorize a folder before the app can save directly there or restore history previews.",
      outputDirectoryPermissionHint:
        "Note: this shows the folder name recorded by the browser, not the full disk path. To save directly and restore history previews, click \"Choose and authorize folder\", then click \"Test output folder\". Browsers may refuse the Downloads root folder; if you want to use Downloads, create C:\\Users\\your-name\\Downloads\\gpt-image-2-studio first and authorize that subfolder. A regular folder such as D:\\gpt-image-outputs is more reliable.",
      outputDirectoryStatusTitle: "Output folder status",
      outputDirectoryStatusBody: (directory, testAction) =>
        `Recorded folder: ${directory}. Images may fall back to browser downloads until the folder test passes. Use ${testAction} to confirm this browser can write and restore previews.`,
      outputDirectoryStateUnsupported: "This browser does not support folder authorization. Images will use browser downloads.",
      outputDirectoryStateNotAuthorized: "No output folder is authorized yet. Choose and authorize a folder.",
      outputDirectoryStatePermissionRequired: (directory) => `Needs permission: folder “${directory}” requires recovery or another test.`,
      outputDirectoryStateReady: (directory, lastTestedAt) => `Ready: folder “${directory}”, last tested ${lastTestedAt}.`,
      currentVersionManualUpdate: "The homepage always points to the latest version. Open a fixed version here if you need a stable fallback.",
      versionSwitchHint: "Fixed version URLs are kept after release, so you can temporarily roll back while a newer version is being tested.",
      referenceImageHint: "These images are sent to the image model together with the prompt. Staying at 4 or fewer is recommended.",
      imageToImageModeDescription: "Image-to-image sends multiple reference images and the prompt together to `/images/edits`.",
      imageEditTestDescription: "Test image-to-image uses a tiny built-in reference image to check whether the current image model supports the edit endpoint.",
      referenceImageLimitHint: "Up to 8 reference images are supported. 4 or fewer is recommended.",
      dragAndDropHint: "You can select multiple images or drag them directly from a folder into the drop zone.",
      sizeConstraintsHint:
        "OpenAI's official GPT Image docs currently list auto, 1024x1024, 1536x1024, and 1024x1536 as regular size options. The extra 2K/4K choices here are for compatible relays or providers that expose extended resolutions; actual support depends on your current provider.",
      customSizeHint: "Custom sizes are for advanced use. Any size that meets the limits can be tried, but a compatible provider may still reject unsupported values.",
      compressionHint: "output_compression only applies to JPEG and WebP. Higher values usually mean higher quality and larger files.",
      compressionUnavailable: "PNG does not use a compression parameter.",
      imageResponseModeHint:
        "The default follows official OpenAI GPT Image behavior and omits response_format. Enable force-base64 only when a relay or provider explicitly requires it.",
      apiKeyStorageHint: "By default the key lasts only for this browser session. Enable long-term storage only on a trusted personal device.",
      apiKeySessionOnlyHint: "The API key can last for this browser session, while other settings remain page-memory only. Long-term API key storage is unavailable.",
      apiKeyMemoryOnlyHint: "Browser storage is unavailable. Settings and the API key remain in memory only for this open page and are lost on refresh or close.",
    },
    welcome: {
      title: "Welcome to Local Image Studio",
      intro: "This is a local image generation tool. Your settings are stored on the current user's device and are not written into the repository.",
      recommendedTitle: "Author-recommended relay",
      recommendedBody: "If you do not have an available endpoint yet, you can start with the relay the author uses most often.",
      quickStartTitle: "Start with these 4 steps",
      quickStartBody: "Go to Settings and fill in API key, Base URL, text model, image model, and output directory. You can run minimal connectivity tests before saving, but saving is still allowed even if tests fail.",
      setupChecklistTitle: "Setup checklist",
      setupChecklistItems: [
        "Fill Base URL and API key, then confirm model names.",
        "Choose and authorize an output folder instead of only typing a C:\\ path.",
        "Run Test output folder to confirm the browser can write and restore previews.",
        "Set timeout between 60 and 600 seconds; start from 180 seconds for 2K/4K.",
        "Start with Single image, then use Batch after one image works.",
      ],
    },
    messages: {
      runtimeLoaded: (mode) => `${mode} loaded. Save after changing settings.`,
      runtimeLoadFailed: (detail) => `Failed to load local state. ${detail}`,
      promptChangedCleared: "The prompt changed, so the previous optimized draft was cleared automatically.",
      promptRequiredForOptimize: "Enter a prompt before optimizing it.",
      promptRequiredForGenerate: "Enter a prompt before generating an image.",
      referenceImageRequired: "Image-to-image mode requires at least one reference image.",
      referenceImageInvalid: "The selection included non-image files, so they were ignored.",
      referenceImagesAdded: (addedCount, totalCount) =>
        `${addedCount} reference image${addedCount === 1 ? " was" : "s were"} added. ${totalCount} total.`,
      referenceImagesInvalidSkipped: (count) => `${count} non-image file${count === 1 ? " was" : "s were"} ignored.`,
      referenceImagesOverflowSkipped: (count, maxCount) =>
        `${count} extra image${count === 1 ? " was" : "s were"} skipped because the maximum is ${maxCount}.`,
      referenceImagesCleared: "All reference images were cleared.",
      referenceImageRemoved: (fileName) => `Removed reference image: ${fileName}`,
      actionNeedsValidSettings: (actionLabel, details) => `${actionLabel} requires valid settings. ${details}`,
      optimizationDiscarded: "The optimization result was not applied because the prompt changed.",
      optimizationFailed: (detail) => `Prompt optimization failed. ${detail}`,
      generationNoImages: "The API returned successfully, but no image data was available to save.",
      settingsSaved: "Settings saved.",
      settingsSavedWithIssues: (details) => `Settings saved. ${details}`,
      settingsSaveFailed: (detail) => `Failed to save settings. ${detail}`,
      outputSelected: (directory) =>
        `Folder authorized: ${directory}. Browsers do not expose the full disk path; history previews will search inside this authorized folder.`,
      chooseDirectoryUnavailableWeb:
        "Folder authorization is unavailable in this browser/runtime. You can still download images after entering a path manually, but history previews cannot be restored.",
      chooseDirectoryCancelled: "No directory was selected.",
      chooseDirectoryFailed: (detail) => `Failed to choose a directory. ${detail}`,
      outputDirectoryTestSuccess: (fileName, bytes) =>
        `Output folder test passed: wrote and read ${fileName} (${bytes} bytes). History previews will try to restore images from this authorized folder.`,
      outputDirectoryTestFailed: (detail) =>
        `Output folder test failed. Make sure the browser has been authorized for a normal subfolder, not the Downloads root folder. ${
          detail ?? ""
        }`.trim(),
      textTestSuccess: (response) => `Text model responded: ${response}`,
      textTestFailed: (detail) => `Text model test failed. ${detail}`,
      imageTestSuccess: (count) => `Text-to-image responded with ${count} image${count === 1 ? "" : "s"}.`,
      imageTestFailed: (detail) => `Text-to-image test failed. ${detail}`,
      imageEditTestSuccess: (count) => `Image-to-image responded with ${count} image${count === 1 ? "" : "s"}.`,
      imageEditTestFailed: (detail) => `Image-to-image test failed. ${detail}`,
      openOutputFailed: (detail) => `Could not open the output path. ${detail}`,
      historyPreviewUnavailable: "The current runtime cannot preview this saved image directly.",
      historyPreviewFileMissing:
        "Could not restore this history preview. In Settings, click \"Choose and authorize folder\" and select the output folder. Typing a C:\\ path manually does not authorize browser file access. Browsers may refuse the Downloads root folder; if you want to use Downloads, create and authorize a Downloads\\gpt-image-2-studio subfolder. If it is already authorized, the image may have been deleted, moved, or the authorized folder does not match.",
      historyPreviewPreparationFailed: (detail) => `Could not prepare a preview for this saved output. ${detail}`,
      editFromImageReady:
        "This image has been added as a reference in the Single image workspace. Add edit instructions, then generate again.",
      editFromImageUnavailable:
        "Could not read this image as a reference. Authorize the correct output folder first, or confirm the file still exists.",
      generatedPreviewLoadFailed: "The image was saved, but the preview failed to load afterward.",
      saveModeAuthorizedDirectory: "Authorized folder",
      saveModeBrowserDownload: "Browser download",
      saveFallbackToBrowserDownload: (detail) =>
        `Authorized folder save failed; fell back to browser download: ${detail}`,
      updateStatus: (version) => `Current version: ${version}. To update, download and install a newer release manually.`,
    },
    validation: {
      "Base URL must be a valid URL.": "Base URL must be a valid URL.",
      "API key is required.": "API key is required.",
      "Text model is required.": "Text model is required.",
      "Image model is required.": "Image model is required.",
      "Timeout must be between 60 and 600 seconds.": "Timeout must be between 60 and 600 seconds.",
      "Timeout below 180 seconds may interrupt slow 2K or 4K generations.":
        "Timeout below 180 seconds may interrupt slow 2K or 4K generations.",
      "Image count must be between 1 and 4.": "Image count must be between 1 and 4.",
      "Image size must be auto or use WIDTHxHEIGHT format.": "Image size must be auto or use WIDTHxHEIGHT format.",
      "Image size width and height must both be multiples of 16.": "Image size width and height must both be multiples of 16.",
      "Image size cannot exceed 3840 pixels on either edge.": "Image size cannot exceed 3840 pixels on either edge.",
      "Image size aspect ratio cannot exceed 3:1.": "Image size aspect ratio cannot exceed 3:1.",
      "Image size must contain between 655,360 and 8,294,400 total pixels.":
        "Image size must contain between 655,360 and 8,294,400 total pixels.",
      "Image quality must be auto, low, medium, or high.": "Image quality must be auto, low, medium, or high.",
      "Image format must be png, jpeg, or webp.": "Image format must be png, jpeg, or webp.",
      "Output compression must be an integer between 0 and 100.": "Output compression must be an integer between 0 and 100.",
      "Output directory is empty; the app will use outputs/.": "Output directory is empty; the app will use outputs/.",
      "High-resolution sizes can take longer and may not be supported by every compatible provider.":
        "High-resolution sizes can take longer and may not be supported by every compatible provider.",
    },
  },
};

export function resolveLanguage(value: unknown): UiLanguage {
  return isSupportedLanguage(value) ? value : DEFAULT_LANGUAGE;
}

export function isSupportedLanguage(value: unknown): value is UiLanguage {
  return value === "zh-CN" || value === "en-US";
}

export function getTranslations(language: UiLanguage): TranslationBundle {
  return translations[resolveLanguage(language)];
}

export function formatClassifiedError(error: unknown, language: UiLanguage): string {
  const classified = classifyErrorForUser(error);
  const detail = classified.technicalDetail;
  const isChinese = resolveLanguage(language) === "zh-CN";

  const messages: Record<typeof classified.kind, string> = isChinese
    ? {
        auth: "认证失败：请检查 API key、Base URL 和模型名称。不要反复重试，这通常不会产生有效图片。",
        provider:
          "模型供应商异常：请求已到达模型供应商或中转站，但上游返回异常。再次调用可能仍然产生费用，建议等待供应商恢复后再手动重试。",
        timeout: "请求超时：图片生成耗时较长，可以增加超时时间后再尝试。",
        "empty-image":
          "模型供应商异常：接口返回成功但没有图片数据。这类空图片响应可能已经产生调用成本，建议等待供应商恢复后再重试。",
        network: "网络连接失败：请检查 Base URL、网络连接或浏览器跨域限制。系统不会自动重试。",
        unknown: "生成失败：无法明确判断错误类型。请检查配置和供应商状态，谨慎重试。",
      }
    : {
        auth: "Authentication failed: check your API key, Base URL, and model names. Do not retry repeatedly because this usually will not generate an image.",
        provider:
          "Provider error: the request reached the provider or relay, but the upstream service returned an abnormal response. Retrying may still incur cost, so wait for recovery before manually retrying.",
        timeout: "The request timed out. Image generation can take a long time; increase the timeout before trying again.",
        "empty-image":
          "The provider returned no image data. This abnormal empty response may still incur cost, so wait for provider recovery before retrying.",
        network:
          "Network error: check the Base URL, network connection, or browser CORS limits. The app will not retry automatically.",
        unknown: "Generation failed and the error type is unclear. Check your settings and provider status before retrying.",
      };

  return `${messages[classified.kind]} ${detail}`;
}
