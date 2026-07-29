from functools import lru_cache
import json
import os
from typing import Any

from pydantic_settings import BaseSettings, SettingsConfigDict


def _app_config_env() -> dict[str, Any]:
    raw = os.getenv("APP_CONFIG_ENV")
    if not raw:
        return {}
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("APP_CONFIG_ENV must be a JSON object")
    return parsed


def _read_config(env_key: str, path_key: str | None = None, default: Any = None) -> Any:
    if env_key in os.environ:
        return os.environ[env_key]
    data = _app_config_env()
    if env_key in data:
        return data[env_key]
    if not path_key:
        return default
    current: Any = data
    for part in path_key.split("."):
        if not isinstance(current, dict) or part not in current:
            return default
        current = current[part]
    return current


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    port: int = 8080
    public_base_url: str = "http://localhost:3000"
    frontend_origin: str = "http://localhost:3000"

    database_url: str | None = None
    direct_url: str | None = None

    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    supabase_service_role_key: str | None = None

    r2_account_id: str | None = None
    r2_endpoint: str | None = None
    r2_bucket: str | None = None
    r2_access_key_id: str | None = None
    r2_secret_access_key: str | None = None
    r2_region: str = "auto"

    asr_provider: str = "mock"
    aliyun_asr_model: str = "qwen3-asr-flash-filetrans"
    aliyun_asr_base_url: str = "https://dashscope.aliyuncs.com/api/v1"
    aliyun_dashscope_api_key: str | None = None
    aliyun_asr_poll_interval_ms: int = 3000
    aliyun_asr_timeout_ms: int = 600000
    aliyun_asr_file_url_expires_seconds: int = 3600

    llm_base_url: str | None = None
    llm_api_key: str | None = None
    llm_model: str | None = None

    debug_token: str | None = None
    ffmpeg_path: str = "ffmpeg"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        port=int(_read_config("PORT", "port", 8080)),
        public_base_url=_read_config("PUBLIC_BASE_URL", "publicBaseUrl", "http://localhost:3000"),
        frontend_origin=_read_config("FRONTEND_ORIGIN", "frontendOrigin", "http://localhost:3000"),
        database_url=_read_config("DATABASE_URL", "databaseUrl")
        or _read_config("DIRECT_URL", "directUrl"),
        direct_url=_read_config("DIRECT_URL", "directUrl"),
        supabase_url=_read_config("SUPABASE_URL", "supabase.url"),
        supabase_anon_key=_read_config("SUPABASE_ANON_KEY", "supabase.anonKey"),
        supabase_service_role_key=_read_config(
            "SUPABASE_SERVICE_ROLE_KEY", "supabase.serviceRoleKey"
        ),
        r2_account_id=_read_config("R2_ACCOUNT_ID", "r2.accountId"),
        r2_endpoint=_read_config("R2_ENDPOINT", "r2.endpoint"),
        r2_bucket=_read_config("R2_BUCKET", "r2.bucket"),
        r2_access_key_id=_read_config("R2_ACCESS_KEY_ID", "r2.accessKeyId"),
        r2_secret_access_key=_read_config("R2_SECRET_ACCESS_KEY", "r2.secretAccessKey"),
        r2_region=_read_config("R2_REGION", "r2.region", "auto"),
        asr_provider=_read_config("ASR_PROVIDER", "asrProvider", "mock"),
        aliyun_asr_model=_read_config(
            "ALIYUN_ASR_MODEL", "aliyun.asrModel", "qwen3-asr-flash-filetrans"
        ),
        aliyun_asr_base_url=_read_config(
            "ALIYUN_ASR_BASE_URL", "aliyun.asrBaseUrl", "https://dashscope.aliyuncs.com/api/v1"
        ),
        aliyun_dashscope_api_key=_read_config("ALIYUN_DASHSCOPE_API_KEY", "aliyun.dashscopeApiKey")
        or _read_config("LLM_API_KEY", "llm.apiKey"),
        aliyun_asr_poll_interval_ms=int(
            _read_config("ALIYUN_ASR_POLL_INTERVAL_MS", "aliyun.asrPollIntervalMs", 3000)
        ),
        aliyun_asr_timeout_ms=int(
            _read_config("ALIYUN_ASR_TIMEOUT_MS", "aliyun.asrTimeoutMs", 600000)
        ),
        aliyun_asr_file_url_expires_seconds=int(
            _read_config(
                "ALIYUN_ASR_FILE_URL_EXPIRES_SECONDS",
                "aliyun.asrFileUrlExpiresSeconds",
                3600,
            )
        ),
        llm_base_url=_read_config("LLM_BASE_URL", "llm.baseUrl"),
        llm_api_key=_read_config("LLM_API_KEY", "llm.apiKey"),
        llm_model=_read_config("LLM_MODEL", "llm.model"),
        debug_token=_read_config("DEBUG_TOKEN", "debugToken"),
        ffmpeg_path=_read_config("FFMPEG_PATH", "ffmpegPath", "ffmpeg"),
    )

