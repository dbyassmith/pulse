import { Command } from "commander";
import { input, password } from "@inquirer/prompts";
import { getSupabaseClient } from "../lib/supabase.js";
import { deleteSessionFile } from "../lib/session.js";

export const authCommand = new Command("auth").description(
  "Authentication commands"
);

authCommand
  .command("login")
  .description("Log in with email and password")
  .action(async () => {
    const email = await input({ message: "Email:" });
    const pass = await password({ message: "Password:" });

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });

    if (error) {
      console.error(`Login failed: ${error.message}`);
      process.exit(1);
    }

    console.log(`Logged in as ${data.user.email}`);
  });

authCommand
  .command("logout")
  .description("Log out and clear session")
  .action(async () => {
    const supabase = getSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      await supabase.auth.signOut();
    }

    deleteSessionFile();
    console.log(session ? "Logged out" : "Not logged in");
  });

authCommand
  .command("whoami")
  .description("Show current user")
  .action(async () => {
    const supabase = getSupabaseClient();
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session) {
      console.error("Not logged in. Run: pulse auth login");
      process.exit(1);
    }

    console.log(`Email:   ${session.user.email}`);
    console.log(`User ID: ${session.user.id}`);
  });
