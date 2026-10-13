---
prev:
  text: 홈으로 돌아가기
  link: /ko/
next:
  text: Nola Translator 다운로드
  link: https://github.com/CerealAxis/Nola-Translator/releases/latest
---

# 빠른 시작

Nola Translator는 시스템 오디오 또는 마이크 음성을 실시간으로 텍스트 변환하고 이중 언어 자막으로 번역합니다. 아래 단계에 따라 Windows x64 환경을 설정하세요.

## 1. 설치

[GitHub Releases](https://github.com/CerealAxis/Nola-Translator/releases/latest)에서 Windows x64 설치 프로그램을 다운로드하여 실행하고 앱을 시작합니다.

## 2. 인식 및 번역 모델 설정

**모델 관리**를 열고 음성 인식 모델과 텍스트 번역 모델을 선택합니다. 각각 독립적으로 설정할 수 있습니다:

- **음성 인식**: Qwen, Paraformer (로컬); Aliyun LiveTranslate, MiniMax (클라우드).
- **텍스트 번역**: Hy-MT2, Index-Translate (로컬); MyMemory 공개 API (클라우드).

로컬 모델은 모델 다운로드와 실행 구성 요소가 필요하며 VRAM/RAM 요구 사항이 있습니다. 클라우드 서비스는 네트워크 연결이 필요하며 일부 서비스는 API 자격 증명 설정이 필요합니다.

## 3. 추론 엔진 설정

**설정 → 컴퓨팅**을 엽니다:

- **추론 엔진**: llama.cpp 또는 PyTorch를 선택.
- **추론 장치**: NVIDIA GPU 또는 CPU를 선택. GPU 추론에는 호환 가능한 드라이버와 충분한 VRAM이 필요합니다.

## 4. 실시간 번역 시작

**빠른 동시통역**을 엽니다:

1. 오디오 소스(시스템 오디오 또는 마이크)를 선택합니다.
2. 소스 언어와 대상 언어를 설정합니다.
3. 인식 및 번역 모델을 선택합니다.
4. 시작을 클릭합니다.

작업 공간은 이중 언어, 원문만, 번역만 보기와 문장 분할 또는 영역 분할 레이아웃을 지원합니다. 세션이 끝나면 **기록**에서 자막과 메모를 확인할 수 있습니다.
