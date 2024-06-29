<div style="text-align: center"></div>
  <p align="center">
  <img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/c187d66f-152e-4172-8268-e54bd77d48bb" width="230px" height="200px">
      <br>
      <i>使用 Koyeb 快速部署我们的Docker镜像加速服务.</i>
  </p>
</div>

---

[Telegram Group](https://t.me/+ghs_XDp1vwxkMGU9) 

---


## 📦 部署
> 以下步骤需要有Koyeb账号，没有账号的可以先注册

**1. 登入 [Koyeb](https://app.koyeb.com/auth/signup/)**

<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/671ac907-35e9-4e33-8ecb-8f1787ea818d?raw=true"></td>
    </tr>
</table>

**2. 创建我们的服务**

<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/c14f1109-3c48-4c00-876b-1bbf8f7e1939?raw=true"></td>
    </tr>
</table>

**3. 选择以docker容器的方式部署，输入下面任一镜像地址**

| 镜像 | 平台 |
|-------|---------------|
| dqzboy/mirror-hub:latest   | docker hub
| dqzboy/mirror-gcr:latest      | Google Container Registry
| dqzboy/mirror-ghcr:latest     | GitHub Container Registry
| dqzboy/mirror-k8sgcr:latest  | Kubernetes Container Registry
| dqzboy/mirror-k8sreg:latest      | Kubernetes's container image registry
| dqzboy/mirror-quay:latest     | Quay Container Registry
| dqzboy/mirror-mcr:latest     | Microsoft Container
| dqzboy/mirror-elastic:latest     | Elastic Stack

<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/7f0df696-f4b6-41db-8ba5-5e28cb58fc17?raw=true"></td>
    </tr>
</table>

<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/6c407af3-5a17-49bb-9c31-45a6fcf8cedd?raw=true"></td>
    </tr>
</table>


**4. 实例类型选择免费即可**

<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/037cd5b2-801f-4ccf-b4c6-ec3f288b08c6?raw=true"></td>
    </tr>
</table>

**5. 暴露端口改为5000，自定义服务名称，然后直接创建即可**
<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/323bf282-804e-49ab-8251-7ebd6c8f8969?raw=true"></td>
    </tr>
</table>

**6. 等待服务运行完成之后，使用分配的外网域名即可愉快的使用了**
<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/cea37723-45f2-48df-bc59-9df97823adaa?raw=true"></td>
    </tr>
</table>
<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/54437313-f104-48ee-8e81-49dfe95a2118?raw=true"></td>
    </tr>
</table>


## ✨ 使用

**1. 改Docker的daemon.json配置，配置你Koyeb服务地址。修改后重启docker**
```shell
~]# vim /etc/docker/daemon.json
{
    "registry-mirrors": [ "https://your_koyeb_url" ],
    "log-opts": {
      "max-size": "100m",
      "max-file": "5"
    }
}
```
**2. 使用Koyeb服务地址替换官方的 Registry 地址拉取镜像**
```shell
# docker hub Registry
## 源：redis:latest
## 替换
docker pull your_koyeb_url/library/redis:latest
```

> **说明**：如果上面配置了docker的`daemon.json`，那么拉取镜像的时候就不需要在镜像前面加`Koyeb_URL`了。【只针对拉取Docker Hub上的镜像有效】


**3. 前缀替换的 Registry 的参考**

| 源站 | 替换为 | 平台 |
|-------|---------------|----------|
| docker.io   | your_render_url   |  docker hub 
| gcr.io      | your_render_url   |  Google Container Registry
| ghcr.io     | your_render_url  |  GitHub Container Registry
| k8s.gcr.io     | your_render_url  | Kubernetes Container Registry
| quay.io     | your_render_url  | Quay Container Registry
| mcr.microsoft.com     | mcr.your_domain_name  | Microsoft Container Registry
| docker.elastic.co     | elastic.your_domain_name  | Elastic Stack

**4. 说明：** 测试发现Koyeb所解析的IP为cloudfare的，国内部分地区运营商对cloudfare进行了阻断，所以这些地区则无法正常访问！

---

## ✨ 将镜像上传到自己的Docker Hub仓库

#### 步骤 1: 登录到 Docker Hub
- 打开终端输入以下命令并按提示输入你的 Docker Hub 用户名和密码：

```shell
docker login
```

#### 步骤 2: 拉取镜像
- 使用 docker pull 命令拉取上面的镜像，这里以 dqzboy/mirror-hub:latest 举例：

```shell
docker pull dqzboy/mirror-hub:latest
```

####  步骤 3: 标记镜像
- 给拉下来的镜像打一个新标签，使其指向你的 Docker Hub 用户名。
- 假设你的 Docker Hub 用户名是 yourusername，你可以使用以下命令：

```shell
docker tag dqzboy/mirror-hub:latest yourusername/mirror-hub:latest
```

####  步骤 4: 上传镜像
- 使用 docker push 命令上传标记的镜像到你的 Docker Hub 仓库：

```shell
docker push yourusername/mirror-hub:latest
```

####  步骤 5: 验证上传
- 上传完成后，你可以登录到 Docker Hub 网站，查看你的仓库中是否已经存在刚刚上传的镜像。
