FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS build
WORKDIR /src
ENV GOTOOLCHAIN=local
COPY go.mod ./
RUN go mod download
COPY . .
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} go build -ldflags="-s -w" -o /out/registry-proxy .

# ---- runtime stage ----
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=build /out/registry-proxy /app/registry-proxy
# 镜像只内置「默认配置」作为兜底/初始化模板；真实配置由宿主机目录挂载进 /app/config.d，
# 入口脚本会在首次运行时自动从默认配置播种一份，保证配置跨镜像更新不丢失。
COPY config.yaml /app/config.default.yaml
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
EXPOSE 5000
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["/app/config.d/config.yaml"]
