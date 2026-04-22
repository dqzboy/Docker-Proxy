<p align="right">
    <a href="./README.md">中文</a> | <strong>English</strong>
</p>

<div style="text-align: center">
  <p align="center">
  <img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/c187d66f-152e-4172-8268-e54bd77d48bb" width="230px" height="200px">
      <br>
      <i>Self-hosted Docker image acceleration service — one-click deployment for Docker, K8s, Quay, Ghcr, Mcr, Elastic, NVCR and other registry proxy/management services.</i>
  </p>
</div>

<div align="center">

[![Auth](https://img.shields.io/badge/Auth-dqzboy-ff69b4)](https://github.com/dqzboy)
[![GitHub contributors](https://img.shields.io/github/contributors/dqzboy/Docker-Proxy)](https://github.com/dqzboy/Docker-Proxy/graphs/contributors)
[![GitHub Issues](https://img.shields.io/github/issues/dqzboy/Docker-Proxy.svg)](https://github.com/dqzboy/Docker-Proxy/issues)
[![GitHub Pull Requests](https://img.shields.io/github/stars/dqzboy/Docker-Proxy)](https://github.com/dqzboy/Docker-Proxy)
[![HitCount](https://views.whatilearened.today/views/github/dqzboy/Docker-Proxy.svg)](https://github.com/dqzboy/Docker-Proxy)
[![GitHub license](https://img.shields.io/github/license/dqzboy/Docker-Proxy)](https://github.com/dqzboy/Docker-Proxy/blob/main/LICENSE)


📢 <a href="https://t.me/+ghs_XDp1vwxkMGU9" style="font-size: 15px;">Docker Proxy-Communication Group</a>

</div>

---

## 📝 Preparation
⚠️  **Important**: Choose a server located outside China and ensure it is not blocked. For domains, domestic ICP filing is not required. You can obtain free domains from various providers. If you choose to install Caddy during the one-click deployment, HTTPS will be configured automatically. If you choose Nginx, you will need to obtain and configure an SSL certificate yourself (for example via Let's Encrypt or Cloudflare).

<details>
<summary><strong>Free domain / TLS certificate options</strong></summary>
<div>

**Option 1:** Use Acme.sh to automatically obtain and renew Let's Encrypt certificates — guide: https://www.dqzboy.com/16437.html

**Option 2:** Host your DNS on Cloudflare and enable its free SSL/TLS service.

**Option 3:** Use third-party providers that offer free DV certificates suitable for personal sites and small projects.

</div>
</details>

<details>
<summary><strong>Alternative deployment options if you lack the recommended environment</strong></summary>
<div>

**Scheme 1:** Deploy to free or low-cost cloud platforms such as [ClawCloud](cloud/ClawCloud/README.md) or [Render](cloud/Render/README.md).

**Scheme 2:** If you have a single server and do not want to use a domain or TLS, configure Docker's `/etc/docker/daemon.json` with `insecure-registries` to point to your proxy.

**Scheme 3:** When deploying from within China, the installer can configure HTTP proxy settings to help install Docker and Docker Compose.

**Scheme 4:** Use the Cloudflare Workers based proxy project: https://github.com/dqzboy/Workers-Proxy-Docker

</div>
</details>

---

> **If you encounter issues during deployment, check the problem summary:** [Issue/issue.md](Issue/issue.md). Try to troubleshoot using the documented cases first.


---

## 🔨 Features
- One‑click deployment of Docker registry proxy services, supporting multiple upstream registries (Docker Hub, ghcr, quay, k8s, mcr.microsoft.com, docker.elastic.co, nvcr, etc.).
- Automatic environment checks and installation of dependencies (Docker, Docker Compose, Nginx, Caddy, etc.).
- Automatic generation of Nginx/Caddy reverse‑proxy configuration for selected services.
- Optional Docker Hub authentication to pull private images and mitigate Docker Hub rate limits (see docs/issues for configuration).
- Configurable proxy cache TTL (`PROXY_TTL`) and IP whitelist/blacklist for access control.
- Service management, configuration management, uninstall, and authentication features for day‑to‑day operations.
- One‑click configuration for local Docker daemon proxy and container HTTP proxy (`HTTP_PROXY`) — HTTP only.
- Installer helpers for servers inside China to work around Docker/Compose installation issues.
- Includes HubCMD‑UI web panel for browsing, image search, documentation, container management, and monitoring alerts.


## 📦 Deploy
### Deploy using the project installer script
```shell
# CentOS / RHEL / Rocky
yum -y install curl
# Ubuntu / Debian
apt -y install curl

# For environments outside China (recommended)
bash -c "$(curl -fsSL https://raw.githubusercontent.com/dqzboy/Docker-Proxy/main/install/DockerProxy_Install.sh)"

# For domestic environments: CDN mirror
bash -c "$(curl -fsSL https://cdn.jsdelivr.net/gh/dqzboy/Docker-Proxy/install/DockerProxy_Install.sh)"

# Alternative GitHub raw proxy
bash -c "$(curl -fsSL https://ghp.ci/https://raw.githubusercontent.com/dqzboy/Docker-Proxy/main/install/DockerProxy_Install.sh)"
```

- **Hubcmd-UI** panel can be installed via the installer script. Demo: https://dqzboy.github.io/proxyui/ (use after deployment to see full features).

```
Run the installer and select options: 2 ---> 8 ---> 1
```

### Deploy to third‑party platforms
<details>
<summary><strong>Deploy to Claw Cloud</strong></summary>
<div>

Claw Cloud may provide free credits and easy deployment — see cloud/ClawCloud/README.md for instructions.

</div>
</details>

<details>
<summary><strong>Deploy to Render</strong></summary>
<div>

Render provides free tiers; see cloud/Render/README.md for a quick guide.

</div>
</details>

<details>
<summary><strong>Deploy to Koyeb</strong></summary>
<div>

Koyeb's assigned domains may be unstable for some regions; see cloud/Koyeb/README.md for details.

</div>
</details>


### Docker Compose deployment
<details>
<summary><strong>Manual container deployment (expand)</strong></summary>
<div>

**⚠️ Note:** Download the config file for the registries you need. The `docker-compose.yaml` includes many services by default — keep only the ones you will run.

1. Download the corresponding `yml` from the [config](https://github.com/dqzboy/Docker-Proxy/tree/main/config) directory.

2. Download `docker-compose.yaml` to the same directory as the config files.

3. Start containers:
```shell
docker compose up -d

# Start a specific service, for example the Docker Hub proxy
docker compose up -d dockerhub

# View logs
docker logs -f [CONTAINER_ID_OR_NAME]
```

4. If you are not familiar with Nginx or Caddy, you can use any reverse proxy you prefer, or access services directly via IP and port.

</div>
</details>


## ✨ Usage guide
Full usage and configuration examples are available in the docs: https://dqzboy.github.io/docs/pages/install.html


## 💻 HubCMD‑UI
> HubCMD‑UI manual installation: hubcmdui/README.md

> HubCMD-UI 手动安装教程：[点击查看教程](hubcmdui/README.md)

> HubCMD-UI 演示环境 [点击查看](https://ufxsgwxleywi.ap-southeast-1.clawcloudrun.com/)

<br/>
<table>
    <tr>
      <td width="50%" align="center"><b>镜像加速</b></td>
      <td width="50%" align="center"><b>镜像搜索</b></td>
    </tr>
    <tr>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/dqzboy-proxy/hubcmd-ui_01.png?raw=true"></td>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/dqzboy-proxy/hubcmd-ui_02.png?raw=true"></td>
    </tr>
    <tr>
      <td width="50%" align="center"><b>文档管理</b></td>
      <td width="50%" align="center"><b>TAG搜索</b></td>
    </tr>
    <tr>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/dqzboy-proxy/hubcmd-ui_03.png?raw=true"></td>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/dqzboy-proxy/hubcmd-ui_11.png?raw=true"></td>
    </tr>
    <tr>
      <td width="50%" align="center"><b>控制面板</b></td>
      <td width="50%" align="center"><b>容器管理</b></td>
    </tr>
    <tr>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/dqzboy-proxy/hubcmd-ui_07.png?raw=true"></td>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/dqzboy-proxy/hubcmd-ui_09.png?raw=true"></td>
    </tr>
</table>


## 💌 Promotion

<table>
  <thead>
    <tr>
      <th width="50%" align="center">描述信息</th>
      <th width="50%" align="center">图文介绍</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td width="50%" align="left">
        <a href="https://dqzboy.github.io/proxyui/racknerd" target="_blank">提供高性价比的海外VPS，支持多种操作系统，适合搭建Docker代理服务。</a>
      </td>
      <td width="50%" align="center">
        <a href="https://dqzboy.github.io/proxyui/racknerd" target="_blank">
          <img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/dqzboy-proxy/Image_2025-07-07_16-14-49.png?raw=true" alt="RackNerd" width="200" height="150">
        </a>
      </td>
    </tr>
    <tr>
      <td width="50%" align="left">
        <a href="https://dqzboy.github.io/proxyui/CloudCone" target="_blank">CloudCone 提供灵活的云服务器方案，支持按需付费，适合个人和企业用户。</a>
      </td>
      <td width="50%" align="center">
        <a href="https://dqzboy.github.io/proxyui/CloudCone" target="_blank">
          <img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/dqzboy-proxy/111.png?raw=true" alt="CloudCone" width="200" height="150">
        </a>
      </td>
    </tr>
  </tbody>
</table>

##### *Telegram Bot: [Click to contact](https://t.me/RelayHubBot) ｜ E-Mail: support@dqzboy.com*
**Only merchants with long-term stable operations and a solid reputation are accepted.*


## 🤝 Contributing
Thanks to everyone who has contributed!

<a href="https://github.com/dqzboy/Docker-Proxy/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=dqzboy/Docker-Proxy" />
</a>


## ❤ Acknowledgements
This project builds on the work of several open‑source projects including:

[CNCF Distribution](https://distribution.github.io/distribution/) 

[docker-registry-browser](https://github.com/klausmeyer/docker-registry-browser)


## License
Docker-Proxy is available under the [Apache 2 license](./LICENSE)

---

[![Star History Chart](https://api.star-history.com/svg?repos=dqzboy/Docker-Proxy&type=Date)](https://star-history.com/#dqzboy/Docker-Proxy&Date)
