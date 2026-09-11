import logging
import re
from typing import Any

from .plot_storage import PlotStorage

logger = logging.getLogger(__name__)


class PlotReferenceResolver:
    PLOT_PATTERN = r"\[PLOT:([^\]]+)\]"

    def __init__(self, plot_storage: PlotStorage):
        self.plot_storage = plot_storage

    def resolve_plot_references(self, text: str) -> str:
        resolved_plots = set()

        def replace_plot_reference(match):
            plot_id = match.group(1)
            if plot_id in resolved_plots:
                logger.warning("Removing duplicate reference to plot %s", plot_id)
                return ""
            resolved_plots.add(plot_id)
            return self._embed_plot(plot_id)

        resolved_text = re.sub(self.PLOT_PATTERN, replace_plot_reference, text)

        total_references = len(re.findall(self.PLOT_PATTERN, text))
        logger.info(
            "Resolved %d/%d plot references, removed %d duplicates",
            len(resolved_plots),
            total_references,
            total_references - len(resolved_plots),
        )

        return resolved_text

    def _embed_plot(self, plot_id: str) -> str:
        plot_html = self.plot_storage.get_plot_html(plot_id)

        if plot_html:
            return self._wrap_plot_html(plot_id, plot_html)

        plot_metadata = self.plot_storage.get_plot(plot_id)
        logger.warning("Plot %s not found, using fallback", plot_id)

        if plot_metadata:
            return f"""
<div class="plot-fallback" style="padding: 20px; border: 2px dashed #ccc; margin: 10px 0; text-align: center; background-color: #f9f9f9;">
    <p><strong>Plot Unavailable: {plot_metadata.description}</strong></p>
    <p><em>Created by {plot_metadata.agent_name}</em></p>
    <p>Plot ID: {plot_id}</p>
</div>"""

        return f"""
<div class="plot-error" style="padding: 20px; border: 2px solid #ff6b6b; margin: 10px 0; text-align: center; background-color: #ffe0e0;">
    <p><strong>Plot Not Found</strong></p>
    <p>Plot ID: {plot_id}</p>
</div>"""

    def _wrap_plot_html(self, plot_id: str, plot_html: str) -> str:
        return f"""
<div class="plot-container" id="plot-{plot_id}" style="margin: 20px 0; width: 100%; overflow: hidden;">
    <div class="plot-content" style="width: 100%; height: auto;">
        {plot_html}
    </div>
</div>"""

    def extract_plot_references(self, text: str) -> list[str]:
        return re.findall(self.PLOT_PATTERN, text)

    def validate_plot_references(self, text: str) -> dict[str, Any]:
        referenced_plots = self.extract_plot_references(text)
        available = set(self.plot_storage.get_all_plots().keys())
        found: list[str] = []
        missing: list[str] = []

        for pid in referenced_plots:
            (found if pid in available else missing).append(pid)

        return {
            "total_references": len(referenced_plots),
            "unique_references": len(set(referenced_plots)),
            "found_plots": found,
            "missing_plots": missing,
            "validation_passed": len(missing) == 0,
        }

    def get_plot_summary(self) -> str:
        if not (plots := self.plot_storage.list_available_plots()):
            return "No plots available"

        return "\n".join([
            f"Available plots ({len(plots)}):",
            *[f"  - {plot['plot_id']}: {plot['description']} (by {plot['agent_name']})" for plot in plots]
        ])

