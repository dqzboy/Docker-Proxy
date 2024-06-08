# Docker-Proxy
自建Docker镜像代理，基于官方registry一键部署Docker镜像代理服务

## 📝 准备工作
⚠️  **重要**：一台国外的服务器，并且未被墙。

## 📦 部署 | Deployment
```shell
# CentOS
yum -y install wget curl
# ubuntu
apt -y install wget curl

bash -c "$(curl -fsSL https://raw.githubusercontent.com/dqzboy/Docker-Proxy/main/install/DockerProxy_Install.sh)"
```

## 🔨 功能 | Functionality
- 一键部署Docker镜像代理服务的功能，支持基于官方Docker Registry的镜像代理. 
- 脚本支持多个Docker镜像仓库的代理，包括Docker Hub、GitHub Container Registry (ghcr.io)和 Kubernetes Container Registry (k8s.gcr.io) 
- 自动检查并安装所需的依赖软件，如Docker、Nginx等，并确保系统环境满足运行要求. 
- 脚本提供了重启、更新和卸载服务的功能，方便用户进行日常管理和维护
- 支持主流Linux发行版操作系统,例如centos、Ubuntu、rocky等

## 📚 展示 | Screenshot
<br/>
<table>
    <tr>
      <td width="50%" align="center"><b>系统环境检查</b></td>
      <td width="50%" align="center"><b>服务部署安装</b></td>
    </tr>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/55df7f6f-c788-4200-9bcd-631998dc53ef?raw=true"></td>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/7307ab45-da46-4df0-99a2-6dd4aa208b1d?raw=true"></td>
    </tr>
</table>
