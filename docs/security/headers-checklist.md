# Security Checklist & Response Headers

- **Content-Security-Policy**: Enforces strict domain allowances for DRM players (VdoCipher, Bunny, YouTube).
- **X-Frame-Options**: Set to SAMEORIGIN.
- **X-Content-Type-Options**: nosniff.
- **Referrer-Policy**: strict-origin-when-cross-origin.
