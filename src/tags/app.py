import json
import os

import boto3
from botocore.exceptions import ClientError

table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])
MAX_TAGS, MAX_LEN = 10, 30


def response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def clean(raw):
    out = []
    for t in raw or []:
        t = str(t).strip().lower()[:MAX_LEN]
        if t and t not in out:
            out.append(t)
    return out[:MAX_TAGS]


def handler(event, context):
    photo_id = event["pathParameters"]["photoId"]
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"error": "El cuerpo no es JSON válido"})
    if not isinstance(body.get("tags", []), list):
        return response(400, {"error": "tags debe ser una lista"})

    tags = clean(body.get("tags"))
    try:
        if tags:
            table.update_item(
                Key={"photoId": photo_id},
                UpdateExpression="SET tags = :t",
                ConditionExpression="attribute_exists(photoId)",
                ExpressionAttributeValues={":t": set(tags)},
            )
        else:
            table.update_item(
                Key={"photoId": photo_id},
                UpdateExpression="REMOVE tags",
                ConditionExpression="attribute_exists(photoId)",
            )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return response(404, {"error": f"No existe la foto {photo_id}"})
        raise

    return response(200, {"photoId": photo_id, "tags": sorted(tags)})