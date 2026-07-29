from fastapi import APIRouter

from class_reflect_api.shared.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str | bool]:
    settings = get_settings()
    return {
        "ok": True,
        "service": "class-reflect",
        "runtime": "python-fastapi",
        "asr_provider": settings.asr_provider,
        "asr_model": settings.aliyun_asr_model,
    }

