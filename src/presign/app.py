import json
import os
import uuid

import boto3
from botocore.config import Config

s3 = boto3.client(
    "s3",
    region_name=os.environ["AWS_REGION"],
    config=Config(signature_version="s3v4"),
)
BUCKET = os.environ["PHOTOS_BUCKET"]
CONTENT_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png"}


def response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def handler(event, context):
    body = json.loads(event.get("body") or "{}")
    ext = str(body.get("ext", "jpg")).lower().lstrip(".")
    content_type = CONTENT_TYPES.get(ext)
    if content_type is None:
        return response(400, {"error": "Formato no soportado. Usa jpg o png."})

    photo_id = uuid.uuid4().hex
    key = f"originals/{photo_id}.{ext}"
    url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": BUCKET, "Key": key, "ContentType": content_type},
        ExpiresIn=300,
    )
    return response(
        200, {"photoId": photo_id, "uploadUrl": url, "contentType": content_type}
    )