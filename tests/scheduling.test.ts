import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addCalendarDays,
  buildEveningSlots,
  etDate,
  etTime,
  formatChinaPreview,
  parseScheduledValue,
  zonedDateTimeToIso,
} from '../src/utils/scheduling.ts';

test('converts ET wall time with the DST-correct offset', () => {
  assert.equal(zonedDateTimeToIso('2026-01-15', '18:30'), '2026-01-15T23:30:00.000Z');
  assert.equal(zonedDateTimeToIso('2026-08-01', '18:30'), '2026-08-01T22:30:00.000Z');
});

test('rejects nonexistent spring-forward time and resolves repeated fall-back time consistently', () => {
  assert.equal(zonedDateTimeToIso('2026-03-08', '02:30'), null);
  assert.equal(zonedDateTimeToIso('2026-11-01', '01:30'), '2026-11-01T05:30:00.000Z');
});

test('shows China next-day labels from the selected instant', () => {
  const instant = zonedDateTimeToIso('2026-08-01', '18:30');
  assert.ok(instant);
  assert.match(formatChinaPreview(instant), /Sun, Aug 2/);
  assert.match(formatChinaPreview(instant), /6:30 AM/);
});

test('preserves date-only legacy values as calendar dates', () => {
  assert.deepEqual(parseScheduledValue('2026-08-01'), {
    kind: 'date-only',
    date: '2026-08-01',
  });
  assert.equal(etDate('2026-08-01'), '2026-08-01');
});

test('builds bounded half-hour evening slots without shifting the chosen instant', () => {
  const slots = buildEveningSlots('2026-08-01');
  assert.equal(slots.length, 14);
  assert.equal(slots[0].etTime, '17:00');
  assert.equal(slots.at(-1)?.etTime, '23:30');
  assert.equal(etDate(slots[3].instant), '2026-08-01');
  assert.equal(etTime(slots[3].instant), '18:30');
  assert.equal(addCalendarDays('2026-08-01', 1), '2026-08-02');
});

test('classifies missing and invalid values safely', () => {
  assert.deepEqual(parseScheduledValue(''), { kind: 'empty' });
  assert.deepEqual(parseScheduledValue('not-a-date'), { kind: 'invalid', value: 'not-a-date' });
});
