import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
// Operator drafts live only in this renderer session. Credentials are never stored here.
const drafts = new Map<string, unknown>();
export function useMemoryState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() =>
    drafts.has(key) ? (drafts.get(key) as T) : initial,
  );
  useEffect(() => {
    setValue(drafts.has(key) ? (drafts.get(key) as T) : initial);
  }, [key]);
  const update: Dispatch<SetStateAction<T>> = (next) =>
    setValue((previous) => {
      const result =
        typeof next === "function" ? (next as (value: T) => T)(previous) : next;
      drafts.set(key, result);
      if (drafts.size > 100) drafts.delete(drafts.keys().next().value!);
      return result;
    });
  return [value, update];
}
