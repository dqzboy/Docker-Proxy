<p align="right">
   <strong>中文</strong> | <a href="./README.en.md">English</a>
</p>

<div style="text-align: center">
  <p align="center">
  <img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/c187d66f-152e-4172-8268-e54bd77d48bb" width="230px" height="200px">
      <br>
      <i>自建Docker镜像加速服务，一键部署Docker、K8s、Quay、Ghcr、Mcr、elastic、nvcr等镜像加速\管理服务.</i>
  </p>
</div>

<div align="center">

[![Auth](https://img.shields.io/badge/Auth-dqzboy-ff69b4)](https://github.com/dqzboy)
[![GitHub contributors](https://img.shields.io/github/contributors/dqzboy/Docker-Proxy)](https://github.com/dqzboy/Docker-Proxy/graphs/contributors)
[![GitHub Issues](https://img.shields.io/github/issues/dqzboy/Docker-Proxy.svg)](https://github.com/dqzboy/Docker-Proxy/issues)
[![GitHub Pull Requests](https://img.shields.io/github/stars/dqzboy/Docker-Proxy)](https://github.com/dqzboy/Docker-Proxy)
[![HitCount](https://views.whatilearened.today/views/github/dqzboy/Docker-Proxy.svg)](https://github.com/dqzboy/Docker-Proxy)
[![GitHub license](https://img.shields.io/github/license/dqzboy/Docker-Proxy)](https://github.com/dqzboy/Docker-Proxy/blob/main/LICENSE)

📢 <a href="https://t.me/+ghs_XDp1vwxkMGU9" style="font-size: 15px;">Docker Proxy-TG交流群</a> 

</div>

---

## 📝 准备工作
⚠️  **重要**：选择一台国外服务器，并且未被墙。对于域名，无需进行国内备案。你也可以通过一些平台申请免费域名。在一键部署过程中，如果选择安装Caddy，它将自动配置HTTPS。若选择部署Nginx服务，则需要自行申请一个免费的SSL证书，或者通过其他方式来实现SSL加密。

<details>
<summary><strong>免费域名证书申请</strong></summary>
<div>

**方式一：** [Acme.sh自动生成和续订Lets Encrypt免费SSL证书](https://www.dqzboy.com/16437.html)

**方式二：** 域名托管到[Cloudflare 开启免费SSL证书](https://www.cloudflare.com/zh-cn/application-services/products/ssl/)

**方式三：** 可通过第三方平台，申请免费的域名证书(免费一般都为DV证书)，适用于个人网站、博客和小型项目

</details>

---

## 🔨 功能
- [x] **零磁盘缓存**：单进程按 `Host` 自动路由到各大公共仓库（`Docker Hub`、`GHCR`、`Quay`、`K8s`、`MCR`、`Elastic`、`NVCR` 等），服务端完成 token 鉴权并以流式转发，不落盘、不占用本地存储
- [x] **一键部署**：交互式菜单一键完成「安装依赖 → 启动 Docker 镜像加速 →（可选）渲染 Nginx/Caddy 反代」
- [x] **可选反代服务**：自动部署 Nginx 或 Caddy 反代，并渲染对应配置（HTTPS、Host 改写）
- [x] **支持仓库账号认证**：可配置上游账号密码，由代理服务端换取 Bearer Token，从而拉取 `Docker Hub` 私有镜像并缓解官方限流
- [x] **HubCMD-UI 管理面板**：网页端直接增删改代理、设置服务器参数并热重载；含镜像搜索、文档教程、容器管理、监控告警等
- [x] **跨平台镜像**：支持主流 `linux/amd64`、`linux/arm64` 等系统架构的部署
- [x] **系统看板**：实时监控服务器资源与容器运行状态、网络流量信息
- [x] **日常运维管理**：提供服务启动 / 停止 / 重启 / 日志 / 更新 / 卸载等全生命周期管理
- [x] **流量监控、告警**：提供服务器带宽吞吐量及镜像拉取的详细客户端侧流量指标、阈值监控告警
- [x] **Registry 管理**：每个 Registry 独立配置管理，在线管理镜像代理（注册表）与服务设置，无需手动编辑配置文件
- [x] **IP 访问控制**：IP 黑白名单，控制谁能通过本服务拉取镜像。支持单个 IP 与 CIDR 网段


## 📦 部署

### Docker 部署
直接下载 [`docker-compose.yaml`](./docker-compose.yaml) 后运行：
```bash
docker compose up -d
```


### 一键部署脚本
仓库内置 [`install/DockerProxy_Install.sh`](./install/DockerProxy_Install.sh)，交互式菜单一键完成「安装依赖 → 启动 Docker 镜像加速 →（可选）渲染 Nginx/Caddy 反代」。

```shell
# CentOS && RHEL && Rocky
yum -y install curl
# ubuntu && debian
apt -y install curl

# 国外环境
bash -c "$(curl -fsSL https://raw.githubusercontent.com/dqzboy/Docker-Proxy/main/install/DockerProxy_Install.sh)"

# 国内环境cdn加速地址
bash -c "$(curl -fsSL https://cdn.jsdelivr.net/gh/dqzboy/Docker-Proxy/install/DockerProxy_Install.sh)"

# 国内Github代理地址
bash -c "$(curl -fsSL https://ghp.ci/https://raw.githubusercontent.com/dqzboy/Docker-Proxy/main/install/DockerProxy_Install.sh)"
```

> 脚本会自动：检查并安装 Docker / Docker Compose；生成随机 `GO_PROXY_ADMIN_TOKEN` 写入 `.env`；可选部署 Nginx / Caddy 反代。

部署完成后访问 `http://<服务器IP>:30080/admin` 即可在网页管理代理与服务器参数

### 配置持久化与升级（重要）
配置文件挂载在宿主机 `./config/go-proxy/` 目录（容器内 `/app/config.d/config.yaml`）

- 首次启动若宿主机还没有配置文件，容器会自动用镜像内置的默认配置初始化一份，无需手动创建。
- 想恢复默认配置：删掉 `./config/go-proxy/config.yaml` 后重建容器即可重新播种。

---

## 💻 Hubcmd-UI

- **默认账户**: `root` / `admin@123`  **部署后请及时修改默认账号和密码**

<br/>
<table>
    <tr>
      <td width="50%" align="center"><b>镜像加速</b></td>
      <td width="50%" align="center"><b>镜像搜索</b></td>
    </tr>
    <tr>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/picture/hubcmdui-images.png?raw=true"></td>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/picture/hubcmdui-images-search.png?raw=true"></td>
    </tr>
    <tr>
      <td width="50%" align="center"><b>Registry 管理</b></td>
      <td width="50%" align="center"><b>Registry 配置</b></td>
    </tr>
    <tr>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/picture/hubcmdui-go-config.png?raw=true"></td>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/picture/hubcmdui-registry-manager.png?raw=true"></td>
    </tr>
    <tr>
      <td width="50%" align="center"><b>系统看板</b></td>
      <td width="50%" align="center"><b>流量监控</b></td>
    </tr>
    <tr>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/picture/hubcmd-ui-dashboard.png?raw=true"></td>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/picture/hubcmdui-Traffic.png?raw=true"></td>
    </tr>
    <tr>
      <td width="50%" align="center"><b>访问控制</b></td>
      <td width="50%" align="center"><b>网络测试</b></td>
    </tr>
    <tr>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/picture/hubcmd-ui-ipaccess.png?raw=true"></td>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/picture/hubcmdui-network-test.png?raw=true"></td>
    </tr>
</table>

---

## 💌 推广

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
        <a href="https://aihub.top/register?aff=RXYDWRNDZ4AU" target="_blank">AIHUB中转，聚合十几家源头持续监控。让大家用上便宜且相对稳定的 Token。</a>
      </td>
      <td width="50%" align="center">
        <a href="https://aihub.top/register?aff=RXYDWRNDZ4AU" target="_blank">
          <img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/picture/AIHUB.png?raw=true" alt="CloudCone" width="200" height="150">
        </a>
      </td>
    </tr>
    <tr>
      <td width="50%" align="left">
        <a href="https://docker-proxy-desc.vercel.app/dedirock.html" target="_blank">DediRock 美国洛杉矶与纽约机房年付 VPS，覆盖低价特惠、存储型与高性能 NVMe 方案，适合 Docker、建站、开发测试与备份节点。</a>
      </td>
      <td width="50%" align="center">
        <a href="https://docker-proxy-desc.vercel.app/dedirock.html" target="_blank">
          <img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/picture/DediRock.png?raw=true" alt="RackNerd" width="200" height="150">
        </a>
      </td>
    </tr>
    <tr>
      <td width="50%" align="left">
        <a href="https://docker-proxy-desc.vercel.app/racknerd.html" target="_blank">提供高性价比的海外VPS，支持多种操作系统，适合搭建Docker代理服务。</a>
      </td>
      <td width="50%" align="center">
        <a href="https://docker-proxy-desc.vercel.app/racknerd.html" target="_blank">
          <img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/dqzboy-proxy/Image_2025-07-07_16-14-49.png?raw=true" alt="RackNerd" width="200" height="150">
        </a>
      </td>
    </tr>
    <tr>
      <td width="50%" align="left">
        <a href="https://docker-proxy-desc.vercel.app/cloudcone.html" target="_blank">CloudCone 提供灵活的云服务器方案，支持按需付费，适合个人和企业用户。</a>
      </td>
      <td width="50%" align="center">
        <a href="https://docker-proxy-desc.vercel.app/cloudcone.html" target="_blank">
          <img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/dqzboy-proxy/111.png?raw=true" alt="CloudCone" width="200" height="150">
        </a>
      </td>
    </tr>
  </tbody>
</table>

##### *Telegram Bot: [点击联系](https://t.me/RelayHubBot) ｜ E-Mail: support@dqzboy.com*
**仅接受长期稳定运营，信誉良好的商家*

## 🤝 参与贡献

感谢所有做过贡献的人!

<a href="https://github.com/dqzboy/Docker-Proxy/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=dqzboy/Docker-Proxy" />
</a>

## ❤ 鸣谢
感谢以下项目的开源的付出：

项目参考了 [CNCF Distribution](https://distribution.github.io/distribution/) 的镜像代理设计思路。

## License
Docker-Proxy is available under the [Apache 2 license](./LICENSE)

---

## Star History

[![Star History Chart](https://api.star-history.com/chart?repos=dqzboy/Docker-Proxy&type=date&legend=top-left&sealed_token=SfUpnp7CeJMr2_b654YiehUQWQJAbzaTvdQFq8n-EjzvSN6Tl7n6XeO6NJ_ofFH0PIh0f1Toe_deHw_j31JlKL7LcFovwrmo75dW3KntbCxpEaoG8YibZA)](https://www.star-history.com/?repos=dqzboy%2FDocker-Proxy&type=date&legend=top-left)