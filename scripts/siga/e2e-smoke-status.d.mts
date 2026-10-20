export type SmokeStatus = "pass" | "skip" | "fail";

export interface SmokeStatusInput {
  label: string;
  expected: number[];
  status: number;
  allowApi500Skip?: boolean;
  optionalInCi?: boolean;
}

export declare function classifySmokeStatus(input: SmokeStatusInput): SmokeStatus;
