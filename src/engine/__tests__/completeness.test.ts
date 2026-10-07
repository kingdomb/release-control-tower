import { describe, expect, it } from 'vitest';
import { completeness } from '../completeness';
import { buildContext } from '../context';
import { at, baseDataset, fullCr, rel, UTC } from './fixtures';

const run = (ds = baseDataset()) => completeness(buildContext(ds, UTC));
const time = { startAt: at('2026-03-10T14:00'), endAt: at('2026-03-10T15:00') };

describe('rule 5: completeness', () => {
  it('flags a Normal change with no rollback plan as high', () => {
    const ds = baseDataset({
      releases: [rel({ id: 'a', changeClass: 'normal', ...time })],
      changeRequests: [fullCr('a', { rollbackPlan: '' })],
    });
    const out = run(ds);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ rule: 'completeness', releaseIds: ['a'], severity: 'high' });
    expect(out[0]!.message).toBe('Normal change "Release a" has no rollback plan.');
  });

  it('flags an Emergency change with no test plan as medium', () => {
    const ds = baseDataset({
      releases: [rel({ id: 'e', changeClass: 'emergency', ...time })],
      changeRequests: [fullCr('e', { testPlan: '' })],
    });
    const out = run(ds);
    expect(out[0]).toMatchObject({ severity: 'medium' });
    expect(out[0]!.message).toContain('no test plan');
  });

  it('treats whitespace-only plans as missing', () => {
    const ds = baseDataset({
      releases: [rel({ id: 'a', changeClass: 'normal', ...time })],
      changeRequests: [fullCr('a', { testPlan: '   \n ' })],
    });
    expect(run(ds)).toHaveLength(1);
  });

  it('lists both plans when there is no change request at all', () => {
    const ds = baseDataset({ releases: [rel({ id: 'a', changeClass: 'normal', ...time })] });
    expect(run(ds)[0]!.message).toContain('no rollback plan and no test plan');
  });

  it('does not require plans for Standard changes', () => {
    const ds = baseDataset({ releases: [rel({ id: 'a', changeClass: 'standard', ...time })] });
    expect(run(ds)).toEqual([]);
  });

  it('accepts a complete change request', () => {
    const ds = baseDataset({ releases: [rel({ id: 'a', changeClass: 'normal', ...time })], changeRequests: [fullCr('a')] });
    expect(run(ds)).toEqual([]);
  });

  it('ignores cancelled releases', () => {
    const ds = baseDataset({ releases: [rel({ id: 'a', changeClass: 'normal', status: 'cancelled', ...time })] });
    expect(run(ds)).toEqual([]);
  });
});
