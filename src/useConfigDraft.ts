import { useEffect, useRef, useState } from "react";
/** In-memory drafts preserve secrets only for the lifetime of this page. */
export function useConfigDraft<T extends object>(
  incoming: T,
  version: number | undefined,
) {
  const [draft, setDraft] = useState(incoming),
    [base, setBase] = useState(incoming),
    baseVersion = useRef(version);
  const incomingKey = JSON.stringify(incoming),
    draftKey = JSON.stringify(draft),
    baseKey = JSON.stringify(base);
  const dirty = draftKey !== baseKey,
    conflict = dirty && incomingKey !== baseKey && incomingKey !== draftKey;
  useEffect(() => {
    if (incomingKey === baseKey) baseVersion.current = version;
    if (!dirty || incomingKey === draftKey) {
      setDraft(incoming);
      setBase(incoming);
      baseVersion.current = version;
    }
  }, [incomingKey, version]);
  const discard = () => {
    setDraft(incoming);
    setBase(incoming);
    baseVersion.current = version;
  };
  const rebase = () => {
    const changes = Object.fromEntries(
      Object.keys(draft)
        .filter(
          (key) =>
            JSON.stringify(draft[key as keyof T]) !==
            JSON.stringify(base[key as keyof T]),
        )
        .map((key) => [key, draft[key as keyof T]]),
    );
    setDraft({ ...incoming, ...changes });
    setBase(incoming);
    baseVersion.current = version;
  };
  return {
    draft,
    setDraft,
    dirty,
    conflict,
    baseVersion,
    discard,
    rebase,
    changedFields: Object.keys(incoming).filter(
      (key) =>
        JSON.stringify(incoming[key as keyof T]) !==
        JSON.stringify(base[key as keyof T]),
    ),
  };
}
