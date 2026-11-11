import io
import os
import urllib.parse

import boto3
from PIL import Image, ImageOps

s3 = boto3.client("s3")
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