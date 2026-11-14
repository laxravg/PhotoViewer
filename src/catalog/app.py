import json
import os

import boto3
from botocore.config import Config

s3 = boto3.client(
    "s3",
    region_name=os.environ["AWS_REGION"],
    config=Config(signature_version="s3v4"),
)
table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])
BUCKET = os.environ["PHOTOS_BUCKET"]


def signed_url(key):
    return s3.generate_presigned_url(
        "get_object", Params={"Bucket": BUCKET, "Key": key}, ExpiresIn=3600
    )


def all_items():
    items, kwargs = [], {}
    while True:
        page = table.scan(**kwargs)
        items += page["Items"]
        if "LastEvaluatedKey" not in page:
            return items
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def handler(event, context):
    items = sorted(all_items(), key=lambda i: i["createdAt"], reverse=True)
    photos = [
        {
            "id": i["photoId"],
            "createdAt": i["createdAt"],
            "thumbUrl": signed_url(f"thumbs/{i['photoId']}.jpg"),
            "webUrl": signed_url(f"web/{i['photoId']}.jpg"),
        }
        for i in items
    ]
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(photos),
    }