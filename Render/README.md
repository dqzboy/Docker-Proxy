<div style="text-align: center"></div>
  <p align="center">
  <img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/c187d66f-152e-4172-8268-e54bd77d48bb" width="230px" height="200px">
      <br>
      <i>使用 Render 快速部署我们的Docker镜像加速服务.</i>
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


## 📦 部署
**1. 登入 [Render](https://dashboard.render.com)**

**2. 创建我们的服务**
<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/Blog-Image/assets/42825450/7a16000a-6514-4cc9-892c-9f0a9746d1b2?raw=true"></td>
    </tr>
</table>

**3. 选择以docker容器的方式部署，输入下面任一镜像地址**
  
| 镜像 | 平台 |
|-------|---------------|
| dqzboy/registry-docker-hub:latest   | docker hub
| dqzboy/registry-gcr:latest      | Google Container Registry
| dqzboy/registry-ghcr:latest     | GitHub Container Registry
| dqzboy/registry-k8s-gcr:latest  | Kubernetes Container Registry
| dqzboy/registry-quay:latest     | Quay Container Registry

<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/Blog-Image/assets/42825450/620181c4-f6e8-4411-9045-d1429cf9da49?raw=true"></td>
    </tr>
</table>

**4. 实例类型选择免费即可(免费实例需要保活,可使用 [uptime-kuma](https://uptime.kuma.pet/) 实现)**

<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/Blog-Image/assets/42825450/c0a166c9-9d06-472e-a4cd-0d16fa3eeb83?raw=true"></td>
    </tr>
</table>

**5. 环境变量不用添加，直接选择创建即可**
<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/Blog-Image/assets/42825450/e760d9c3-b6f4-4a5e-81ce-64c8017c70fc?raw=true"></td>
    </tr>
</table>

**6. 等待服务运行完成之后，使用分配的外网域名即可愉快的使用了**
<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/Blog-Image/assets/42825450/e597f257-9ca8-41c8-afa2-3f5e43100954?raw=true"></td>
    </tr>
</table>

## ✨ 使用

**1. 改Docker的daemon.json配置，配置你Render服务地址。修改后重启docker**
```shell
~]# vim /etc/docker/daemon.json
{
    "registry-mirrors": [ "https://your_render_url" ],
    "log-opts": {
      "max-size": "100m",
      "max-file": "5"
    }
}
```
**2. 使用Render服务地址替换官方的 Registry 地址拉取镜像**
```shell
# docker hub Registry
## 源：nginx:latest
## 替换
docker pull your_render_url/library/nginx:latest
```

**3. 拉取速度测试，效果还是可以的，主要是免费**
![image](https://github.com/dqzboy/Blog-Image/assets/42825450/06ad14d4-cb0f-4924-ab41-5c3f001261a2)

**4. 前缀替换的 Registry 的参考**

| 源站 | 替换为 | 平台 |
|-------|---------------|----------|
| docker.io   | your_render_url   |  docker hub 
| gcr.io      | your_render_url   |  Google Container Registry
| ghcr.io     | your_render_url  |  GitHub Container Registry
| k8s.gcr.io     | your_render_url  | Kubernetes Container Registry
| quay.io     | your_render_url  | Quay Container Registry
