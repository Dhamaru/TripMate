import assert from 'node:assert/strict';
import { safeParsePlan, isValidPlanLike } from '@/lib/planParser';

function run() {
  const obj = { destination: 'X', itinerary: [] };
  assert.deepEqual(safeParsePlan(obj), obj);
  assert.equal(isValidPlanLike(obj), true);

  const jsonStr = JSON.stringify(obj);
  assert.deepEqual(safeParsePlan(jsonStr), obj);

  const textWithJson = `Hello\n\n${jsonStr}\nThanks`;
  assert.deepEqual(safeParsePlan(textWithJson), obj);

  const bad = 'not json';
  assert.equal(safeParsePlan(bad), null);
  assert.equal(isValidPlanLike(null), false);

  console.log('Parser tests passed');
}

run();
