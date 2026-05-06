import type { UiLanguage } from "../core/config";
import { classifyErrorForUser, type UserErrorKind } from "../core/errorClassifier";

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
    languageChinese: string;
    languageEnglish: string;
    statusLabel: string;
    environment: string;
  };
  tabs: {
    generate: string;
    history: string;
    settings: string;
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
    save: string;
    saveBusy: string;
    testText: string;
    testTextBusy: string;
    testImage: string;
    testImageBusy: string;
    testImageEdit: string;
    testImageEditBusy: string;
    checkUpdates: string;
    startUsing: string;
    skip: string;
    close: string;
    enlarge: string;
    openRecommended: string;
    inspect: string;
    applyTemplate: string;
    savePromptTemplate: string;
    deleteTemplate: string;
    selectRecord: string;
    selectVisible: string;
    clearSelection: string;
    deleteSelected: string;
    deleteSelectedBusy: string;
    openOutputDirectory: string;
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
    customWidth: string;
    customHeight: string;
    templateSearch: string;
    templateSearchPlaceholder: string;
    templateTitle: string;
    templateTitlePlaceholder: string;
    templateCategory: string;
    historySearch: string;
    historySearchPlaceholder: string;
    historyStatus: string;
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
    statusAll: string;
    statusSuccess: string;
    statusFailed: string;
    statusCancelled: string;
    categoryAll: string;
    categoryPortrait: string;
    categoryProduct: string;
    categorySocial: string;
    categoryStyle: string;
    categoryCustom: string;
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
    supportTitle: string;
    supportHint: string;
    supportRecommendation: string;
    supportZoomHint: string;
    referenceImages: string;
    promptTemplateLibrary: string;
    customPromptTemplate: string;
    filteredRecords: string;
    selectedRecords: string;
    historyFilters: string;
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
    mode: string;
    sourceImages: string;
    size: string;
    quality: string;
    format: string;
    compression: string;
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
  };
  empty: {
    noHistorySelected: string;
    noHistorySaved: string;
    loadingRuntime: string;
    noReferenceImages: string;
    noPromptTemplates: string;
    noHistoryMatches: string;
  };
  notes: {
    optimizedPromptLinked: string;
    openOutputDesktopOnly: string;
    webHistoryUnavailable: string;
    defaultsDescription: string;
    outputDescription: string;
    currentVersionManualUpdate: string;
    referenceImageHint: string;
    imageToImageModeDescription: string;
    imageEditTestDescription: string;
    referenceImageLimitHint: string;
    dragAndDropHint: string;
    sizeConstraintsHint: string;
    customSizeHint: string;
    compressionHint: string;
    compressionUnavailable: string;
    promptTemplateLibraryDescription: string;
    customPromptTemplateDescription: string;
    historyFilterDescription: string;
  };
  welcome: {
    title: string;
    intro: string;
    recommendedTitle: string;
    recommendedBody: string;
    quickStartTitle: string;
    quickStartBody: string;
  };
  support: {
    trigger: string;
    modalTitle: string;
    body: string;
    zoomTitle: string;
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
    textTestSuccess: (response: string) => string;
    textTestFailed: (detail: string) => string;
    imageTestSuccess: (count: number) => string;
    imageTestFailed: (detail: string) => string;
    imageEditTestSuccess: (count: number) => string;
    imageEditTestFailed: (detail: string) => string;
    openOutputFailed: (detail: string) => string;
    historyPreviewUnavailable: string;
    historyPreviewPreparationFailed: (detail: string) => string;
    generatedPreviewLoadFailed: string;
    updateStatus: (version: string) => string;
    runtimeUnavailable: string;
    promptTemplateApplied: (title: string) => string;
    promptTemplatePromptRequired: string;
    promptTemplateSaved: (title: string) => string;
    promptTemplateSaveFailed: (detail: string) => string;
    promptTemplateRemoved: (title: string) => string;
    promptTemplateDeleteFailed: (detail: string) => string;
    promptTemplateUntitled: string;
    historySelectionSummary: (selectedCount: number, visibleCount: number) => string;
    historySelected: (count: number) => string;
    historySelectionCleared: string;
    historyDeleted: (count: number) => string;
    historyDeleteFailed: (detail: string) => string;
    openOutputDirectoryOpened: string;
    openOutputDirectoryUnavailableWeb: string;
  };
  errors: Record<
    UserErrorKind,
    {
      title: string;
      message: string;
      retryAdvice: string;
    }
  >;
  promptTemplates: Record<string, string>;
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
      languageChinese: "简体中文",
      languageEnglish: "English",
      statusLabel: "当前状态",
      environment: "当前运行环境",
    },
    tabs: {
      generate: "生成",
      history: "历史",
      settings: "设置",
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
      chooseDirectory: "选择目录",
      chooseImage: "选择图片",
      changeImage: "继续添加图片",
      removeImage: "移除",
      clearImages: "清空全部",
      save: "保存配置",
      saveBusy: "正在保存...",
      testText: "测试文字模型",
      testTextBusy: "测试中...",
      testImage: "测试文生图",
      testImageBusy: "测试中...",
      testImageEdit: "测试图生图",
      testImageEditBusy: "测试中...",
      checkUpdates: "检查更新",
      startUsing: "开始使用",
      skip: "跳过",
      close: "关闭",
      enlarge: "点击放大",
      openRecommended: "前往推荐中转站",
      inspect: "查看",
      applyTemplate: "使用模板",
      savePromptTemplate: "保存为我的模板",
      deleteTemplate: "删除模板",
      selectRecord: "选择记录",
      selectVisible: "选择当前结果",
      clearSelection: "清空选择",
      deleteSelected: "删除所选",
      deleteSelectedBusy: "正在删除...",
      openOutputDirectory: "打开保存目录",
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
      customWidth: "自定义宽度",
      customHeight: "自定义高度",
      templateSearch: "搜索模板",
      templateSearchPlaceholder: "按标题或提示词搜索",
      templateTitle: "模板标题",
      templateTitlePlaceholder: "例如：我的商品主图模板",
      templateCategory: "模板分类",
      historySearch: "搜索历史",
      historySearchPlaceholder: "按提示词、模型、路径或错误信息搜索",
      historyStatus: "记录状态",
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
      statusAll: "全部状态",
      statusSuccess: "成功",
      statusFailed: "失败",
      statusCancelled: "已取消",
      categoryAll: "全部分类",
      categoryPortrait: "人物肖像",
      categoryProduct: "商品宣传",
      categorySocial: "社媒封面",
      categoryStyle: "风格化",
      categoryCustom: "我的模板",
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
      supportTitle: "请作者喝杯可乐",
      supportHint: "如果这个工具帮你省了时间，可以支持作者继续维护。",
      supportRecommendation: "推荐使用微信支付",
      supportZoomHint: "点击二维码可放大查看。",
      referenceImages: "当前参考图",
      promptTemplateLibrary: "提示词模板库",
      customPromptTemplate: "保存当前提示词",
      filteredRecords: "筛选结果",
      selectedRecords: "已选记录",
      historyFilters: "历史筛选",
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
      mode: "生成模式",
      sourceImages: "参考图",
      size: "尺寸",
      quality: "质量",
      format: "格式",
      compression: "压缩",
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
    },
    empty: {
      noHistorySelected: "还没有选中任何历史记录。",
      noHistorySaved: "还没有保存任何图片记录。",
      loadingRuntime: "正在读取本地配置和历史记录...",
      noReferenceImages: "还没有添加参考图。",
      noPromptTemplates: "没有找到匹配的提示词模板。",
      noHistoryMatches: "没有符合筛选条件的历史记录。",
    },
    notes: {
      optimizedPromptLinked: "优化稿与当前提示词绑定；原提示词发生变化时，会自动清空旧优化稿，避免误用。",
      openOutputDesktopOnly: "“打开输出位置”仅在桌面模式可用。",
      webHistoryUnavailable: "网页模式无法直接读取旧文件预览，你仍然可以在本地目录中手动查看。",
      defaultsDescription:
        "这里可以设置超时时间、默认图片数量、尺寸、质量、格式和压缩。生成高分辨率图片时，建议把超时时间保持在 180 秒以上。",
      outputDescription: "你可以指定默认保存目录，也可以在桌面模式中直接调起目录选择器。",
      currentVersionManualUpdate: "本版本只提供手动更新提示，不会自动下载或安装新版本。",
      referenceImageHint: "这些参考图会和提示词一起发送给图像模型，推荐不超过 4 张。",
      imageToImageModeDescription: "图生图会把多张参考图和提示词一起发送到 `/images/edits`。",
      imageEditTestDescription: "“测试图生图”会使用内置的极小参考图，验证当前图像模型是否支持图生图接口。",
      referenceImageLimitHint: "最多支持 8 张参考图，推荐不超过 4 张。",
      dragAndDropHint: "支持多选上传，也支持从文件夹中直接拖拽图片到上传区。",
      sizeConstraintsHint:
        "官方文档说明 gpt-image-2 支持任意满足约束的分辨率，常见尺寸包括 1024x1024、1536x1024、1024x1536、2048x2048、2048x1152、3840x2160 和 2160x3840。总像素高于 2560x1440 时属于实验区，兼容服务商的实际支持仍可能不同。",
      customSizeHint: "自定义尺寸适合高级用法；只要满足约束就可以尝试，但兼容服务商不支持时仍会返回接口错误。",
      compressionHint: "output_compression 仅对 JPEG / WebP 生效；数值越高通常画质越高、文件也越大。",
      compressionUnavailable: "PNG 不使用压缩参数。",
      promptTemplateLibraryDescription: "内置常用场景模板，也可以把当前提示词保存成本地个人模板。",
      customPromptTemplateDescription: "保存后仅写入当前用户本地配置，不会进入仓库或上传到服务器。",
      historyFilterDescription: "可以按关键词和状态筛选记录，再批量选择或删除本地历史。",
    },
    welcome: {
      title: "欢迎来到本地生图工作台",
      intro: "这是一个本地运行的生图工具。你的配置保存在当前用户自己的设备上，不会写进仓库源码。",
      recommendedTitle: "作者推荐中转站",
      recommendedBody: "如果你还没有可用接口，可以先看看作者常用的中转站。",
      quickStartTitle: "先做这 4 步",
      quickStartBody: "去“设置”页填写 API key、Base URL、文字模型、生图模型和保存目录。你也可以先做最小连通性测试，再决定是否保存。",
    },
    support: {
      trigger: "请作者喝杯可乐",
      modalTitle: "请作者喝杯可乐",
      body: "如果这个工具对你有帮助，欢迎支持作者继续优化体验。",
      zoomTitle: "微信收款码",
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
      outputSelected: (directory) => `已选择保存目录：${directory}`,
      chooseDirectoryUnavailableWeb: "当前浏览器或运行环境不支持目录选择，请手动填写保存目录。",
      chooseDirectoryCancelled: "未选择任何目录。",
      chooseDirectoryFailed: (detail) => `选择目录失败。${detail}`,
      textTestSuccess: (response) => `文字模型响应成功：${response}`,
      textTestFailed: (detail) => `文字模型测试失败。${detail}`,
      imageTestSuccess: (count) => `文生图响应成功，共返回 ${count} 张图片。`,
      imageTestFailed: (detail) => `文生图测试失败。${detail}`,
      imageEditTestSuccess: (count) => `图生图响应成功，共返回 ${count} 张图片。`,
      imageEditTestFailed: (detail) => `图生图测试失败。${detail}`,
      openOutputFailed: (detail) => `无法打开输出路径。${detail}`,
      historyPreviewUnavailable: "当前运行环境无法直接预览这张已保存图片。",
      historyPreviewPreparationFailed: (detail) => `准备历史预览失败。${detail}`,
      generatedPreviewLoadFailed: "图片已保存，但预览加载失败。",
      updateStatus: (version) => `当前版本：${version}。如需更新，请手动下载安装新版本。`,
      runtimeUnavailable: "当前运行环境尚未加载完成，请稍后再试。",
      promptTemplateApplied: (title) => `已使用提示词模板：${title}`,
      promptTemplatePromptRequired: "请先输入或生成一段实际提示词，再保存为模板。",
      promptTemplateSaved: (title) => `已保存个人模板：${title}`,
      promptTemplateSaveFailed: (detail) => `保存提示词模板失败。${detail}`,
      promptTemplateRemoved: (title) => `已删除个人模板：${title}`,
      promptTemplateDeleteFailed: (detail) => `删除提示词模板失败。${detail}`,
      promptTemplateUntitled: "未命名模板",
      historySelectionSummary: (selectedCount, visibleCount) =>
        `已选择 ${selectedCount} 条；当前筛选显示 ${visibleCount} 条。`,
      historySelected: (count) => `已选择当前筛选结果中的 ${count} 条记录。`,
      historySelectionCleared: "已清空历史记录选择。",
      historyDeleted: (count) => `已删除 ${count} 条历史记录。图片文件不会被自动删除。`,
      historyDeleteFailed: (detail) => `删除历史记录失败。${detail}`,
      openOutputDirectoryOpened: "已打开保存目录。",
      openOutputDirectoryUnavailableWeb: "网页模式不能直接打开本机目录；请在桌面版中使用，或手动打开保存路径。",
    },
    errors: {
      auth: {
        title: "鉴权失败",
        message: "请检查 API key、Base URL 和模型供应商账户状态。当前请求没有通过鉴权。",
        retryAdvice: "不要直接重试；先修正配置并使用设置页的测试按钮验证。",
      },
      provider: {
        title: "模型供应商异常",
        message: "请求已到达模型供应商或中转站，但上游返回了异常状态，可能是供应商暂时不可用。",
        retryAdvice: "再次调用可能仍然产生费用。建议等待几分钟，或确认供应商恢复后手动重试。",
      },
      timeout: {
        title: "请求超时",
        message: "图片生成耗时超过了当前超时设置，服务端可能仍在处理或已经失败。",
        retryAdvice: "不会自动重试。若确认供应商正常，可以先增加超时时间，再手动发起新请求。",
      },
      "empty-image": {
        title: "未返回图片数据",
        message: "接口返回了响应，但响应中没有可保存的图片数据。这通常是模型供应商或兼容接口异常。",
        retryAdvice: "再次调用可能仍然产生费用。建议先测试图片模型，确认正常后再手动重试。",
      },
      network: {
        title: "网络连接失败",
        message: "当前设备无法连接到配置的 Base URL，或浏览器/系统拦截了请求。",
        retryAdvice: "不会自动重试。请检查网络、Base URL 和代理设置后手动重试。",
      },
      unknown: {
        title: "未知错误",
        message: "请求失败，但应用无法确定具体原因。",
        retryAdvice: "不会自动重试。请查看技术详情，确认配置和供应商状态后再手动重试。",
      },
    },
    promptTemplates: {
      "built-in-portrait-graduation": "毕业照肖像",
      "built-in-portrait-profile": "职业头像",
      "built-in-product-poster": "商品宣传海报",
      "built-in-product-lifestyle": "商品生活方式场景",
      "built-in-social-cover": "社媒封面图",
      "built-in-style-clay": "软陶 3D 插画",
      "built-in-style-film": "电影感剧照",
    },
    validation: {
      "Base URL must be a valid URL.": "Base URL 必须是有效的 URL。",
      "API key is required.": "必须填写 API key。",
      "Text model is required.": "必须填写文字模型。",
      "Image model is required.": "必须填写生图模型。",
      "Timeout must be at least 180 seconds.": "超时时间至少需要 180 秒。",
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
      languageChinese: "简体中文",
      languageEnglish: "English",
      statusLabel: "Status",
      environment: "Current runtime",
    },
    tabs: {
      generate: "Generate",
      history: "History",
      settings: "Settings",
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
      chooseDirectory: "Choose directory",
      chooseImage: "Choose images",
      changeImage: "Add more images",
      removeImage: "Remove",
      clearImages: "Clear all",
      save: "Save settings",
      saveBusy: "Saving...",
      testText: "Test text model",
      testTextBusy: "Testing...",
      testImage: "Test text-to-image",
      testImageBusy: "Testing...",
      testImageEdit: "Test image-to-image",
      testImageEditBusy: "Testing...",
      checkUpdates: "Check updates",
      startUsing: "Start using",
      skip: "Skip",
      close: "Close",
      enlarge: "Click to enlarge",
      openRecommended: "Open recommended relay",
      inspect: "Inspect",
      applyTemplate: "Use template",
      savePromptTemplate: "Save as my template",
      deleteTemplate: "Delete template",
      selectRecord: "Select record",
      selectVisible: "Select visible",
      clearSelection: "Clear selection",
      deleteSelected: "Delete selected",
      deleteSelectedBusy: "Deleting...",
      openOutputDirectory: "Open save folder",
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
      customWidth: "Custom width",
      customHeight: "Custom height",
      templateSearch: "Search templates",
      templateSearchPlaceholder: "Search by title or prompt text",
      templateTitle: "Template title",
      templateTitlePlaceholder: "Example: My product hero template",
      templateCategory: "Template category",
      historySearch: "Search history",
      historySearchPlaceholder: "Search prompts, models, paths, or error text",
      historyStatus: "Record status",
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
      statusAll: "All statuses",
      statusSuccess: "Success",
      statusFailed: "Failed",
      statusCancelled: "Cancelled",
      categoryAll: "All categories",
      categoryPortrait: "Portrait",
      categoryProduct: "Product",
      categorySocial: "Social",
      categoryStyle: "Style",
      categoryCustom: "My templates",
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
      supportTitle: "Buy the author a cola",
      supportHint: "If this tool saves you time, you can support the author to keep maintaining it.",
      supportRecommendation: "WeChat Pay is recommended",
      supportZoomHint: "Click the QR code to enlarge it.",
      referenceImages: "Reference images",
      promptTemplateLibrary: "Prompt template library",
      customPromptTemplate: "Save current prompt",
      filteredRecords: "Filtered records",
      selectedRecords: "Selected records",
      historyFilters: "History filters",
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
      mode: "Mode",
      sourceImages: "Source images",
      size: "Size",
      quality: "Quality",
      format: "Format",
      compression: "Compression",
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
    },
    empty: {
      noHistorySelected: "No history item is selected yet.",
      noHistorySaved: "No image records have been saved yet.",
      loadingRuntime: "Loading local settings and history...",
      noReferenceImages: "No reference images have been added yet.",
      noPromptTemplates: "No matching prompt templates were found.",
      noHistoryMatches: "No history records match the current filters.",
    },
    notes: {
      optimizedPromptLinked: "The optimized draft is tied to the current prompt. If the source prompt changes, the old optimized draft is cleared automatically.",
      openOutputDesktopOnly: "\"Open output\" is available only in desktop mode.",
      webHistoryUnavailable: "The web runtime cannot preview older local files directly. You can still open them manually from the output directory.",
      defaultsDescription:
        "Set timeout, default image count, size, quality, format, and compression here. For long-running generations, keep the timeout at 180 seconds or more.",
      outputDescription: "Set a default save location, or open the directory picker directly in desktop mode.",
      currentVersionManualUpdate: "This release only shows manual update guidance. It does not download updates automatically.",
      referenceImageHint: "These images are sent to the image model together with the prompt. Staying at 4 or fewer is recommended.",
      imageToImageModeDescription: "Image-to-image sends multiple reference images and the prompt together to `/images/edits`.",
      imageEditTestDescription: "Test image-to-image uses a tiny built-in reference image to check whether the current image model supports the edit endpoint.",
      referenceImageLimitHint: "Up to 8 reference images are supported. 4 or fewer is recommended.",
      dragAndDropHint: "You can select multiple images or drag them directly from a folder into the drop zone.",
      sizeConstraintsHint:
        "The official docs say gpt-image-2 supports any resolution that meets the limits. Common sizes include 1024x1024, 1536x1024, 1024x1536, 2048x2048, 2048x1152, 3840x2160, and 2160x3840. Outputs above 2560x1440 total pixels are experimental, and provider compatibility can still vary.",
      customSizeHint: "Custom sizes are for advanced use. Any size that meets the limits can be tried, but a compatible provider may still reject unsupported values.",
      compressionHint: "output_compression only applies to JPEG and WebP. Higher values usually mean higher quality and larger files.",
      compressionUnavailable: "PNG does not use a compression parameter.",
      promptTemplateLibraryDescription: "Use built-in scenario templates, or save the current prompt as a local personal template.",
      customPromptTemplateDescription: "Saved templates stay in this user's local settings and are not uploaded or written into the repository.",
      historyFilterDescription: "Filter records by keyword and status, then select or delete local history in batches.",
    },
    welcome: {
      title: "Welcome to Local Image Studio",
      intro: "This is a local image generation tool. Your settings are stored on the current user's device and are not written into the repository.",
      recommendedTitle: "Author-recommended relay",
      recommendedBody: "If you do not have an available endpoint yet, you can start with the relay the author uses most often.",
      quickStartTitle: "Start with these 4 steps",
      quickStartBody: "Go to Settings and fill in API key, Base URL, text model, image model, and output directory. You can run minimal connectivity tests before saving, but saving is still allowed even if tests fail.",
    },
    support: {
      trigger: "Buy the author a cola",
      modalTitle: "Buy the author a cola",
      body: "If this tool is useful to you, you can support the author to keep improving it.",
      zoomTitle: "WeChat payment QR",
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
      outputSelected: (directory) => `Output directory selected: ${directory}`,
      chooseDirectoryUnavailableWeb: "Directory picking is unavailable in this browser/runtime. Enter the output directory manually.",
      chooseDirectoryCancelled: "No directory was selected.",
      chooseDirectoryFailed: (detail) => `Failed to choose a directory. ${detail}`,
      textTestSuccess: (response) => `Text model responded: ${response}`,
      textTestFailed: (detail) => `Text model test failed. ${detail}`,
      imageTestSuccess: (count) => `Text-to-image responded with ${count} image${count === 1 ? "" : "s"}.`,
      imageTestFailed: (detail) => `Text-to-image test failed. ${detail}`,
      imageEditTestSuccess: (count) => `Image-to-image responded with ${count} image${count === 1 ? "" : "s"}.`,
      imageEditTestFailed: (detail) => `Image-to-image test failed. ${detail}`,
      openOutputFailed: (detail) => `Could not open the output path. ${detail}`,
      historyPreviewUnavailable: "The current runtime cannot preview this saved image directly.",
      historyPreviewPreparationFailed: (detail) => `Could not prepare a preview for this saved output. ${detail}`,
      generatedPreviewLoadFailed: "The image was saved, but the preview failed to load afterward.",
      updateStatus: (version) => `Current version: ${version}. To update, download and install a newer release manually.`,
      runtimeUnavailable: "The current runtime has not finished loading. Try again shortly.",
      promptTemplateApplied: (title) => `Prompt template applied: ${title}`,
      promptTemplatePromptRequired: "Enter or prepare an effective prompt before saving it as a template.",
      promptTemplateSaved: (title) => `Personal template saved: ${title}`,
      promptTemplateSaveFailed: (detail) => `Failed to save prompt template. ${detail}`,
      promptTemplateRemoved: (title) => `Personal template deleted: ${title}`,
      promptTemplateDeleteFailed: (detail) => `Failed to delete prompt template. ${detail}`,
      promptTemplateUntitled: "Untitled template",
      historySelectionSummary: (selectedCount, visibleCount) =>
        `${selectedCount} selected; ${visibleCount} visible with the current filters.`,
      historySelected: (count) => `${count} visible history record${count === 1 ? "" : "s"} selected.`,
      historySelectionCleared: "History selection cleared.",
      historyDeleted: (count) =>
        `${count} history record${count === 1 ? "" : "s"} deleted. Image files are not deleted automatically.`,
      historyDeleteFailed: (detail) => `Failed to delete history records. ${detail}`,
      openOutputDirectoryOpened: "Save folder opened.",
      openOutputDirectoryUnavailableWeb: "Web mode cannot open local folders directly. Use the desktop app or open the path manually.",
    },
    errors: {
      auth: {
        title: "Authentication failed",
        message: "Check the API key, Base URL, and provider account status. The request was not authorized.",
        retryAdvice: "Do not retry immediately. Fix the settings first, then use the test buttons in Settings.",
      },
      provider: {
        title: "Provider or upstream failure",
        message: "The request reached the provider or relay, but the upstream service returned an abnormal response.",
        retryAdvice:
          "Retrying may still incur cost. Wait a few minutes or confirm the provider recovered before retrying manually.",
      },
      timeout: {
        title: "Request timed out",
        message: "The generation exceeded the configured timeout. The server may still be processing or may have failed.",
        retryAdvice:
          "The app will not retry automatically. If the provider is healthy, increase the timeout before retrying manually.",
      },
      "empty-image": {
        title: "No image data returned",
        message: "The API returned a response, but it contained no image data that could be saved.",
        retryAdvice: "Retrying may still incur cost. Test the image model first, then retry manually after it looks healthy.",
      },
      network: {
        title: "Network connection failed",
        message: "This device could not connect to the configured Base URL, or the request was blocked.",
        retryAdvice: "The app will not retry automatically. Check the network, Base URL, and proxy settings before retrying.",
      },
      unknown: {
        title: "Unknown error",
        message: "The request failed, but the app could not identify a specific cause.",
        retryAdvice:
          "The app will not retry automatically. Review the technical detail, settings, and provider status before retrying.",
      },
    },
    promptTemplates: {
      "built-in-portrait-graduation": "Graduation portrait",
      "built-in-portrait-profile": "Professional profile photo",
      "built-in-product-poster": "Product poster",
      "built-in-product-lifestyle": "Lifestyle product scene",
      "built-in-social-cover": "Social media cover",
      "built-in-style-clay": "Soft clay illustration",
      "built-in-style-film": "Cinematic film still",
    },
    validation: {
      "Base URL must be a valid URL.": "Base URL must be a valid URL.",
      "API key is required.": "API key is required.",
      "Text model is required.": "Text model is required.",
      "Image model is required.": "Image model is required.",
      "Timeout must be at least 180 seconds.": "Timeout must be at least 180 seconds.",
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
  const resolvedLanguage = resolveLanguage(language);
  const copy = getTranslations(resolvedLanguage);
  const classified = classifyErrorForUser(error);
  const errorCopy = copy.errors[classified.kind];
  const separator = resolvedLanguage === "zh-CN" ? "：" : ": ";

  return `${errorCopy.title}${separator}${errorCopy.message} ${errorCopy.retryAdvice} ${classified.technicalDetail}`.trim();
}
