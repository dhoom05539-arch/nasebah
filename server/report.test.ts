import { describe, expect, it } from "vitest";
import { checkInWindow, currentLateStatus, lateMinutesFor, LATE_GRACE_MINUTES, parseSchedule } from "./report";

describe("monthly attendance report rules", () => {
  it("does not count the first 20 minutes as late", () => {
    expect(lateMinutesFor(420, 439)).toBe(0);
    expect(lateMinutesFor(420, 440)).toBe(0);
    expect(lateMinutesFor(420, 441)).toBe(1);
    expect(LATE_GRACE_MINUTES).toBe(20);
  });

  it("reads weekly schedule minutes and days off", () => {
    const schedule = parseSchedule('{"0":420,"1":null,"2":900}');
    expect(schedule["0"]).toBe(420);
    expect(schedule["1"]).toBeNull();
    expect(schedule["2"]).toBe(900);
  });

  it("marks a scheduled check-in late only after the grace period", () => {
    const schedule = '{"1":420}';
    const onTime = currentLateStatus(schedule, new Date("2026-09-07T04:19:00.000Z"));
    const late = currentLateStatus(schedule, new Date("2026-09-07T04:21:00.000Z"));
    expect(onTime.scheduled).toBe(true);
    expect(onTime.lateMinutes).toBe(0);
    expect(late.lateMinutes).toBe(1);
  });

  it("allows check-in only within ten minutes before shift start", () => {
    const tooEarly = checkInWindow('{"1":420}', new Date("2026-09-07T03:40:00.000Z"));
    const allowed = checkInWindow('{"1":420}', new Date("2026-09-07T03:51:00.000Z"));
    expect(tooEarly.allowed).toBe(false);
    expect(tooEarly.minutesUntilStart).toBe(20);
    expect(allowed.allowed).toBe(true);
  });
});
