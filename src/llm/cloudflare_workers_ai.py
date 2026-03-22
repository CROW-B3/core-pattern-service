from typing import Any
import httpx
from crewai.llm import LLM


class CloudflareWorkersAILLM(LLM):
    cf_account_id: str
    cf_api_token: str
    ai_gateway_id: str = "crow-ai-gateway"
    model_name: str = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"

    def __init__(
        self,
        cf_account_id: str,
        cf_api_token: str,
        model_name: str = "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        ai_gateway_id: str = "crow-ai-gateway",
    ):
        super().__init__(model=f"cloudflare/{model_name}")
        self.cf_account_id = cf_account_id
        self.cf_api_token = cf_api_token
        self.model_name = model_name
        self.ai_gateway_id = ai_gateway_id

    def call(self, messages: list[dict[str, str]], **kwargs: Any) -> str:
        url = (
            f"https://gateway.ai.cloudflare.com/v1/"
            f"{self.cf_account_id}/{self.ai_gateway_id}/workers-ai/{self.model_name}"
        )

        payload = {
            "messages": messages,
            "max_tokens": kwargs.get("max_tokens", 2048),
            "temperature": kwargs.get("temperature", 0.7),
        }

        with httpx.Client(timeout=120.0) as client:
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
