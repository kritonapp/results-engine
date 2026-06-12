import { describe, expect, it } from 'vitest';
import {
  arithmeticMean,
  maxOf,
  medianOf,
  minOf,
  quantileOf,
  rangeOf,
  stddev,
  trimmedMean,
  weightedMean,
  zscoreNormalise,
} from './aggregators.js';

describe('aggregators', () => {
  it('arithmeticMean', () => {
    expect(arithmeticMean([5, 10])).toBe(7.5);
    expect(arithmeticMean([])).toBe(0);
  });

  it('medianOf (odd and even)', () => {
    expect(medianOf([3, 1, 2])).toBe(2);
    expect(medianOf([1, 2, 3, 4])).toBe(2.5);
    expect(medianOf([])).toBe(0);
  });

  it('stddev is population (divides by n), matching legacy', () => {
    expect(stddev([5, 10])).toBe(2.5);
    expect(stddev([7])).toBe(0);
    expect(stddev([])).toBe(0);
  });

  it('min / max / range', () => {
    expect(minOf([3, 1, 2])).toBe(1);
    expect(maxOf([3, 1, 2])).toBe(3);
    expect(rangeOf([3, 1, 2])).toBe(2);
    expect(rangeOf([])).toBe(0);
  });

  it('quantileOf', () => {
    expect(quantileOf([1, 2, 3, 4], 0)).toBe(1);
    expect(quantileOf([1, 2, 3, 4], 1)).toBe(4);
  });

  it('trimmedMean drops k from each tail', () => {
    // drop 1 each end of [1,2,3,4,5,100] -> mean(2,3,4,5) = 3.5
    expect(trimmedMean([100, 1, 3, 2, 5, 4], 1)).toBe(3.5);
  });

  it('trimmedMean clamps over-large k to keep >=1 value', () => {
    // n=3, k=5 -> effectiveK clamped to 1 -> mean of middle value
    expect(trimmedMean([1, 2, 3], 5)).toBe(2);
  });

  it('weightedMean = sum(v*w)/sum(w)', () => {
    expect(
      weightedMean([
        { value: 10, weight: 1 },
        { value: 0, weight: 1 },
      ]),
    ).toBe(5);
    // weights bias toward the heavier criterion
    expect(
      weightedMean([
        { value: 10, weight: 3 },
        { value: 2, weight: 1 },
      ]),
    ).toBe(8);
    expect(weightedMean([])).toBe(0);
  });

  it('zscoreNormalise centres on the mean and scales by stddev', () => {
    const z = zscoreNormalise([5, 10]);
    expect(z[0]).toBeCloseTo(-1, 10);
    expect(z[1]).toBeCloseTo(1, 10);
    // order preserved, mean of z ~ 0
    expect(arithmeticMean(z)).toBeCloseTo(0, 10);
  });

  it('zscoreNormalise guards zero variance → all zeros (Flag 8)', () => {
    expect(zscoreNormalise([7, 7, 7])).toEqual([0, 0, 0]);
    expect(zscoreNormalise([])).toEqual([]);
  });
});
