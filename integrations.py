"""
Kinetic Integration Examples
─────────────────────────────

1. LangChain callback handler
2. CrewAI task callback
3. Bare-minimum manual usage
"""

# ─────────────────────────────────────────────────────────────────────────────
# 1. LangChain — One-click callback handler
# ─────────────────────────────────────────────────────────────────────────────

from kinetic.monitor import KineticMonitor

monitor = KineticMonitor(
    api_key="knt_your_api_key",
    agent_id="your-agent-uuid",
    auto_kill=True,
    verbose=True,
)

# --- LangChain AgentExecutor ---
def run_langchain_agent(user_input: str):
    from langchain.agents import AgentExecutor, create_openai_functions_agent
    from langchain_openai import ChatOpenAI
    from langchain.tools import tool

    @tool
    def search(query: str) -> str:
        """Search the web."""
        return f"Results for: {query}"

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    # Kinetic plugs in as a single callback — zero other changes
    agent = create_openai_functions_agent(llm, [search], prompt=None)
    executor = AgentExecutor(
        agent=agent,
        tools=[search],
        callbacks=[monitor.langchain_callback()],  # ← one line
        verbose=False,
    )
    return executor.invoke({"input": user_input})


# ─────────────────────────────────────────────────────────────────────────────
# 2. CrewAI — Task callback
# ─────────────────────────────────────────────────────────────────────────────

def run_crewai_agent():
    from crewai import Agent, Task, Crew

    researcher = Agent(
        role="Senior Researcher",
        goal="Gather the latest AI news",
        backstory="An expert at finding and summarizing AI developments.",
        verbose=False,
    )

    task = Task(
        description="Find the 3 most important AI news items this week.",
        expected_output="A bullet-point list with URLs.",
        agent=researcher,
        callback=monitor.crewai_task_callback(),  # ← one line
    )

    crew = Crew(agents=[researcher], tasks=[task], verbose=False)
    return crew.kickoff()


# ─────────────────────────────────────────────────────────────────────────────
# 3. @wrap_agent decorator — simplest possible usage
# ─────────────────────────────────────────────────────────────────────────────

from kinetic.monitor import wrap_agent

@wrap_agent(api_key="knt_your_api_key", agent_id="your-agent-uuid")
def my_agent(user_input: str) -> str:
    """Any function — Kinetic tracks it transparently."""
    # Manual tracking inside (optional but recommended for detail):
    monitor.track_llm(prompt_tokens=450, completion_tokens=120)
    monitor.track_tool("web_search")
    monitor.track_tool("web_search")  # called it twice
    monitor.track_loop()

    return f"Processed: {user_input}"


if __name__ == "__main__":
    result = my_agent("What are the latest AI developments?")
    print(result)
