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

#### 2、搭建好了，但是国内拉取速度不理想
- [x] **已知问题：** 你的国外服务器到国内的网络线路不理想

- [x] **解决方案：** 
  -  (1) 开启服务器BBR，优化网络性能(效果有限)
  - (2) 更换对国内网络线路优化更好的服务器

#### 3、registry 镜像缓存多少时间，如何调整
- [x] **已知问题：** 默认缓存`168h`，也就是`7天`。修改配置文件`proxy`配置部分`ttl`调整缓存时间

#### 4、使用镜像加速拉取`hub`公共空间下的镜像时如何不添加`library`

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

#### 5、拉取镜像报错 `tls: failed to verify certificate: x509: certificate signed by unknown authority`
- [x] **已知问题：** 证书问题。表示证书是由一个未知的或不受信任的证书颁发机构（CA）签发的。

#### 6、通过docker-compose部署，如何设置Proxy认证
- [x] **已知问题：** 查看教程：[自建Docker镜像加速服务](https://www.dqzboy.com/8709.html)