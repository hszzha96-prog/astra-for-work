"""Fully synthetic regressions for the two daily detectors and the NAB standard score."""
import unittest
from datetime import date, timedelta

from detectors import COST, DETECTORS, WARMUP, flags, thresholds
from vendor.sweeper import Sweeper


class DailyThresholdsTest(unittest.TestCase):
    def test_warmup_and_inclusive_boundaries(self):
        for value, adaptive_alert, fixed_alert in [(74, 0, 0), (75, 1, 0), (199, 1, 0), (200, 1, 1)]:
            with self.subTest(value=value):
                minutes = [25] * WARMUP + [value]
                limits = thresholds(minutes)
                for name in DETECTORS:
                    self.assertEqual(limits[name][:WARMUP], [None] * WARMUP)
                self.assertEqual(flags(minutes, limits['rolling_median_mad']), [0] * WARMUP + [adaptive_alert])
                self.assertEqual(flags(minutes, limits['fixed_8_sessions']), [0] * WARMUP + [fixed_alert])

    def test_mad_rule_uses_only_previous_observations(self):
        short = [0, 25, 50, 75, 100, 125, 150, 0]
        changed = short[:-1] + [900, 600, 500]
        original_limits, changed_limits = thresholds(short), thresholds(changed)
        for name in DETECTORS:
            self.assertEqual(original_limits[name], changed_limits[name][:len(short)])
        self.assertAlmostEqual(original_limits['rolling_median_mad'][-1], 75 + 3 * 1.4826 * 50)
        self.assertNotEqual(thresholds(changed)['rolling_median_mad'][8],
                            thresholds(short + [600])['rolling_median_mad'][8])


class DailyScoringTest(unittest.TestCase):
    days = [date(2040, 1, 1) + timedelta(days=i) for i in range(28)]
    window_start = 11

    def score(self, alerts):
        window = [(self.days[self.window_start], self.days[self.window_start + 1])]
        sweeper = Sweeper(probationPercent=0.15, costMatrix=COST)
        _, result = sweeper.scoreDataSet(self.days, alerts, window, 'synthetic', 0.5)
        return result.score

    def test_early_alert_outscores_late_and_duplicate_adds_no_reward(self):
        def alert_on(*indices):
            return [int(i in indices) for i in range(len(self.days))]

        first = self.window_start
        perfect = self.score(alert_on(first))
        late = self.score(alert_on(first + 1))
        self.assertAlmostEqual(perfect, 1.0)
        self.assertLess(0, late)
        self.assertLess(late, perfect)
        self.assertEqual(self.score(alert_on(first, first + 1)), perfect)

    def test_missed_window_and_false_alarm_penalty(self):
        silent = [0] * len(self.days)
        self.assertAlmostEqual(self.score(silent), -1.0)
        false_alarm = silent.copy()
        false_alarm[22] = 1
        self.assertAlmostEqual(self.score(false_alarm), -1.11)

    def test_synthetic_spikes_through_both_detectors(self):
        for spike, expected in [(0, (0, 0)), (50, (100, 0)), (200, (100, 100))]:
            with self.subTest(added_minutes=spike):
                minutes = [25] * len(self.days)
                minutes[self.window_start] += spike
                limits = thresholds(minutes)
                silent = [0] * len(minutes)
                ideal = silent.copy()
                ideal[self.window_start] = 1
                null_score, perfect_score = self.score(silent), self.score(ideal)
                for method, expected_score in zip(DETECTORS, expected):
                    raw = self.score(flags(minutes, limits[method]))
                    normalized = 100 * (raw - null_score) / (perfect_score - null_score)
                    self.assertAlmostEqual(normalized, expected_score)
