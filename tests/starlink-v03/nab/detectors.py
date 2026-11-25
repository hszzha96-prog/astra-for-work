"""Thresholds and alert flags from the Starlink daily anomaly experiment."""
from statistics import median


WARMUP = 7
DETECTORS = ('rolling_median_mad', 'fixed_8_sessions')
COST = {'tpWeight': 1.0, 'fnWeight': 1.0, 'fpWeight': 0.11, 'tnWeight': 1.0}


def thresholds(minutes):
    """Exclude current point from every adaptive threshold; first 7 observed points are warmup."""
    result = {method: [] for method in DETECTORS}
    for i, actual in enumerate(minutes):
        if i < WARMUP:
            for method in DETECTORS:
                result[method].append(None)
            continue
        past = minutes[i-WARMUP:i]
        center = median(past)
        mad = median(abs(x-center) for x in past)
        result['rolling_median_mad'].append(center + max(50, 3*1.4826*mad))
        result['fixed_8_sessions'].append(200.0)
    return result


def flags(minutes, limits):
    return [int(limit is not None and x >= limit) for x, limit in zip(minutes, limits)]
