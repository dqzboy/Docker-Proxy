<div style="text-align: center"></div>
  <p align="center">
  <img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/c187d66f-152e-4172-8268-e54bd77d48bb" width="230px" height="200px">
      <br>
      <i>自建Docker镜像代理，基于官方registry一键部署Docker镜像代理服务.</i>
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
⚠️  **重要**：一台国外的服务器，并且未被墙。一个域名，无需国内备案，便宜的就行，然后申请一个免费的SSL证书或通过[Acme.sh自动生成和续订Lets Encrypt免费SSL证书](https://www.dqzboy.com/16437.html)

## 📦 部署
```shell
# CentOS
yum -y install wget curl
# ubuntu
apt -y install wget curl

bash -c "$(curl -fsSL https://raw.githubusercontent.com/dqzboy/Docker-Proxy/main/install/DockerProxy_Install.sh)"
```

## 🔨 功能
- 一键部署Docker镜像代理服务的功能，支持基于官方Docker Registry的镜像代理. 
- 脚本支持多个Docker镜像仓库的代理，包括Docker Hub、GitHub Container Registry (ghcr.io)和 Kubernetes Container Registry (k8s.gcr.io) 
- 自动检查并安装所需的依赖软件，如Docker、Nginx等，并确保系统环境满足运行要求. 
- 脚本提供了重启、更新和卸载服务的功能，方便用户进行日常管理和维护
- 支持主流Linux发行版操作系统,例如centos、Ubuntu、rocky等

## ✨ 教程
### 代理程序部署完成之后，需自行配置 Nginx 反代
1.下载仓库下的nginx配置文件 [registry-proxy.conf](https://raw.githubusercontent.com/dqzboy/Docker-Proxy/main/nginx/registry-proxy.conf) 到你的nginx服务下，并修改配置里的域名和证书部分 <br>
2.在你的DNS服务提供商将相应的访问域名解析到部署docker proxy服务的机器IP上 <br>
3.修改需要拉镜像的docker配置文件，使用自建的proxy服务地址来加速镜像拉取.修改后重启docker
```shell
~]# vim /etc/docker/daemon.json
{
    "registry-mirrors": [ "https://hub.xxx.com" ],
    "log-opts": {
      "max-size": "100m",
      "max-file": "5"
    }
}
```
4. 使用代理地址拉取镜像
```shell
# 比如我们要下载镜像：gcr.io/google-containers/pause:3.1
 
# 可以通过镜像代理仓库地址下载：
docker pull gcr.xxx.com/google-containers/pause:3.1
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
        <td width="50%" align="center"><img src=https://github.com/dqzboy/Docker-Proxy/assets/42825450/c544fb1e-ecd5-447c-9661-0c5913586118"?raw=true"></td>
    </tr>
</table>

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

[Joxit/docker-registry-ui](https://github.com/Joxit/docker-registry-ui)
