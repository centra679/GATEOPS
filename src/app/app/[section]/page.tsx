import { notFound } from "next/navigation";
import { WorkspaceSection } from "@/components/workspace/workspace-section";
import { isKnownSection } from "@/lib/gateops/navigation";

export default async function WorkspacePage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ token?: string | string[] }> }) {
  const [{ section }, query] = await Promise.all([params, searchParams]);
  if (!isKnownSection(section)) notFound();
  const inviteToken = typeof query.token === "string" ? query.token : "";
  return <WorkspaceSection section={section} inviteToken={inviteToken} />;
}