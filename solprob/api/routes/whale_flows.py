# api/routes/whale_flows.py
from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.deps import get_whale_provider
from models.whale import IntervalLiteral, WhaleFlowsQuery, WhaleFlowsResponse
from services.whale_provider import WhaleDataProvider, WhaleProviderError

router = APIRouter(prefix="/v1", tags=["whale-flows"])


@router.get(
    "/token/{token_address}/whale-flows",
    response_model=WhaleFlowsResponse,
    summary="Get aggregated whale flows for a token",
)
async def get_whale_flows(
    token_address: str,
    interval: Annotated[IntervalLiteral, Query(description="Bar interval", example="1h")] = "1h",
    start: Annotated[datetime | None, Query(description="Start time (ISO8601)", example=None)] = None,
    end: Annotated[datetime | None, Query(description="End time (ISO8601)", example=None)] = None,
    limit: Annotated[int | None, Query(ge=1, le=2000, description="Max number of bars")] = 100,
    provider: WhaleDataProvider = Depends(get_whale_provider),
) -> WhaleFlowsResponse:
    """
    This is the endpoint AssetDash/Moby will hit.

    It is agnostic to how whale data is sourced: mock vs remote provider.
    """

    # Let Pydantic parse/normalize basic types via the model
    query = WhaleFlowsQuery(
        interval=interval,
        start=start,
        end=end,
        limit=limit,
    )

    # Cross-field validation: end must be greater than start if both are provided.
    if query.start and query.end and query.end <= query.start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end must be greater than start",
        )

    try:
        flows = await provider.get_flows(
            token_address=token_address,
            interval=query.interval,
            start=query.start,
            end=query.end,
            limit=query.limit,
        )
    except WhaleProviderError as exc:
        # Upstream or parsing error from the provider
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return WhaleFlowsResponse(
        token_address=token_address,
        interval=query.interval,
        whale_flows=flows,
    )
