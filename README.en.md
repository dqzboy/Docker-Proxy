<p align="right">
   <a href="./README.md">中文</a> | <strong>English</strong>
</p>

<div style="text-align: center">
  <p align="center">
  <img src="./hubcmdui/src/public/images/docker-proxy.svg" width="200px" height="200px" alt="Docker Proxy Logo">
      <br>
      <i>Self-hosted Docker image acceleration service — one-click deployment of image acceleration & management for Docker, K8s, Quay, GHCR, MCR, Elastic, NVCR, and more.</i>
  </p>
</div>

<div align="center">

[![Auth](https://img.shields.io/badge/Auth-dqzboy-ff69b4)](https://github.com/dqzboy)
[![GitHub contributors](https://img.shields.io/github/contributors/dqzboy/Docker-Proxy)](https://github.com/dqzboy/Docker-Proxy/graphs/contributors)
[![GitHub Issues](https://img.shields.io/github/issues/dqzboy/Docker-Proxy.svg)](https://github.com/dqzboy/Docker-Proxy/issues)
[![GitHub Pull Requests](https://img.shields.io/github/stars/dqzboy/Docker-Proxy)](https://github.com/dqzboy/Docker-Proxy)
[![HitCount](https://views.whatilearened.today/views/github/dqzboy/Docker-Proxy.svg)](https://github.com/dqzboy/Docker-Proxy)
[![GitHub license](https://img.shields.io/github/license/dqzboy/Docker-Proxy)](https://github.com/dqzboy/Docker-Proxy/blob/main/LICENSE)

📢 <a href="https://t.me/+ghs_XDp1vwxkMGU9" style="font-size: 15px;">Docker Proxy TG Group</a>

</div>

---

## 📝 Prerequisites
⚠️ **Important**: Choose an overseas server that is not blocked. Domain names do not require ICP filing in China. You can also obtain a free domain through some platforms. During one-click deployment, if you choose to install Caddy, it will automatically configure HTTPS. If you choose to deploy Nginx, you need to apply for a free SSL certificate yourself, or implement SSL encryption through other means.

<details>
<summary><strong>Free Domain SSL Certificate Application</strong></summary>
<div>

**Method 1:** [Acme.sh automatically generates and renews free Let's Encrypt SSL certificates](https://www.dqzboy.com/16437.html)

**Method 2:** Host your domain on [Cloudflare to enable free SSL certificates](https://www.cloudflare.com/zh-cn/application-services/products/ssl/)

**Method 3:** You can apply for a free domain certificate through third-party platforms (free ones are generally DV certificates), suitable for personal websites, blogs, and small projects

</details>

---

## 🔨 Features
- [x] **Zero disk cache**: A single process automatically routes by `Host` to major public registries (Docker Hub, GHCR, Quay, K8s, MCR, Elastic, NVCR, etc.), performs server-side token authentication and streams the response without writing to disk or consuming local storage.
- [x] **One-click deployment**: Interactive menu: with a single click, complete “install dependencies → start Docker image acceleration → (optional) configure Nginx/Caddy reverse proxy”.
- [x] **Optional reverse proxy**: Automatically deploys Nginx or Caddy as a reverse proxy and renders the corresponding configuration (HTTPS, Host rewriting).
- [x] **Upstream account authentication**: You can configure an upstream username/password; the proxy server exchanges them for a Bearer Token, enabling pulls of private Docker Hub images and mitigating official rate limits.
- [x] **HubCMD-UI management panel**: Manage proxies, configure server parameters, and hot-reload directly from the web UI; includes image search, documentation tutorials, container management, monitoring, and alerting.
- [x] **System Dashboard**: Real-time monitoring of server resources, container runtime status, and network traffic information
- [x] **Cross-platform images**: Supports deployment on mainstream architectures such as `linux/amd64` and `linux/arm64`.
- [x] **Daily operations management**: Provides full lifecycle management including service start / stop / restart / logs / update / uninstall.
- [x] **Traffic Monitoring and Alerts**: Provides detailed client-side traffic metrics for server bandwidth throughput and image pull operations, along with threshold-based monitoring and alerting.
- [x] **Registry Management**: Each registry has independent configuration management, enabling online management of image proxies (registries) and service settings without the need to manually edit configuration files.
- [x] **IP Access Control**: IP blacklists and whitelists to control who can pull images from this service. Supports both individual IPs and CIDR blocks.


## 📦 Deployment

### Docker Deployment
Download [`docker-compose.yaml`](./docker-compose.yaml) and run:
```bash
docker compose up -d
```


### One-click deployment script
The repository includes [`install/DockerProxy_Install.sh`](./install/DockerProxy_Install.sh), an interactive menu that completes "install dependencies → start Docker image acceleration  → (optional) render Nginx/Caddy reverse proxy" in one click.

```shell
# CentOS && RHEL && Rocky
yum -y install curl
# ubuntu && debian
apt -y install curl

# Overseas environment
bash -c "$(curl -fsSL https://raw.githubusercontent.com/dqzboy/Docker-Proxy/main/install/DockerProxy_Install.sh)"

# Domestic environment (CDN acceleration)
bash -c "$(curl -fsSL https://cdn.jsdelivr.net/gh/dqzboy/Docker-Proxy/install/DockerProxy_Install.sh)"

# Domestic GitHub proxy
bash -c "$(curl -fsSL https://ghp.ci/https://raw.githubusercontent.com/dqzboy/Docker-Proxy/main/install/DockerProxy_Install.sh)"
```

> The script automatically: checks and installs Docker / Docker Compose; generates a random `GO_PROXY_ADMIN_TOKEN` and writes it to `.env`; optionally deploys Nginx / Caddy reverse proxy.

After deployment, visit `http://<server-IP>:30080/admin` to manage proxies and server parameters from the web UI.

### Config persistence & upgrades (Important)
The config file is mounted on the host at `./config/go-proxy/` (inside the container: `/app/config.d/config.yaml`).

- On first start, if the host does not yet have a config file, the container automatically initializes one from the built-in default config — no manual creation needed.
- To restore the default config: delete `./config/go-proxy/config.yaml` and recreate the container to re-seed.

---

## 💻 Hubcmd-UI

**Default account**: root / admin@123   **Please change the default account and password promptly after deployment.**

<br/>
<table>
    <tr>
      <td width="50%" align="center"><b>Image Acceleration</b></td>
      <td width="50%" align="center"><b>Image Search</b></td>
    </tr>
    <tr>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/picture/hubcmdui-images.png?raw=true"></td>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/picture/hubcmdui-images-search.png?raw=true"></td>
    </tr>
    <tr>
      <td width="50%" align="center"><b>Registry Management</b></td>
      <td width="50%" align="center"><b>Registry Configuration</b></td>
    </tr>
    <tr>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/picture/hubcmdui-go-config.png?raw=true"></td>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/picture/hubcmdui-registry-manager.png?raw=true"></td>
    </tr>
    <tr>
      <td width="50%" align="center"><b>System Dashboard</b></td>
      <td width="50%" align="center"><b>Traffic Monitoring</b></td>
    </tr>
    <tr>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/picture/hubcmd-ui-dashboard.png?raw=true"></td>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/picture/hubcmdui-Traffic.png?raw=true"></td>
    </tr>
    <tr>
      <td width="50%" align="center"><b>Access Control</b></td>
      <td width="50%" align="center"><b>Network Testing</b></td>
    </tr>
    <tr>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/picture/hubcmd-ui-ipaccess.png?raw=true"></td>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/picture/hubcmdui-network-test.png?raw=true"></td>
    </tr>
</table>

---

## 🛠 Local Development

For developers participating in secondary development, debugging, or building images locally. The two sub-projects (`go-proxy/` and `hubcmdui/`) are **independent** and can be run separately.

### go-proxy (Go backend)

**Prerequisite**: Go ≥ 1.23 (explicitly required in `go-proxy/go.mod` as 1.23.0)

```bash
cd go-proxy
# Method A: Auto-discovers config.local.yaml > config.yaml > config.example.yaml in the current directory
go run .
# Method B: Pass an explicit config file
go run . ./config.local.yaml
```

After startup:

| Port | Purpose | Exposure |
| --- | --- | --- |
| `:5000` | OCI Registry reverse proxy (`/v2/` main entry) | Public / behind reverse proxy |
| `:5001` | Admin API (`/-/healthz`, `/-/config`, `/-/reload`, `/-/stats`, `/-/credentials`) | **Internal only** |

> ⚠️ **About `GO_PROXY_ADMIN_TOKEN`**: The admin API uses independent admin token authentication with **strict startup validation** — placeholder tokens (`change-me` / `admin` / empty string, etc.) or length < 16 will **directly refuse to start**. For local development, at minimum set a 16+ character random value:
>
> ```bash
> export GO_PROXY_ADMIN_TOKEN="$(openssl rand -hex 16)"
> ```

### hubcmdui (Web UI)

**Prerequisite**: Node.js ≥ 18 (20 LTS recommended)

```bash
cd hubcmdui
npm install
# Start dev server
npm run dev
```

Service listens on `:3000` by default; admin entry at `http://localhost:3000/admin`; default account `root / admin@123` (**Password change reminder on the first login pop-up**)

---

## 💌 Promotion

<table>
  <tr>
    <td width="33.33%" align="center">
      <a href="https://aihub.top/register?aff=RXYDWRNDZ4AU"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/picture/AIHUB.png?raw=true" alt="AIHUB" width="280" height="158"><br><strong>AIHUB</strong></a><br>
      <sub>Reliable and affordable AI API relay service</sub>
    </td>
    <td width="33.33%" align="center">
      <a href="https://docker-proxy-desc.vercel.app/dedione.html"><img src=https://cdn.jsdelivr.net/gh/dqzboy/Images/picture/dedione-vps.png?raw=true" alt="DediOne" width="280" height="158"><br><strong>DediOne</strong></a><br>
      <sub>Fast and reliable web hosting services</sub>
    </td>
    <td width="33.33%" align="center">
      <a href="https://docker-proxy-desc.vercel.app/dedirock.html"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/picture/DediRock.png?raw=true" alt="DediRock" width="280" height="158"><br><strong>DediRock</strong></a><br>
      <sub>Cost-effective VPS across multiple U.S. data centers</sub>
    </td>
  </tr>
  <tr>
    <td width="33.33%" align="center">
      <a href="https://docker-proxy-desc.vercel.app/racknerd.html"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/dqzboy-proxy/Image_2025-07-07_16-14-49.png?raw=true" alt="RackNerd" width="280" height="158"><br><strong>RackNerd</strong></a><br>
      <sub>Overseas VPS for websites and Docker services</sub>
    </td>
    <td width="33.33%" align="center">
      <a href="https://docker-proxy-desc.vercel.app/cloudcone.html"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/dqzboy-proxy/111.png?raw=true" alt="CloudCone" width="280" height="158"><br><strong>CloudCone</strong></a><br>
      <sub>Flexible pay-as-you-go cloud servers</sub>
    </td>
    <td width="33.33%"><!-- New promotion slot --></td>
  </tr>
</table>

---

<p align="center">
  <strong>Promotion Partnerships</strong><br>
  We only accept reputable providers with stable, long-term operations<br>
  <a href="https://t.me/RelayHubBot">Telegram</a> · <a href="mailto:support@dqzboy.com">support@dqzboy.com</a>
</p>

---

## 🤝 Contributing

Thanks to everyone who has contributed!

<a href="https://github.com/dqzboy/Docker-Proxy/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=dqzboy/Docker-Proxy" />
</a>

## ❤ Acknowledgements
Thanks to the following projects for their open-source contributions:

The project references the registry proxy design ideas of [CNCF Distribution](https://distribution.github.io/distribution/).

## License
Docker-Proxy is available under the [Apache 2 license](./LICENSE)

---

## Star History

[![Star History Chart](https://api.star-history.com/chart?repos=dqzboy/Docker-Proxy&type=date&legend=top-left&sealed_token=SfUpnp7CeJMr2_b654YiehUQWQJAbzaTvdQFq8n-EjzvSN6Tl7n6XeO6NJ_ofFH0PIh0f1Toe_deHw_j31JlKL7LcFovwrmo75dW3KntbCxpEaoG8YibZA)](https://www.star-history.com/?repos=dqzboy%2FDocker-Proxy&type=date&legend=top-left)
