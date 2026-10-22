import { createClient } from "@supabase/supabase-js";

interface Database {
  public: {
    Tables: {
      todos: {
        Row: { id: string };
        Insert: { id: string };
        Update: { id?: string };
        Relationships: [];
      };
    };
    Views: {};
    Functions: {};
  };
}

const query = createClient<Database>("http://localhost", "key").from("todos").select("id");
declare const row: NonNullable<Awaited<typeof query>["data"]>[number];
const spreadRow = { ...row };

interface State<TExtra = typeof spreadRow> {
  isLoading: boolean;
  extra: TExtra;
}

declare function useSelector<TSelected>(selector: (state: State) => TSelected): TSelected;

const isLoading = useSelector((state) => state.isLoading);
export const probe: boolean = isLoading;
