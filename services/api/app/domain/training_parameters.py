"""Checking training values against the descriptor that declares them.

Kept apart from the models so the rule is one function both the descriptor
loader (is the shipped default itself valid?) and the run start (is what the
user typed valid?) go through.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.domain.models import (
        TrainingModelDescriptor,
        TrainingParameterSpec,
        TrainingRunConfig,
    )


def coerce_parameter(spec: "TrainingParameterSpec", value: Any) -> Any:
    """The value in the type `spec` declares, or ValueError saying why not."""
    name = f"'{spec.label}' ({spec.key})"
    if value is None or (isinstance(value, str) and not value.strip() and spec.kind != "text"):
        if spec.nullable:
            return None
        raise ValueError(f"{name} cần có giá trị.")

    if spec.kind == "bool":
        if isinstance(value, bool):
            return value
        raise ValueError(f"{name} phải là bật/tắt.")

    if spec.kind in {"int", "float"}:
        if isinstance(value, bool):
            raise ValueError(f"{name} phải là số.")
        try:
            number = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{name} phải là số.") from exc
        if not math.isfinite(number):
            raise ValueError(f"{name} phải là số hữu hạn.")
        if spec.kind == "int":
            if not number.is_integer():
                raise ValueError(f"{name} phải là số nguyên.")
            number = int(number)
        if spec.min is not None and number < spec.min:
            raise ValueError(f"{name} không được nhỏ hơn {spec.min:g}.")
        if spec.max is not None and number > spec.max:
            raise ValueError(f"{name} không được lớn hơn {spec.max:g}.")
        return number

    if spec.kind == "choice":
        for option in spec.options:
            if option.value == value:
                return option.value
        allowed = ", ".join(str(option.value) for option in spec.options)
        raise ValueError(f"{name} phải là một trong: {allowed}.")

    if not isinstance(value, str):
        raise ValueError(f"{name} phải là chuỗi.")
    return value


def resolve_parameters(
    descriptor: "TrainingModelDescriptor", overrides: dict[str, Any]
) -> dict[str, Any]:
    """Every declared parameter, with the user's values over the defaults.

    An unknown key is refused rather than dropped: a value the user set that
    silently goes nowhere is worse than an error naming it. A locked parameter
    keeps its default whatever was sent.
    """
    specs = {spec.key: spec for spec in descriptor.parameters}
    unknown = sorted(set(overrides) - set(specs))
    if unknown:
        raise ValueError(
            f"{descriptor.label} không có tham số: {', '.join(unknown)}."
        )
    resolved: dict[str, Any] = {}
    for key, spec in specs.items():
        if spec.editable and key in overrides:
            resolved[key] = coerce_parameter(spec, overrides[key])
        else:
            resolved[key] = coerce_parameter(spec, spec.default)
    return resolved


def apply_to_run_config(
    descriptor: "TrainingModelDescriptor", config: "TrainingRunConfig"
) -> "TrainingRunConfig":
    """The run config a descriptor and its values describe."""
    parameters = resolve_parameters(descriptor, config.parameters)
    update: dict[str, Any] = {
        "model_id": descriptor.id,
        "engine": descriptor.engine,
        "mode": descriptor.mode,
        "parameters": parameters,
    }
    fields = type(config).model_fields
    for spec in descriptor.parameters:
        if spec.run_field and spec.run_field in fields and parameters[spec.key] is not None:
            update[spec.run_field] = parameters[spec.key]
    # Validate again so a descriptor mapping, say, a zero into `steps` fails
    # here instead of inside a training process an hour from now.
    return type(config).model_validate({**config.model_dump(), **update})
