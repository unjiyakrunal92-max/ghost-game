export type TutorialScope = "guest" | `account-${string}`;
type ReadValue = (key: string) => string | null;

export function tutorialScopeForUser(accountId?: number | string | null): TutorialScope {
  return accountId == null ? "guest" : `account-${accountId}`;
}

export function tutorialCompletionKey(scope: TutorialScope): string {
  return `last-relic-tutorial-v2:${scope}`;
}

export function tutorialIsComplete(scope: TutorialScope, readValue: ReadValue): boolean {
  if (readValue(tutorialCompletionKey(scope)) === "complete") return true;
  // Preserve the old guest-only preference, but never let it hide onboarding
  // from a newly signed-in account on a shared browser.
  return scope === "guest" && readValue("last-relic-tutorial-v2") === "complete";
}
