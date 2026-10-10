# Caching Architecture & Strategies

- **Settings Cache**: Cached in-memory with 5-minute TTL; invalidated on admin update.
- **Token Versioning**: Incremented on password change or session revocation to immediately invalidate active JWTs.
- **Rate Limiter Cache**: In-memory sliding window cache with automatic expired item purging.
