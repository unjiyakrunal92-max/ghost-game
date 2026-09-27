import { describe, expect, it } from "vitest";
import {
  directionFromJoystick,
  directionFromSwipe,
  MOBILE_JOYSTICK_STORAGE_KEY,
  readJoystickPreference,
} from "../client/src/game/input";

describe("touch swipe movement", () => {
  it.each([
    [{ x: 0, y: 0 }, { x: 80, y: 10 }, "right"],
    [{ x: 80, y: 0 }, { x: 0, y: 8 }, "left"],
    [{ x: 0, y: 80 }, { x: 9, y: 0 }, "up"],
    [{ x: 0, y: 0 }, { x: 7, y: 90 }, "down"],
  ] as const)("maps a dominant swipe to %s", (start, end, expected) => {
    expect(directionFromSwipe(start, end)).toBe(expected);
  });

  it("ignores short taps and small jitter", () => {
    expect(directionFromSwipe({ x: 12, y: 12 }, { x: 30, y: 20 })).toBeNull();
  });

  it("uses the dominant axis for diagonal swipes", () => {
    expect(directionFromSwipe({ x: 0, y: 0 }, { x: 44, y: 90 })).toBe("down");
  });

  it("moves from a short joystick flick but ignores contact at the center", () => {
    expect(directionFromJoystick({ x: 50, y: 50 }, { x: 50, y: 34 })).toBe("up");
    expect(directionFromJoystick({ x: 50, y: 50 }, { x: 54, y: 51 })).toBeNull();
  });

  it("defaults the joystick on and honors a saved off toggle", () => {
    const values = new Map<string, string>();
    const read = (key: string) => values.get(key) ?? null;
    expect(readJoystickPreference(read)).toBe(true);
    values.set(MOBILE_JOYSTICK_STORAGE_KEY, "off");
    expect(readJoystickPreference(read)).toBe(false);
    values.set(MOBILE_JOYSTICK_STORAGE_KEY, "on");
    expect(readJoystickPreference(read)).toBe(true);
  });
});
