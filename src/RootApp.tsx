import { useEffect, useState } from "react";

import App from "./App";
import { PlatformApp } from "./platform/PlatformApp";

type Edition = "basic" | "platform";
const EDITION_STORAGE_KEY = "chat-to-image.edition";

export default function RootApp() {
  const [edition, setEdition] = useState<Edition>(() => getInitialEdition(window.localStorage));

  useEffect(() => {
    window.localStorage.setItem(EDITION_STORAGE_KEY, edition);
  }, [edition]);

  if (edition === "basic") {
    return (
      <>
        <EditionSwitch edition={edition} onChange={setEdition} />
        <App />
      </>
    );
  }

  return (
    <>
      <EditionSwitch edition={edition} onChange={setEdition} />
      <PlatformApp onOpenBasicTool={() => setEdition("basic")} />
    </>
  );
}

export function getInitialEdition(storage: Pick<Storage, "getItem">): Edition {
  const stored = storage.getItem(EDITION_STORAGE_KEY);
  return stored === "platform" ? "platform" : "basic";
}

function EditionSwitch({
  edition,
  onChange,
}: {
  edition: Edition;
  onChange: (edition: Edition) => void;
}) {
  return (
    <nav className="edition-switch" aria-label="产品版本切换">
      <button
        type="button"
        className={edition === "platform" ? "active" : ""}
        onClick={() => onChange("platform")}
      >
        平台版
      </button>
      <button
        type="button"
        className={edition === "basic" ? "active" : ""}
        onClick={() => onChange("basic")}
      >
        基础工具版
      </button>
    </nav>
  );
}
