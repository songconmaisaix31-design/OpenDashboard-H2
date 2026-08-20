from __future__ import annotations

import argparse

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the loopback-only H2 analytics API.")
    parser.add_argument("--port", type=int, default=8765)
    arguments = parser.parse_args()
    if not 1024 <= arguments.port <= 65535:
        parser.error("--port must be between 1024 and 65535")
    uvicorn.run(
        "h2_analytics.api.app:app",
        host="127.0.0.1",
        port=arguments.port,
        reload=False,
        access_log=False,
    )


if __name__ == "__main__":
    main()
