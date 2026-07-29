from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from class_reflect_api.app.routes.health import router as health_router
from class_reflect_api.shared.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Class Reflect API",
        version="0.1.0",
        description="AI classroom replay and teaching analysis backend.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "x-teacher-id"],
    )
    app.include_router(health_router, prefix="/api")
    return app


app = create_app()

