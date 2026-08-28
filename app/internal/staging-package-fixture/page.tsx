import { notFound } from "next/navigation";
import FixturePanel from "./fixture-panel";

export default function StagingPackageFixturePage() {
  if (process.env.VERCEL_ENV !== "preview") notFound();
  return <FixturePanel />;
}
