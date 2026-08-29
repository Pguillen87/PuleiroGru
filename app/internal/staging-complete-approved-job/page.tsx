import { notFound } from "next/navigation";
import CompleteApprovedJobPanel from "./complete-approved-job-panel";

export default function StagingCompleteApprovedJobPage() {
  if (process.env.VERCEL_ENV !== "preview") notFound();
  return <CompleteApprovedJobPanel />;
}
