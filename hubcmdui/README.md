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

## 📝 本地运行
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

## 📦 Docker运行

- 如果不自行构建Docker镜像，可直接跳转第三步拉取镜像运行

#### 1. 克隆项目（可选）
```bash
git clone git@github.com:dqzboy/Docker-Proxy.git
```

#### 2. 构建镜像（可选）
```bash
cd Docker-Proxy

docker build -t hubcmd-ui .
```

#### 3. 运行容器
```bash
# 拉取镜像！如果你手动构建了镜像此步骤跳过
docker pull dqzboy/hubcmd-ui:latest

docker run -d -p 30080:3000 --name hubcmdui-server hubcmd-ui
```


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
        <td width="50%" align="center"><img src="https://github.com/user-attachments/assets/c7e368ca-7f1a-4311-9a10-a5f4f06d86d8"?raw=true"></td>
    </tr>
</table>

<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/user-attachments/assets/0024d3e7-3b9d-4a10-9079-f2b91633a5f5"?raw=true"></td>
    </tr>
</table>

<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/user-attachments/assets/8569c5c4-4ce6-4cd4-8547-fa9816019049"?raw=true"></td>
    </tr>
</table>

<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/user-attachments/assets/b7efcd39-8757-46f9-ae68-02ca6add40e7"?raw=true"></td>
    </tr>
</table>

> 浏览器输入 `服务器地址:30080/admin` 访问后端页面，默认登入账号密码: root/admin@123

<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/user-attachments/assets/e69f0473-04c1-473d-a580-6e9a85c4053c"?raw=true"></td>
    </tr>
</table>

<table>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/user-attachments/assets/3ffe6a5d-da8c-436a-ae28-033fecf52770"?raw=true"></td>
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