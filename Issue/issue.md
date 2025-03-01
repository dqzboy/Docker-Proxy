<div style="text-align: center"></div>
  <p align="center">
  <img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/c187d66f-152e-4172-8268-e54bd77d48bb" width="230px" height="200px">
      <br>
      <i>部署Docker Proxy服务和后期使用相关等问题总结.</i>
  </p>
</div>

---

[Docker Proxy-交流群](https://t.me/+ghs_XDp1vwxkMGU9) 

---

## 👨🏻‍💻 问题总结

#### 1、无法通过UI界面删除某一镜像的TAG
- [x] **已知问题：** 使用`registry`作为代理缓存时不支持删除

- [x] **issues：** [#3853](https://github.com/distribution/distribution/issues/3853)

- [x] **代码片段：**  [configure as a pull through cache](https://github.com/distribution/distribution/blob/main/registry/handlers/app.go#L349)

#### 2、搭建好了，但是国内拉取速度不理想
- [x] **已知问题：** 你的国外服务器到国内的网络线路不理想

- [x] **解决方案：** 
  -  (1) 开启服务器BBR，优化网络性能(效果有限)
  - (2) 更换对国内网络线路优化更好的服务器

#### 3、registry 镜像缓存多少时间，如何调整，如何禁用
- [x] **已知问题：** 默认缓存`168h`，也就是`7天`。修改配置文件中`proxy`配置块中的`ttl` 参数调整缓存时间，`0` 禁用缓存过期。默认单位ns

  - - 要是调度程序正常清理旧数据，需要配置中将 `delete` 开启（本项目默认已开启）

#### 4、使用镜像加速拉取`hub`公共空间下的镜像时如何不添加`library`

- 此方案来自交流群里大佬提供，通过nginx实现并实测
```shell
# 将下面的$http_upgrade $connection_upgrade变量添加到http块中
http {
    # 用于支持WebSocket
    map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      close;
    }

    server {
        listen 80;
        server_name hub.your_domain.com;

        # 在docker hub的配置中添加下面的location规则
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
    }
}
```

#### 5、拉取镜像报错 `tls: failed to verify certificate: x509: certificate signed by unknown authority`
- [x] **已知问题：** 证书问题。表示证书是由一个未知的或不受信任的证书颁发机构（CA）签发的。
- [x] **解决方案：** 修改Docker配置 `daemon.json` 添加 `insecure-registries` 并填入您的加速域名(非URL)

#### 6、通过docker-compose部署，如何设置Proxy认证
- [x] **已知问题：** 查看教程：[自建Docker镜像加速服务](https://www.dqzboy.com/8709.html)

#### 7、对于服务器的规格要求，内存、CPU、磁盘、带宽网络等
- [x] **已知问题：** 建议最低使用1C1G的服务器，磁盘大小取决于你拉取镜像的频率以及保存镜像缓存的时长决定(默认缓存7天,部署时可自定义)；如果对拉取速度有要求，最好选择针对中国大陆进行网络优化的服务器

#### 8、缓存在本地磁盘上的数据是否会自动清理？如何判断缓存是否被清理？
- [x] **已知问题：** Registry会定期删除旧内容以节省磁盘空间。下面为官方原文解释：
> In environments with high churn rates, stale data can build up in the cache. When running as a pull through cache the Registry periodically removes old content to save disk space. Subsequent requests for removed content causes a remote fetch and local re-caching.
> To ensure best performance and guarantee correctness the Registry cache should be configured to use the `filesystem` driver for storage.

- [x] **已知问题：** 当我们在配置文件开启了 `delete.enabled.true` 那么调度程序会自动清理过期的镜像层或未使用的镜像标签

 - ⚠️ 注意：不要通过在UI上查看某个镜像是否被删除来判断调度程序是否已自动执行删除操作。而是查看对应代理服务的容器日志

 - [x] **解决方案：** 目前 `registry` 的清理效果对于磁盘小的机器并不理想，如果并不希望镜像文件长时间缓存在本地磁盘，建议通过脚本结合系统`crontab`实现定时清理

 #### 9、拉取了一个镜像之后，发现UI界面没有显示？
 - [x] **已知问题：** Docker-Proxy部署的服务器上的存储空间不足。宿主机默认的挂载目录 `./registry/data`

 #### 10、开启认证后，配置`daemon.json`指定了代理地址，可以正常登入，但是`docker pull`镜像时无法拉取镜像
 - [x] **已知问题：** 因为对于私有镜像仓库，docker客户端对镜像的相关操作，比如pull push支持不友好（历史遗留问题）相关 [issues](https://github.com/docker/cli/issues/3793#issuecomment-1269051403)

 - [x] **解决方案：** 
 - - （1）首先通过docker login <私有镜像地址>  登入私有镜像仓库，登入成功之后，会在对应的用户家目录下生成 `.docker/config.json` 配置文件

  - - （2）通过`vi`命令打开配置文件，然后手动在`auths`配置块里面添加官方地址`https://index.docker.io/v1/`，`auth`哈希值与你的私有镜像地址的auth保持一致，然后重启docker即可直接通过`docker pull`拉取了

  ```bash
  vi $HOME/.docker/config.json
{
        "auths": {
                "https://index.docker.io/v1/": {
                        "auth": "复制下面私有镜像登入认证的哈希值填到这里"
                },
                "你的私有镜像地址": {
                        "auth": "自动生成的认证哈希值"
                }
        }
}

# 重启 docker
systemctl restart docker

# 拉取镜像
docker pull nginx
  ```

 #### 11、如何配置才能让数据不保留到磁盘中？
 - [x] **已知问题：** 默认使用的存储系统为`filesystem` 使用本地磁盘存储注册表文件
 - [x] **解决方案：** 修改对应Registry的配置，将`Storage driver` 存储驱动改为 `inmemory`，⚠️ 注意：此存储驱动程序不会在运行期间保留数据。这就是为什么它只适合测试。切勿在生产中使用此驱动程序。


  #### 12、关于Docker Hub免费拉取政策再次变更后的解决方案？
  - [x] **已知问题：** Docker Hub从 2020年11月2日起就已经限制非付费用户的拉取频率了，只是这次又变更了拉取政策。匿名用户每小时10次，登入用户每小时100次
  - [x] **解决方案：** 修改项目中Docker Hub对应的配置文件`registry-hub.yml` 添加Docker Hub用户，添加后重新启动Docker Registry容器即可！
  ```
...

# username 输入docker hub账号，password 输入对应账号密码
proxy:
  remoteurl: https://registry-1.docker.io
  username: 
  password:
  ttl: 168h 
  ```