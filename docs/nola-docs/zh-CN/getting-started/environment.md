# 环境配置

> [!WARNING]  
> 本文档仍在持续完善中，部分内容可能不完整、未验证或暂未覆盖最新实现。  
> 如果你有兴趣，欢迎提交 Pull Request 来完善本文档

## 一、背景

在 Nola Translator 中，软件支持**三种**大语言模型推理框架，分别是 Pytorch、llama.cpp、CrispASR 。

::: details 点击展开了解更多推理框架的介绍。

- **中国大陆**
    - Pytorch：https://www.runoob.com/pytorch/pytorch-intro.html
    - llama.cpp：https://zhuanlan.zhihu.com/p/1912277511359922360
    - CrispASR：https://gitee.com/sieding/CrispASR

- **其他地区**
    - Pytorch：https://en.wikipedia.org/wiki/PyTorch
    - llama.cpp：https://en.wikipedia.org/wiki/Llama.cpp
    - CrispASR：https://github.com/CrispStrobe/CrispASR

:::

在 Nola Translator 中，这些加载器可以用来运行不同种类的大语言模型，不同的推理框架会对应不同的模型文件。如您打算采用接入云端模型或其他API的方式进行推理，您可以跳过本章节，直接查阅[云端模型配置](../getting-started/cloud-models)

> [!NOTE]  
> **不需要**三种推理框架都安装，您只需要确保安装的推理框架能运行一个语音识别模型，一个翻译模型即可。
> 推荐安装 **llama.cpp** 和 **CrispASR** 。

:::details 点击展开查阅各个推理框架的支持情况

### （一）Pytorch

| 类型 | 模型系列 | 参数 | 文件名 | 种类 |
|---|---|---|---|---:|
| ASR | Qwen3-ASR | 0.6B、1.7B | Qwen3-ASR-0.6B-hf、Qwen3-ASR-1.7B-hf | 2 |
| ASR | SenseVoiceSmall | Small | SenseVoiceSmall | 1 |
| MT | Index-Translate | 2B、9B、35B-A3B preview；BF16、FP8、FP4 | Index-Translate-2B、Index-Translate-2B-FP8、Index-Translate-2B-FP4；Index-Translate-9B、Index-Translate-9B-FP8、Index-Translate-9B-FP4；Index-Translate-35B-A3B-preview、Index-Translate-35B-A3B-preview-FP8、Index-Translate-35B-A3B-preview-FP4 | 9 |
| MT | M2M100 | 418M | m2m100_418M | 1 |
| TTS | Qwen3-TTS | 0.6B Base、0.6B CustomVoice、1.7B Base、1.7B CustomVoice、1.7B VoiceDesign（BF16） | Qwen3-TTS-12Hz-0.6B-Base、Qwen3-TTS-12Hz-0.6B-CustomVoice、Qwen3-TTS-12Hz-1.7B-Base、Qwen3-TTS-12Hz-1.7B-CustomVoice、Qwen3-TTS-12Hz-1.7B-VoiceDesign | 5 |

### （二）llama.cpp

| 类型 | 模型系列 | 参数 | 文件名 | 种类 |
|---|---|---|---|---:|
| ASR | Qwen3-ASR | 0.6B：Q4_K_M、Q8_0、BF16；1.7B：Q4_K_M、Q8_0、BF16 | Qwen3-ASR-0.6B.Q4_K_M.gguf、Qwen3-ASR-0.6B-Q8_0.gguf、Qwen3-ASR-0.6B-bf16.gguf；Qwen3-ASR-1.7B-Q4_K_M.gguf、Qwen3-ASR-1.7B-Q8_0.gguf、Qwen3-ASR-1.7B-bf16.gguf | 6 |
| MT | Hy-MT2 | 1.8B：Q4_K_M、Q3_K_M、UD-IQ2_M；7B：Q4_K_M | Hy-MT2-1.8B-Q4_K_M.gguf、Hy-MT2-1.8B-Q3_K_M.gguf、Hy-MT2-1.8B-UD-IQ2_M.gguf、Hy-MT2-7B-Q4_K_M.gguf | 4 |
| MT | Index-Translate | 2B、9B、35B-A3B preview（Q4_K_M） | Index-Translate-2B.Q4_K_M.gguf、Index-Translate-9B.Q4_K_M.gguf、Index-Translate-35B-A3B-preview.Q4_K_M.gguf | 3 |
| TTS | Qwen3-TTS | 1.7B Base：Q4_K_M、Q8_0、BF16 | Qwen3-TTS-12Hz-1.7B-Base-Q4_K_M.gguf、Qwen3-TTS-12Hz-1.7B-Base-Q8_0.gguf、Qwen3-TTS-12Hz-1.7B-Base-bf16.gguf | 3 |

### （三）CrispASR

| 类型 | 模型系列 | 参数 | 文件名 | 种类 |
|---|---|---|---|---:|
| ASR | Fun-ASR Nano | Nano：Q4_K、Q8_0、F16 | funasr-nano-2512-q4_k.gguf、funasr-nano-2512-q8_0.gguf、funasr-nano-2512-f16.gguf | 3 |
| ASR | VibeVoice-ASR | Q4_K、Q8_0、F16 | vibevoice-asr-q4_k.gguf、vibevoice-asr-q8_0.gguf、vibevoice-asr-f16.gguf | 3 |
| ASR | MiMo-V2.5-ASR | Q4_K、F16 | mimo-asr-q4_k.gguf、mimo-asr-f16.gguf | 2 |
| ASR | SenseVoiceSmall | Q4_K、Q8_0、F16 | sensevoice-small-q4_k.gguf、sensevoice-small-q8_0.gguf、sensevoice-small-f16.gguf | 3 |
| ASR | Qwen3-ASR | 0.6B、1.7B；各有 Q4_K、Q8_0、F16 | qwen3-asr-0.6b-q4_k.gguf、qwen3-asr-0.6b-q8_0.gguf、qwen3-asr-0.6b.gguf；qwen3-asr-1.7b-q4_k.gguf、qwen3-asr-1.7b-q8_0.gguf、qwen3-asr-1.7b-f16.gguf | 6 |
| TTS | Qwen3-TTS | 0.6B Base：Q4_K、Q8_0、F16；0.6B CustomVoice：Q8_0；1.7B Base：Q8_0、F16；1.7B CustomVoice：Q8_0、F16；1.7B VoiceDesign：Q8_0、F16 | qwen3-tts-12hz-0.6b-base-q4_k.gguf、qwen3-tts-12hz-0.6b-base-q8_0.gguf、qwen3-tts-12hz-0.6b-base.gguf、qwen3-tts-12hz-0.6b-customvoice-q8_0.gguf；qwen3-tts-12hz-1.7b-base-q8_0.gguf、qwen3-tts-12hz-1.7b-base-f16.gguf、qwen3-tts-12hz-1.7b-customvoice-q8_0.gguf、qwen3-tts-12hz-1.7b-customvoice-f16.gguf、qwen3-tts-12hz-1.7b-voicedesign-q8_0.gguf、qwen3-tts-12hz-1.7b-voicedesign-f16.gguf | 10 |

:::

## 二、版本选择

> [!WARNING]  
> 安装加载器前请先升级至**最新公版驱动**，否则**不受理**相关问题。  
> NVIDIA 驱动下载：[链接](https://www.nvidia.cn/geforce/drivers)  
> AMD 驱动下载：[链接](https://www.amd.com/zh-hans/support)  
> Intel 驱动下载：[链接](https://www.intel.cn/content/www/cn/zh/download-center/home.html)  
> 若不清楚驱动是否为最新版本，请直接下载最新公版驱动安装。    

### （一）NVIDIA 显卡

对于 NVIDIA 显卡用户，请务必把显卡驱动更新至最新版后再安装加载器。因 NVIDIA 有特有的 `CUDA` 计算单元，您可安装对应的 `CUDA` 版本以获得更好的性能表现，同时也可以选择 `Vulcan` 版本安装。

由于不同显卡和驱动支持的最高 `CUDA` 版本不同，在开始安装前需要先检查您电脑支持的**最高 CUDA** 版本。

- 第一步：打开 `powershell` 或 `cmd`
- 第二步：在控制台中运行以下代码，在右上角即可查询当前显卡支持的**最高 CUDA** 版本。

```powershell
nvidia-smi
```
![nvidia-smi 输出中的 CUDA 版本](/docs-image/zh-CN/getting-started/environment/nvidia-smi-cuda-version.png)

**1. CrispASR**

- 打开 `设置` ，点击 `计算设备` 
- 找到 `推理引擎` ，切换到 `CrispASR`
- 点击安装即可
- 安装本加载器后，您可以安装推荐列表中的所有 **语音识别模型（ASR）** 和 **语音合成模型（TTS）** 。

![计算设备中的 CrispASR 加载器与版本选择](/docs-image/zh-CN/getting-started/environment/crispasr-loader-settings.png)

**2. llama.cpp**

- 打开 `设置` ，点击 `计算设备` 
- 找到 `推理引擎` ，切换到 `llama.cpp`
- 点击安装 `CUDA` 版本 或 `Vulcan` 版本即可
- 对于文件名后缀，（CUDA 12.4）表示该加载器支持的**最低 CUDA** 版本，您要确保您的 CUDA 版本要大于等于12 才可尝试安装，其他后缀依次类推。
- 安装本加载器后，您可以安装推荐列表中的部分 **语音识别模型（ASR）** 、绝大部分 **翻译模型（MT）** 和全部 **语音合成模型（TTS）** 。

![llama.cpp 加载器的 CUDA 版本选择](/docs-image/zh-CN/getting-started/environment/llama-cpp-cuda-version-selection.png)

### （二）AMD 显卡

对于 AMD 显卡用户，请务必把显卡驱动更新至最新版后再安装加载器。

**1. CrispASR**

- 打开 `设置` ，点击 `计算设备` 
- 找到 `推理引擎` ，切换到 `CrispASR`
- 点击安装即可
- 安装本加载器后，您可以安装推荐列表中的所有 **语音识别模型（ASR）** 和 **语音合成模型（TTS）** 。

![计算设备中的 CrispASR 加载器与版本选择](/docs-image/zh-CN/getting-started/environment/crispasr-loader-settings.png)

**2. llama.cpp**

- 打开 `设置` ，点击 `计算设备` 
- 找到 `推理引擎` ，切换到 `llama.cpp`
- 点击安装 `Vulcan` 版本即可
- 安装本加载器后，您可以安装推荐列表中的部分 **语音识别模型（ASR）** 、绝大部分 **翻译模型（MT）** 和全部 **语音合成模型（TTS）** 。

![llama.cpp 加载器的 Vulkan 版本选择](/docs-image/zh-CN/getting-started/environment/llama-cpp-vulkan-version-selection.png)

### （三）INTEL 显卡

对于 INTEL 显卡用户，请务必把显卡驱动更新至最新版后再安装加载器。

**1. CrispASR**

- 打开 `设置` ，点击 `计算设备` 
- 找到 `推理引擎` ，切换到 `CrispASR`
- 点击安装即可
- 安装本加载器后，您可以安装推荐列表中的所有 **语音识别模型（ASR）** 和 **语音合成模型（TTS）** 。

![计算设备中的 CrispASR 加载器与版本选择](/docs-image/zh-CN/getting-started/environment/crispasr-loader-settings.png)

**2. llama.cpp**

- 打开 `设置` ，点击 `计算设备` 
- 找到 `推理引擎` ，切换到 `llama.cpp`
- 点击安装 `Vulcan` 版本即可
- 安装本加载器后，您可以安装推荐列表中的部分 **语音识别模型（ASR）** 、绝大部分 **翻译模型（MT）** 和全部 **语音合成模型（TTS）** 。

![llama.cpp 加载器的 Vulkan 版本选择](/docs-image/zh-CN/getting-started/environment/llama-cpp-vulkan-version-selection.png)