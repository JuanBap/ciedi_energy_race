export type UserRole = "admin" | "timer" | "judge";
export type EventStatus = "draft" | "active" | "finished";
export type CategorySlug = "pushcarts" | "hpvs";
export type TestType = "velocity" | "versatility";
export type Lane = "C2" | "C4" | "C6";
export type RunStatus = "pending" | "recorded" | "failed" | "reprogrammed";
export type HeatStatus = "pending" | "active" | "finished" | "failed";

export interface Database {
  public: {
    Tables: {
      events: {
        Row: Event;
        Insert: Omit<Event, "id" | "created_at">;
        Update: Partial<Omit<Event, "id" | "created_at">>;
      };
      categories: {
        Row: Category;
        Insert: Omit<Category, "id">;
        Update: Partial<Omit<Category, "id">>;
      };
      teams: {
        Row: Team;
        Insert: Omit<Team, "id" | "created_at">;
        Update: Partial<Omit<Team, "id" | "created_at">>;
      };
      user_profiles: {
        Row: UserProfile;
        Insert: Omit<UserProfile, "created_at">;
        Update: Partial<Omit<UserProfile, "id" | "created_at">>;
      };
      user_assignments: {
        Row: UserAssignment;
        Insert: Omit<UserAssignment, "id" | "created_at">;
        Update: Partial<Omit<UserAssignment, "id" | "created_at">>;
      };
      heats: {
        Row: Heat;
        Insert: Omit<Heat, "id" | "created_at">;
        Update: Partial<Omit<Heat, "id" | "created_at">>;
      };
      heat_assignments: {
        Row: HeatAssignment;
        Insert: Omit<HeatAssignment, "id">;
        Update: Partial<Omit<HeatAssignment, "id">>;
      };
      runs: {
        Row: Run;
        Insert: Omit<Run, "id" | "created_at">;
        Update: Partial<Omit<Run, "id" | "created_at">>;
      };
      scores: {
        Row: Score;
        Insert: Omit<Score, "id" | "created_at">;
        Update: Partial<Omit<Score, "id" | "created_at">>;
      };
    };
    Views: {
      v_rankings: {
        Row: RankingRow;
      };
    };
  };
}

export interface Event {
  id: string;
  name: string;
  start_date: string;
  status: EventStatus;
  created_at: string;
}

export interface Category {
  id: string;
  event_id: string;
  slug: CategorySlug;
  name: string;
}

export interface Team {
  id: string;
  event_id: string;
  category_id: string;
  name: string;
  school: string;
  color_hex: string;
  shield_url: string | null;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  full_name: string | null;
  created_at: string;
}

export interface UserAssignment {
  id: string;
  user_id: string;
  event_id: string;
  test_type: TestType;
  lane: Lane | null;
  created_at: string;
}

export interface Heat {
  id: string;
  event_id: string;
  test_type: TestType;
  heat_number: number;
  status: HeatStatus;
  created_at: string;
}

export interface HeatAssignment {
  id: string;
  heat_id: string;
  team_id: string;
  lane: Lane | null;
}

export interface Run {
  id: string;
  heat_assignment_id: string;
  time_ms: number | null;
  has_penalty_velocity: boolean;
  penalty_versatility_count_out: number;
  penalty_versatility_count_crash: number;
  penalty_versatility_count_cut: number;
  status: RunStatus;
  recorded_by: string | null;
  recorded_at: string | null;
  edited_by: string | null;
  edited_at: string | null;
  created_at: string;
}

export interface Score {
  id: string;
  team_id: string;
  design_brief_score: number;
  pitch_score: number;
  created_at: string;
}

export interface RankingRow {
  event_id: string;
  category_id: string;
  category_slug: CategorySlug;
  team_id: string;
  team_name: string;
  school: string;
  color_hex: string;
  shield_url: string | null;
  time_velocity_total: number | null;
  time_versatility_total: number | null;
  position_velocity: number | null;
  position_versatility: number | null;
  points_velocity: number;
  points_versatility: number;
  points_design_brief: number;
  points_pitch: number;
  total_score: number;
  final_position: number | null;
}

// Extended types with joins
export interface TeamWithCategory extends Team {
  categories: Category;
}

export interface HeatWithAssignments extends Heat {
  heat_assignments: (HeatAssignment & {
    teams: Team;
    runs: Run[];
  })[];
}

export interface RunWithDetails extends Run {
  heat_assignments: HeatAssignment & {
    heats: Heat;
    teams: Team;
    lane: Lane | null;
  };
  recorder: UserProfile | null;
  editor: UserProfile | null;
}
