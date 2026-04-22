import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from server import _category_from_score, _recommended_action_for_dimension


def test_category_thresholds():
    assert _category_from_score(95) == "Ottimo"
    assert _category_from_score(70) == "Buono"
    assert _category_from_score(50) == "Attenzione"
    assert _category_from_score(20) == "Critico"


def test_recommendation_mapping():
    assert _recommended_action_for_dimension("no_show_rate")[1] == "Apri Agenda"
    assert _recommended_action_for_dimension("acceptance_rate")[1] == "Apri Recupero Preventivi"
    assert _recommended_action_for_dimension("closing_speed")[1] == "Apri Revenue Lost Radar"
    assert _recommended_action_for_dimension("revenue_trend")[1] == "Apri dashboard revenue"
