import { useRef, useState } from "react";

/** Lock synchronously: React's next render can arrive after a second submit event. */
export function useSubmitLock() {
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const run = async (action: () => void | Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    try {
      await action();
    } finally {
      locked.current = false;
      setPending(false);
    }
  };
  return { pending, run };
}
