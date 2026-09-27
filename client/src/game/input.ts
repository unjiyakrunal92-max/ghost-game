export type SwipePoint = { x: number; y: number };
export type SwipeDirection = "up" | "down" | "left" | "right";
export const MOBILE_JOYSTICK_STORAGE_KEY = "last-relic-mobile-joystick";

/** Return the dominant cardinal direction for a meaningful board swipe. */
export function directionFromSwipe(
  start: SwipePoint,
  end: SwipePoint,
  minimumDistance = 30,
): SwipeDirection | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.hypot(dx, dy) < minimumDistance) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "down" : "up";
}

/** Smaller dead-zone for short joystick drags on a phone-sized control. */
export function directionFromJoystick(
  center: SwipePoint,
  point: SwipePoint,
  minimumDistance = 12,
): SwipeDirection | null {
  return directionFromSwipe(center, point, minimumDistance);
}

/** Joystick starts enabled for discoverability; an explicit "off" stays off. */
export function readJoystickPreference(readValue: (key: string) => string | null): boolean {
  return readValue(MOBILE_JOYSTICK_STORAGE_KEY) !== "off";
}
