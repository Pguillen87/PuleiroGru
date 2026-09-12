import { describe, expect, it, vi } from "vitest";
import { completePostBirthProfile } from "@/lib/mascot-generation/post-birth-store";
import type { GeneratedPose } from "@/lib/mascot-generation/types";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const ATTEMPT_ID = "attempt-post-birth-0001";
const JOB_ID = "job-post-birth-0001";

function createClient(result: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data: result, error });
  return { rpc } as never;
}

const poses: GeneratedPose[] = [
  { id: "pose-normal", role: "normal", optionId: "normal-1", label: "Normal", imageUrl: "" },
  { id: "pose-listening", role: "listening", optionId: "listening-1", label: "Ouvindo", imageUrl: "" },
  { id: "pose-transcribing", role: "transcribing", optionId: "transcribing-1", label: "Transcrevendo", imageUrl: "" },
];

describe("completePostBirthProfile", () => {
  it("delegates profile and library creation to one owner-scoped transaction", async () => {
    const client = createClient({
      idempotent_replay: false,
      profile: {
        id: "profile-1",
        user_id: USER_ID,
        attempt_id: ATTEMPT_ID,
        modal_job_id: JOB_ID,
        state: "ACTIVE",
        display_name: "Pipoca",
        journal_config: { version: 1 },
        configuration_revision: 3,
        created_at: "2026-09-07T12:00:00.000Z",
        updated_at: "2026-09-07T12:05:00.000Z",
        activated_at: "2026-09-07T12:05:00.000Z",
        library_item_id: "item-1",
      },
      library_item: {
        id: "item-1",
        user_id: USER_ID,
        attempt_id: ATTEMPT_ID,
        modal_job_id: JOB_ID,
        master_id: "master-1",
        mascot_code: "GRU-AAAA-BBBB",
        display_name: "Pipoca",
        pose_snapshot: poses,
        created_at: "2026-09-07T12:05:00.000Z",
        is_favorite: false,
        favorite_rank: null,
      },
    });

    const result = await completePostBirthProfile(client, USER_ID, ATTEMPT_ID, {
      expectedRevision: 2,
      displayName: "  Pipoca  ",
      journalConfig: { version: 1 },
      modalJobId: JOB_ID,
      masterId: "master-1",
      mascotCode: "GRU-AAAA-BBBB",
      poses,
    }, client);

    expect(result).toMatchObject({
      idempotentReplay: false,
      profile: { state: "ACTIVE", displayName: "Pipoca", libraryItemId: "item-1" },
      libraryItem: { id: "item-1", displayName: "Pipoca", mascotCode: "GRU-AAAA-BBBB" },
    });
    expect((client as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("complete_post_birth_profile", {
      p_user_id: USER_ID,
      p_attempt_id: ATTEMPT_ID,
      p_expected_revision: 2,
      p_display_name: "Pipoca",
      p_journal_config: { version: 1 },
      p_modal_job_id: JOB_ID,
      p_master_id: "master-1",
      p_mascot_code: "GRU-AAAA-BBBB",
      p_pose_snapshot: poses,
    });
  });

  it("fails closed when the transaction RPC is unavailable", async () => {
    const client = createClient(null, { code: "PGRST202" });

    await expect(completePostBirthProfile(client, USER_ID, ATTEMPT_ID, {
      expectedRevision: 0,
      displayName: "Pipoca",
      journalConfig: { version: 1 },
      modalJobId: JOB_ID,
      masterId: "master-1",
      mascotCode: "GRU-AAAA-BBBB",
      poses,
    }, client)).rejects.toMatchObject({ code: "POST_BIRTH_PROFILE_COMPLETE_FAILED", status: 503 });
  });

  it("requires the durable approved pose set for the new completion contract", async () => {
    const client = createClient({
      idempotent_replay: true,
      profile: {
        id: "profile-1", user_id: USER_ID, attempt_id: ATTEMPT_ID, modal_job_id: JOB_ID,
        state: "ACTIVE", display_name: "Pipoca", journal_config: { version: 1 },
        configuration_revision: 3, created_at: "2026-09-07T12:00:00.000Z",
        updated_at: "2026-09-07T12:05:00.000Z", activated_at: "2026-09-07T12:05:00.000Z", library_item_id: "item-1",
      },
      library_item: {
        id: "item-1", user_id: USER_ID, attempt_id: ATTEMPT_ID, modal_job_id: JOB_ID, master_id: "master-1",
        mascot_code: "GRU-AAAA-BBBB", display_name: "Pipoca", pose_snapshot: poses,
        created_at: "2026-09-07T12:05:00.000Z", is_favorite: false, favorite_rank: null,
      },
    });

    await completePostBirthProfile(client, USER_ID, ATTEMPT_ID, {
      expectedRevision: 2,
      displayName: "Pipoca",
      journalConfig: { version: 1 },
      modalJobId: JOB_ID,
      masterId: "master-1",
      mascotCode: "GRU-AAAA-BBBB",
      poses,
      approvedPoseSetId: "11111111-1111-4111-8111-111111111111",
    }, client);

    expect((client as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("complete_post_birth_profile_v2", expect.objectContaining({
      p_pose_set_id: "11111111-1111-4111-8111-111111111111",
    }));
  });
});
