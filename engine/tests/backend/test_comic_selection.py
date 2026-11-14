import numpy as np
import pytest

from nola_translator_engine.backend.comic_selection import selection_mask, validate_selection


def test_selection_preserves_holes_disjoint_regions_and_operation_order():
    operations = [
        {'op': 'add', 'points': [[0, 0], [80, 0], [80, 80], [0, 80]]},
        {'op': 'subtract', 'points': [[20, 20], [60, 20], [60, 60], [20, 60]]},
        {'op': 'add', 'points': [[90, 90], [100, 90], [100, 100], [90, 100]]},
    ]
    normalized = validate_selection(operations, 100, 100)
    mask = selection_mask(normalized, 100, 100)
    assert mask.dtype == np.uint8
    assert mask[10, 10] == 255 and mask[40, 40] == 0
    assert mask[95, 95] == 255 and mask[85, 85] == 0
    readded = operations + [{'op': 'add', 'points': [[30, 30], [40, 30], [40, 40], [30, 40]]}]
    assert selection_mask(readded, 100, 100)[35, 35] == 255
    assert selection_mask([[0, 0], [10, 0], [10, 10]], 100, 100).any()


@pytest.mark.parametrize('invalid', [
    [], [[False, 0], [1, 1], [2, 2]], [[0, 0], [float('nan'), 1], [2, 2]],
    [[0, 0], [101, 1], [2, 2]],
    [{'op': 'xor', 'points': [[0, 0], [1, 1], [2, 2]]}],
    [{'op': 'add', 'points': [[0, 0], [1, 1], [2, 2]], 'extra': True}],
])
def test_selection_rejects_invalid_points_and_operations(invalid):
    with pytest.raises(ValueError):
        validate_selection(invalid, 100, 100)


def test_selection_bounds_operation_and_total_point_count():
    operation = {'op': 'add', 'points': [[0, 0], [1, 0], [1, 1]]}
    with pytest.raises(ValueError, match='selectionTooLarge'):
        validate_selection([operation] * 65, 100, 100)
    many = {'op': 'add', 'points': [[0, 0]] * 2000}
    with pytest.raises(ValueError, match='selectionTooLarge'):
        validate_selection([many] * 5, 100, 100)
