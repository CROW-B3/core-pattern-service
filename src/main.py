"""FastAPI app for pattern analysis container."""
import os
from typing import Any
import httpx
from fastapi import FastAPI
from pydantic import BaseModel

from src.llm.cloudflare_workers_ai import CloudflareWorkersAILLM
from src.crews.pattern_crew import PatternCrew

app = FastAPI(title="CROW Pattern Service")


class AnalyzeRequest(BaseModel):
    orgId: str
    period: str
    apiGatewayUrl: str
    systemSecret: str | None = None


async def fetch_interactions(api_gateway_url: str, org_id: str) -> dict[str, list[Any]]:
    """Fetch interactions grouped by source type."""
    result: dict[str, list[Any]] = {"web": [], "cctv": [], "social": []}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.get(
                f"{api_gateway_url}/api/v1/interactions/organization/{org_id}?limit=100",
                headers={"X-System-Token": "true"},
            )
            if res.status_code == 200:
                data = res.json()
                for interaction in data.get("interactions", []):
                    source = interaction.get("sourceType", "web")
                    if source in result:
                        result[source].append(interaction)
    except Exception:
        pass
    return result


async def fetch_products(api_gateway_url: str, org_id: str) -> list[Any]:
    """Fetch products for the organization."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.get(
                f"{api_gateway_url}/api/v1/products/organization/{org_id}?page=1&pageSize=50",
                headers={"X-System-Token": "true"},
            )
            if res.status_code == 200:
                return res.json().get("products", [])
    except Exception:
        pass
    return []


@app.post("/analyze")
async def analyze(request: AnalyzeRequest) -> dict[str, Any]:
    """Run pattern analysis for an organization."""
    cf_account_id = os.environ.get("CF_ACCOUNT_ID", "")
    cf_api_token = os.environ.get("CF_API_TOKEN", "")

    interactions = await fetch_interactions(request.apiGatewayUrl, request.orgId)
    products = await fetch_products(request.apiGatewayUrl, request.orgId)

    llm = CloudflareWorkersAILLM(
        cf_account_id=cf_account_id,
        cf_api_token=cf_api_token,
    )
    crew = PatternCrew(llm=llm)
    result = crew.kickoff({
        "interactions": interactions,
        "products": products,
        "period": request.period,
    })

    return {
        "orgId": request.orgId,
        "period": request.period,
        "result": result,
    }


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "healthy"}
