"""Custom CrewAI LLM connector using Cloudflare Workers AI HTTP API."""
from typing import Any, Optional
import httpx
from crewai.llm import LLM


class CloudflareWorkersAILLM(LLM):
    """Custom LLM connector for Cloudflare Workers AI."""

    cf_account_id: str
    cf_api_token: str
    model_name: str = "@cf/meta/llama-3.1-8b-instruct"

    def __init__(self, cf_account_id: str, cf_api_token: str, model_name: str = "@cf/meta/llama-3.1-8b-instruct"):
        super().__init__(model=f"cloudflare/{model_name}")
        self.cf_account_id = cf_account_id
        self.cf_api_token = cf_api_token
        self.model_name = model_name

    def call(self, messages: list[dict[str, str]], **kwargs: Any) -> str:
        """Call Cloudflare Workers AI with the given messages."""
        url = f"https://api.cloudflare.com/client/v4/accounts/{self.cf_account_id}/ai/run/{self.model_name}"

        payload = {
            "messages": messages,
            "max_tokens": kwargs.get("max_tokens", 1024),
            "temperature": kwargs.get("temperature", 0.7),
        }

        with httpx.Client(timeout=60.0) as client:
            response = client.post(
                url,
                json=payload,
                headers={
                    "Authorization": f"Bearer {self.cf_api_token}",
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
            data = response.json()
            return data["result"]["response"]
