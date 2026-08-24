jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
}));
jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}));

import { isTrialExpired, TRIAL_DURATION_MS } from './trialLicense';

describe('trialLicense', () => {
  const startedAt = '2025-08-24T00:00:00.000Z';
  const startMs = Date.parse(startedAt);

  it('is not expired before 6 months', () => {
    expect(isTrialExpired(startedAt, startMs + TRIAL_DURATION_MS - 1)).toBe(false);
  });

  it('expires at 6 months', () => {
    expect(isTrialExpired(startedAt, startMs + TRIAL_DURATION_MS)).toBe(true);
  });
});
