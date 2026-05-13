import type { ApiClient } from "../api-client.js";
import qrcode from "qrcode-terminal";

export async function connectionQr(client: ApiClient) {
  const data = await client.getConnectionQr();
  console.log(`Machine: ${data.machineName} (${data.machineId})`);
  console.log(`URL: ${data.url}`);
  console.log("");
  qrcode.generate(data.url, { small: true }, (qr) => {
    console.log(qr);
  });
}
