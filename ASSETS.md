# 이미지 사용 목록

기존 배경 PNG 4장 + HEIC→PNG 32장. 원본 이름의 오타(`캐릭어이미지1`)와 대소문자도 실제 경로 그대로 사용합니다. 모든 HEIC는 RGBA이며 32장 모두 변환 성공했습니다. 원본 크기와 알파 채널, 디코딩 픽셀 동일 검증 완료. 별도 ICC 프로필은 원본에 없었습니다.

| 사용 파일 | 원본 크기 | 용도 |
|---|---|---|
| `assets/backgrounds/배경이미지1.PNG` | 2172×724 | 순환 횡스크롤 풍경 |
| `assets/backgrounds/배경이미지2.PNG` | 2170×725 | 순환 횡스크롤 풍경 |
| `assets/backgrounds/배경이미지3.PNG` | 2048×768 | 순환 횡스크롤 풍경 |
| `assets/backgrounds/배경이미지4.PNG` | 2170×725 | 순환 횡스크롤 풍경 |
| `assets/characters/캐릭어이미지1.png` | 99×131 | 기본/달리기 |
| `assets/characters/캐릭터이미지2.png` | 90×122 | 달리기 |
| `assets/characters/캐릭터이미지3.png` | 97×127 | 달리기 |
| `assets/characters/캐릭터이미지4.png` | 89×124 | 달리기 |
| `assets/characters/캐릭터이미지5.png` | 92×122 | 달리기 |
| `assets/characters/캐릭터이미지6.png` | 107×107 | 피격/주저앉기 |
| `assets/characters/캐릭터이미지7.png` | 135×90 | 게임 오버/넘어짐 |
| `assets/characters/캐릭터이미지8.png` | 96×129 | 점프 상승 |
| `assets/characters/캐릭터이미지9.png` | 91×120 | 달리기 |
| `assets/extras/기타이미지10.png` | 112×113 | 책 더미 / 하단 장식 |
| `assets/extras/기타이미지3.png` | 114×118 | 과거 책 / 하단 장식 |
| `assets/extras/기타이미지4.png` | 89×109 | 붓 / 하단 장식 |
| `assets/extras/기타이미지8.png` | 75×77 | 엽전 / 수집 효과 |
| `assets/items/귤이미지1.png` | 93×89 | 귤 수집 |
| `assets/items/귤이미지2.png` | 93×85 | 귤 수집 |
| `assets/items/귤이미지3.png` | 93×88 | 귤 수집 |
| `assets/items/귤이미지4.png` | 64×61 | 귤 조각 수집 |
| `assets/items/귤이미지5.png` | 58×56 | 귤 조각 수집 |
| `assets/items/귤이미지6.png` | 73×86 | 귤 조각 수집 |
| `assets/obstacles/귤이미지7.png` | 506×173 | 짧은 귤 기차 장애물 |
| `assets/obstacles/귤이미지8.png` | 548×217 | 긴 귤 기차 장애물 |
| `assets/obstacles/기타이미지1.png` | 108×78 | 바위 장애물 |
| `assets/obstacles/기타이미지2.png` | 90×109 | 울타리 장애물 |
| `assets/obstacles/기타이미지5.png` | 104×118 | 항아리 장애물 |
| `assets/obstacles/기타이미지6.png` | 122×126 | 귤나무 배경 장식 |
| `assets/obstacles/기타이미지7.png` | 139×150 | 나무 배경 장식 |
| `assets/obstacles/기타이미지9.png` | 65×113 | 두루마리 배경 장식 |
| `assets/ui/기타이미지11.png` | 200×101 | 시작하기 버튼 |
| `assets/ui/기타이미지12.png` | 180×64 | 점수판 |
| `assets/ui/기타이미지13.png` | 217×201 | 게임 오버 / 다시하기 |
| `assets/ui/기타이미지14.png` | 241×73 | 체력바 |
| `assets/ui/기타이미지15.png` | 65×67 | 정지 버튼 |

PNG는 동일 폴더의 동명 HEIC에서 변환했습니다. 그림 재생성·배경 제거·색 보정·업스케일은 하지 않았습니다. 숫자와 체력 채움, 착지 축소는 실행 시에만 적용됩니다. 캐릭터 동작 용도는 이미지의 자세를 직접 확인해 지정했습니다.

3차 개선: 그림 파일은 모두 유지합니다. `assets/fonts/GamjaFlower-Game.woff2`와 공식 `OFL.txt`를 추가했으며, 배경 경계 페더링은 제거했습니다.
