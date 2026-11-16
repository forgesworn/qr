# Security

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/forgesworn/qr/security/advisories/new)
for a suspected security issue. Include the affected version and backend, a
minimal reproduction, expected and observed behaviour, and impact. Use a
throwaway QR payload; do not attach a real seed, invoice or sign-in credential.
Ordinary bugs and integration questions belong in
[GitHub issues](https://github.com/forgesworn/qr/issues).

We cannot promise a response time. The latest published version is the target
for fixes; older pre-1.0 releases do not have a separate maintenance branch.

## Application boundaries

Decoding a QR code does not authenticate its author or make its payload safe.
Validate URLs and protocol messages before opening them or performing actions.
Display text as text rather than injecting it into HTML.

The library processes pixels locally and performs no network access. It does
not open or manage the camera. Applications should bound image dimensions,
avoid unbounded frame queues, and use a worker for untrusted or costly images.
Search budgets bound candidate work; total memory and preprocessing still
depend on image dimensions. WASM instances should be reused and disposed when
finished; WebAssembly linear memory retains its high-water allocation while
the instance remains alive.

No decoder can guarantee the absence of wrong reads on every damaged input.
The regression suites check exact expected payloads and reject known
miscorrections; the published evidence describes the cases actually tested.
