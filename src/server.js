import { app } from "./bootstrap.js";
import { config } from "./config.js";

app.listen(config.port, () => {
  console.log(`BYOA Chess POC listening on http://localhost:${config.port}`);
});
