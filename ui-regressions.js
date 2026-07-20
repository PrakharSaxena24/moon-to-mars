'use strict';

// Focused browser-glue contracts that can run in Node without a DOM. These
// execute the exact pure helpers from app.js rather than duplicating them.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

function between(startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert(start >= 0 && end > start, `missing app.js section: ${startNeedle}`);
  return source.slice(start, end).trim();
}

const buddySource = between(
  'function buddyAssignmentsWithinCap(defaults, overrides, cap)',
  'function validDayState(v, seg, domain)'
);
const buddyContext = {};
vm.runInNewContext(`${buddySource}\nthis.checkBuddyCap = buddyAssignmentsWithinCap;`, buddyContext);

const defaults = { gd_watanabe: 'p01', gd_maeda: 'p04' };
assert.strictEqual(
  buddyContext.checkBuddyCap(defaults, { gd_nagatani: 'p01', gd_kadou: 'p01' }, 2),
  false,
  'seeded and override buddies must share the same per-person cap'
);
assert.strictEqual(
  buddyContext.checkBuddyCap(defaults, { gd_watanabe: null, gd_nagatani: 'p01', gd_kadou: 'p01' }, 2),
  true,
  'a null override must remove its seeded buddy before load counting'
);

const validationSource = between(
  'function validateAuthoringState(v)',
  'function validatePlanEnvelope(v)'
);
assert(
  validationSource.includes('buddyAssignmentsWithinCap(domain.template.buddies, v.buddyOv, 2)'),
  'authoring import validation must check the effective seeded-plus-override buddy map'
);

const verdictSource = between(
  'function reportReadinessVerdict(plan, rehearsalComplete)',
  'function appendAssumptionCondition(plan, compact)'
);
const verdictContext = {};
vm.runInNewContext(`
  var readiness;
  function executionReadiness() { return readiness; }
  function T() {
    return {
      rehearsalFactsPending: function (n) { return 'pending:' + n; },
      realExecutionReady: 'ready',
      rehearsalComplete: 'complete'
    };
  }
  ${verdictSource}
  this.setReadiness = function (value) { readiness = value; };
  this.verdict = reportReadinessVerdict;
`, verdictContext);

verdictContext.setReadiness({ rehearsalComplete: false, realExecutionReady: false, unresolvedCount: 5, unresolved: [] });
assert.strictEqual(
  verdictContext.verdict({}, true),
  null,
  'a caller-local success cannot override an engine-incomplete whole rehearsal'
);
verdictContext.setReadiness({ rehearsalComplete: true, realExecutionReady: false, unresolvedCount: 5, unresolved: [] });
assert.strictEqual(verdictContext.verdict({}, true), 'pending:5');
verdictContext.setReadiness({ rehearsalComplete: true, realExecutionReady: true, unresolvedCount: 0, unresolved: [] });
assert.strictEqual(verdictContext.verdict({}, true), 'ready');

console.log('UI regression checks passed.');
