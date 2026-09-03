import pytest
from pydantic import ValidationError

from app.schemas.models import SimulationInput


VALID = {
    "well_id": "demo",
    "temperature": 80,
    "pressure": 4.2,
    "viscosity": 1000,
    "rpm_or_spm": 8,
    "steam_injection_pressure": 20,
    "steam_volume": 900,
    "soak_time": 24,
    "production_cutoff": 10,
    "stroke_length": 55,
    "vfd_frequency": 40,
    "fluid_level": 40,
    "water_cut": 0.15,
}


@pytest.mark.parametrize(
    ("field", "inside", "outside"),
    [
        ("temperature", 44.289, 44.288),
        ("pressure", 5.649, 5.65),
        ("viscosity", 120.6595, 120.65),
        ("rpm_or_spm", 11.55, 11.56),
        ("steam_injection_pressure", 9.5665, 9.56),
        ("steam_volume", 1473.0135, 1473.02),
        ("soak_time", 11.4, 11.39),
        ("production_cutoff", 20.496, 20.50),
        ("stroke_length", 38.0, 37.99),
        ("vfd_frequency", 52.5, 52.51),
        ("fluid_level", 24.0255, 24.02),
        ("water_cut", 0.3318, 0.332),
    ],
)
def test_buffered_validation_ranges(field: str, inside: float, outside: float):
    assert getattr(SimulationInput(**{**VALID, field: inside}), field) == inside
    with pytest.raises(ValidationError):
        SimulationInput(**{**VALID, field: outside})


def test_unvalidated_dataset_missing_fields_are_optional():
    model = SimulationInput(**VALID)
    assert model.oil_flow_rate is None
    assert model.valve_opening is None


def test_unvalidated_dataset_missing_fields_accept_finite_values():
    model = SimulationInput(**VALID, oil_flow_rate=-1, valve_opening=250)
    assert model.oil_flow_rate == -1
    assert model.valve_opening == 250
