import { RpcConnection, ArchConnection, PubkeyUtil } from "@arch-network/arch-sdk";

self.onmessage = async (event) => {
    const { clientCode } = event.data;

    try {
        // Send initial message to verify worker is receiving
        self.postMessage({ type: 'info', message: 'Worker received code' });

        // Create console override
        const consoleOverride = `
            const console = {
                log: (...args) => self.postMessage({ type: 'info', message: args.join(' ') }),
                error: (...args) => self.postMessage({ type: 'error', message: args.join(' ') }),
                info: (...args) => self.postMessage({ type: 'info', message: args.join(' ') })
            };
        `;

        // Create a new function with the console override and client code
        console.log(consoleOverride + clientCode);
        const executeCode = new Function(consoleOverride + clientCode);

        // Execute the code
        executeCode();

        self.postMessage({ type: 'success', message: 'Code executed successfully' });
    } catch (e) {
        self.postMessage({
            type: 'error',
            message: e instanceof Error ? e.message : 'Unknown error'
        });
    }
};
