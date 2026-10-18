FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY src/index.html src/app.js src/lib.js src/style.css /usr/share/nginx/html/
# /images and /metrics are served by CloudFront from S3, not by this image (see .github/workflows/ci.yml).
USER 101
EXPOSE 8080
