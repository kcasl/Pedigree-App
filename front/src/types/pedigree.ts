/**
 * 족보 인물 모델.
 * 좌표는 두지 않는다. 관계는 fatherId / motherId / spouseId 만으로 표현한다.
 */
export type PersonId = string;

export type ParentType = 'father' | 'mother';
export type GenderType = 'male' | 'female' | 'unknown';

export interface Person {
  id: PersonId;
  name: string;
  phone?: string;
  /** YYYY-MM-DD. 저장 시 정규화 */
  birthDate?: string;
  /** 등록일 ISO. 추가 시 네트워크 시간 */
  createdAt: string;
  photoUri?: string;
  /** 비고. 100자 제한은 UI에서 제어 */
  note?: string;
  gender?: GenderType;

  fatherId?: PersonId;
  motherId?: PersonId;
  spouseId?: PersonId;
  /** 레이아웃 힌트 — 형제 줄에서 왼쪽/오른쪽 고정이 필요할 때 */
  lineageSideHint?: 'left' | 'right';
}

