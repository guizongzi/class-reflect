class PostgresDatabase:
    """PostgreSQL adapter boundary.

    Repositories and application services should use this layer, not raw database drivers in routes.
    """

    async def fetch_one(self, query: str, *params: object) -> dict | None:
        raise NotImplementedError

    async def execute(self, query: str, *params: object) -> None:
        raise NotImplementedError

