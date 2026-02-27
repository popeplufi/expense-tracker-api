#!/usr/bin/env python3
import base64
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def _b64url(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def generate():
    private_key = ec.generate_private_key(ec.SECP256R1())
    private_number = private_key.private_numbers().private_value.to_bytes(32, "big")
    public_key = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    return _b64url(public_key), _b64url(private_number)


if __name__ == "__main__":
    public_key, private_key = generate()
    print(f"VAPID_PUBLIC_KEY={public_key}")
    print(f"VAPID_PRIVATE_KEY={private_key}")
    print("VAPID_CLAIMS_SUB=mailto:you@example.com")
