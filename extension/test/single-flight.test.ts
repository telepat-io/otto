import assert from 'node:assert/strict';
import test from 'node:test';
import { createSingleFlight } from '../src/runtime/single-flight.js';

test('createSingleFlight runs task and returns result', async () => {
  const sf = createSingleFlight();
  const result = await sf.run('key-1', async () => 'value-1');
  assert.equal(result, 'value-1');
});

test('createSingleFlight deduplicates concurrent tasks', async () => {
  const sf = createSingleFlight();
  let callCount = 0;
  const task = async () => {
    callCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 50));
    return 'value';
  };

  const [r1, r2] = await Promise.all([sf.run('key-1', task), sf.run('key-1', task)]);
  assert.equal(r1, 'value');
  assert.equal(r2, 'value');
  assert.equal(callCount, 1);
});

test('createSingleFlight allows new task after previous completes', async () => {
  const sf = createSingleFlight();
  let callCount = 0;
  const task = async () => {
    callCount += 1;
    return `value-${callCount}`;
  };

  const r1 = await sf.run('key-1', task);
  const r2 = await sf.run('key-1', task);
  assert.equal(r1, 'value-1');
  assert.equal(r2, 'value-2');
});

test('createSingleFlight does not remove key if replaced', async () => {
  const sf = createSingleFlight();
  const task1 = async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return 'first';
  };
  const task2 = async () => 'second';

  const p1 = sf.run('key-1', task1);
  await new Promise((resolve) => setTimeout(resolve, 10));
  // While task1 is still in flight, a second run for the same key
  // should return the existing promise (task1), not start task2.
  const p2 = sf.run('key-1', task2);

  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1, 'first');
  assert.equal(r2, 'first');

  // After task1 completes, a new run should execute task2.
  const r3 = await sf.run('key-1', task2);
  assert.equal(r3, 'second');
});
