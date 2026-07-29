class QwenLlmClient:
    """OpenAI-compatible Qwen adapter boundary."""

    async def json_completion(self, *, system_prompt: str, payload: dict) -> dict:
        raise NotImplementedError

