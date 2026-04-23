// Browser-only helper. Called on sign-in and sign-out so a new session
// starts with a clean slate — another user on the same device won't inherit
// the previous player's daily-completion cache or solo best score.
//
// Keys cleared:
//   - "solo-best-score"            — personal best cached between sessions
//   - "daily-challenge:<date>"     — one entry per UTC date, written by
//                                    DailyChallenge on game completion
//
// localStorage has no wildcard removal, so we enumerate and filter. Safe
// to call even when localStorage is disabled (private mode, sandboxed iframe).

export function clearGameLocalStorage(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null && key.startsWith("daily-challenge:")) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      localStorage.removeItem(key);
    }
    localStorage.removeItem("solo-best-score");
  } catch {
    // localStorage disabled — nothing to clear, ignore
  }
}
