# 本地模型配置

> [!WARNING]  
> 本文档仍在持续完善中，部分内容可能不完整、未验证或暂未覆盖最新实现。  
> 如果你有兴趣，欢迎提交 Pull Request 来完善本文档

## 一、背景

Nola Translator 支持三种大模型推理框架，分别是 Pytorch、llama.cpp、CrispASR 。

若您采用本地推理的方案，则需要安装本地推理的模型文件，软件支持 `从软件中安装` 和 `本地导入` 两种方案。

## 二、从软件中安装

启动软件，点击 `模型管理`。可以看到软件中已经内置好了一份推荐清单。

![模型管理](/docs-image/zh-CN/getting-started/local-models/model-recommendations.png)

您可以结合自身电脑的配置、显存容量、已安装的加载器等因素来选择模型安装。

![模型下载](/docs-image/zh-CN/getting-started/local-models/download-source-selection.png)

怎么选择模型呢？一般可以这样判断，为了便于理解，可能有不严谨的地方，请见谅。

- 同系列模型，参数越大，性能越好
- 参数相同，量化程度越低，性能越好
- 量化程度：参数相同，体积越小，量化程度越高

对于不同的电脑，推荐安装组合如下。

|类别|语音模型|翻译模型|
|-|-|-|
|核心显卡|SenseVoiceSmall (CrispASR) | Index Translator 免费API|
|独立显卡|Qwen3 ASR 0.6B (CrispASR) | HY-MT2-1.8B-IQ2 (llama.cpp) 
|旗舰显卡|Qwen3 ASR 1.7B (CrispASR) | HY-MT2-1.8B-Q4 (llama.cpp) |


## 三、本地导入

> [!WARNING]  
> 这是一个实验性功能，如有问题请反馈至 [Github Issue](https://github.com/CerealAxis/Nola-Translator/issues)

待攥写......