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
            goal=(
                "Identify trends, seasonality, and growth rates in interaction data over time. "
                "Each trend must have a descriptive title (e.g. 'Rising Weekend Foot Traffic' not 'trend_1'). "
                "Never include UUIDs or internal IDs in any output text."
            ),
            backstory=(
                "Expert statistician specializing in time-series decomposition and trend analysis for customer "
                "behavior data. You write findings in plain business language with named patterns — "
                "never generic labels or internal identifiers."
            ),
            llm=self.llm,
            verbose=False,
        )

        anomaly_detective = Agent(
            role="Anomaly Detective",
            goal=(
                "Detect outliers, distribution shifts, and unusual patterns in behavioral data. "
                "Name each anomaly descriptively (e.g. 'Sudden Drop in Evening Checkouts' not 'anomaly_2'). "
                "Never include UUIDs or internal IDs in any output text."
            ),
            backstory=(
                "Data scientist specializing in anomaly detection using statistical methods and distribution analysis. "
                "You describe anomalies in human-readable business terms with clear severity and impact context."
            ),
            llm=self.llm,
            verbose=False,
        )

        correlation_mapper = Agent(
            role="Correlation Mapper",
            goal=(
                "Discover cross-channel correlations, product co-interest patterns, and behavioral linkages. "
                "Link correlations to specific product categories when possible. "
                "Never include UUIDs or internal IDs in correlation descriptions."
            ),
            backstory=(
                "Analytics expert specializing in multi-variate correlation analysis and product affinity mapping. "
                "You describe relationships in plain English, naming product categories explicitly "
                "(e.g. 'Customers browsing Electronics also visit Home Appliances within the same session')."
            ),
            llm=self.llm,
            verbose=False,
        )

        insight_generator = Agent(
            role="Insight Generator",
            goal=(
                "Synthesize findings into concise, actionable business recommendations. "
                "Every recommendation must have a descriptive title and link to a specific product category or behavior. "
                "Never include UUIDs, org IDs, or internal identifiers anywhere in the output."
            ),
            backstory=(
                "Business intelligence strategist who translates data patterns into clear, executive-ready recommendations. "
                "You write tight bullet-point insights — never verbose paragraphs. "
                "Each recommendation is tied to a product category or customer segment for direct actionability."
            ),
            llm=self.llm,
            verbose=False,
        )

        confidence_assessor = Agent(
            role="Confidence Assessor",
            goal=(
                "Validate statistical robustness of findings and assign confidence scores to each named pattern. "
                "Reference patterns by their descriptive titles only — never by IDs or internal references."
            ),
            backstory=(
                "Statistical quality assurance specialist who validates analytical rigor and quantifies uncertainty. "
                "You produce human-readable methodology notes and label each pattern by its descriptive title."
            ),
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
        common_rules = (
            "CRITICAL OUTPUT RULES:\n"
            "- NEVER include organization IDs, UUIDs, internal identifiers, or raw system IDs in any output\n"
            "- Refer to the organization as 'your organization' or 'the team' — never by ID\n"
            "- Use descriptive, human-readable titles for every pattern, trend, and anomaly\n"
            "- Keep all insight text concise: bullet points preferred over long paragraphs\n"
            "- Format insight text fields using markdown (## headings, **bold**, bullet points)\n"
            "- Output ONLY valid JSON — no markdown code fences, no extra text outside the JSON\n"
        )

        trend_task = Task(
            description=(
                f"Analyze {period} interaction data for trends, seasonality, and growth rates.\n\n"
                f"Data: {interactions_summary}\n\n"
                f"Requirements:\n"
                f"- Give each trend a descriptive title capturing the 'what' and 'when' "
                f"(e.g., 'Rising Evening Web Engagement', 'Declining Weekend In-Store Visits')\n"
                f"- Link trends to product categories when the data supports it\n"
                f"- Keep each 'insight' field to one or two sentences maximum\n\n"
                f"{common_rules}"
            ),
            expected_output=(
                "JSON with: trends (list of objects with 'title', 'direction', 'metric', 'productCategory', 'insight'), "
                "seasonality (list of objects with 'title' and 'description'), "
                "growth_rates (dict of readable metric name to rate)"
            ),
            agent=agents["time_series"],
        )

        anomaly_task = Task(
            description=(
                f"Detect outliers and distribution shifts in {period} interaction data.\n\n"
                f"Data: {interactions_summary}\n\n"
                f"Requirements:\n"
                f"- Give each anomaly a descriptive title (e.g., 'Unexpected Spike in Cart Abandonments on Tuesday')\n"
                f"- Include severity: high, medium, or low\n"
                f"- Describe each anomaly in one sentence — what changed, by how much, and in which channel\n\n"
                f"{common_rules}"
            ),
            expected_output=(
                "JSON with: anomalies (list of objects with 'title', 'metric', 'value', 'severity', 'channel', 'description'), "
                "distribution_shifts (list of objects with 'title' and 'summary')"
            ),
            agent=agents["anomaly"],
        )

        correlation_task = Task(
            description=(
                f"Find cross-channel correlations and product co-interest patterns.\n\n"
                f"Interactions: {interactions_summary}\n"
                f"Products: {products_summary}\n\n"
                f"Requirements:\n"
                f"- Describe each correlation in plain English naming the product categories involved\n"
                f"  (e.g., 'Customers browsing Electronics also view Home Appliances in the same session')\n"
                f"- Assign a correlation strength: strong, moderate, or weak\n"
                f"- List product IDs only in the 'productIds' array — never in text fields\n\n"
                f"{common_rules}"
            ),
            expected_output=(
                "JSON with: correlations (list of objects with 'title', 'channels', 'productCategories', 'strength', 'insight'), "
                "product_co_interest (list of objects with 'title' and 'description'), "
                "productIds (list of product ID strings)"
            ),
            agent=agents["correlation"],
        )

        insight_task = Task(
            description=(
                "Synthesize trend, anomaly, and correlation findings into concise, actionable recommendations.\n\n"
                "Requirements:\n"
                "- Each recommendation must have a descriptive 'title' tied to a product category or customer behavior\n"
                "- 'detail' must be 1-3 bullet points in markdown — no long paragraphs\n"
                "- 'summary' must use ## Key Patterns, ## Notable Anomalies, ## Recommended Actions sections\n"
                "  with bullet points only — no prose paragraphs\n"
                "- 'priority_actions' must be the 3 highest-impact actions, each naming the specific "
                "  product category or behavior it targets\n\n"
                f"{common_rules}"
            ),
            expected_output=(
                "JSON with: recommendations (list of objects with 'title', 'productCategory', and 'detail' as markdown bullets), "
                "summary (markdown string with ## Key Patterns / ## Notable Anomalies / ## Recommended Actions), "
                "priority_actions (list of 3 concise strings each naming a product category or behavior)"
            ),
            agent=agents["insight"],
            context=[trend_task, anomaly_task, correlation_task],
        )

        confidence_task = Task(
            description=(
                "Assess statistical confidence and robustness of all findings from the analysis pipeline.\n\n"
                "Requirements:\n"
                "- Reference each pattern by its descriptive title (never by ID or index)\n"
                "- 'methodology_notes' must be 2-4 bullet points in markdown describing data quality\n"
                "  and any caveats — no verbose prose\n\n"
                f"{common_rules}"
            ),
            expected_output=(
                "JSON with: overall_confidence (0.0–1.0), "
                "pattern_scores (list of objects with 'pattern_title' and 'confidence'), "
                "methodology_notes (markdown bullet list of data quality notes and caveats)"
            ),
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
