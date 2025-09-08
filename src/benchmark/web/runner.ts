const CASES = [
  // 'raw object - simple key',
  // 'raw Map - simple key',
  // 'raw object',
  // 'raw Map',
  'blastore localStorage - simple key',
  'blastore localStorage - precompiled key',
  'blastore localStorage',
  'raw localStorage - simple key',
  'raw localStorage',
  // 'blastore - simple key',
  // 'blastore',
  // 'blastore -- precompiled key',
  // 'zustand - simple key',
  // 'zustand',
  // 'valtio - simple key',
  // 'valtio',
  // 'jotai - simple key',
  // 'jotai',
  // 'redux-toolkit - simple key',
  // 'redux-toolkit',
  // 'mobx - simple key',
  // 'mobx',
];

const ITERATIONS = 1_000_000;
const log = (...args: any[]) =>
  (document.getElementById('log')!.textContent += args.join(' ') + '\n');

function needsMainThread(name: string) {
  return name.includes('localStorage');
}

async function runIsolated(name: string) {
  if (needsMainThread(name)) return runInIframe(name);
  return runInWorker(name);
}

function runInWorker(name: string) {
  return new Promise((resolve) => {
    // @ts-ignore
    const w = new Worker(new URL('./worker-bench.ts', import.meta.url), {
      type: 'module',
    });
    w.onmessage = (e) => {
      resolve(e.data);
      w.terminate();
    };
    w.onerror = (e) => {
      resolve({ name, error: e.message || 'worker error' });
      w.terminate();
    };
    w.postMessage({ name, iterations: ITERATIONS });
  });
}

function runInIframe(name: string) {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    iframe.onload = () => {
      iframe.contentWindow!.postMessage(
        { name, iterations: ITERATIONS },
        location.origin
      );
    };

    const onMsg = (ev: MessageEvent) => {
      if (ev.source === iframe.contentWindow) {
        window.removeEventListener('message', onMsg);
        iframe.remove();
        resolve(ev.data);
      }
    };
    window.addEventListener('message', onMsg);

    iframe.src = './iframe.html';
  });
}

(async () => {
  for (const name of CASES) {
    const r: any = await runIsolated(name);
    if (r.error) log(name.padEnd(60), 'ERROR:', r.error);
    else log(name.padEnd(60), r.time, '| +' + r.delta);
    await new Promise((r) => setTimeout(r, 0));
  }
})();
