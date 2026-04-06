"""FACIS AI Insight Service - main entrypoint."""

import logging

import uvicorn

from src.api.rest.app import create_app
from src.config import load_config
from src.logging_config import configure_logging

configure_logging(service_name="facis-ai-insight")
logger = logging.getLogger(__name__)


def main() -> None:
    """Start the AI Insight REST API."""
    settings = load_config()
    logger.info("Starting FACIS AI Insight Service...")
    app = create_app()
    uvicorn.run(app, host=settings.http.host, port=settings.http.port, log_config=None)


if __name__ == "__main__":
    main()
