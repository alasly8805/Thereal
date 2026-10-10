# API Rate Limiting Architecture

All public mutations (auth, balance check, quiz submits) enforce strict token-bucket or sliding-window rate limiters.

## Rate Limit Headers
- `Retry-After`: Wait duration in seconds when 429 is triggered.
- Sliding-window eviction runs via periodic cleanup.
