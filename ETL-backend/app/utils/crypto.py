"""
AES-256-GCM encryption for the credential vault.

Each credential config is encrypted before it's stored in the database,
so even with direct DB access you can't read connection strings.

The key comes from VAULT_SECRET_KEY in .env. Generate a fresh one with:
    python -c "import secrets; print(secrets.token_hex(32))"

In development, a hardcoded fallback key is used so you don't need to
configure anything. Never use that fallback in production.
"""

import os
import base64
import warnings

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_DEV_FALLBACK_KEY = b"arithflow_dev_key_change_in_prod"  # exactly 32 bytes


class VaultCrypto:
    @staticmethod
    def _get_key() -> bytes:
        """
        Resolve the 32-byte AES key from config.

        Priority:
        1. VAULT_SECRET_KEY env var (base64 encoded or raw)
        2. The hardcoded dev fallback (with a warning)
        """
        from app.config import settings
        raw = os.getenv("VAULT_SECRET_KEY", "")
        
        if not raw:
            if settings.ENVIRONMENT == "production":
                raise RuntimeError(
                    "FATAL: VAULT_SECRET_KEY must be set in production environment. "
                    "Server will not start with insecure defaults."
                )
                
            warnings.warn(
                "VAULT_SECRET_KEY is not set. Using the dev fallback key — "
                "never do this in production.",
                stacklevel=3,
            )
            return _DEV_FALLBACK_KEY

        # Try base64 decode first, fall back to using the raw string as bytes
        try:
            key = base64.urlsafe_b64decode(raw.encode())
        except Exception:
            key = raw.encode()

        # Pad or truncate to exactly 32 bytes
        return key.ljust(32, b"\0")[:32]

    @staticmethod
    def encrypt(plaintext: str) -> str:
        """
        Encrypt a string and return a base64-encoded blob.

        The blob format is: base64(12-byte nonce + AES-GCM ciphertext).
        The nonce is randomly generated per encryption call, which means
        encrypting the same value twice produces different blobs — that's correct.
        """
        if not plaintext:
            return plaintext

        key = VaultCrypto._get_key()
        nonce = os.urandom(12)
        ciphertext = AESGCM(key).encrypt(nonce, plaintext.encode(), None)
        return base64.b64encode(nonce + ciphertext).decode()

    @staticmethod
    def decrypt(blob: str) -> str:
        """
        Decrypt a blob produced by encrypt(). Returns the original plaintext.

        If decryption fails (bad key, corrupted data), returns the original
        blob unchanged so the caller can decide how to handle the error.
        """
        if not blob:
            return blob

        try:
            raw = base64.b64decode(blob.encode())
            if len(raw) < 13:  # 12 nonce + at least 1 byte ciphertext
                raise ValueError("Blob is too short to be valid AES-GCM output")
            nonce, ciphertext = raw[:12], raw[12:]
            key = VaultCrypto._get_key()
            return AESGCM(key).decrypt(nonce, ciphertext, None).decode()
        except Exception as exc:
            # Log this instead of silently swallowing it
            import logging
            logging.getLogger("arithflow.crypto").warning(f"Decryption failed: {exc}")
            return blob
