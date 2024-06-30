<p align="right">
    <a href="./README.md">中文</a> | <strong>English</strong>
</p>

<div style="text-align: center">
  <p align="center">
  <img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/c187d66f-152e-4172-8268-e54bd77d48bb" width="230px" height="200px">
      <br>
      <i>Self-built Docker image acceleration service, based on the official registry, one-click deployment of Docker, K8s, Quay, Ghcr, Mcr, elastic, and other image acceleration management services.</i>
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
⚠️  **Important:** Choose a foreign server that is not blocked. For the domain name, no need to go through domestic filing. During the one-click deployment process, if you choose to install Caddy, it will automatically configure HTTPS. If you choose to deploy Nginx service, you will need to apply for a free SSL certificate yourself, or realize SSL encryption through other methods.

<details>
<summary><strong>Free domain certificate application</strong></summary>
<div>

**Method one:** [Acme.sh Automatically Generate and Renew Lets Encrypt Free SSL Certificate](https://www.dqzboy.com/16437.html)

**Method two:** Domain hosted to[Cloudflare enabling free SSL certificate](https://www.cloudflare.com/zh-cn/application-services/products/ssl/)

</details>

<details>
<summary><strong>If you don't have the environment mentioned above, you can try the following several schemes</strong></summary>
<div>

**Scheme one:**  🚀 🚀 If you don't have the things mentioned above, you can also deploy to **[Render](Render/README.md)**

**Scheme two:** If you don't have a domain name, only a public IP, then you can try to apply for an SSL certificate for the IP via **[Zerossl](https://zerossl.com)** 

**Scheme three:** If you only have one server and don't want to deal with domain names or configure TLS, then you can configure Docker's configuration file `daemon.json`, and specify `insecure-registries` to configure your image acceleration address

**Scheme four:** If you're deploying on a server within China, you can configure proxies while executing one-click deployment, which will also help solve the problem of Docker not being able to install domestically

</details>


> **During the deployment process, if you encounter any issues or questions, please scroll down to find the problem, see if your situation has been listed! Try to resolve it yourself first.**

---


## 📦 Deploy
### Deploy through project script
```shell
# CentOS && RHEL && Rocky
yum -y install curl
# ubuntu && debian
apt -y install curl

# overseas environment
bash -c "$(curl -fsSL https://raw.githubusercontent.com/dqzboy/Docker-Proxy/main/install/DockerProxy_Install.sh)"

# domestic environment
bash -c "$(curl -fsSL https://cdn.jsdelivr.net/gh/dqzboy/Docker-Proxy/install/DockerProxy_Install.sh)"
```

### Deployment to Third-Party Platforms
<details>
<summary><strong>Deploy to Render</strong></summary>
<div>

> Render offers a free quota, and you can further increase the quota after adding a card.

Deploy quickly with Render: [View Tutorial](Render/README.md)

</details>

<details>
<summary><strong>Deploy to Koyeb</strong></summary>
<div>

> The domain name assigned by Koyeb is not very stable when accessed in the domestic area, not highly recommended!

Deploy quickly with Koyeb: [View Tutorial](Koyeb/README.md)

</details>


### Docker Compose Deployment
<details>
<summary><strong>Manual Container Deployment</strong></summary>
<div>

**⚠️ Note:** Download the configuration for the image repository you wish to accelerate. The `docker-compose.yaml` file is set to deploy all domestic image repository acceleration services by default. Similarly, you should configure and deploy the one you need, and simply remove the rest!

**1.** Download the corresponding `yml` file from the [config](https://github.com/dqzboy/Docker-Proxy/tree/main/config) directory to your local machine.

**2.** Download the [docker-compose.yaml](https://github.com/dqzboy/Docker-Proxy/blob/main/docker-compose.yaml) file to your local machine and place it in the same directory level as the configuration file.

**3.** Execute the `docker compose` command to start the container service.
```shell
docker compose up -d

# View container logs
docker logs -f [Container ID or Name]
```

**4.** If you are not familiar with Nginx or Caddy, you can use a service you are familiar with for proxying. You can also access directly via IP and port number.

</details>


## 🔨 Features
- [x] One-click deployment of Docker image proxy services, supporting proxy based on the official Docker Registry. 
- [x] Supports proxy for multiple image repositories, including Docker Hub, GitHub Container Registry (ghcr.io), Quay Container Registry (quay.io), Kubernetes Container Registry (k8s.gcr.io), Microsoft Container (mcr.microsoft.com), Elastic Stack (docker.elastic.co).
- [x] Automatically checks for and installs required dependency software such as Docker, Nginx/Caddy, etc., and ensures the system environment meets the operational requirements.
- [x] Automatically renders the corresponding Nginx or Caddy service configuration based on the service you choose to deploy.
- [x] Automatically cleans up files in the registry upload directory that are no longer referenced by any image or manifest.
- [x] Provides features for restarting services, updating services, updating configurations, and uninstalling services, making it convenient for users to perform daily management and maintenance.
- [x] Supports user selection of whether to provide authentication during deployment.
- [x] Supports configuration of proxy (HTTP_PROXY), only supports HTTP.
- [x] Solves the problem of being unable to install Docker services in the domestic environment.
- [x] Supports mainstream Linux distribution operating systems, such as CentOS, Ubuntu, Rocky, Debian, RHEL, etc.
- [x] Supports deployment on mainstream ARCH architectures, including linux/amd64, linux/arm64.

## ✨ Tutorial
#### Configure Nginx Reverse Proxy
> **Note**： If you choose to deploy with Nginx, after the proxy program is deployed, you need to configure Nginx yourself.<br>

**1.Download the [registry-proxy.conf](https://raw.githubusercontent.com/dqzboy/Docker-Proxy/main/nginx/registry-proxy.conf) configuration file from the repository to your Nginx service and modify the domain name and certificate sections in the configuration** <br>
**2.Resolve the corresponding access domain name to the IP of the machine where the Docker proxy service is deployed at your DNS service provider** <br>
**3.Modify the Docker daemon.json configuration to configure your self-built Registry address. Restart Docker after modification**
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

> **Explanation：** After configuring the daemon.json, you no longer need to specify your acceleration address when pulling images; simply execute docker pull to retrieve the images you need. The following steps are for when you have not configured the daemon.json, and you need to include your acceleration address to pull images normally.

---

**1. Replace the official Registry address with your own Registry address to pull the image.**
```shell
# Docker Hub Registry
## Original: nginx:latest
## Replace with:
docker pull hub.your_domain_name/library/nginx:latest

# Google Registry
## Original: gcr.io/google-containers/pause:3.1
## Replace with:
docker pull gcr.your_domain_name/google-containers/pause:3.1
```

**2. Prefix replacement reference for the Registry.**

| Source | Replace with | Platform |
|-------|---------------|----------|
| docker.io   | hub.your_domain_name   |  docker hub 
| gcr.io      | gcr.your_domain_name   |  Google Container Registry
| ghcr.io     | ghcr.your_domain_name  |  GitHub Container Registry
| k8s.gcr.io     | k8s-gcr.your_domain_name  | Kubernetes Container Registry
| registry.k8s.io     | k8s.your_domain_name  | Kubernetes's container image registry
| quay.io     | quay.your_domain_name  | Quay Container Registry
| mcr.microsoft.com     | mcr.your_domain_name  | Microsoft Container Registry
| docker.elastic.co     | elastic.your_domain_name  | Elastic Stack

---

**Regarding the scheme for pulling images from the Docker Hub public space without adding "library" when using an image acceleration**

- This scheme was provided by a senior member in the communication group and has been implemented and tested through Nginx.
```shell
location ^~ / {
    if ($request_uri ~  ^/v2/([^/]+)/(manifests|blobs)/(.*)$) {
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

> Detailed Tutorial: [Self-built Docker Image Acceleration Service: Accelerating and Optimizing Image Management](https://www.dqzboy.com/8709.html)

## 📚 Display
<br/>
<table>
    <tr>
      <td width="50%" align="center"><b>System Environment Check</b></td>
      <td width="50%" align="center"><b>Service Deployment and Installation</b></td>
    </tr>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/55df7f6f-c788-4200-9bcd-631998dc53ef?raw=true"></td>
        <td width="50%" align="center"><img src=https://github.com/dqzboy/Docker-Proxy/assets/42825450/c544fb1e-ecd5-447c-9661-0c5913586118?raw=true"></td>
    </tr>
</table>

## 💻 UI
![docker-proxy](https://github.com/dqzboy/Docker-Proxy/assets/42825450/0ddb041b-64f6-4d93-b5bf-85ad3b53d0e0)

---

## 👨🏻‍💻 Issue

#### 1、Unable to delete a specific image tag through the UI.
**Known Issue：** Deletion is not supported when using `registry` as a proxy cache.

**Related Issues：** [#3853](https://github.com/distribution/distribution/issues/3853)

#### 2、The pull speed from within China is not ideal.
**Known Issue：** The network route from your foreign server to China is suboptimal.

**Solutions：** 
- (1) Enable BBR on the server to optimize network performance (with limited effect).
- (2) Switch to a server that has better network optimization for routes to China.

#### 3、How long does the registry image cache last, and how to adjust it?
**Known Issue：** The default cache time is 168 hours, which is 7 days. Adjust the cache time by modifying the ttl in the proxy configuration section of the configuration file

---

## 🫶 Sponsorship
If you find this project helpful, please give it a Star. And if possible, you can also give me a little support. Thank you very much for your support.😊

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


## 😺 Other

Open Source is not easy, if you reference this project or make modifications based on it, could you please credit this project in your documentation? Thank you!


## ❤ Acknowledgements
Thanks to the open source contributions of the following projects:

[CNCF Distribution](https://distribution.github.io/distribution/) 

[docker-registry-browser](https://github.com/klausmeyer/docker-registry-browser)