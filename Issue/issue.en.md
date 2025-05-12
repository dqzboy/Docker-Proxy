<p align="right">
    <a href="./README.md">中文</a> | <strong>English</strong>
<div style="text-align: center"></div>
  <p align="center">
  <img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/c187d66f-152e-4172-8268-e54bd77d48bb" width="230px" height="200px">
      <br>
      <i>Deployment and Usage Issues Summary for Docker Proxy Service.</i>
  </p>
</div>

---

[Docker Proxy-Communication Group](https://t.me/+ghs_XDp1vwxkMGU9) 

---

## 👨🏻‍💻 Problem Summary

#### 1. Unable to delete a specific image tag through the UI.
**Known Issue：** Deletion is not supported when using `registry` as a proxy cache.

**Related Issues：** [#3853](https://github.com/distribution/distribution/issues/3853)

#### 2. The pull speed from within China is not ideal.
**Known Issue：** The network route from your foreign server to China is suboptimal.

**Solutions：** 
- (1) Enable BBR on the server to optimize network performance (with limited effect).
- (2) Switch to a server that has better network optimization for routes to China.

#### 3. How long does the registry image cache last, and how to adjust it?
**Known Issue：** The default cache time is 168 hours, which is 7 days. Adjust the cache time by modifying the ttl in the proxy configuration section of the configuration file

#### 4. Regarding the solution for pulling images from the 'Hub' public namespace with or without adding the 'library' prefix when using a mirror registry for acceleration.

- This scheme was provided by a senior member in the communication group and has been implemented and tested through Nginx.
```shell
http {
    map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      close;
    }

    server {
        listen 80;
        server_name hub.your_domain.com;

        # 在docker hub的配置中添加下面的location规则
        location ~ ^/v2/([^/]+)/(manifests|blobs)/(.*)$ {
            rewrite ^/v2/(.*)$ /v2/library/$1 break;
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

        location  / {
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

#### 5. An error occurs when pulling an image `tls: failed to verify certificate: x509: certificate signed by unknown authority`

**Known Issue：** Certificate issue. Indicates that the certificate was issued by an unknown or untrusted certificate Authority (CA).
