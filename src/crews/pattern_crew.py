"""CrewAI pattern analysis crew for CROW-B3."""
from crewai import Agent, Crew, Task
from typing import Any
from src.llm.cloudflare_workers_ai import CloudflareWorkersAILLM


class PatternCrew:
    """Crew for analyzing customer behavior patterns."""

    def __init__(self, llm: CloudflareWorkersAILLM):
        self.llm = llm

    def _create_agents(self) -> dict[str, Agent]:
        web_analyst = Agent(
            role="Web Interaction Analyst",
            goal="Analyze web interaction patterns including sessions, page views, and engagement metrics",
            backstory="Expert in web analytics and customer journey mapping",
            llm=self.llm,
            verbose=False,
        )

        cctv_analyst = Agent(
            role="CCTV Behavior Analyst",
            goal="Analyze physical store behavior patterns from CCTV analysis results including foot traffic, zones, and dwell time",
            backstory="Expert in retail analytics and customer behavior in physical spaces",
            llm=self.llm,
            verbose=False,
        )

        social_analyst = Agent(
            role="Social Media Analyst",
            goal="Analyze social media interaction patterns including sentiment and trending topics",
            backstory="Expert in social media analytics and brand sentiment analysis",
            llm=self.llm,
            verbose=False,
        )

        product_correlator = Agent(
            role="Product Correlation Specialist",
            goal="Identify correlations between customer behavior patterns and product catalog items",
            backstory="Expert in retail analytics and product performance correlation",
            llm=self.llm,
            verbose=False,
        )

        return {
            "web": web_analyst,
            "cctv": cctv_analyst,
            "social": social_analyst,
            "correlator": product_correlator,
        }

    def kickoff(self, inputs: dict[str, Any]) -> dict[str, Any]:
        """Run the pattern analysis crew."""
        agents = self._create_agents()
        interactions = inputs.get("interactions", {})
        products = inputs.get("products", [])
        period = inputs.get("period", "weekly")

        web_data = str(interactions.get("web", [])[:20])
        cctv_data = str(interactions.get("cctv", [])[:20])
        social_data = str(interactions.get("social", [])[:20])
        products_data = str(products[:10])

        tasks = [
            Task(
                description=f"Analyze {period} web interaction patterns: {web_data}. Identify key trends, popular pages, and engagement patterns.",
                expected_output="JSON with keys: trends (list), engagement_score (0-10), top_pages (list)",
                agent=agents["web"],
            ),
            Task(
                description=f"Analyze {period} CCTV behavior data: {cctv_data}. Identify foot traffic patterns, dwell times, and hotspots.",
                expected_output="JSON with keys: traffic_patterns (list), peak_hours (list), hotspots (list)",
                agent=agents["cctv"],
            ),
            Task(
                description=f"Analyze {period} social media interactions: {social_data}. Identify sentiment trends and popular topics.",
                expected_output="JSON with keys: sentiment (positive/neutral/negative), topics (list), engagement_trend (up/flat/down)",
                agent=agents["social"],
            ),
            Task(
                description=f"Based on all behavioral patterns, identify product correlations with: {products_data}. Which products match observed patterns?",
                expected_output="JSON with keys: correlations (list of product-pattern matches), recommendations (list), insights (string summary)",
                agent=agents["correlator"],
                context=[],
            ),
        ]

        crew = Crew(agents=list(agents.values()), tasks=tasks, verbose=False)

        try:
            result = crew.kickoff()
            return {
                "patterns": str(result),
                "productCorrelations": [],
                "insights": str(result)[:500],
            }
        except Exception as e:
            return {
                "patterns": f"Analysis failed: {str(e)}",
                "productCorrelations": [],
                "insights": "Pattern analysis could not be completed.",
            }
