<div style="text-align: center">
  <p align="center">
  <img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/c187d66f-152e-4172-8268-e54bd77d48bb" width="230px" height="200px">
      <br>
      <i>自建Docker镜像加速服务，基于官方 registry 一键部署Docker、K8s、Quay、Ghcr镜像加速\管理服务.</i>
  </p>
</div>

<div align="center">

[![Auth](https://img.shields.io/badge/Auth-dqzboy-ff69b4)](https://github.com/dqzboy)
[![GitHub contributors](https://img.shields.io/github/contributors/dqzboy/Docker-Proxy)](https://github.com/dqzboy/Docker-Proxy/graphs/contributors)
[![GitHub Issues](https://img.shields.io/github/issues/dqzboy/Docker-Proxy.svg)](https://github.com/dqzboy/Docker-Proxy/issues)
[![GitHub Pull Requests](https://img.shields.io/github/stars/dqzboy/Docker-Proxy)](https://github.com/dqzboy/Docker-Proxy)
[![HitCount](https://views.whatilearened.today/views/github/dqzboy/Docker-Proxy.svg)](https://github.com/dqzboy/Docker-Proxy)
[![GitHub license](https://img.shields.io/github/license/dqzboy/Docker-Proxy)](https://github.com/dqzboy/Docker-Proxy/blob/main/LICENSE)

</div>

---

[Telegram Group](https://t.me/+ghs_XDp1vwxkMGU9) 

<details>
<summary>点击此处加入微信交流群</summary>
<div align="center">
<img src="https://raw.githubusercontent.com/dqzboy/Blog-Image/main/TEG/dqzboy-it.png" width="400px">
</div>
</details>

---

## 📝 准备工作
⚠️  **重要**：一台国外的服务器，并且未被墙。一个域名，无需国内备案，便宜的就行！一键部署时选择安装Caddy可自动实现HTTPS。如果部署的是Nginx服务，那么你需要申请一个免费的SSL证书或通过[Acme.sh自动生成和续订Lets Encrypt免费SSL证书](https://www.dqzboy.com/16437.html)还可以把域名托管到[Cloudflare 开启免费SSL证书](https://www.cloudflare.com/zh-cn/application-services/products/ssl/)


> 如果没有域名，只有公网IP，那么你可以尝试通过 **[zerossl](https://zerossl.com)** 给IP申请SSL证书
> 
> 如果你只有一台服务器，不想搞域名也不想配置TLS，那么你可以配置Docker的配置文件daemon.json，指定insecure-registries配置你的镜像加速地址
>
> **如果你没有国外服务器，你可以在执行一键部署时配置自己的代理地址**


🚀 如果你身边没有上面提到的这些东西，那么你也可以部署到Render，详细操作查看下面教程

## 📦 部署
#### 通过项目脚本部署
```shell
# CentOS
yum -y install wget curl
# ubuntu
apt -y install wget curl

bash -c "$(curl -fsSL https://raw.githubusercontent.com/dqzboy/Docker-Proxy/main/install/DockerProxy_Install.sh)"
```

#### 使用 Render 部署
<details>
<summary><strong>部署到 Render</strong></summary>
<div>

[使用Render快速部署](Render/README.md)

</details>

#### Docker Compose 部署
<details>
<summary><strong>手动部署容器</strong></summary>
<div>

**1.** 下载[config](https://github.com/dqzboy/Docker-Proxy/tree/main/config)目录下对应的`yml`文件到你本地机器上

**2.** 下载[docker-compose.yaml](https://github.com/dqzboy/Docker-Proxy/blob/main/docker-compose.yaml)文件到你本地机器上，并且与配置文件同级目录下

**3.** 执行 `docker compose` 命令启动容器服务
```shell
docker compose up -d

# 查看容器日志
docker logs -f [容器ID或名称]
```

**4.** 如果你对Nginx或Caddy不熟悉,那么你可以使用你熟悉的服务进行代理。也可以直接通过IP+端口的方式访问

</details>


## 🔨 功能
- 一键部署Docker镜像代理服务的功能，支持基于官方Docker Registry的镜像代理. 
- 支持多个镜像仓库的代理，包括Docker Hub、GitHub Container Registry (ghcr.io)、Quay Container Registry (quay.io)和 Kubernetes Container Registry (k8s.gcr.io) 
- 自动检查并安装所需的依赖软件，如Docker、Nginx等，并确保系统环境满足运行要求.
- 自动清理注册表上传目录中的那些不再被任何镜像或清单引用的文件
- 提供了重启服务、更新服务、更新配置和卸载服务的功能，方便用户进行日常管理和维护
- 支持用户在部署时选择是否提供身份验证
- 支持配置代理(HTTP_PROXY)，仅支持http和https
- 支持主流Linux发行版操作系统,例如Centos、Ubuntu、Rocky、Debian、Rhel等
- 支持主流ARCH架构下部署，包括linux/amd64、linux/arm64

## ✨ 教程
### 配置Nginx反向代理
**注意**： 如果你选择部署的是Nginx，那么代理程序部署完成之后，需自行配置 Nginx <br>

**1.下载仓库下的nginx配置文件 [registry-proxy.conf](https://raw.githubusercontent.com/dqzboy/Docker-Proxy/main/nginx/registry-proxy.conf) 到你的nginx服务下，并修改配置里的域名和证书部分** <br>
**2.在你的DNS服务提供商将相应的访问域名解析到部署docker proxy服务的机器IP上** <br>
**3.修改Docker的daemon.json配置，配置你自建的Registry地址。修改后重启docker**
```shell
~]# vim /etc/docker/daemon.json
{
    "registry-mirrors": [ "https://hub.your_domain_name" ],
    "log-opts": {
      "max-size": "100m",
      "max-file": "5"
    }
}
```

> **说明：** 配置了daemon.json之后，现在拉取镜像无需指定你的加速地址，直接执行docker pull 拉取你需要的镜像即可。下面的步骤是你在没有配置daemon.json的时候，拉取镜像需要加上你的加速地址才可以正常拉取。

---

**1. 使用自建的 Registry 地址替换官方的 Registry 地址拉取镜像**
```shell
# docker hub Registry
## 源：nginx:latest
## 替换
docker pull hub.your_domain_name/library/nginx:latest

# Google Registry
## 源：gcr.io/google-containers/pause:3.1
## 替换：
docker pull gcr.your_domain_name/google-containers/pause:3.1
```

**2. 前缀替换的 Registry 的参考**

| 源站 | 替换为 | 平台 |
|-------|---------------|----------|
| docker.io   | hub.your_domain_name   |  docker hub 
| gcr.io      | gcr.your_domain_name   |  Google Container Registry
| ghcr.io     | ghcr.your_domain_name  |  GitHub Container Registry
| k8s.gcr.io     | k8s-gcr.your_domain_name  | Kubernetes Container Registry
| registry.k8s.io     | k8s.your_domain_name  | Kubernetes's container image registry
| quay.io     | quay.your_domain_name  | Quay Container Registry

---

**关于使用镜像加速拉取docker hub公共空间下的镜像时如何不添加library的方案**

- 此方案来自交流群里大佬提供，通过nginx实现并实测
```shell
location ^~ / {
    if ($request_uri ~  ^/v2/([^/]+)/(manifests|blobs)/(.*)$) {
            # 重写路径并添加 library/
            rewrite ^/v2/(.*)$ /v2/library/$1 break;
    }

    proxy_pass http://127.0.0.1:51000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header REMOTE-HOST $remote_addr;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_http_version 1.1;
    add_header X-Cache $upstream_cache_status;
}
```



> 详细教程：[自建Docker镜像加速服务：加速与优化镜像管理](https://www.dqzboy.com/8709.html)

## 📚 展示
<br/>
<table>
    <tr>
      <td width="50%" align="center"><b>系统环境检查</b></td>
      <td width="50%" align="center"><b>服务部署安装</b></td>
    </tr>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/55df7f6f-c788-4200-9bcd-631998dc53ef?raw=true"></td>
        <td width="50%" align="center"><img src=https://github.com/dqzboy/Docker-Proxy/assets/42825450/c544fb1e-ecd5-447c-9661-0c5913586118?raw=true"></td>
    </tr>
</table>

## 💻 UI
![docker-proxy](https://github.com/dqzboy/Docker-Proxy/assets/42825450/5194cfc0-1108-4c99-bf87-31e90b9154a1)


## 🫶 赞助
如果你觉得这个项目对你有帮助，请给我点个Star。并且情况允许的话，可以给我一点点支持，总之非常感谢支持😊

<table>
    <tr>
      <td width="50%" align="center"><b> Alipay </b></td>
      <td width="50%" align="center"><b> WeChat Pay </b></td>
    </tr>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/Deploy_K8sCluster/assets/42825450/223fd099-9433-468b-b490-f9807bdd2035?raw=true"></td>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/Deploy_K8sCluster/assets/42825450/9404460f-ea1b-446c-a0ae-6da96eb459e3?raw=true"></td>
    </tr>
</table>

## 😺 其他

开源不易,若你参考此项目或基于此项目修改可否麻烦在你的项目文档中标识此项目？谢谢你！


## ❤ 鸣谢
感谢以下项目的开源的付出：

[CNCF Distribution](https://distribution.github.io/distribution/) 

[docker-registry-browser](https://github.com/klausmeyer/docker-registry-browser)
