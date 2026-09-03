from __future__ import annotations

from app.domain.models import (
    EngineProfileSchema,
    ReadingAudienceOption,
    ReadingAudienceVocabulary,
)

# Vietnamese has no accent or dialect facet in the engine schema, but Project Hub
# already offers these three when a project is created. Reusing those ids keeps
# one vocabulary across the app instead of two that drift.
VIETNAMESE_REGIONS = [
    ReadingAudienceOption(id="vi-North", label="Miền Bắc"),
    ReadingAudienceOption(id="vi-Central", label="Miền Trung"),
    ReadingAudienceOption(id="vi-South", label="Miền Nam"),
]


def _facet(schema: EngineProfileSchema, facet_id: str) -> list[ReadingAudienceOption]:
    for facet in schema.facets:
        if facet.id == facet_id:
            return [
                ReadingAudienceOption(id=choice.id, label=choice.label) for choice in facet.options
            ]
    return []


def audience_vocabulary(schema: EngineProfileSchema) -> ReadingAudienceVocabulary:
    """Tag choices the authoring dialog offers, drawn from the engine's own list.

    Gender and age come straight from the voice-design facets, so a passage is
    tagged in the same terms a Speaker Profile is described in. Region is
    language-shaped rather than universal: English has accents, Chinese has
    dialects, and Vietnamese has neither in the engine schema.
    """
    return ReadingAudienceVocabulary(
        genders=_facet(schema, "gender"),
        age_ranges=_facet(schema, "age"),
        regions_by_language={
            "en": _facet(schema, "accent"),
            "zh": _facet(schema, "dialect"),
            "vi": list(VIETNAMESE_REGIONS),
        },
    )
