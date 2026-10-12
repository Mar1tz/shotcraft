import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { NewVideoForm } from "./NewVideoForm";

export const metadata: Metadata = { title: "New video" };

// The form is static and renders straight away. Only the project-name
// suggestions stream in, as a <datalist> the Project field points at.
export default function NewVideoPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">New video</p>
          <h1>What are we launching?</h1>
          <p className="lede">A few quick steps. The agent reads the project, captures real screens, and checks with
            you before it renders.</p>
        </div>
      </div>
      {/* The plain element matters: when you navigate away, Next keeps this page
          alive but hidden, and hides the page's own elements -- a client
          component's root form slipped through and stayed on screen. */}
      <div className="wizard-wrap">
        <NewVideoForm />
        <Suspense fallback={null}><ProjectOptions /></Suspense>
      </div>
    </>
  );
}

async function ProjectOptions() {
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("name").order("updated_at", { ascending: false }).limit(50);
  return <datalist id="projects">{(data ?? []).map((p) => <option key={p.name as string} value={p.name as string} />)}</datalist>;
}
