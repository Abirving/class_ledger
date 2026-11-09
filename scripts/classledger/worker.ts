import { Worker, Queue } from "bullmq";
import { runtime, redisConnection } from "../../lib/server/node-runtime";
import { runJob } from "../../lib/server/pdf";
const rt = await runtime(),
  connection = redisConnection(),
  queue = new Queue("classledger-reports", { connection });
const worker = new Worker(
  "classledger-reports",
  async (job) => {
    await runJob(rt, job.data.id, 300000);
    const [batch] = await rt.db.all(
      "SELECT status FROM report_batch WHERE id=?",
      [job.data.id],
    );
    if (batch?.status === "FAILED")
      throw new Error("Report rendering failed; inspect the batch error.");
    if (batch?.status !== "COMPLETED" && batch?.status !== "CANCELLED")
      throw new Error("Report not finished; retry after lease expires.");
  },
  { connection, concurrency: 1, lockDuration: 360000 },
);
worker.on("failed", (job, error) =>
  console.error(
    JSON.stringify({
      event: "report_failed",
      batch: job?.data.id,
      message: error.message,
    }),
  ),
);
async function recover() {
  for (const b of await rt.db.all(
    "SELECT id FROM report_batch WHERE status IN('QUEUED','RUNNING')",
  )) {
    const existing = await queue.getJob(b.id);
    if (!existing)
      await queue.add(
        "render",
        { id: b.id },
        {
          jobId: b.id,
          attempts: 3,
          backoff: { type: "exponential", delay: 3000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
    else if ((await existing.getState()) === "failed") await existing.retry();
  }
}
await recover();
const timer = setInterval(
  () => recover().catch((e) => console.error("Recovery failed:", e.name)),
  15000,
);
async function stop() {
  clearInterval(timer);
  await worker.close();
  await queue.close();
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
console.log("ClassLedger report worker is ready.");
