# GPG 签名配置

> [!WARNING]  
> 本文档仍在持续完善中，部分内容可能不完整、未验证或暂未覆盖最新实现。  
> 如果你有兴趣，欢迎提交 Pull Request 来完善本文档

GPG 可以为 Git 提交添加数字签名，帮助验证提交由对应密钥持有者签署。GitHub 在满足公钥和身份关联等条件后显示 `Verified`。

## 一、背景

| 信息 | 用途 | 是否可公开 |
| --- | --- | --- |
| GPG 公钥 | 验证签名、登记到 GitHub | 可以，但注意其中的身份信息 |
| GPG 私钥与口令 | 创建签名、保护密钥 | 不可公开 |
| SSH 仓库认证密钥 | 克隆或推送时向 GitHub 认证 | 公钥可登记，私钥不可公开 |

已经能通过 SSH 推送，不代表 Git 已设置 GPG 签名。反过来，配置 GPG 也不会自动解决 HTTPS 或 SSH 的推送认证。

## 二、安装工具

本项目桌面开发以 Windows 为主。访问 [GnuPG 官方下载页](https://gnupg.org/download/)，选择可信的 Windows 分发，例如包含图形界面的 Gpg4win 或所需命令行版本，按其安装说明完成。

安装后重新打开 PowerShell，检查：

```powershell
git --version
gpg --version
Get-Command gpg
```

找不到 `gpg` 时先检查安装和 PATH，必要时重开终端。机器上有多个版本时，记录实际路径，避免密钥在一个程序中生成、Git 却调用另一个环境。

## 三、确认是否已有可用密钥

```powershell
gpg --list-secret-keys --keyid-format=long
```

这里列出有私钥的身份。只有公钥不能签名。已有未过期、可用于签名且属于本人控制的密钥时，可以复用，不必每次贡献都生成一套。

输出中的 `sec` 表示主密钥，`ssb` 表示子密钥；`[S]` 代表签名能力。

## 四、生成新密钥

运行：

```powershell
gpg --full-generate-key
```

### 1. 算法与用途

菜单编号随版本不同，按文字选择 GnuPG 和 GitHub 支持、具备签名能力的算法。可以使用支持签名的现代椭圆曲线方案，或相应 RSA 方案；不要照抄他人截图中的菜单数字后不检查结果。

项目不在此规定唯一算法。生成后必须确认有可用签名能力，不能误选仅加密用途。

### 2. 有效期

按个人密钥管理计划选择有效期，例如 `1y` 表示一年。设置有效期后应安排续期或更换；选择永不过期也不意味着泄露风险消失。

有效期与密钥撤销不同，泄露时应及时撤销，不能只等自然过期。

### 3. 身份信息

填写可识别的名称和 GitHub 已验证邮箱。需要隐藏真实邮箱时，可以使用 GitHub 提供的 `noreply` 地址，并同步设置提交邮箱。

检查当前仓库使用的邮箱：

```powershell
git config --get user.email
```

GPG 身份邮箱、提交邮箱和 GitHub 账户关联不一致时，可能出现签名有效但网页未显示已验证的情况。

### 4. 保护口令与备份

为私钥设置保护口令。口令窗口可能由图形程序弹出，不显示终端字符不代表没有输入。

私钥备份、保护口令和撤销证书应安全保存，不能放进项目、云端公开目录或 Issue。不要为协助排错把整个 GPG 用户目录发给他人。

## 五、导出并登记公钥

先检查完整指纹：

```powershell
gpg --list-secret-keys --keyid-format=long
gpg --fingerprint
```

将以下 `YOUR_KEY_FINGERPRINT` 替换为目标密钥的完整指纹，再导出公钥：

```powershell
gpg --armor --export YOUR_KEY_FINGERPRINT
```

复制 `BEGIN PGP PUBLIC KEY BLOCK` 至 `END PGP PUBLIC KEY BLOCK` 的完整公钥内容。进入 GitHub“Settings → SSH and GPG keys → New GPG key”，粘贴并登记。

不要把 `PRIVATE KEY BLOCK` 内容当公钥上传。若输出为空，检查指纹及当前 GPG 环境，不要直接换用导出私钥命令。

## 六、配置当前仓库

在仓库根目录执行，替换邮箱和指纹：

```powershell
git config --local user.email "YOUR_VERIFIED_EMAIL"
git config --local gpg.format openpgp
git config --local user.signingkey YOUR_KEY_FINGERPRINT
git config --local commit.gpgsign true
```

`--local` 只影响当前仓库。需要全局设置时应理解对其他仓库的影响，不必为本项目强行改变所有项目。

有多个 GPG 程序时，可用 `git config --local gpg.program` 指向实际安装路径。完整路径按本机 `Get-Command gpg` 结果填写，不复制其他用户的磁盘目录。

检查配置来源：

```powershell
git config --show-origin --get gpg.format
git config --show-origin --get user.signingkey
git config --show-origin --get commit.gpgsign
```

## 七、创建和验证签名提交

完成真实修改并检查差异后再提交。启用 `commit.gpgsign` 后普通提交会尝试签名，也可以对单次提交显式使用 `-S`。使用 AI 助手时，先按项目规范确认英文提交信息。

不需要为了测试签名创建无意义空提交，也不要未经协调改写已经共享的历史。

提交后在仓库根目录运行：

```powershell
git log -1 --show-signature
git verify-commit HEAD
```

然后推送自己的工作分支，在 GitHub 查看同一提交的签名状态。要核对提交哈希，避免验证的是本地新提交、网页查看的却是旧提交。

## 八、常见问题

### `gpg failed to sign the data`

检查私钥是否存在、有效期、所选指纹、Git 实际调用程序及口令窗口。图形编辑器可能没有打开口令提示，也可能使用了不同 PATH，先在同一终端验证工具来源。

### 本地有效，GitHub 未验证

检查公钥是否登记、提交邮箱是否属于该密钥并与账户关联。不要通过关闭邮箱隐私保护来掩盖配置错误；可以使用已关联的 `noreply` 邮箱。

### 只有公钥或显示未知公钥

本机只有公钥时不能签名；验证他人提交时缺少对应公钥，则不能仅凭“未知公钥”判断对方签名伪造。先取得可信公钥并核对指纹。

### 密钥过期、丢失或泄露

过期应按计划续期并更新平台登记；丢失私钥需要使用备份或新密钥。泄露时优先撤销旧密钥、登记新公钥并检查使用范围，不继续用同一私钥签署。

撤销旧密钥不意味着可以随意重写所有历史提交。历史处理应结合实际影响与维护者沟通。

## 九、后续维护

记录密钥的用途和到期时间，定期确认备份可恢复。换电脑时只在可信环境导入私钥；仓库复制不应包含私钥备份。

准备改用 SSH 提交签名时，应显式调整 `gpg.format` 和签名键，不能把公钥文件路径直接放进仍使用 OpenPGP 的配置中。
