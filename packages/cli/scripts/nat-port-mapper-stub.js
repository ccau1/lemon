// Stub for @achingbrain/nat-port-mapper to avoid ESM/native bundling issues in pkg
export function upnpNat() {
  return {
    async *findGateways() {},
  };
}

export class Gateway {
  async map() {
    return { externalPort: 0 };
  }
  async externalIp() {
    return "127.0.0.1";
  }
  async stop() {}
}
