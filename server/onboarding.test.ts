import { describe, expect, it } from "vitest";
import {
  tutorialCompletionKey,
  tutorialIsComplete,
  tutorialScopeForUser,
} from "../client/src/game/onboarding";

describe("account-specific tutorial onboarding", () => {
  it("creates independent scopes for different signed-in accounts", () => {
    const first = tutorialScopeForUser(12);
    const second = tutorialScopeForUser(13);
    expect(first).not.toBe(second);
    expect(tutorialCompletionKey(first)).not.toBe(tutorialCompletionKey(second));
  });

  it("does not let a guest completion hide the tutorial from a first-time account", () => {
    const stored = new Map([["last-relic-tutorial-v2", "complete"]]);
    const read = (key: string) => stored.get(key) ?? null;

    expect(tutorialIsComplete(tutorialScopeForUser(null), read)).toBe(true);
    expect(tutorialIsComplete(tutorialScopeForUser("new-player"), read)).toBe(false);
  });

  it("remembers completion independently for each account", () => {
    const firstScope = tutorialScopeForUser(4);
    const secondScope = tutorialScopeForUser(5);
    const stored = new Map([[tutorialCompletionKey(firstScope), "complete"]]);
    const read = (key: string) => stored.get(key) ?? null;

    expect(tutorialIsComplete(firstScope, read)).toBe(true);
    expect(tutorialIsComplete(secondScope, read)).toBe(false);
  });
});
