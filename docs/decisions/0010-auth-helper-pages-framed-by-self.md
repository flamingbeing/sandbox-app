# 0010: With the sign-in domain on the app's own host, the Worker lets Firebase's helper pages be framed by itself

Status: accepted (2026-10-26)

Decision:

- `authDomain` is the app's own host, so Firebase's sign-in frames its helper pages (`/__/auth/*`, `/__/firebase/*`) from that
  same host. The Worker sends `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'` for those paths (`framedBySelf` in
  `worker/headers.js`), and `DENY` / `'none'` everywhere else.
- The OAuth web client needs `https://<host>/__/auth/handler` among its authorized redirect URIs.

Why: with `DENY` on the helper pages the browser refuses the frame and Google sign-in comes back signed out.

Cost: the helper pages can be framed by this site's own pages only.
