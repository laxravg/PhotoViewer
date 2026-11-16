import io
import os
import urllib.parse
from datetime import datetime, timezone

import boto3
from PIL import Image, ImageOps

s3 = boto3.client("s3")
table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])
BUCKET = os.environ["PHOTOS_BUCKET"]
SIZES = {"thumbs": 400, "web": 1600}


def handler(event, context):
    for record in event["Records"]:
        key = urllib.parse.unquote_plus(record["s3"]["object"]["key"])
        if not key.startswith("originals/"):
            continue
        photo_id = os.path.splitext(os.path.basename(key))[0]

        original = s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()
        with Image.open(io.BytesIO(original)) as img:
            img = ImageOps.exif_transpose(img).convert("RGB")
            width, height = img.size
            for prefix, size in SIZES.items():
                copy = img.copy()
                copy.thumbnail((size, size))
                buffer = io.BytesIO()
                copy.save(buffer, "JPEG", quality=85)
                s3.put_object(
                    Bucket=BUCKET,
                    Key=f"{prefix}/{photo_id}.jpg",
                    Body=buffer.getvalue(),
                    ContentType="image/jpeg",
                )

        table.update_item(
            Key={"photoId": photo_id},
            UpdateExpression=(
                "SET createdAt = if_not_exists(createdAt, :c), "
                "width = :w, height = :h, originalKey = :k"
            ),
            ExpressionAttributeValues={
                ":c": datetime.now(timezone.utc).isoformat(),
                ":w": width,
                ":h": height,
                ":k": key,
            },
        )