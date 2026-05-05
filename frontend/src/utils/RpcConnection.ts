export class RpcConnection {
    constructor(private rpcUrl: string) {}

    async request(method: string, params: any[] = []) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(this.rpcUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          credentials: 'same-origin',
          mode: 'cors',
          signal: controller.signal,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'arch',
            method,
            params
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.error) {
          throw new Error(data.error.message || 'RPC error');
        }

        return data.result;
      } catch (error: any) {
        if (error.name === 'AbortError') {
          throw new Error('Connection timeout');
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    /**
     * Request an airdrop for the given pubkey byte array.
     * Returns the transaction hash on success.
     */
    async requestAirdrop(pubkeyBytes: number[]): Promise<string> {
      return this.request('request_airdrop', pubkeyBytes);
    }

    async checkConnection(): Promise<boolean> {
      try {
        await this.request('getblockcount');
        return true;
      } catch (error) {
        return false;
      }
    }
}