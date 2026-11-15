# Diagnose a quarantined upload

Stop npm run dev, extract this patch into the existing v0.7.0 project root and keep the existing environment file. From the root run:

    node --import tsx scripts/check-document-scanner.ts
    npm run dev

For a compiled deployment run npm run build and restart the compiled processes instead. This patch needs no migration or new dependencies. The scanner probe uses the same TCP streaming client as the API and sends harmless test bytes. For a Windows-hosted API and the supplied Docker scanner use DOCUMENT_CLAMD_HOST=127.0.0.1 and DOCUMENT_CLAMD_PORT=3310. A containerized API should use the Docker service hostname clamd.

Retry the existing quarantined version once. The document panel now reports whether the failure occurred during scanning or uploading. The API terminal logs document_release_blocked with a short code and HTTP status when available. Raw provider messages, file contents, credentials and signed URLs are excluded.

A storage-stage error means that the scanner returned clean. Check the HRIS root .env for the exact storage branch endpoint, region, bucket, key and secret. The setup folder's environment file is separate. NoSuchBucket indicates a bucket/branch mismatch. For AccessDenied verify the credential can write to the selected bucket. For SignatureDoesNotMatch verify the endpoint, region and matching key pair. Restart the API after editing its environment and retry the same document. READY requires a successful clean verdict and an accepted storage write.
