# 최신 이미지 사용 목록

기존 원본은 모두 보존했습니다. 새로 만든 파일은 **흰 배경을 제거한 귤 RGBA PNG 6개**뿐입니다. 배경·장애물·캐릭터·UI 그림 파일은 수정하지 않았습니다. 폰트는 새 문구에 맞춰 문자 서브셋만 갱신했습니다.

| 실제 사용 경로 | 원본 크기 | 용도 |
|---|---|---|
| `assets/backgrounds/bbaakk1.jpg` | 2144×724 | 단일 반복 배경 |
| `assets/items/귤1.png` | 500×527 | 일반 귤 1, +100점 / 원본 귤1.jpg 보존 |
| `assets/items/귤2.png` | 504×457 | 일반 귤 2, +100점 / 원본 귤2.jpg 보존 |
| `assets/items/귤3.png` | 510×473 | 일반 귤 3, +100점 / 원본 귤3.jpg 보존 |
| `assets/items/귤4.png` | 507×476 | 일반 귤 4, +100점 / 원본 귤4.jpg 보존 |
| `assets/items/귤5.png` | 492×365 | 일반 귤 5, +100점 / 원본 귤5.jpg 보존 |
| `assets/items/귤6.png` | 527×503 | 일반 귤 6, +100점 / 원본 귤6.jpg 보존 |
| `assets/obstacles/기타이미지1.png` | 108×78 | 1단 장애물 |
| `assets/obstacles/기타이미지2.png` | 90×109 | 1단 장애물 |
| `assets/obstacles/기타이미지6.png` | 122×126 | 2단 장애물 (가지/술 장식 판정 제외) |
| `assets/obstacles/기타이미지7.png` | 139×150 | 2단 장애물 (가지/술 장식 판정 제외) |
| `assets/obstacles/기타이미지9.png` | 65×113 | 2단 장애물 (가지/술 장식 판정 제외) |
| `assets/extras/기타이미지4.png` | 89×109 | 붓: 5초 가속 |
| `assets/extras/기타이미지3.png` | 114×118 | 과거 책: 5초 거대화 |
| `assets/characters/캐릭어이미지1.png` | 99×131 | 캐릭터 동작 |
| `assets/characters/캐릭터이미지2.png` | 90×122 | 캐릭터 동작 |
| `assets/characters/캐릭터이미지3.png` | 97×127 | 캐릭터 동작 |
| `assets/characters/캐릭터이미지4.png` | 89×124 | 캐릭터 동작 |
| `assets/characters/캐릭터이미지5.png` | 92×122 | 캐릭터 동작 |
| `assets/characters/캐릭터이미지6.png` | 107×107 | 캐릭터 동작 |
| `assets/characters/캐릭터이미지7.png` | 135×90 | 캐릭터 동작 |
| `assets/characters/캐릭터이미지8.png` | 96×129 | 캐릭터 동작 |
| `assets/characters/캐릭터이미지9.png` | 91×120 | 캐릭터 동작 |
| `assets/ui/기타이미지11.png` | 200×101 | 기존 수채화 UI |
| `assets/ui/기타이미지12.png` | 180×64 | 기존 수채화 UI |
| `assets/ui/기타이미지13.png` | 217×201 | 기존 수채화 UI |
| `assets/ui/기타이미지14.png` | 241×73 | 기존 수채화 UI |
| `assets/ui/기타이미지15.png` | 65×67 | 기존 수채화 UI |

## 로딩하지 않는 기존 그림

- `assets/backgrounds/배경이미지1.PNG`~`배경이미지4.PNG`
- background1/2/3 순환 배경 (현재 로딩 목록에 없음)
- `assets/items/귤이미지1.png`~`귤이미지6.png`
- `assets/obstacles/귤이미지7.png`, `귤이미지8.png`, `기타이미지5.png`
- `assets/extras/기타이미지8.png`, `기타이미지10.png`

기존 JPG/HEIC/PNG 원본은 삭제하거나 덮어쓰지 않았습니다. 새 PNG는 원본 JPG와 해상도가 동일합니다. PNG의 투명 여백만 실행 중 크기 계산에서 제외하고 그림의 가로세로 비율은 유지합니다. 원본의 크림색 테두리와 하이라이트는 그림의 일부라 보존합니다.

흰 배경 제거 기록은 `tools/orange-processing-report.json`, 재현 스크립트는 `tools/prepare_oranges.py`입니다. Pillow/numpy/scipy는 자산 준비에만 필요하고 게임에는 필요 없습니다.

배경 분리 개선: 이미지 파일 변경 없이 `game.js`의 배경 렌더링에만 1.25 CSS px 블러와 채도/대비 94%를 적용합니다. 다른 모든 이미지와 UI는 필터 없이 표시합니다.
