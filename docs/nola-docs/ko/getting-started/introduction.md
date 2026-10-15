# 제품 소개

<div align="center">
  <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/assets/brand/nola-logo.svg" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/CerealAxis/Nola-Translator/main/assets/brand/nola-logo.svg" alt="Nola Translator Logo" width="112" height="112"></a>
  <h1>Nola Translator</h1>
  <p>실시간 자막 및 번역 앱</p>
  <p><a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.md">English</a> · <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.zh-CN.md">简体中文</a> · <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.zh-TW.md">繁體中文（台灣）</a> · <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.zh-HK.md">繁體中文（香港）</a> · <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.ja.md">日本語</a> · <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/README.ko.md">한국어</a></p>
</div>

<p align="center">
  <a href="https://github.com/CerealAxis/Nola-Translator/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-GPL%20v3-blue.svg?style=flat-square" alt="GPL v3 라이선스"></a>
  <a href="https://github.com/CerealAxis/Nola-Translator/actions/workflows/build.yml"><img src="https://github.com/CerealAxis/Nola-Translator/actions/workflows/build.yml/badge.svg" alt="빌드 워크플로 상태"></a>
  <a href="https://github.com/CerealAxis/Nola-Translator/actions/workflows/build.yml"><img src="https://img.shields.io/badge/Actions-Download%20Artifacts-2088FF?style=flat-square&logo=githubactions&logoColor=white" alt="GitHub Actions 아티팩트 다운로드"></a>
  <a href="https://github.com/CerealAxis/Nola-Translator/releases"><img src="https://img.shields.io/github/v/release/CerealAxis/Nola-Translator?style=flat-square&label=Release" alt="최신 GitHub 릴리스"></a>
  <a href="https://github.com/CerealAxis/Nola-Translator/releases/latest"><img src="https://img.shields.io/badge/Releases-Download%20Latest-2DA44E?style=flat-square&logo=github&logoColor=white" alt="최신 릴리스 다운로드"></a>
  <img src="https://img.shields.io/badge/QQ%E7%BE%A4-701699932-12B7F5?style=flat-square&logo=tencentqq&logoColor=white" alt="QQ 그룹: 701699932">
  <img src="https://img.shields.io/badge/Electron-43-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react&logoColor=white" alt="React 19">
  <img src="https://img.shields.io/badge/Vite-7-7A5CFA?style=flat-square&logo=vite&logoColor=white" alt="Vite 7">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/CerealAxis/Nola-Translator/main/docs/public/screenshots/ko/home.png" alt="Nola Translator 인터페이스 미리보기" width="1000">
</p>

## 개요

Nola Translator는 로컬 모델과 클라우드 모델을 모두 지원하는 실시간 자막 및 번역 앱입니다. 필요에 따라 로컬 컴퓨팅 리소스로 음성을 인식하고 번역하거나 클라우드 모델에 연결해 인식과 번역을 수행할 수 있습니다.

## 기능

- **로컬 모델:** Qwen3-ASR, SenseVoiceSmall 등의 인식 모델과 HY-MT2 등의 번역 모델을 로컬에서 실행할 수 있습니다. Hugging Face의 다른 모델을 검색하고 설치할 수도 있습니다.
- **클라우드 모델:** Aliyun, MiniMax 등의 클라우드 ASR 모델을 지원하며 OpenAI 호환 API, Anthropic, Ollama 등의 LLM 프로토콜과 무료 MyMemory 번역 서비스도 지원합니다.
- **GPU 가속:** 사용 가능한 컴퓨팅 장치를 감지하고 인식과 번역에 서로 다른 장치를 지정할 수 있습니다.
- **브라우저 확장 프로그램:** Chrome 및 Edge용 확장 프로그램으로 동영상 페이지에 이중 언어 자막을 표시합니다. 데스크톱 시스템 오디오를 입력 소스로 설정할 수도 있습니다.
- **실시간 자막 오버레이:** 시스템 출력, 선택한 오디오 장치 또는 마이크를 지원합니다. 자막은 별도 창에 표시되며 위치, 글꼴 크기, 색상, 불투명도, 원문과 번역의 레이아웃을 조정할 수 있습니다.
- **유연한 설정:** 필요한 모델을 설치하고 인식·번역 방식, 언어 방향, 컴퓨팅 장치, 자막 스타일을 선택할 수 있습니다. API 자격 증명은 앱에 안전하게 저장됩니다.
- **기록 및 내보내기:** 자막 기록을 저장하고 TXT, SRT, WebVTT 형식으로 내보낼 수 있습니다. 오디오 녹음 저장은 선택 사항입니다.

## 화면 미리보기

| 홈 | 플로팅 자막 | 동영상 자막 |
|---|---|---|
| ![](https://raw.githubusercontent.com/CerealAxis/Nola-Translator/main/docs/public/screenshots/ko/home.png) | ![](https://raw.githubusercontent.com/CerealAxis/Nola-Translator/main/docs/public/screenshots/ko/overlay-scene.png) | ![](https://raw.githubusercontent.com/CerealAxis/Nola-Translator/main/docs/public/screenshots/ko/browser-scene.png) |

| 로컬 모델 설치 | 추론 환경 설정 | 다크 모드 |
|---|---|---|
| ![](https://raw.githubusercontent.com/CerealAxis/Nola-Translator/main/docs/public/screenshots/ko/models.png) | ![](https://raw.githubusercontent.com/CerealAxis/Nola-Translator/main/docs/public/screenshots/zh-CN/compute-environment.png) | ![](https://raw.githubusercontent.com/CerealAxis/Nola-Translator/main/docs/public/screenshots/zh-CN/dark-mode.png) |

## 설치

- [최신 릴리스 다운로드](https://github.com/CerealAxis/Nola-Translator/releases/latest)

Windows x64를 지원하며 EXE 또는 MSI 설치 프로그램을 선택할 수 있습니다. 다른 플랫폼은 개발이 안정된 후 지원할 예정입니다.

## 지원하는 음성 인식 언어

::: tip
인식 및 번역에 사용할 수 있는 언어는 선택한 모델의 기능에 따라 달라집니다. 아래 표는 앱에 포함된 추천 모델의 지원 현황입니다. 추천할 모델이 있다면 issue로 알려 주세요. 검토 후 포함 여부를 결정하겠습니다. 처음 사용하는 분께는 인식 모델로 **SenseVoiceSmall**, 번역 모델로 **HY-MT2 1.8B**를 권장합니다.
:::

### 인식 모델

| 모델 | 언어 수 | 상세 정보 |
|---|---:|---|
| Qwen3-ASR 1.7B | 30 | 자동 감지 지원;중국어, 영어, 광둥어, 아랍어, 독일어, 프랑스어, 스페인어, 포르투갈어, 인도네시아어, 이탈리아어, 한국어, 러시아어, 태국어, 베트남어, 일본어, 튀르키예어, 힌디어, 말레이어, 네덜란드어, 스웨덴어, 덴마크어, 핀란드어, 폴란드어, 체코어, 필리핀어, 페르시아어, 그리스어, 헝가리어, 마케도니아어, 루마니아어 |
| Qwen3-ASR 0.6B | 30 | 자동 감지 지원;중국어, 영어, 광둥어, 아랍어, 독일어, 프랑스어, 스페인어, 포르투갈어, 인도네시아어, 이탈리아어, 한국어, 러시아어, 태국어, 베트남어, 일본어, 튀르키예어, 힌디어, 말레이어, 네덜란드어, 스웨덴어, 덴마크어, 핀란드어, 폴란드어, 체코어, 필리핀어, 페르시아어, 그리스어, 헝가리어, 마케도니아어, 루마니아어 |
| SenseVoiceSmall | 5 | 중국어, 영어, 광둥어, 일본어, 한국어 |

### 번역 모델

| 모델 | 언어 수 | 상세 정보 |
|---|---:|---|
| HY-MT2 1.8B | 37 | 중국어(간체), 중국어(번체), 영어, 프랑스어, 포르투갈어, 스페인어, 일본어, 튀르키예어, 러시아어, 아랍어, 한국어, 태국어, 이탈리아어, 독일어, 베트남어, 말레이어, 인도네시아어, 필리핀어, 힌디어, 폴란드어, 체코어, 네덜란드어, 크메르어, 버마어, 페르시아어, 구자라트어, 우르두어, 텔루구어, 마라티어, 히브리어, 벵골어, 타밀어, 우크라이나어, 티베트어, 카자흐어, 몽골어, 위구르어 |
| M2M100 418M | 100 | 아프리칸스어, 암하라어, 아랍어, 아스투리아어, 아제르바이잔어, 바슈키르어, 벨라루스어, 불가리아어, 벵골어, 브르타뉴어, 보스니아어, 카탈로니아어, 세부아노어, 체코어, 웨일스어, 덴마크어, 독일어, 그리스어, 영어, 스페인어, 에스토니아어, 페르시아어, 풀라어, 핀란드어, 프랑스어, 서부 프리지아어, 아일랜드어, 스코틀랜드 게일어, 갈리시아어, 구자라트어, 하우사어, 히브리어, 힌디어, 크로아티아어, 아이티어, 헝가리어, 아르메니아어, 인도네시아어, 이그보어, 이로코어, 아이슬란드어, 이탈리아어, 일본어, 자바어, 조지아어, 카자흐어, 크메르어, 칸나다어, 한국어, 룩셈부르크어, 간다어, 링갈라어, 라오어, 리투아니아어, 라트비아어, 말라가시어, 마케도니아어, 말라얄람어, 몽골어, 마라티어, 말레이어, 버마어, 네팔어, 네덜란드어, 노르웨이어, 북소토어, 오크어, 오리야어, 펀자브어, 폴란드어, 파슈토어, 포르투갈어, 루마니아어, 러시아어, 신디어, 싱할라어, 슬로바키아어, 슬로베니아어, 소말리아어, 알바니아어, 세르비아어, 시스와티어, 순다어, 스웨덴어, 스와힐리어, 타밀어, 태국어, 필리핀어, 츠와나어, 튀르키예어, 우크라이나어, 우르두어, 우즈베크어, 베트남어, 월로프어, 코사어, 이디시어, 요루바어, 중국어, 줄루어 |

## 클라우드 모델

| 제공업체 | 모델 | 지원 언어 | 상세 정보 |
|---|---|---|---|
| Aliyun | Qwen3.5 / Qwen3.8 LiveTranslate | 60 | 중국어, 영어, 아랍어, 독일어, 프랑스어, 스페인어, 포르투갈어, 인도네시아어, 이탈리아어, 한국어, 러시아어, 태국어, 베트남어, 일본어, 튀르키예어, 힌디어, 말레이어, 네덜란드어, 우르두어, 노르웨이어(보크말), 스웨덴어, 덴마크어, 히브리어, 핀란드어, 폴란드어, 아이슬란드어, 체코어, 필리핀어, 페르시아어, 광둥어, 그리스어, 아프리칸스어, 아스투리아어, 벨라루스어, 불가리아어, 벵골어, 보스니아어, 카탈로니아어, 세부아노어, 에스토니아어, 갈리시아어, 구자라트어, 크로아티아어, 헝가리어, 자바어, 카자흐어, 칸나다어, 키르기스어, 라트비아어, 마케도니아어, 말라얄람어, 마라티어, 펀자브어, 루마니아어, 슬로바키아어, 슬로베니아어, 스와힐리어, 타지크어, 아제르바이잔어, 우크라이나어。3.8은 입력 언어를 자동 감지하고, 3.5는 입력 언어를 직접 지정합니다. |
| MiniMax | Speech-to-Text `asr-1.0` | 20 | 아랍어, 광둥어, 중국어, 영어, 필리핀어, 프랑스어, 독일어, 인도네시아어, 이탈리아어, 일본어, 한국어, 말레이어, 폴란드어, 포르투갈어, 러시아어, 스페인어, 태국어, 튀르키예어, 우크라이나어, 베트남어 |

## LLM API 설정

::: tip
여기서 설정하는 LLM 프로토콜은 번역에 사용됩니다. Aliyun 및 MiniMax ASR 모델은 「오디오 및 인식」의 별도 연결 설정과 자격 증명을 사용합니다. 로컬 모델은 API 설정이 필요하지 않습니다.
:::

### 지원 프로토콜

다음 API 프로토콜을 지원합니다:

| 프로토콜 |
|---|
| OpenAI Chat Completions |
| OpenAI Responses |
| Anthropic Messages |
| Ollama Chat |

### 설정 예시

| 서비스 제공업체 | API 형식 | API URL 예시 | 모델 ID 예시 |
|---|---|---|---|
| DeepSeek | OpenAI Chat Completions | `https://api.deepseek.com` | `deepseek-flash` |
| MiniMax | OpenAI Chat Completions | `https://api.minimax.io/v1` | `MiniMax-M3` |
| MiMo | OpenAI Chat Completions | `https://api.xiaomimimo.com/v1` | `mimo-v2.6-pro` |

### 설정 방법

![](https://raw.githubusercontent.com/CerealAxis/Nola-Translator/main/docs/public/screenshots/zh-CN/llm-configuration.png)

1. 번역 설정에서 **클라우드 번역**을 선택합니다.
2. 제공업체에서 지원하는 **API 형식**을 선택합니다.
3. **API URL**, **API 키**, **모델 ID**를 입력합니다.
4. 필요에 따라 컨텍스트 길이와 최대 출력 Token 수를 조정합니다.

## 프로젝트 구조

```text
assets/brand/                  로고 및 브랜드 리소스
docs/                          VitePress 제품 웹사이트 및 다국어 문서
engine/nola_translator_engine/  Python 오디오·인식·번역 엔진
engine/tests/                   Python 테스트
scripts/                        설정 및 빌드 스크립트
src/main/                       Electron 메인 프로세스
src/preload/                    IPC 브리지
src/renderer/                   React 인터페이스
src/shared/                     공유 계약 및 설정
tests/                          애플리케이션 테스트
```

## 개발 및 빌드

```powershell
npm run typecheck
npm test
.\.venv\Scripts\python.exe -m pytest engine\tests
npm run build
```

Windows x64 설치 프로그램 빌드:

```powershell
npm run dist:win
```

## 기여하기

저장소를 Fork하고 브랜치를 만든 뒤 변경 사항을 제출하고 Pull Request를 열어 주세요. 변경 내용과 실행한 검사를 간단히 설명해 주세요. 디자인 및 코드 규칙은 [DESIGN.md](https://github.com/CerealAxis/Nola-Translator/blob/main/DESIGN.md)와 [AGENTS.md](https://github.com/CerealAxis/Nola-Translator/blob/main/AGENTS.md)를 참조하세요.

## 라이선스

Nola Translator의 원본 코드는 [GNU GPL v3.0 only](https://github.com/CerealAxis/Nola-Translator/blob/main/LICENSE) 라이선스로 제공됩니다. 타사 구성 요소와 모델에는 각자의 라이선스가 적용됩니다. 자세한 내용은 [Third-Party Notices](https://github.com/CerealAxis/Nola-Translator/blob/main/THIRD_PARTY_NOTICES.md)를 참조하세요.

[![Star History Chart](https://api.star-history.com/svg?repos=CerealAxis/Nola-Translator&type=Date)](https://star-history.com/#CerealAxis/Nola-Translator)
