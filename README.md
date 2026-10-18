# lab-web

Static dashboard for the lab project: visitor counters (hero figure and tiles), a 30-day visits and unique visitors chart, and the platform health cards.
Plain HTML, CSS and ES modules. There is no framework, bundler or runtime dependency, so nothing to pin or patch.

## How it fits together

| Path | Served by | Content |
|---|---|---|
| `/` , `/app.js`, `/lib.js`, `/style.css` | nginx pod in EKS (this image, port 8080) | the page |
| `/api/*` | `lab-backend` pod (ALB path rule) | `GET /api/visit` records a visit and returns counters and history |
| `/metrics/metrics.json` | S3 through CloudFront | written every minute by the metrics Lambda (`lab-infra-platform`, edge stack) |
| `/images/*` | S3 through CloudFront | the card icons in `src/images/`, synced by CI |

The page calls `/api/visit` once per load. If the counters are down (HTTP 503) it shows dashes and still draws the history; if the API is unreachable it says so.
A card whose metric has no datapoint shows "No data yet" instead of a zero. Platform data older than 3 minutes is dimmed.

## Design

- Hero figure for total visits; stat tiles for the other counters; a line chart for history (2px lines, 10% area wash, labelled end points).
- Colours follow a validated palette (blue, orange): contrast and colour-blind separation were checked in light and dark. Status is never colour alone: each card status carries an icon and a word.
- The chart has a hover/keyboard tooltip (ArrowLeft/ArrowRight/Escape), a legend, and a table view for the same data.
- Light and dark themes follow the OS setting. The chart is drawn at its real pixel width, so text stays readable on a phone.

## Develop

```bash
npm test                                   # unit tests for the pure logic in src/lib.js (Node 20+)
cd src && python3 -m http.server 8080      # static files only; /api and /metrics need a backend or a stub
docker build -t lab-web:local .
```

The image is `nginx-unprivileged` on port 8080 (uid 101) and runs with a read-only root filesystem; `nginx.conf` keeps its pid and temp files under `/tmp`.
Only the page files are in the image. Icons are not copied in because CloudFront serves them from S3.

## CI/CD

Pull requests run the unit tests, a syntax check and an image build. The release steps (scan, sign, push to ECR, sync `src/images` to the environment's
assets bucket, bump `lab-gitops`) come from the reusable workflows in `lab-github-workflows`, which are not written yet.
