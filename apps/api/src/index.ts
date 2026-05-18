import { mkdir } from "node:fs/promises";
import { app, outputDir, modelsDir, seedChairModel } from "./app.js";

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
app.listen(port, async () => {
  await mkdir(outputDir, { recursive: true });
  await mkdir(modelsDir, { recursive: true });

  console.log(JSON.stringify({ event: "api_started", port, outputDir, modelsDir }));

  try {
    await seedChairModel();
  } catch (err) {
    console.error(JSON.stringify({ event: "seed_error", error: String(err) }));
  }
});
