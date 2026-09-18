import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateGuardianInstructionDto {
  @IsString()
  @IsOptional()
  instruction_type?: string;

  @IsString()
  @IsNotEmpty()
  content!: string;
}

export interface GuardianInstructionResponseDto {
  id: string;
  child_id: string;
  created_by_guardian_user_id: string;
  instruction_type: string;
  content: string;
  created_at: string;
  revoked_at?: string | null;
}
