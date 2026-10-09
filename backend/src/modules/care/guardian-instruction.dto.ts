import { IsString, IsNotEmpty, IsOptional, IsIn, MaxLength } from 'class-validator';

export class CreateGuardianInstructionDto {
  @IsString()
  @IsOptional()
  @IsIn(['MEDICATION', 'COMMENT', 'PICKUP_NOTE'])
  instruction_type?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;
}

export interface GuardianInstructionResponseDto {
  id: string;
  child_id: string;
  author_user_id: string;
  created_by_guardian_user_id: string;
  instruction_type: string;
  content: string;
  created_at: string;
  revoked_at?: string | null;
}
