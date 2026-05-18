export function updateBatchDocumentTitle(done: number, total: number, baseTitle = "GPT Image 2 Studio") {
  document.title = `${done}/${total} 生成中 - ${baseTitle}`;
}

export function restoreDocumentTitle(baseTitle = "GPT Image 2 Studio") {
  document.title = baseTitle;
}

export async function notifyBatchComplete(title: string, body: string): Promise<boolean> {
  if (typeof Notification === "undefined") {
    return false;
  }

  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }

  if (Notification.permission !== "granted") {
    return false;
  }

  new Notification(title, { body });
  return true;
}
