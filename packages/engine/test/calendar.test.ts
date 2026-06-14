import { describe, expect, it } from 'vitest';
import { EventCalendar } from '../src/calendar.js';

describe('EventCalendar', () => {
  it('pops events in time order regardless of insertion order', () => {
    const cal = new EventCalendar();
    const order: number[] = [];
    cal.schedule(5, () => order.push(5));
    cal.schedule(1, () => order.push(1));
    cal.schedule(3, () => order.push(3));
    for (let ev = cal.next(); ev; ev = cal.next()) ev.fn();
    expect(order).toEqual([1, 3, 5]);
  });

  it('breaks ties in FIFO insertion order', () => {
    const cal = new EventCalendar();
    const order: string[] = [];
    cal.schedule(2, () => order.push('a'));
    cal.schedule(2, () => order.push('b'));
    cal.schedule(2, () => order.push('c'));
    for (let ev = cal.next(); ev; ev = cal.next()) ev.fn();
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('returns undefined when empty and tracks size', () => {
    const cal = new EventCalendar();
    expect(cal.next()).toBeUndefined();
    cal.schedule(1, () => {});
    expect(cal.size).toBe(1);
    cal.next();
    expect(cal.size).toBe(0);
  });

  it('pops 500 bulk-scheduled events in sorted order', () => {
    const cal = new EventCalendar();
    const popped: number[] = [];
    for (let i = 0; i < 500; i++) cal.schedule(Math.sin(i * 999) * 100 + 100, () => {});
    for (let ev = cal.next(); ev; ev = cal.next()) popped.push(ev.time);
    const sorted = [...popped].sort((a, b) => a - b);
    expect(popped).toEqual(sorted);
  });
});
