# 감자꽃 (Gamja Flower)

- 제작/저작권: YoonDesign Inc.
- 공식 배포: https://github.com/google/fonts/tree/main/ofl/gamjaflower
- 원본: https://raw.githubusercontent.com/google/fonts/main/ofl/gamjaflower/GamjaFlower-Regular.ttf
- 라이선스: SIL Open Font License 1.1. 전문은 같은 폴더의 `OFL.txt`에 보존했습니다.

OFL은 소프트웨어와 함께 폰트를 사용·포함·재배포·수정하는 것을 허용합니다. 폰트만 단독으로 판매할 수 없으며, 재배포 시 저작권 및 라이선스를 포함해야 합니다. 이 게임은 라이선스와 저작권 표기를 함께 제공합니다.

게임에는 원본 13MB TTF 대신 실제 사용 문자와 ASCII/숫자를 포함한 36,432바이트 WOFF2 서브셋을 자체 호스팅합니다. 글자 모양은 변경하지 않았으며, 외부 폰트 서버에 요청하지 않습니다. 서브셋에 포함한 문자 목록은 `characters.txt`입니다. 한글 문구를 추가할 때는 폰트 서브셋도 갱신해야 합니다.

재생성 예 (FontTools + Brotli 설치 필요):

```sh
pyftsubset GamjaFlower-Regular.ttf --text-file=assets/fonts/characters.txt --flavor=woff2 --name-IDs='*' --name-legacy --name-languages='*' --output-file=assets/fonts/GamjaFlower-Game.woff2
```
