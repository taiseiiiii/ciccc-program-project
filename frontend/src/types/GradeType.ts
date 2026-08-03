export default interface Grade {
  grade_id: number;
  grade_name: string; // "V0" .. "V17"
  level: number; // 0..17
  created_at: string;
  updated_at: string;
}
