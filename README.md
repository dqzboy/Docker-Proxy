<div style="text-align: center"></div>
  <p align="center">
  <img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/c187d66f-152e-4172-8268-e54bd77d48bb" width="230px" height="200px">
      <br>
      <i>自建Docker镜像加速服务，基于官方 registry 一键部署Docker、K8s、Quay、Ghcr镜像加速\管理服务.</i>
  </p>
</div>

---

[Telegram Group](https://t.me/+ghs_XDp1vwxkMGU9) 
<details>
<summary>扫描下方二维码加入微信群</summary>
<div align="center">
<img src="https://github.com/dqzboy/ChatGPT-Proxy/assets/42825450/09211fb0-70bd-4ac7-bb99-2ead29561142" width="400px">
</div>
</details>

---

## 📝 准备工作
⚠️  **重要**：一台国外的服务器，并且未被墙。一个域名，无需国内备案，便宜的就行！选择部署Caddy可自动实现HTTPS。
如果部署的是Nginx服务，那么你需要申请一个免费的SSL证书或通过[Acme.sh自动生成和续订Lets Encrypt免费SSL证书](https://www.dqzboy.com/16437.html)还可以把域名托管到[Cloudflare 开启免费SSL证书](https://www.cloudflare.com/zh-cn/application-services/products/ssl/)

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

## 🔨 功能
- 一键部署Docker镜像代理服务的功能，支持基于官方Docker Registry的镜像代理. 
- 支持多个镜像仓库的代理，包括Docker Hub、GitHub Container Registry (ghcr.io)、Quay Container Registry (quay.io)和 Kubernetes Container Registry (k8s.gcr.io) 
- 自动检查并安装所需的依赖软件，如Docker、Nginx等，并确保系统环境满足运行要求.
- 自动清理注册表上传目录中的那些不再被任何镜像或清单引用的文件
- 提供了重启服务、更新服务、更新配置和卸载服务的功能，方便用户进行日常管理和维护
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
**4. 使用自建的 Registry 地址替换官方的 Registry 地址拉取镜像**
```shell
# docker hub Registry
## 源：nginx:latest
## 替换
docker pull hub.your_domain_name/library/nginx:latest

# K8s Registry
## 源：gcr.io/google-containers/pause:3.1
## 替换：
docker pull gcr.your_domain_name/google-containers/pause:3.1
```

**5. 前缀替换的 Registry 的参考**

| 源站 | 替换为 | 平台 |
|-------|---------------|----------|
| docker.io   | hub.your_domain_name   |  docker hub 
| gcr.io      | gcr.your_domain_name   |  Google Container Registry
| ghcr.io     | ghcr.your_domain_name  |  GitHub Container Registry
| k8s.gcr.io     | k8s-gcr.your_domain_name  | Kubernetes Container Registry
| quay.io     | quay.your_domain_name  | Quay Container Registry


**6. 关于使用镜像加速拉取docker hub公共空间下的镜像时如何不添加library的方案**

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

## ❤ 鸣谢
感谢以下项目的开源的付出：

[CNCF Distribution](https://distribution.github.io/distribution/) 

[docker-registry-browser](https://github.com/klausmeyer/docker-registry-browser)
