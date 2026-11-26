# Code signing policy / 代码签名政策

## Status / 现状

Global Software Timer has applied to the [SignPath Foundation](https://signpath.org) for free code signing of its Windows installers. Releases published before the first signed release are not code-signed; you can check them against the `SHA256SUMS.txt` attached to each release.

全局软件计时器已向 [SignPath Foundation](https://signpath.org) 申请免费的 Windows 安装包代码签名。第一个签名版本之前发布的安装包都没有代码签名，可以用每个发布页附带的 `SHA256SUMS.txt` 校验。

## Signed releases / 签名版本

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

免费代码签名由 [SignPath.io](https://about.signpath.io) 提供，证书由 [SignPath Foundation](https://signpath.org) 签发。

- Only installers built by this repository's GitHub Actions workflow from the public source code are signed. Nothing built on a personal computer is signed.
- Every release is approved by hand before it is signed.
- The signed files are the setup `.exe` and the `.msi` attached to the [GitHub releases](https://github.com/Awes0meE/Global-Software-Timer/releases).

- 只签由本仓库的 GitHub Actions 从公开源代码构建出的安装包，个人电脑上构建的文件一律不签。
- 每个版本签名前都要人工批准。
- 签名的是 [GitHub 发布页](https://github.com/Awes0meE/Global-Software-Timer/releases) 上的 `.exe` 安装包和 `.msi` 安装包。

## Team roles / 团队分工

The project is maintained by one person, who holds every role:

本项目由一个人维护，以下角色都由他担任：

- Committers and reviewers / 提交者与审阅者：[Awes0meE](https://github.com/Awes0meE)
- Approvers / 签名批准者：[Awes0meE](https://github.com/Awes0meE)

Contributions from anyone else arrive as pull requests and are reviewed before they are merged. The maintainer's GitHub and SignPath accounts use multi-factor authentication.

其他人的贡献都以拉取请求（PR）提交，审阅后才会合并。维护者的 GitHub 和 SignPath 账号都开启了多因素认证。

## Privacy policy / 隐私政策

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it. Up to v0.4.5 it makes no network request at all. From v0.4.6 the only network request it can make is the update check: it runs only when you press 检查更新… in 设置 and then agree in the dialog that follows, every time, and it asks GitHub for the latest version without sending any usage data. Usage records stay on this computer. See [PRIVACY.md](./PRIVACY.md) for details.

除非用户本人或安装、操作它的人明确要求，本程序不会向其他联网系统发送任何信息。v0.4.5 及更早的版本完全不联网；从 v0.4.6 起，它唯一可能发出的网络请求是检查更新：只有在设置里点了「检查更新…」并在随后的对话框里同意之后才会发出，每次都要重新同意；请求只向 GitHub 查询最新版本，不带任何使用记录。使用记录只保存在这台电脑上。详见 [PRIVACY.md](./PRIVACY.md)。
