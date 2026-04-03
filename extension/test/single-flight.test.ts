import test from 'node:test';
import assert from 'node:assert/strict';
import { createSingleFlight } from '../src/runtime/single-flight';

test('single-flight coalesces concurrent calls for the same key', async () => {
  const singleFlight = createSingleFlight();
  let runCount = 0;

  const task = async () => {
    runCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return 'ok';
  };

  const [a, b, c] = await Promise.all([
    singleFlight.run('keyA', task),
    singleFlight.run('keyA', task),
    singleFlight.run('keyA', task),
  ]);

  assert.equal(a, 'ok');
  assert.equal(b, 'ok');
  assert.equal(c, 'ok');
  assert.equal(runCount, 1);
});

test('single-flight runs distinct keys independently', async () => {
  const singleFlight = createSingleFlight();
  let runCount = 0;

  const task = async () => {
    runCount += 1;
    return runCount;
  };

  const [a, b] = await Promise.all([
    singleFlight.run('keyA', task),
    singleFlight.run('keyB', task),
  ]);

  assert.deepEqual([a, b].sort((x, y) => x - y), [1, 2]);
  assert.equal(runCount, 2);
});

test('single-flight resets key after failure to allow retry', async () => {
  const singleFlight = createSingleFlight();
  let attempt = 0;

  await assert.rejects(
    () => singleFlight.run('keyA', async () => {
      attempt += 1;
      throw new Error('first failure');
    }),
    /first failure/,
  );

  const result = await singleFlight.run('keyA', async () => {
    attempt += 1;
    return 'recovered';
  });

  assert.equal(result, 'recovered');
  assert.equal(attempt, 2);
});
