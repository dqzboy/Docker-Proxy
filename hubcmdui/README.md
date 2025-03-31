<p align="right">
   <strong>中文</strong> | <a href="./README.en.md">English</a>
</p>

<div style="text-align: center">
  <p align="center">
  <img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/c187d66f-152e-4172-8268-e54bd77d48bb" width="230px" height="200px">
      <br>
      <i>Docker镜像加速命令查询获取、镜像搜索、配置教程文档展示UI面板.</i>
  </p>
</div>

<div align="center">

[![Auth](https://img.shields.io/badge/Auth-dqzboy-ff69b4)](https://github.com/dqzboy)
[![GitHub contributors](https://img.shields.io/github/contributors/dqzboy/Docker-Proxy)](https://github.com/dqzboy/Docker-Proxy/graphs/contributors)
[![GitHub Issues](https://img.shields.io/github/issues/dqzboy/Docker-Proxy.svg)](https://github.com/dqzboy/Docker-Proxy/issues)
[![GitHub Pull Requests](https://img.shields.io/github/stars/dqzboy/Docker-Proxy)](https://github.com/dqzboy/Docker-Proxy)
[![HitCount](https://views.whatilearened.today/views/github/dqzboy/Docker-Proxy.svg)](https://github.com/dqzboy/Docker-Proxy)
[![GitHub license](https://img.shields.io/github/license/dqzboy/Docker-Proxy)](https://github.com/dqzboy/Docker-Proxy/blob/main/LICENSE)


📢 <a href="https://t.me/+ghs_XDp1vwxkMGU9" style="font-size: 15px;">Docker Proxy-交流群</a>

</div>

---

## 📝 源码构建运行
#### 1. 克隆项目
```bash
git clone git@github.com:dqzboy/Docker-Proxy.git
```

#### 2. 安装依赖
```bash
cd Docker-Proxy/hubcmdui
npm install
```

#### 3. 启动服务
```bash
node server.js
```

## 📦 Docker 方式运行

#### 1. 下载 hubcmd-ui 镜像
```bash
docker pull dqzboy/hubcmd-ui:latest
```

#### 2. 运行 hubcmd-ui 容器
```bash
docker run -d -v /var/run/docker.sock:/var/run/docker.sock -p 30080:3000 --name hubcmdui-server dqzboy/hubcmd-ui
```
- `-v` 参数解释：左边是宿主机上的 Docker socket 文件路径，右边是容器内的映射路径

## Docker Compose 部署

#### 1. 下载 [docker-compose.yaml](https://github.com/dqzboy/Docker-Proxy/blob/main/hubcmdui/docker-compose.yaml) 文件到你本地机器上

#### 2. 执行 `docker compose` 或 `docker-compose` 命令启动容器服务

```shell
docker compose up -d

# 查看容器日志
docker logs -f [容器ID或名称]
```

---

## UI界面

- 默认容器监听`3000`端口，映射宿主机端口`30080`

> 浏览器输入 `服务器地址:30080` 访问前端

<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/user-attachments/assets/bfe09d99-6727-43bc-9c2d-73e34d881953"?raw=true"></td>
    </tr>
</table>

<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/user-attachments/assets/42c4337e-44cb-4c35-bc6f-a5d21f3d1184"?raw=true"></td>
    </tr>
</table>

<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/user-attachments/assets/c1e938dc-d604-475c-8689-d60b09329af8"?raw=true"></td>
    </tr>
</table>

<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/user-attachments/assets/1be671e5-7bd5-4d63-9f4e-8936b819ee2d"?raw=true"></td>
    </tr>
</table>

<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/user-attachments/assets/f97a0a37-457f-4ffb-893e-db68b204ee33"?raw=true"></td>
    </tr>
</table>

> 浏览器输入 `服务器地址:30080/admin` 访问后端页面，默认登入账号密码: root / admin@123

<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/user-attachments/assets/85a0c746-d44a-4168-8b4b-a1e7273cdd59"?raw=true"></td>
    </tr>
</table>

<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/user-attachments/assets/bc066047-15d3-45fc-b363-ded37bfe1121"?raw=true"></td>
    </tr>
</table>

<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/user-attachments/assets/c775abbe-0927-4a1f-b4e6-faf531784aea"?raw=true"></td>
    </tr>
</table>

<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/user-attachments/assets/78ad0e29-abfd-47d6-a132-c5b49b48bc95"?raw=true"></td>
    </tr>
</table>

<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/user-attachments/assets/bfe99dc9-ecb8-4c47-9f68-2312e447f309"?raw=true"></td>
    </tr>
</table>

---

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

---

## 😺 其他

开源不易,若你参考此项目或基于此项目修改可否麻烦在你的项目文档中标识此项目？谢谢你！

---

## License
Docker-Proxy is available under the [Apache 2 license](./LICENSE)
