from dataclasses import dataclass


@dataclass(frozen=True)
class ObjectRef:
    bucket: str
    key: str


class R2Storage:
    """Cloudflare R2 adapter placeholder.

    Business code should depend on this adapter boundary instead of importing S3 SDKs directly.
    """

    async def create_upload_url(self, object_ref: ObjectRef, content_type: str) -> str:
        raise NotImplementedError

    async def create_read_url(self, object_ref: ObjectRef, expires_in: int = 900) -> str:
        raise NotImplementedError

