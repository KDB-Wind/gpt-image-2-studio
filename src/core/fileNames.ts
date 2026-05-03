export type BuildImageFileNameInput = {
  customName: string;
  prompt: string;
  generatedAt: Date;
  format: "png" | "jpeg" | "webp";
  existingFileNames: string[];
};

const RESERVED_WINDOWS_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

export function formatDateFolder(date: Date): string {
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
}

export function formatLocalTime(date: Date): string {
  return [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join("-");
}

export function sanitizeFileBaseName(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
    .replace(/['`]+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  if (!sanitized) {
    return "image";
  }

  return RESERVED_WINDOWS_NAMES.has(sanitized) ? `${sanitized}-file` : sanitized;
}

export function summarizePrompt(prompt: string): string {
  return sanitizeFileBaseName(prompt)
    .split("-")
    .filter(Boolean)
    .slice(0, 8)
    .join("-");
}

export function buildImageFileName(input: BuildImageFileNameInput): string {
  const extension = normalizeExtension(input.format);
  const customName = sanitizeFileBaseName(input.customName);
  const baseName = input.customName.trim()
    ? customName
    : `${formatLocalTime(input.generatedAt)}_${summarizePrompt(input.prompt)}`;

  return addCollisionSuffix(baseName, extension, input.existingFileNames);
}

export function buildOutputPath(outputDirectory: string, generatedAt: Date, fileName: string): string {
  const baseDirectory = normalizeDirectory(outputDirectory) || "outputs";
  return `${baseDirectory}/${formatDateFolder(generatedAt)}/${fileName}`;
}

function addCollisionSuffix(baseName: string, extension: string, existingFileNames: string[]): string {
  const existing = new Set(existingFileNames.map((fileName) => fileName.toLowerCase()));
  const initialFileName = `${baseName}.${extension}`;

  if (!existing.has(initialFileName.toLowerCase())) {
    return initialFileName;
  }

  let index = 2;
  while (existing.has(`${baseName}-${index}.${extension}`.toLowerCase())) {
    index += 1;
  }

  return `${baseName}-${index}.${extension}`;
}

function normalizeDirectory(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/\/+$/g, "");
}

function normalizeExtension(value: string): string {
  return value.toLowerCase() === "jpeg" ? "jpg" : value.toLowerCase();
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
