# Family Tree Engine - Master Specification

> 목적: 확장 가능한 족보 엔진을 구축한다.

---

# 1. 핵심 목표

- 자동 레이아웃
- 자동 선 연결(SVG)
- 자동 관계 계산
- 시점(Viewpoint) 변경
- 무한 확장 가능한 데이터 구조

---

# 2. 핵심 원칙

1. 좌표는 절대 DB에 저장하지 않는다.
2. 사람(Person)과 관계(Relationship)만 저장한다.
3. 화면은 항상 관계를 기반으로 다시 계산한다.
4. UI는 계산하지 않는다.
5. Layout Engine이 모든 좌표를 생성한다.
6. Relationship Engine이 모든 관계를 계산한다.

---

# 3. 기본 화면

앱 실행 시 항상 현재 기준 인물(나)을 중심으로 5세대를 표시한다.

1세대 : 조부모
2세대 : 부모
3세대 : 나 / 형제자매 / 배우자
4세대 : 자녀 / 조카
5세대 : 손자녀

기준 인물은 항상 강조 테두리로 표시한다.

---

# 4. Person 모델

```text
id
uuid
name
gender
birth
death
alive
fatherId
motherId
spouseIds[]
childrenIds[]
memo
photo
orderAmongSiblings
createdAt
updatedAt
```

---

# 5. 노드 규칙

각 노드는 클릭 가능하다.

메뉴
- 정보 수정
- 삭제
- 시점 변경
- 관계 추가

모든 노드에는 가능한 관계에 대한 + 버튼을 제공한다.

예)
- 부모 추가
- 배우자 추가
- 형제 추가
- 자녀 추가

추가 즉시 관계 계산 → 레이아웃 계산 → 선 계산 → 렌더링.

---

# 6. 시점 변경

선택한 인물을 새로운 '나'로 지정한다.

예외
- 아버지 : 친가 보기
- 어머니 : 외가 보기

시점 변경은 화면 이동이 아니라 새로운 족보 생성이다.

항상 동일한 5세대 규칙을 적용한다.

---

# 7. 자동 레이아웃

순서

1. 기준 인물 선택
2. 표시 대상 추출
3. 세대 분류
4. 형제 그룹 생성
5. 배우자 그룹 생성
6. 서브트리 크기 계산
7. X 계산
8. Y 계산
9. SVG 연결선 계산
10. 렌더링

규칙

- 부모는 위
- 자녀는 아래
- 배우자는 같은 높이
- 형제는 같은 높이
- 출생순 유지
- 노드 겹침 금지
- 빈 공간 최소화

---

# 8. SVG 선

부부선
↓

부모 연결선
↓

형제 수평선
↓

자녀 수직선

선은 항상 노드 위치 계산 이후 생성한다.

---

# 9. 프로젝트 구조

src/
 components/
 engine/
   layout/
   relationship/
 stores/
 dialogs/
 hooks/
 types/
 utils/

UI와 Engine은 반드시 분리한다.

---

# 10. 저장

JSON 저장/불러오기 지원.

좌표 저장 금지.

---

# 11. Undo/Redo

모든 작업은 Command Pattern.

- AddPerson
- DeletePerson
- EditPerson
- ChangeViewpoint

---

# 12. Cursor Rules

절대 좌표 저장 금지.
절대 UI에서 계산 금지.
항상 전체 레이아웃 재계산.
항상 SVG 자동 생성.
항상 관계 기반 렌더링.
항상 5세대 유지.
