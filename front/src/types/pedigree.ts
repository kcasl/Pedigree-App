export type PersonId = string;

export type ParentType = 'father' | 'mother';
export type GenderType = 'male' | 'female' | 'unknown';

export interface Person {
  id: PersonId;
  name: string;
  phone?: string;
  birthDate?: string; // YYYY-MM-DD
  createdAt: string; // 등록일 (ISO, 추가 시 네트워크 시간 자동 입력)
  photoUri?: string;
  note?: string; // 비고(기타 정보), 100자 제한(UI에서 제어)
  gender?: GenderType;

  fatherId?: PersonId;
  motherId?: PersonId;
  spouseId?: PersonId;
  lineageSideHint?: 'left' | 'right';
}

