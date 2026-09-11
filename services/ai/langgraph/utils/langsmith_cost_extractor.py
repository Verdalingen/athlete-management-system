import logging
import os
from dataclasses import dataclass
from decimal import Decimal

from langsmith import Client

logger = logging.getLogger(__name__)


@dataclass
class NodeCostSummary:
    name: str
    run_id: str
    model: str | None
    cost_usd: float
    tokens: int
    input_tokens: int = 0
    output_tokens: int = 0
    web_search_requests: int = 0


@dataclass
class WorkflowCostSummary:
    trace_id: str
    root_run_id: str
    total_cost_usd: float
    total_tokens: int
    total_input_tokens: int
    total_output_tokens: int
    total_web_searches: int
    node_costs: list[NodeCostSummary]
    execution_time_seconds: float = 0.0


class LangSmithCostExtractor:

    def __init__(self):
        self.client = None
        if os.getenv("LANGSMITH_API_KEY"):
            try:
                self.client = Client()
                logger.info("LangSmith cost extractor initialized")
            except Exception as exc:
                logger.warning("Failed to initialize LangSmith client: %s", exc)

    def extract_workflow_costs_by_trace(
        self, trace_id: str, execution_time: float = 0.0
    ) -> WorkflowCostSummary:
        if not self.client:
            logger.warning("LangSmith client not available - returning zero costs")
            return self._zero_workflow_summary(trace_id)

        try:
            all_runs = list(
                self.client.list_runs(
                    trace=trace_id, select=["id", "name", "run_type", "total_cost", "total_tokens"]
                )
            )
            logger.info("Found %s total runs for trace %s", len(all_runs), trace_id)
            for run in all_runs[:5]:  # Log first 5 for debugging
                run_cost = float(run.total_cost or 0)
                logger.info(
                    "  Run: %s (type: %s) - Cost: $%.4f",
                    run.name,
                    run.run_type,
                    run_cost,
                )

            llm_runs = list(
                self.client.list_runs(
                    trace=trace_id,
                    filter='eq(run_type, "llm")',
                    select=[
                        "id",
                        "name",
                        "total_cost",
                        "total_tokens",
                        "prompt_tokens",
                        "completion_tokens",
                        "serialized",
                    ],
                )
            )
            logger.info("Found %s LLM runs for trace %s", len(llm_runs), trace_id)

            total_cost = Decimal("0")
            total_tokens = 0
            total_input_tokens = 0
            total_output_tokens = 0
            total_web_searches = 0
            node_costs = []

            for run in llm_runs:
                cost = Decimal(str(run.total_cost or 0))
                tokens = run.total_tokens or 0
                input_tokens = run.prompt_tokens or 0
                output_tokens = run.completion_tokens or 0
                model = (run.serialized or {}).get("model", "unknown")

                web_searches = 0
                if "search" in run.name.lower() or "web" in run.name.lower():
                    web_searches = 1  # Approximate

                total_cost += cost
                total_tokens += tokens
                total_input_tokens += input_tokens
                total_output_tokens += output_tokens
                total_web_searches += web_searches

                node_costs.append(
                    NodeCostSummary(
                        name=run.name,
                        run_id=str(run.id),
                        model=model,
                        cost_usd=float(cost),
                        tokens=tokens,
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                        web_search_requests=web_searches,
                    )
                )

            logger.info(
                "Extracted costs for trace %s: $%.4f (%s tokens)",
                trace_id,
                float(total_cost),
                total_tokens,
            )

            return WorkflowCostSummary(
                trace_id=trace_id,
                root_run_id="",  # Will be filled by caller if needed
                total_cost_usd=float(total_cost),
                total_tokens=total_tokens,
                total_input_tokens=total_input_tokens,
                total_output_tokens=total_output_tokens,
                total_web_searches=total_web_searches,
                node_costs=node_costs,
                execution_time_seconds=execution_time,
            )

        except Exception:
            logger.exception("Failed to extract workflow costs for trace %s", trace_id)
            return self._zero_workflow_summary(trace_id)

    def _zero_workflow_summary(self, trace_id: str) -> WorkflowCostSummary:
        return WorkflowCostSummary(
            trace_id=trace_id,
            root_run_id="",
            total_cost_usd=0.0,
            total_tokens=0,
            total_input_tokens=0,
            total_output_tokens=0,
            total_web_searches=0,
            node_costs=[],
            execution_time_seconds=0.0,
        )
