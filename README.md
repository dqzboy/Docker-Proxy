# Docker-Proxy
自建Docker镜像代理，基于官方registry一键部署Docker镜像代理服务


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
      <td width="50%" align="center"><b>交互定义信息</b></td>
    </tr>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/55df7f6f-c788-4200-9bcd-631998dc53ef?raw=true"></td>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/chatgpt-web/assets/42825450/426aaa15-11c6-432b-9473-36fbde59a31c?raw=true"></td>
    </tr>
    <tr>
      <td width="50%" align="center"><b>OS组件环境检测</b></td>
      <td width="50%" align="center"><b>自定义网站目录</b></td>
    </tr>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/chatgpt-web/assets/42825450/626ba006-4753-413d-a155-c2896ab95506?raw=true"></td>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/chatgpt-web/assets/42825450/1848fb65-ddc7-487f-8f2e-c50d7edef039?raw=true"></td>
    <tr>
    </tr>
</table>


