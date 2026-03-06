"""
kinetic.monitor — Python SDK
pip install kinetic-monitor
"""

from __future__ import annotations

import functools
import time
import uuid
from collections import defaultdict
from typing import Any, Callable, Dict, List, Optional

import requests

__version__ = "1.0.0"


class KineticClient:
    """Low-level HTTP client for the Kinetic API."""

    def __init__(self, api_key: str, base_url: str = "https://app.kinetic.ai"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self._session = requests.Session()
        self._session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": f"kinetic-python/{__version__}",
        })

    def calculate_entropy(self, agent_id: str, metrics: Dict[str, Any]) -> Dict[str, Any]:
        r = self._session.post(
            f"{self.base_url}/api/v1/calculate-entropy",
            json={"agent_id": agent_id, "metrics": metrics},
            timeout=10,
        )
        r.raise_for_status()
        return r.json()

    def kill_switch(self, reason: str = "SDK triggered", agent_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"reason": reason}
        if agent_ids:
            payload["agent_ids"] = agent_ids
        r = self._session.post(f"{self.base_url}/api/v1/kill-switch/activate", json=payload, timeout=10)
        r.raise_for_status()
        return r.json()


class _AgentMetricsCollector:
    """Collects and aggregates metrics during an agent run."""

    def __init__(self):
        self.reset()

    def reset(self):
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.token_history: List[int] = []
        self.loop_count = 0
        self.tool_calls: Dict[str, int] = defaultdict(int)
        self.start_time = time.monotonic()
        self.step_times: List[float] = []
        self._last_step_time = time.monotonic()

    def on_llm_call(self, prompt_tokens: int = 0, completion_tokens: int = 0):
        self.prompt_tokens += prompt_tokens
        self.completion_tokens += completion_tokens
        total = prompt_tokens + completion_tokens
        self.token_history.append(total)

    def on_loop(self):
        self.loop_count += 1

    def on_tool_call(self, tool_name: str):
        self.tool_calls[tool_name] += 1
        now = time.monotonic()
        self.step_times.append((now - self._last_step_time) * 1000)
        self._last_step_time = now

    def build_metrics(self) -> Dict[str, Any]:
        total_tokens = self.prompt_tokens + self.completion_tokens
        times_ms = self.step_times or [0.0]
        sorted_times = sorted(times_ms)
        p95_idx = int(len(sorted_times) * 0.95)
        p99_idx = int(len(sorted_times) * 0.99)

        return {
            "token_usage": {
                "prompt_tokens": self.prompt_tokens,
                "completion_tokens": self.completion_tokens,
                "total_tokens": total_tokens,
                "history": self.token_history[-50:],
            },
            "execution_time": {
                "average_ms": sum(times_ms) / len(times_ms),
                "p95_ms": sorted_times[min(p95_idx, len(sorted_times) - 1)],
                "p99_ms": sorted_times[min(p99_idx, len(sorted_times) - 1)],
            },
            "loop_count": self.loop_count,
            "tool_calls": {
                "total": sum(self.tool_calls.values()),
                "by_tool": dict(self.tool_calls),
            },
        }


class KineticMonitor:
    """
    Main monitor class. Wraps agent functions for CrewAI, LangChain, or any callable.

    Usage:
        monitor = KineticMonitor(api_key="your-key", agent_id="agent-uuid")

        @monitor.wrap_agent
        def my_agent(input):
            ...
    """

    def __init__(
        self,
        api_key: str,
        agent_id: str,
        base_url: str = "https://app.kinetic.ai",
        auto_kill: bool = True,
        kill_threshold: float = 0.85,
        verbose: bool = False,
    ):
        self.client = KineticClient(api_key, base_url)
        self.agent_id = agent_id
        self.auto_kill = auto_kill
        self.kill_threshold = kill_threshold
        self.verbose = verbose
        self._collector = _AgentMetricsCollector()

    # ── Decorators ──────────────────────────────────────────────────────────

    def wrap_agent(self, func: Callable) -> Callable:
        """Decorator: wraps any agent callable to track metrics and compute entropy."""

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            self._collector.reset()
            try:
                result = func(*args, **kwargs)
            finally:
                self._flush()
            return result

        return wrapper

    # ── LangChain callback handler ──────────────────────────────────────────

    def langchain_callback(self):
        """
        Returns a LangChain BaseCallbackHandler that auto-reports to Kinetic.

        Usage:
            from langchain.agents import AgentExecutor
            handler = monitor.langchain_callback()
            executor = AgentExecutor(agent=..., callbacks=[handler])
        """
        try:
            from langchain_core.callbacks import BaseCallbackHandler
        except ImportError:
            raise ImportError("langchain-core is required: pip install langchain-core")

        collector = self._collector
        monitor_self = self

        class _KineticCallbackHandler(BaseCallbackHandler):
            def on_llm_end(self, response, **kwargs):
                usage = getattr(response, "llm_output", {}).get("token_usage", {})
                collector.on_llm_call(
                    prompt_tokens=usage.get("prompt_tokens", 0),
                    completion_tokens=usage.get("completion_tokens", 0),
                )

            def on_tool_start(self, serialized, input_str, **kwargs):
                collector.on_tool_call(serialized.get("name", "unknown"))

            def on_agent_action(self, action, **kwargs):
                collector.on_loop()

            def on_chain_end(self, outputs, **kwargs):
                monitor_self._flush()

        return _KineticCallbackHandler()

    # ── CrewAI integration ──────────────────────────────────────────────────

    def crewai_task_callback(self):
        """
        Returns a CrewAI task callback.

        Usage:
            from crewai import Task
            task = Task(description="...", callback=monitor.crewai_task_callback())
        """
        collector = self._collector
        monitor_self = self

        def _callback(output):
            # CrewAI passes TaskOutput; try to extract token info
            if hasattr(output, "token_usage"):
                usage = output.token_usage
                collector.on_llm_call(
                    prompt_tokens=getattr(usage, "prompt_tokens", 0),
                    completion_tokens=getattr(usage, "completion_tokens", 0),
                )
            monitor_self._flush()
            return output

        return _callback

    # ── Manual tracking ─────────────────────────────────────────────────────

    def track_llm(self, prompt_tokens: int = 0, completion_tokens: int = 0):
        self._collector.on_llm_call(prompt_tokens, completion_tokens)

    def track_loop(self):
        self._collector.on_loop()

    def track_tool(self, tool_name: str):
        self._collector.on_tool_call(tool_name)

    def flush(self) -> Optional[Dict[str, Any]]:
        """Manually flush metrics to Kinetic."""
        return self._flush()

    # ── Private ─────────────────────────────────────────────────────────────

    def _flush(self) -> Optional[Dict[str, Any]]:
        try:
            metrics = self._collector.build_metrics()
            result = self.client.calculate_entropy(self.agent_id, metrics)
            if self.verbose:
                print(f"[kinetic] entropy={result['entropy']['total']:.3f} risk={result['entropy']['risk_level']}")
            if self.auto_kill and result.get("kill_switch_triggered"):
                print(f"[kinetic] ⚠️  Kill switch triggered for agent {self.agent_id}")
            return result
        except Exception as exc:
            if self.verbose:
                print(f"[kinetic] flush error: {exc}")
            return None


# ── Convenience function ──────────────────────────────────────────────────────

def wrap_agent(
    func: Optional[Callable] = None,
    *,
    api_key: str,
    agent_id: str,
    base_url: str = "https://app.kinetic.ai",
    auto_kill: bool = True,
) -> Callable:
    """
    Standalone decorator. Usage:

        @wrap_agent(api_key="key", agent_id="uuid")
        def my_agent(input):
            ...
    """
    monitor = KineticMonitor(api_key=api_key, agent_id=agent_id, base_url=base_url, auto_kill=auto_kill)

    if func is not None:
        return monitor.wrap_agent(func)

    def decorator(f):
        return monitor.wrap_agent(f)

    return decorator
