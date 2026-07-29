from class_reflect_api.domain.transcript import TranscriptSegment


class AliyunAsrClient:
    """Aliyun DashScope ASR adapter boundary."""

    async def transcribe(self, audio_url: str) -> list[TranscriptSegment]:
        raise NotImplementedError

