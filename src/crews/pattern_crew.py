from crewai import Agent, Crew, Task, Process
from typing import Any
import json
from src.llm.cloudflare_workers_ai import CloudflareWorkersAILLM


class PatternCrew:
    def __init__(self, llm: CloudflareWorkersAILLM):
        self.llm = llm

    def _create_agents(self) -> dict[str, Agent]:
        time_series_analyst = Agent(
            role="Time-Series Analyst",
            goal="Identify trends, seasonality, and growth rates in interaction data over time",
            backstory="Expert statistician specializing in time-series decomposition and trend analysis for customer behavior data",
            llm=self.llm,
            verbose=False,
        )

        anomaly_detective = Agent(
            role="Anomaly Detective",
            goal="Detect outliers, distribution shifts, and unusual patterns in behavioral data",
            backstory="Data scientist specializing in anomaly detection using statistical methods and distribution analysis",
            llm=self.llm,
            verbose=False,
        )

        correlation_mapper = Agent(
            role="Correlation Mapper",
            goal="Discover cross-channel correlations, product co-interest patterns, and behavioral linkages",
            backstory="Analytics expert specializing in multi-variate correlation analysis and product affinity mapping",
            llm=self.llm,
            verbose=False,
        )

        insight_generator = Agent(
            role="Insight Generator",
            goal="Synthesize findings into actionable business recommendations and strategic insights",
            backstory="Business intelligence strategist who translates data patterns into clear actionable recommendations",
            llm=self.llm,
            verbose=False,
        )

        confidence_assessor = Agent(
            role="Confidence Assessor",
            goal="Validate statistical robustness of findings and assign confidence scores to each pattern",
            backstory="Statistical quality assurance specialist who validates analytical rigor and quantifies uncertainty",
            llm=self.llm,
            verbose=False,
        )

        return {
            "time_series": time_series_analyst,
            "anomaly": anomaly_detective,
            "correlation": correlation_mapper,
            "insight": insight_generator,
            "confidence": confidence_assessor,
        }

    def _build_tasks(
        self,
        agents: dict[str, Agent],
        interactions_summary: str,
        products_summary: str,
        period: str,
    ) -> list[Task]:
        trend_task = Task(
            description=f"Analyze {period} interaction data for trends, seasonality, and growth rates: {interactions_summary}",
            expected_output="JSON with keys: trends (list of trend objects with direction and metric), seasonality (list), growth_rates (dict of metric to rate)",
            agent=agents["time_series"],
        )

        anomaly_task = Task(
            description=f"Detect outliers and distribution shifts in {period} interaction data: {interactions_summary}",
            expected_output="JSON with keys: anomalies (list of anomaly objects with metric, value, severity), distribution_shifts (list)",
            agent=agents["anomaly"],
        )

        correlation_task = Task(
            description=f"Find cross-channel correlations and product co-interest patterns. Interactions: {interactions_summary}. Products: {products_summary}",
            expected_output="JSON with keys: correlations (list of correlation objects with channels and strength), product_co_interest (list), productIds (list of product IDs involved)",
            agent=agents["correlation"],
        )

        insight_task = Task(
            description="Synthesize the trend analysis, anomaly detection, and correlation findings into actionable business recommendations",
            expected_output="JSON with keys: recommendations (list of actionable items), summary (string), priority_actions (list)",
            agent=agents["insight"],
            context=[trend_task, anomaly_task, correlation_task],
        )

        confidence_task = Task(
            description="Assess the statistical confidence and robustness of all findings from the analysis pipeline. Assign confidence scores.",
            expected_output="JSON with keys: overall_confidence (0-1), pattern_scores (list of pattern with confidence), methodology_notes (string)",
            agent=agents["confidence"],
            context=[trend_task, anomaly_task, correlation_task, insight_task],
        )

        return [trend_task, anomaly_task, correlation_task, insight_task, confidence_task]

    def _parse_json_safe(self, text: str) -> dict[str, Any]:
        try:
            cleaned = text.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            return json.loads(cleaned)
        except (json.JSONDecodeError, ValueError):
            return {"raw": text[:1000]}

    def kickoff(self, inputs: dict[str, Any]) -> dict[str, Any]:
        agents = self._create_agents()
        interactions = inputs.get("interactions", {})
        products = inputs.get("products", [])
        period = inputs.get("period", "weekly")

        interactions_summary = self._summarize_interactions(interactions)
        products_summary = str(products[:10])

        tasks = self._build_tasks(agents, interactions_summary, products_summary, period)

        crew = Crew(
            agents=list(agents.values()),
            tasks=tasks,
            process=Process.hierarchical,
            manager_llm=self.llm,
            verbose=False,
        )

        try:
            result = crew.kickoff()
            return self._format_output(result, tasks)
        except Exception as e:
            return {
                "patterns": [],
                "anomalies": [],
                "correlations": [],
                "metadata": {"error": str(e), "period": period},
            }

    def _summarize_interactions(self, interactions: dict[str, list[Any]] | list[Any]) -> str:
        if isinstance(interactions, list):
            return str(interactions[:20])
        parts = []
        for source, items in interactions.items():
            parts.append(f"{source}: {len(items)} items, sample: {str(items[:5])}")
        return "; ".join(parts)

    def _format_output(self, result: Any, tasks: list[Task]) -> dict[str, Any]:
        raw = str(result)
        parsed = self._parse_json_safe(raw)

        correlation_output = self._parse_json_safe(str(tasks[2].output)) if tasks[2].output else {}
        confidence_output = self._parse_json_safe(str(tasks[4].output)) if tasks[4].output else {}
        anomaly_output = self._parse_json_safe(str(tasks[1].output)) if tasks[1].output else {}

        return {
            "patterns": parsed.get("recommendations", parsed.get("trends", [raw[:500]])),
            "anomalies": anomaly_output.get("anomalies", []),
            "correlations": correlation_output.get("correlations", []),
            "productIds": correlation_output.get("productIds", []),
            "metadata": {
                "overall_confidence": confidence_output.get("overall_confidence", 0.5),
                "pattern_scores": confidence_output.get("pattern_scores", []),
                "methodology_notes": confidence_output.get("methodology_notes", ""),
            },
        }
