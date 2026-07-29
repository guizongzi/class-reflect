import asyncio
import logging

from class_reflect_api.application.agent_orchestrator import decide_next_action

logger = logging.getLogger(__name__)


async def run_worker_once() -> None:
    decision = decide_next_action()
    logger.info("worker decision: %s", decision)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker_once())


if __name__ == "__main__":
    main()

